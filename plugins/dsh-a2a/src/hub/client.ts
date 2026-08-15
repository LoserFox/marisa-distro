/**
 * The mesh hub client: typed fetch wrapper over one hub's `/api` project
 * routes, the `/v1/meta` probe, and the `/v1/history` query. The hub is a
 * trusted-network peer (no caller authentication), mirroring the omp trust
 * model — never expose a hub URL to an untrusted network. Realtime
 * presence and messaging ride {@link A2aConnection}, not this client.
 * @module @dpskh/a2a/hub/client
 */

import { A2aError } from '../error.ts'
import { A2A_PROTOCOL_VERSION } from './realtime-types.ts'
import type { A2aHistoryPage, A2aHistoryQuery, A2aProject } from './types.ts'

/** Wire envelope of one route call. */
type WireEnvelope = { result?: unknown; error?: { code: string; message: string } }

/** Constructor options. */
export interface A2aHubClientOptions {
  /** Hub base URL, e.g. `http://127.0.0.1:4173`. */
  readonly baseUrl: string
  /** Per-request timeout in ms. */
  readonly timeoutMs?: number
}

/** Default per-request timeout. */
const DEFAULT_TIMEOUT_MS = 10_000

/** The mesh hub client. Every method maps to one hub surface. */
export class A2aHubClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  /**
   * @param options - hub base URL and request timeout.
   */
  constructor(options: A2aHubClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** The hub base URL (WebSocket connections derive `ws://…/v1/connect` from it). */
  get url(): string {
    return this.baseUrl
  }

  /**
   * Read the hub's protocol metadata.
   * @returns the meta; `null` when the hub is not reachable.
   */
  async meta(): Promise<HubMeta | null> {
    try {
      return await this.fetchJson<HubMeta>(`${this.baseUrl}/v1/meta`, {
        signal: AbortSignal.timeout(1_500),
      })
    } catch {
      return null
    }
  }

  /**
   * Create one project.
   * @param name - project name.
   * @param meta - display name, description, and creating cwd.
   * @returns the created project.
   */
  async createProject(name: string, meta: { displayName?: string; description?: string; createdByCwd?: string } = {}): Promise<A2aProject> {
    const { project } = await this.call<{ project: A2aProject }>('projects.create', { name, ...meta })
    return project
  }

  /**
   * List projects.
   * @returns projects sorted by name.
   */
  async listProjects(): Promise<A2aProject[]> {
    const { projects } = await this.call<{ projects: A2aProject[] }>('projects.list', {})
    return projects
  }

  /**
   * Delete one project and its history. Refused while presences are active.
   * @param name - project name.
   * @returns true when the project existed.
   */
  async deleteProject(name: string): Promise<boolean> {
    const { deleted } = await this.call<{ deleted: boolean }>('projects.delete', { name })
    return deleted
  }

  /**
   * Query one project's history.
   * @param query - project, cursors, sender filter, and limit.
   * @returns the matched messages.
   */
  async history(query: A2aHistoryQuery): Promise<A2aHistoryPage> {
    const parameters = new URLSearchParams({ project: query.project })
    if (query.before !== undefined) parameters.set('before', query.before)
    if (query.after !== undefined) parameters.set('after', query.after)
    if (query.from !== undefined) parameters.set('from', query.from)
    if (query.limit !== undefined) parameters.set('limit', String(query.limit))
    return this.fetchJson<A2aHistoryPage>(`${this.baseUrl}/v1/history?${parameters}`)
  }

  /** Call one route with a timeout; transport and business errors fold into A2aError. */
  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, this.timeoutMs)
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...params }),
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      throw new A2aError(
        aborted ? `hub request timed out: ${method}` : `hub request failed: ${method}`,
        'A2A_HTTP_TRANSPORT',
        { cause: error },
      )
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      throw new A2aError(`hub route ${method} answered HTTP ${response.status}`, 'A2A_HTTP_STATUS')
    }
    const envelope = await response.json() as WireEnvelope
    if (envelope.error !== undefined) {
      const code = envelope.error.code === 'project-conflict'
        ? 'A2A_PROJECT_CONFLICT'
        : envelope.error.code === 'bad-request'
          ? 'A2A_BAD_REQUEST'
          : 'A2A_REGISTRY'
      throw new A2aError(envelope.error.message, code)
    }
    if (envelope.result === undefined) {
      throw new A2aError(`hub route ${method} answered without a result`, 'A2A_HTTP_TRANSPORT')
    }
    return envelope.result as T
  }

  /** Fetch one JSON surface with error folding. */
  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init)
    const body = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
      throw new A2aError(
        body.error ? body.error : `HTTP ${response.status} ${url}`,
        'A2A_HTTP_STATUS',
      )
    }
    return body
  }
}

/** Hub protocol metadata served by `/v1/meta`. */
export interface HubMeta {
  readonly pid: number
  readonly port: number
  readonly baseUrl: string
  readonly startedAt: number
  readonly protocolVersion: number
}

/**
 * Probe one hub URL and verify the protocol version.
 * @param baseUrl - the hub base URL.
 * @returns the hub meta when reachable and version-matched.
 * @throws {A2aError} when unreachable or version-mismatched.
 */
export async function probeHub(baseUrl: string): Promise<HubMeta> {
  const meta = await new A2aHubClient({ baseUrl }).meta()
  if (meta === null) {
    throw new A2aError(`A2A hub not reachable at ${baseUrl}`, 'A2A_CLIENT_TRANSPORT')
  }
  if (meta.protocolVersion !== A2A_PROTOCOL_VERSION) {
    throw new A2aError(
      `A2A protocol mismatch: client=${A2A_PROTOCOL_VERSION}, hub=${meta.protocolVersion}`,
      'A2A_PROTOCOL_MISMATCH',
    )
  }
  return meta
}
