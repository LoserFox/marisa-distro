/** Browser-safe A2A RPC contract carried by the public Connection seam. */
import { z } from 'zod'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { A2aPeerView } from '@dpskh/a2a/view'

/** Dedicated public Connection channel owned by this plugin. */
export const A2A_RPC_CHANNEL = '/dpskh-a2a'

export const A2A_RPC_ENDPOINTS = {
  snapshot: 'snapshot',
  connect: 'connect',
  projectCreate: 'project/create',
  disconnect: 'disconnect',
  watch: 'watch',
} as const

/** One project projected to the browser. */
export interface A2aProjectView {
  readonly name: string
  readonly displayName?: string
  readonly description?: string
  readonly createdAt: number
}

/** One authoritative A2A browser snapshot. */
export type A2aSnapshot =
  | {
    readonly revision: number
    readonly connected: false
    readonly peers: readonly []
    readonly projects: readonly A2aProjectView[]
  }
  | {
    readonly revision: number
    readonly connected: true
    readonly project: string
    readonly self: A2aPeerView
    readonly peers: readonly A2aPeerView[]
    readonly projects: readonly A2aProjectView[]
  }

/** Stable plugin-owned failures nested inside a successful Connection RPC. */
export type A2aApiError =
  | { readonly code: 'a2a-name-in-use'; readonly message: string; readonly details: { readonly project: string; readonly name: string } }
  | { readonly code: 'a2a-project-not-found'; readonly message: string; readonly details: { readonly project: string } }
  | { readonly code: 'a2a-project-conflict'; readonly message: string; readonly details: { readonly project: string } }
  | { readonly code: 'a2a-invalid-name'; readonly message: string; readonly details: { readonly field: 'project' | 'name' } }
  | { readonly code: 'a2a-invalid-request'; readonly message: string; readonly details: Record<string, never> }
  | { readonly code: 'a2a-unavailable'; readonly message: string; readonly details: Record<string, never> }
  | { readonly code: 'internal'; readonly message: string; readonly details: Record<string, never> }

/** A2A-domain result nested inside the Connection carrier result. */
export type A2aApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: A2aApiError }

export interface A2aSnapshotRequest { readonly sessionId: SessionId }
export interface A2aConnectRequest { readonly sessionId: SessionId; readonly project: string; readonly name: string }
export interface A2aProjectCreateRequest { readonly name: string; readonly displayName?: string; readonly description?: string }
export interface A2aDisconnectRequest { readonly sessionId: SessionId }
export interface A2aWatchRequest { readonly sessionId: SessionId; readonly revision: number }

/** Structural subset of the public browser Connection RPC caller. */
export interface A2aRpcTransport {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>
}

/** Typed A2A browser client. */
export interface A2aApiClient {
  snapshot(request: A2aSnapshotRequest): Promise<A2aApiResult<A2aSnapshot>>
  connect(request: A2aConnectRequest): Promise<A2aApiResult<{ connected: boolean; name?: string }>>
  projectCreate(request: A2aProjectCreateRequest): Promise<A2aApiResult<{ project: A2aProjectView }>>
  disconnect(request: A2aDisconnectRequest): Promise<A2aApiResult<{ removed: boolean }>>
  watch(request: A2aWatchRequest, signal?: AbortSignal): Promise<A2aApiResult<{ revision: number }>>
}

const projectSchema: z.ZodType<A2aProjectView> = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.number(),
}).transform(project => ({
  name: project.name,
  ...(project.displayName === undefined ? {} : { displayName: project.displayName }),
  ...(project.description === undefined ? {} : { description: project.description }),
  createdAt: project.createdAt,
}))
const peerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.literal('hub'),
  target: z.string(),
  status: z.literal('online'),
  activity: z.enum(['idle', 'conversing', 'working']),
})
const snapshotSchema: z.ZodType<A2aSnapshot> = z.discriminatedUnion('connected', [
  z.object({ revision: z.number().int().nonnegative(), connected: z.literal(false), peers: z.tuple([]), projects: z.array(projectSchema) }),
  z.object({
    revision: z.number().int().nonnegative(),
    connected: z.literal(true),
    project: z.string(),
    self: peerSchema,
    peers: z.array(peerSchema),
    projects: z.array(projectSchema),
  }),
])
const errorSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('a2a-name-in-use'), message: z.string(), details: z.object({ project: z.string(), name: z.string() }) }),
  z.object({ code: z.literal('a2a-project-not-found'), message: z.string(), details: z.object({ project: z.string() }) }),
  z.object({ code: z.literal('a2a-project-conflict'), message: z.string(), details: z.object({ project: z.string() }) }),
  z.object({ code: z.literal('a2a-invalid-name'), message: z.string(), details: z.object({ field: z.enum(['project', 'name']) }) }),
  z.object({ code: z.enum(['a2a-invalid-request', 'a2a-unavailable', 'internal']), message: z.string(), details: z.object({}) }),
])

/** Host request schemas, shared with the handler so every wire payload is validated once. */
export const a2aRequestSchemas = {
  snapshot: z.object({ sessionId: z.string() }),
  connect: z.object({ sessionId: z.string(), project: z.string(), name: z.string() }),
  projectCreate: z.object({ name: z.string(), displayName: z.string().optional(), description: z.string().optional() }),
  disconnect: z.object({ sessionId: z.string() }),
  watch: z.object({ sessionId: z.string(), revision: z.number().int().nonnegative() }),
} as const
const connectResultSchema: z.ZodType<{ connected: boolean; name?: string }> = z.object({
  connected: z.boolean(),
  name: z.string().optional(),
}).transform(result => ({
  connected: result.connected,
  ...(result.name === undefined ? {} : { name: result.name }),
}))

/** Create the typed browser client over public Connection generic RPC. */
export function createA2aApiClient(rpc: A2aRpcTransport): A2aApiClient {
  const call = async <T>(endpoint: string, payload: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<A2aApiResult<T>> => {
    const carrier = await rpc.call(A2A_RPC_CHANNEL, endpoint, payload, signal)
    if (!carrier.ok) return { ok: false, error: { code: 'internal', message: carrier.error.message, details: {} } }
    const parsed = z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), value: schema }),
      z.object({ ok: z.literal(false), error: errorSchema }),
    ]).safeParse(carrier.value)
    if (!parsed.success) {
      return { ok: false, error: { code: 'internal', message: 'invalid A2A response from host', details: {} } }
    }
    return parsed.data as A2aApiResult<T>
  }
  return {
    snapshot: request => call(A2A_RPC_ENDPOINTS.snapshot, request, snapshotSchema),
    connect: request => call(A2A_RPC_ENDPOINTS.connect, request, connectResultSchema),
    projectCreate: request => call(A2A_RPC_ENDPOINTS.projectCreate, request, z.object({ project: projectSchema })),
    disconnect: request => call(A2A_RPC_ENDPOINTS.disconnect, request, z.object({ removed: z.boolean() })),
    watch: (request, signal) => call(A2A_RPC_ENDPOINTS.watch, request, z.object({ revision: z.number().int().nonnegative() }), signal),
  }
}
