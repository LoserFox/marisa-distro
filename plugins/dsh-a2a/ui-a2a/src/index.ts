/** Host bridge exposing A2A through the public Connection RPC seam. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { A2aError, type A2aMeshService } from '@dpskh/a2a'
import { AGENT_NAME_RE, PROJECT_NAME_RE, peerView } from '@dpskh/a2a/view'
import {
  A2A_EVENTS_PATH,
  A2A_RPC_CHANNEL,
  A2A_RPC_ENDPOINTS,
  a2aRequestSchemas,
  type A2aApiError,
  type A2aApiResult,
  type A2aProjectView,
  type A2aSnapshot,
} from './api.ts'
import { PluginEvents } from './events.ts'

/** Stable Cordis plugin name. */
export const name = 'ui-a2a'
/** Host services required by the bridge. */
export const inject = ['connection', 'a2aMesh', 'webServer']

/** Project the durable hub record to the browser contract. */
function projectView(project: {
  readonly name: string
  readonly displayName?: string
  readonly description?: string
  readonly createdAt: number
}): A2aProjectView {
  return {
    name: project.name,
    ...(project.displayName === undefined ? {} : { displayName: project.displayName }),
    ...(project.description === undefined ? {} : { description: project.description }),
    createdAt: project.createdAt,
  }
}

/** Map mesh failures into the plugin-owned browser vocabulary. */
function apiError(error: unknown, details: { project?: string; name?: string } = {}): A2aApiError {
  if (error instanceof A2aError) {
    if (error.code === 'A2A_NAME_IN_USE') {
      return { code: 'a2a-name-in-use', message: error.message, details: { project: details.project ?? '', name: details.name ?? '' } }
    }
    if (error.code === 'A2A_UNKNOWN_PROJECT') {
      return { code: 'a2a-project-not-found', message: error.message, details: { project: details.project ?? '' } }
    }
    if (error.code === 'A2A_PROJECT_CONFLICT') {
      return { code: 'a2a-project-conflict', message: error.message, details: { project: details.project ?? '' } }
    }
    if (
      error.code === 'A2A_CLIENT_TRANSPORT'
      || error.code === 'A2A_HTTP_STATUS'
      || error.code === 'A2A_HTTP_TRANSPORT'
      || error.code === 'A2A_CLIENT_CONNECT'
    ) {
      return { code: 'a2a-unavailable', message: error.message, details: {} }
    }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

function carried<T>(value: A2aApiResult<T>): RpcResult<unknown> {
  return { ok: true, value }
}

function ok<T>(value: T): RpcResult<unknown> {
  return carried({ ok: true, value })
}

function invalidRequest(endpoint: string): RpcResult<unknown> {
  return carried({
    ok: false,
    error: { code: 'a2a-invalid-request', message: `invalid A2A request for endpoint "${endpoint}"`, details: {} },
  })
}

/**
 * Register the Host bridge and the plugin-owned downlink: one WebSocket
 * endpoint pushing `changed` frames on `a2a/change`, replacing the old
 * per-session watch long-poll. Unary RPC (snapshot/connect/projectCreate/
 * disconnect) stays on the Connection seam.
 */
export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as HostConnectionHandle
  const mesh = ctx.get('a2aMesh') as A2aMeshService
  const events = new PluginEvents(ctx, A2A_EVENTS_PATH)
  let nextRevision = 0
  let globalRevision = 0
  const sessionRevisions = new Map<string, number>()
  const revisionFor = (sessionId: string): number =>
    Math.max(globalRevision, sessionRevisions.get(sessionId) ?? 0)

  ctx.on('a2a/change', (change) => {
    nextRevision += 1
    if (change.scope === 'all') {
      globalRevision = nextRevision
      events.broadcast({ type: 'changed', scope: 'all', revision: nextRevision })
      return
    }
    sessionRevisions.set(change.agentId, nextRevision)
    events.broadcast({
      type: 'changed',
      scope: 'session',
      sessionId: change.agentId,
      revision: nextRevision,
    })
  })

  const handler: ConnectionRpcHandler = async (endpoint, payload, signal) => {
    try {
      switch (endpoint) {
        case A2A_RPC_ENDPOINTS.snapshot: {
          const parsed = a2aRequestSchemas.snapshot.safeParse(payload)
          if (!parsed.success) return invalidRequest(endpoint)
          const status = await mesh.status(parsed.data.sessionId)
          const projects = status.projects.map(projectView)
          const snapshot: A2aSnapshot = status.connected
            ? {
              revision: revisionFor(parsed.data.sessionId),
              connected: true,
              project: status.project,
              self: peerView({ name: status.name, presenceId: status.presenceId }, status.project, status.activity.self),
              peers: status.peers.map(peer => peerView(peer, status.project, status.activity.peers[peer.presenceId] ?? 'idle')),
              projects,
            }
            : { revision: revisionFor(parsed.data.sessionId), connected: false, peers: [], projects }
          return ok(snapshot)
        }
        case A2A_RPC_ENDPOINTS.connect: {
          const parsed = a2aRequestSchemas.connect.safeParse(payload)
          if (!parsed.success) return invalidRequest(endpoint)
          const { sessionId, project, name: rosterName } = parsed.data
          if (!PROJECT_NAME_RE.test(project)) {
            return carried({ ok: false, error: { code: 'a2a-invalid-name', message: 'invalid project name', details: { field: 'project' } } })
          }
          if (!AGENT_NAME_RE.test(rosterName)) {
            return carried({ ok: false, error: { code: 'a2a-invalid-name', message: 'invalid roster name', details: { field: 'name' } } })
          }
          const status = await mesh.connect(sessionId, project, rosterName)
          return ok({ connected: status.connected, ...(status.connected ? { name: status.name } : {}) })
        }
        case A2A_RPC_ENDPOINTS.projectCreate: {
          const parsed = a2aRequestSchemas.projectCreate.safeParse(payload)
          if (!parsed.success) return invalidRequest(endpoint)
          if (!PROJECT_NAME_RE.test(parsed.data.name)) {
            return carried({ ok: false, error: { code: 'a2a-invalid-name', message: 'invalid project name', details: { field: 'project' } } })
          }
          const project = await mesh.createProject(parsed.data.name, {
            ...(parsed.data.displayName === undefined ? {} : { displayName: parsed.data.displayName }),
            ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
          })
          return ok({ project: projectView(project) })
        }
        case A2A_RPC_ENDPOINTS.disconnect: {
          const parsed = a2aRequestSchemas.disconnect.safeParse(payload)
          if (!parsed.success) return invalidRequest(endpoint)
          return ok({ removed: await mesh.disconnect(parsed.data.sessionId) })
        }
        default:
          return invalidRequest(endpoint)
      }
    } catch (error: unknown) {
      const details: { project?: string; name?: string } = {}
      if (typeof payload === 'object' && payload !== null) {
        if ('project' in payload && typeof payload.project === 'string') details.project = payload.project
        if ('name' in payload && typeof payload.name === 'string') details.name = payload.name
      }
      return carried({
        ok: false,
        error: apiError(error, details),
      })
    }
  }

  ctx.effect(() => {
    const dispose = connection.rpc.handle(A2A_RPC_CHANNEL, handler, { authority: 'trusted-host' })
    return async () => {
      events.close()
      await dispose()
    }
  }, 'ui-a2a: connection RPC + downlink')
}
