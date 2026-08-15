/**
 * Realtime wire frames (protocol version 3): the client/server vocabulary
 * over the `/v1/connect` WebSocket. Text and attachment content travel as
 * encoded payloads; frames are plain JSON text.
 * @module @dpskh/a2a/hub/realtime-types
 */

import type { A2aMessageRequestTarget, A2aPeer, A2aRealtimeMessage } from './types.ts'
import type { EncodedAttachment, EncodedTextPayload } from './payload.ts'

/** The mesh protocol version this seam implements. */
export const A2A_PROTOCOL_VERSION = 3

/** One accepted send: the stored message plus the recipients at accept time. */
export type A2aAcceptedMessage = {
  readonly message: A2aRealtimeMessage
  readonly recipients: readonly string[]
}

/** Client→Hub frames. */
export type A2aClientFrame =
  | { type: 'hello'; protocolVersion: number; project: string; name: string }
  | {
    type: 'message'
    requestId: string
    messageId: string
    target: A2aMessageRequestTarget
    payload: EncodedTextPayload
    attachments: EncodedAttachment[]
    replyTo?: string
  }
  | { type: 'delivered'; messageId: string }
  | { type: 'delivery_failed'; messageId: string; error: string }

/** Hub→Client frames. */
export type A2aServerFrame =
  | {
    type: 'claimed'
    protocolVersion: typeof A2A_PROTOCOL_VERSION
    project: string
    self: A2aPeer
    peers: A2aPeer[]
  }
  | { type: 'presence_joined'; peer: A2aPeer }
  | {
    type: 'presence_left'
    peer: A2aPeer
    reason: 'connection_closed' | 'heartbeat_timeout' | 'hub_shutdown'
  }
  | { type: 'accepted'; requestId: string; message: A2aRealtimeMessage; recipients: string[] }
  | { type: 'message'; message: A2aRealtimeMessage }
  | ({ type: 'delivery' } & (
    | { messageId: string; to: string; status: 'delivered' | 'disconnected' }
    | { messageId: string; to: string; status: 'failed'; error: string }
  ))
  | { type: 'error'; code: string; message: string; requestId?: string }
