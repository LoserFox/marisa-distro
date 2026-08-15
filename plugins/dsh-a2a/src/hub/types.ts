/**
 * Mesh wire vocabulary (protocol version 3): peers, message targets,
 * realtime messages, delivery outcomes, and the history query shapes.
 * Field names mirror the JSON wire; enums are lowercase like the frames
 * they ride. Presence is in-memory — a socket alive is a member — and
 * messages are the only durable record.
 * @module @dpskh/a2a/hub/types
 */

import type { EncodedAttachment, EncodedTextPayload } from './payload.ts'

/** One currently present agent in a project. */
export interface A2aPeer {
  /** The claimed roster name, unique within its project. */
  readonly name: string
  /** The presence id assigned by the hub at claim; unique per connection. */
  readonly presenceId: string
}

/** A message target as stored in history: direct name, or project broadcast. */
export type A2aMessageTarget =
  | { type: 'agent'; name: string; presenceId?: string }
  | { type: 'project' }

/** The target shape a sender submits: current name, or project broadcast. */
export type A2aMessageRequestTarget =
  | { type: 'agent'; name: string }
  | { type: 'project' }

/** One immutable project-scoped message, as persisted and delivered. */
export interface A2aRealtimeMessage {
  /** Opaque sender-chosen idempotency key (retrying the same body returns the original message). */
  readonly messageId: string
  /** Friendly reference "<project>:<sequence>" (for example `demo:42`). */
  readonly messageRef: string
  readonly project: string
  /** Monotonic per-project sequence, assigned by the hub at append. */
  readonly sequence: number
  /** The sending presence at append time. */
  readonly from: A2aPeer
  readonly target: A2aMessageTarget
  readonly payload: EncodedTextPayload
  readonly attachments: readonly EncodedAttachment[]
  readonly createdAt: number
  /** Friendly reference of the replied-to message, when any. */
  readonly replyTo?: string
}

/** One delivery outcome reported to the sender. */
export type A2aDeliveryEvent =
  | { messageId: string; to: string; status: 'delivered' | 'disconnected' }
  | { messageId: string; to: string; status: 'failed'; error: string }

/** History query filters. */
export interface A2aHistoryQuery {
  readonly project: string
  /** Only messages before this reference (exclusive). */
  readonly before?: string
  /** Only messages after this reference (exclusive). */
  readonly after?: string
  /** Maximum messages; defaults to 50, capped at 500. */
  readonly limit?: number
  /** Only messages from this sender name. */
  readonly from?: string
}

/** One history page: newest-first, newest-capped by decoded byte budget. */
export interface A2aHistoryPage {
  readonly messages: readonly A2aRealtimeMessage[]
}

/** One mesh project. */
export interface A2aProject {
  readonly name: string
  readonly displayName?: string
  readonly description?: string
  readonly createdAt: number
  readonly createdByCwd?: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    a2a: A2aMessageSource
  }
}

/** Producer provenance of an injected mesh message. */
export interface A2aMessageSource {
  kind: 'a2a'
  /** The message's msgId, used by consumers for idempotent delivery. */
  msgId: string
  /** The project-scoped friendly reference. */
  messageRef: string
}
