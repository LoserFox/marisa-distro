/**
 * `@dpskh/a2a` 0.3 — the realtime A2A mesh for the DeepSeek Harness, in one
 * package with one entry plugin. Mounting the plugin provides the mesh hub
 * host (`ctx.a2aHub`: project registry + immutable message history over the
 * storage domain, with an optional listening hub server that also serves
 * the realtime WebSocket) and the mesh client (`ctx.a2aMesh`: one
 * WebSocket presence per joined agent with serial injection), plus the
 * `a2a_peers` / `a2a_message` / `a2a_history` tools and the `/a2a` command
 * surface. Presence is a live socket; messages are the durable record —
 * realtime chat on a trusted private network.
 * @module @dpskh/a2a
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { A2aHubHostService, type A2aHubHostConfig } from './hub/host.ts'
import { A2aMeshService, type MeshConfig } from './mesh.ts'
import * as toolsPlugin from './tools.ts'
import * as commandsPlugin from './commands.ts'

export { A2aError } from './error.ts'
export type { A2aErrorCode } from './error.ts'
// The standard-A2A spec constants (constants.ts) and the mesh protocol
// version (realtime-types.ts) both export `A2A_PROTOCOL_VERSION`, so the
// mesh version is re-exported under its own name and the spec pin wins the
// bare name (see constants.ts).
export { A2A_PROTOCOL_VERSION as MESH_PROTOCOL_VERSION } from './hub/realtime-types.ts'
export type {
  A2aClientFrame,
  A2aServerFrame,
  A2aAcceptedMessage,
} from './hub/realtime-types.ts'
export * from './hub/types.ts'
export * from './constants.ts'
export { a2aHubDomainSpec, compositeKey, KEY_SEP } from './hub/spec.ts'
export { A2aHubRegistry, ProjectConflictError, UnknownProjectError } from './hub/registry.ts'
export { A2aHubMessages, MessageIdConflictError, UnknownReplyTargetError, MAX_HISTORY_BYTES } from './hub/messages.ts'
export { A2aPresenceRegistry, NameInUseError } from './hub/presence.ts'
export type { A2aPresence } from './hub/presence.ts'
export { A2aHubServer, NAME_RE } from './hub/server.ts'
export { A2aHubClient, probeHub } from './hub/client.ts'
export type { HubMeta } from './hub/client.ts'
export { A2aConnection } from './hub/connection.ts'
export type { A2aConnectionEvents } from './hub/connection.ts'
export { A2aHubHostService } from './hub/host.ts'
export type { A2aHubHostConfig } from './hub/host.ts'
export { A2aMeshService } from './mesh.ts'
export type { MeshConfig, A2aChange, A2aMeshStatus, A2aMessageView, StoredConnection } from './mesh.ts'
export { DEFAULT_PROJECT, ASYNC_REPLY_GUIDANCE } from './mesh.ts'
export { snapshotAttachments, materializeAttachments } from './attachments.ts'
export type { A2aAttachmentReference } from './attachments.ts'
export { peerView } from './view.ts'
export type { A2aPeerActivity, A2aPeerView } from './view.ts'
export {
  encodeTextPayload,
  decodeTextPayload,
  encodeBinaryPayload,
  decodeBinaryPayload,
  parseEncodedAttachments,
  validateMessageContent,
  TEXT_PLAIN_LIMIT,
  DECODED_TEXT_LIMIT,
  MAX_MESSAGE_CONTENT_BYTES,
  MAX_ATTACHMENT_COUNT,
} from './hub/payload.ts'
export type { EncodedTextPayload, EncodedBinaryPayload, EncodedAttachment } from './hub/payload.ts'
export { formatMessageRef, parseMessageRef, PROJECT_NAME_RE, AGENT_NAME_RE } from './hub/message-ref.ts'
export { handleA2a } from './commands.ts'
export { buildTools } from './tools.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    a2aHub: A2aHubHostService
    a2aMesh: A2aMeshService
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'a2a'

/** Services the entry plugin itself consumes (children declare their own). */
export const inject: string[] = []

/** One plugin configuration: hub host and mesh client. */
export interface Config {
  /** Optional hub host: run the mesh hub (registry + history + HTTP/WebSocket server). */
  readonly hub?: A2aHubHostConfig
  /** Optional mesh client: connect one agent's presence on mount. */
  readonly mesh?: MeshConfig
}

/** Config validator. */
export const Config: z<Config> = z.object({
  // schemastery object schemas default to `{}` when absent; the explicit
  // `default(undefined)` keeps the optional fields truly absent.
  hub: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().required(),
    maxPort: z.number(),
  }).default(undefined as never),
  mesh: z.object({
    hubUrl: z.string(),
    project: z.string(),
    name: z.string(),
    agentId: z.string(),
    autoConnect: z.boolean(),
    persistConnections: z.boolean(),
    reconnectMs: z.number(),
  }).default(undefined as never),
})

/**
 * Mount the whole A2A mesh: the hub host (when configured), the mesh
 * client (when configured), and the tool/command surfaces. Each child
 * plugin declares its own `inject`, so cordis activates them in dependency
 * order and owns their disposers (HMR-safe).
 * @param ctx - Cordis context.
 * @param config - plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.hub !== undefined) {
    ctx.plugin(A2aHubHostService, config.hub)
  }
  if (config.mesh !== undefined) {
    ctx.plugin(A2aMeshService, config.mesh)
    // The tool and command plugins declare the mesh service and their
    // registries as inject dependencies, so cordis activates them in the
    // right order with no timing coupling (the module object carries the
    // `inject` metadata the fiber resolves).
    ctx.plugin(toolsPlugin)
    ctx.plugin(commandsPlugin)
  }
}
