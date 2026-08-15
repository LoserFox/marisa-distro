/**
 * The mesh hub HTTP server (protocol version 3): plain JSON routes for
 * projects and history, the `/v1/meta` probe, and the `/v1/connect`
 * WebSocket upgrade handled by the realtime hub. Transport only — the
 * registry and message store are supplied by the composing package; every
 * failure folds into `{error: {code, message}}` (or an HTTP error status on
 * the `/v1/*` surface).
 * @module @dpskh/a2a/hub/server
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { A2aError } from '../error.ts'
import { A2aHubMessages } from './messages.ts'
import { A2aRealtimeHub } from './realtime-server.ts'
import { A2A_PROTOCOL_VERSION } from './realtime-types.ts'
import { ProjectConflictError, type A2aHubRegistry } from './registry.ts'

/** Name validation: printable ASCII, no `/` (composite keys depend on it). */
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

/** Maximum accepted request body bytes (project metadata only; messages ride the WebSocket). */
const MAX_BODY_BYTES = 2 * 1024 * 1024

/** One route outcome. */
type RouteResult = { result: unknown } | { error: { code: string; message: string } }

/** Route table: method name → handler. */
type RouteTable = Record<string, (params: Record<string, unknown>) => Promise<RouteResult>>

/** Constructor options for the mesh hub server. */
export interface A2aHubServerOptions {
  /** Bind host; defaults to `127.0.0.1`. */
  readonly host?: string
  /** Bind port; `0` asks the OS for an ephemeral port. */
  readonly port: number
  /** Inclusive upper port bound; `EADDRINUSE` walks up to it before failing. */
  readonly maxPort?: number
  /** The project registry. */
  readonly registry: A2aHubRegistry
  /** The message store. */
  readonly messages: A2aHubMessages
}

type Params = Record<string, unknown>

function paramString(params: Params, name: string): string {
  const value = params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new A2aError(`missing or invalid parameter: ${name}`, 'A2A_BAD_REQUEST')
  }
  return value
}

function paramOptionalString(params: Params, name: string): string | undefined {
  const value = params[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new A2aError(`invalid parameter: ${name}`, 'A2A_BAD_REQUEST')
  return value
}

/** Validate a name against the mesh name rule. */
function assertName(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new A2aError(`invalid name (must match ${NAME_RE}): ${name}`, 'A2A_BAD_REQUEST')
  }
  return name
}

/**
 * The mesh hub transport. Serves `/healthz`, `/v1/meta`, the `/v1/history`
 * query, the `/api/<method>` project routes, and the `/v1/connect`
 * WebSocket upgrade (realtime hub) over one HTTP server; the caller owns
 * the registry and message-store lifetimes.
 */
export class A2aHubServer {
  private readonly host: string
  private readonly bindPort: number
  private readonly maxPort: number
  private readonly registry: A2aHubRegistry
  private readonly messages: A2aHubMessages
  private readonly routes: RouteTable
  private server: Server | undefined
  private realtime: A2aRealtimeHub | undefined
  private actualPort = 0
  private baseUrl = ''

  /**
   * @param options - bind address (with an optional port range to walk up on
   * `EADDRINUSE`) plus the registry and message store backing the routes.
   */
  constructor(options: A2aHubServerOptions) {
    this.host = options.host ?? '127.0.0.1'
    this.bindPort = options.port
    this.maxPort = options.maxPort ?? options.port
    if (this.maxPort < this.bindPort) {
      throw new A2aError(`invalid hub port range: maxPort ${this.maxPort} is below port ${this.bindPort}`, 'A2A_BAD_REQUEST')
    }
    this.registry = options.registry
    this.messages = options.messages
    this.routes = {
      'projects.create': async (params) => {
        const name = assertName(paramString(params, 'name'))
        const project = await this.registry.createProject(name, {
          ...(paramOptionalString(params, 'displayName') === undefined
            ? {}
            : { displayName: paramOptionalString(params, 'displayName') as string }),
          ...(paramOptionalString(params, 'description') === undefined
            ? {}
            : { description: paramOptionalString(params, 'description') as string }),
          ...(paramOptionalString(params, 'createdByCwd') === undefined
            ? {}
            : { createdByCwd: paramOptionalString(params, 'createdByCwd') as string }),
        })
        return { result: { project } }
      },
      'projects.list': () => Promise.resolve({ result: { projects: this.registry.listProjects() } }),
      'projects.delete': async (params) => {
        const name = assertName(paramString(params, 'name'))
        if (this.realtime?.count(name)) {
          throw new ProjectConflictError(`project has active presences: ${name}`)
        }
        const deleted = await this.registry.deleteProject(name)
        if (deleted) await this.messages.deleteProject(name)
        return { result: { deleted } }
      },
    }
  }

  /**
   * Start listening, walking from `port` up to `maxPort` (inclusive) while
   * the port is taken (`EADDRINUSE`). Every other bind error fails
   * immediately. The realtime hub attaches to the listening server.
   * @returns the bound port (useful when `port: 0` or the range walked).
   */
  listen(): Promise<number> {
    return this.tryListen(this.bindPort)
  }

  /** Try one port; on `EADDRINUSE` below `maxPort`, walk to the next. */
  private tryListen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.dispatch(request, response)
      })
      server.on('error', (error) => {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EADDRINUSE' && port < this.maxPort) {
          void this.tryListen(port + 1).then(resolve, reject)
          return
        }
        reject(error)
      })
      server.listen(port, this.host, () => {
        const address = server.address() as AddressInfo
        this.server = server
        this.actualPort = address.port
        this.baseUrl = `http://${this.host}:${address.port}`
        this.realtime = new A2aRealtimeHub(server, this.messages, name => this.registry.getProject(name))
        resolve(address.port)
      })
    })
  }

  /** The bound base URL, once listening. */
  get url(): string | undefined {
    return this.server === undefined ? undefined : this.baseUrl
  }

  /** The bound port, once listening. */
  get port(): number | undefined {
    return this.server === undefined ? undefined : this.actualPort
  }

  /**
   * Present count of one project (live presences; deletion refuses them).
   * @param project - project name.
   * @returns the number of live presences.
   */
  count(project: string): number {
    return this.realtime?.count(project) ?? 0
  }

  /**
   * Close the realtime hub and the server.
   * @returns resolution after the listener closes.
   */
  close(): Promise<void> {
    this.realtime?.close()
    this.realtime = undefined
    const server = this.server
    this.server = undefined
    if (server === undefined) return Promise.resolve()
    return new Promise((resolve, reject) => {
      server.close((error) => {
        // A close error only surfaces with open connections mid-teardown; the
        // tests close idle servers, so the reject branch is defensive.
        /* v8 ignore next 2 -- defensive: idle-server closes never fail */
        if (error !== undefined) reject(error)
        else resolve()
      })
    })
  }

  /** Route one HTTP request. */
  private async dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      /* v8 ignore next 1 -- defensive: node always provides a request url */
      const url = request.url ?? '/'
      if (request.method === 'GET' && url === '/healthz') {
        this.json(response, 200, { ok: true })
        return
      }
      if (request.method === 'GET' && url === '/v1/meta') {
        this.json(response, 200, {
          pid: process.pid,
          port: this.actualPort,
          baseUrl: this.baseUrl,
          startedAt: this.startedAt,
          protocolVersion: A2A_PROTOCOL_VERSION,
        })
        return
      }
      if (request.method === 'GET' && url.startsWith('/v1/history')) {
        this.dispatchHistory(request, response)
        return
      }
      if (request.method === 'POST' && url.startsWith('/api/')) {
        const method = url.slice('/api/'.length)
        const handler = this.routes[method]
        if (handler === undefined) {
          this.json(response, 404, { error: { code: 'not-found', message: `unknown route: ${method}` } })
          return
        }
        const body = await this.readBody(request)
        const params = body === '' ? {} : JSON.parse(body) as Record<string, unknown>
        const outcome = await handler(params)
        this.json(response, 200, outcome)
        return
      }
      this.json(response, 404, { error: { code: 'not-found', message: `no route for ${request.method} ${url}` } })
    } catch (error) {
      let mapped: { code: string; message: string }
      if (error instanceof SyntaxError) {
        mapped = { code: 'bad-json', message: 'request body is not valid JSON' }
      } else if (error instanceof ProjectConflictError) {
        mapped = { code: 'project-conflict', message: error.message }
      } else if (error instanceof A2aError) {
        mapped = { code: error.code, message: error.message }
      } else {
        // Only a programming error in a route reaches here; everything
        // caller-shaped folds into A2aError above.
        mapped = { code: 'internal', message: error instanceof Error ? error.message : String(error) }
      }
      this.json(response, 200, { error: mapped })
    }
  }

  /** Serve one `/v1/history` query. */
  private dispatchHistory(request: IncomingMessage, response: ServerResponse): void {
    const search = new URL(request.url ?? '/', 'http://localhost').searchParams
    const project = search.get('project') ?? ''
    if (project === '') {
      this.json(response, 400, { error: 'project required' })
      return
    }
    if (this.registry.getProject(project) === null) {
      this.json(response, 404, { error: `unknown project: ${project}` })
      return
    }
    try {
      const page = this.messages.history({
        project,
        ...(search.get('before') === null ? {} : { before: search.get('before') as string }),
        ...(search.get('after') === null ? {} : { after: search.get('after') as string }),
        ...(search.get('from') === null ? {} : { from: search.get('from') as string }),
        ...(search.get('limit') === null ? {} : { limit: Number(search.get('limit')) }),
      })
      this.json(response, 200, page)
    } catch (error) {
      this.json(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Read and cap one request body. */
  private readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      let settled = false
      request.on('data', (chunk: Buffer) => {
        /* v8 ignore next 1 -- defensive: destroy() can race a buffered chunk */
        if (settled) return
        size += chunk.byteLength
        if (size > MAX_BODY_BYTES) {
          settled = true
          reject(new A2aError('request body too large', 'A2A_BAD_REQUEST'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        /* v8 ignore next 1 -- defensive: destroy() suppresses end */
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
      // A mid-body disconnect is the caller's problem, not a server bug:
      // fold it into the wire error vocabulary like the other refusals.
      /* v8 ignore next 4 -- defensive: the oversized-body path destroys the socket, which suppresses error events */
      request.on('error', () => {
        if (settled) return
        settled = true
        reject(new A2aError('request body was interrupted', 'A2A_BAD_REQUEST'))
      })
    })
  }

  /** Write one JSON response. */
  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  /** Hub start time (for the meta probe). */
  private readonly startedAt = Date.now()
}
