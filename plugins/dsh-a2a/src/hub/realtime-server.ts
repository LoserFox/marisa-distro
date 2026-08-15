/**
 * The realtime hub: presence over one WebSocket per connection, immutable
 * message append, and in-memory delivery outcomes. A presence exists if and
 * only if its socket is alive; direct messages resolve the target's current
 * presence at accept time, and project broadcasts freeze the current
 * presence snapshot (never backfilling later joiners). Delivery is
 * in-memory only: `delivered` proves the receiving client injected the
 * message, `failed` a materialization/injection error, `disconnected` a
 * socket that closed before acknowledging.
 * @module @dpskh/a2a/hub/realtime-server
 */

import type { IncomingMessage, Server } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { A2aHubMessages, MessageIdConflictError, UnknownReplyTargetError } from './messages.ts'
import { PayloadTooLargeError } from './payload.ts'
import { A2aPresenceRegistry, NameInUseError, type A2aPresence } from './presence.ts'
import {
  A2A_PROTOCOL_VERSION,
  type A2aClientFrame,
  type A2aServerFrame,
} from './realtime-types.ts'
import type { A2aMessageTarget, A2aProject } from './types.ts'

/** One WebSocket frame's byte cap (text + attachment base64 fits below it). */
const MAX_FRAME_BYTES = 6 * 1024 * 1024

/** Presence heartbeat cadence (WS ping/pong, not an application lease). */
const HEARTBEAT_MS = 10_000

/** A socket that sends no hello this long is closed. */
const HELLO_TIMEOUT_MS = 5_000

/** Delivery failure error text cap. */
const MAX_DELIVERY_ERROR_BYTES = 512

/** The direct recipient is not currently present. */
class RecipientNotPresentError extends Error {}

/** Decode one ws message payload to text (text frames arrive as Buffer on Node). */
function frameText(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(new Uint8Array(data)).toString('utf8')
}

/** One in-flight delivery awaiting the recipient's acknowledgment. */
type PendingDelivery = {
  messageId: string
  senderPresenceId: string
  recipientPresenceId: string
  recipientName: string
}

/** The realtime hub over one HTTP server and one message store. */
export class A2aRealtimeHub {
  private readonly server: Server
  private readonly wss: WebSocketServer
  private readonly presences = new A2aPresenceRegistry()
  private readonly alive = new Map<WebSocket, boolean>()
  private readonly closeReasons = new Map<WebSocket, 'connection_closed' | 'heartbeat_timeout' | 'hub_shutdown'>()
  private readonly pendingDeliveries = new Map<string, PendingDelivery>()
  private readonly heartbeat: ReturnType<typeof setInterval>
  private readonly upgradeHandler: (request: IncomingMessage, socket: Socket, head: Buffer) => void
  private closing = false

  /**
   * @param server - the hub's HTTP server (upgrade events are hijacked).
   * @param messages - the message store backing appends and history.
   * @param getProject - synchronous project lookup for claim validation.
   */
  constructor(
    server: Server,
    private readonly messages: A2aHubMessages,
    private readonly getProject: (name: string) => A2aProject | null,
  ) {
    this.server = server
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })
    this.upgradeHandler = (request, socket, head) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname !== '/v1/connect') {
        socket.destroy()
        return
      }
      this.wss.handleUpgrade(request, socket, head, websocket =>
        this.wss.emit('connection', websocket, request),
      )
    }
    server.on('upgrade', this.upgradeHandler)
    this.wss.on('connection', (socket) => { this.accept(socket) })
    this.heartbeat = setInterval(() => { this.heartbeatConnections() }, HEARTBEAT_MS)
  }

  /**
   * Present count of one project (project deletion refuses active presences).
   * @param project - project name.
   * @returns the number of live presences.
   */
  count(project: string): number {
    return this.presences.count(project)
  }

  /** Close every presence and the WebSocket server (hub teardown). */
  close(): void {
    if (this.closing) return
    this.closing = true
    clearInterval(this.heartbeat)
    this.server.off('upgrade', this.upgradeHandler)
    for (const presence of this.presences.close()) {
      this.closeReasons.set(presence.socket, 'hub_shutdown')
    }
    for (const socket of this.wss.clients) socket.terminate()
    this.pendingDeliveries.clear()
    this.wss.close()
  }

  /** Accept one connection: hello handshake, then frame handling. */
  private accept(socket: WebSocket): void {
    this.alive.set(socket, true)
    socket.on('pong', () => this.alive.set(socket, true))
    const helloTimeout = setTimeout(() => {
      if (!this.presences.getBySocket(socket)) socket.close(1008, 'hello timeout')
    }, HELLO_TIMEOUT_MS)
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        this.send(socket, {
          type: 'error',
          code: 'invalid_frame',
          message: 'binary frames are not supported',
        })
        return
      }
      try {
        const frame = JSON.parse(frameText(data)) as unknown
        this.handleFrame(socket, frame)
      } catch (error) {
        this.send(socket, {
          type: 'error',
          code: 'invalid_frame',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    socket.once('close', () => {
      clearTimeout(helloTimeout)
      this.alive.delete(socket)
      const presence = this.presences.remove(socket)
      if (!presence) return
      this.failDeliveriesFor(presence)
      if (!this.closing) {
        this.broadcast(presence.project, presence.presenceId, {
          type: 'presence_left',
          peer: { name: presence.name, presenceId: presence.presenceId },
          reason: this.closeReasons.get(socket) ?? 'connection_closed',
        })
      }
      this.closeReasons.delete(socket)
    })
  }

  /** Dispatch one parsed frame to its handler. */
  private handleFrame(socket: WebSocket, value: unknown): void {
    if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
      throw new Error('frame type is required')
    }
    const claimed = this.presences.getBySocket(socket)
    if (!claimed) {
      if (value.type !== 'hello') throw new Error('hello must be the first frame')
      this.claim(socket, value as Partial<Extract<A2aClientFrame, { type: 'hello' }>>)
      return
    }
    if (value.type === 'message') {
      void this.handleMessage(claimed, value as Partial<Extract<A2aClientFrame, { type: 'message' }>>)
      return
    }
    if (value.type === 'delivered') {
      const frame = value as Partial<Extract<A2aClientFrame, { type: 'delivered' }>>
      this.handleDeliveryResult(claimed, frame.messageId, 'delivered')
      return
    }
    if (value.type === 'delivery_failed') {
      const frame = value as Partial<Extract<A2aClientFrame, { type: 'delivery_failed' }>>
      if (
        typeof frame.error !== 'string'
        || frame.error.length === 0
        || Buffer.byteLength(frame.error, 'utf8') > MAX_DELIVERY_ERROR_BYTES
      ) {
        throw new Error('delivery failure error is invalid')
      }
      this.handleDeliveryResult(claimed, frame.messageId, 'failed', frame.error)
      return
    }
    throw new Error(`unsupported frame type: ${value.type}`)
  }

  /** Claim one name for a socket: validate, register, then announce. */
  private claim(socket: WebSocket, frame: Partial<Extract<A2aClientFrame, { type: 'hello' }>>): void {
    try {
      if (frame.protocolVersion !== A2A_PROTOCOL_VERSION) {
        throw new Error(`Hub requires protocol ${A2A_PROTOCOL_VERSION}`)
      }
      if (typeof frame.project !== 'string' || typeof frame.name !== 'string') {
        throw new Error('project and name are required')
      }
      const project = this.getProject(frame.project)
      if (!project) {
        this.send(socket, {
          type: 'error',
          code: 'unknown_project',
          message: `unknown project: ${frame.project}`,
        })
        socket.close(1008, 'unknown_project')
        return
      }
      const { self, peers } = this.presences.claim(project.name, frame.name, socket)
      this.send(socket, {
        type: 'claimed',
        protocolVersion: A2A_PROTOCOL_VERSION,
        project: self.project,
        self: { name: self.name, presenceId: self.presenceId },
        peers,
      })
      this.broadcast(self.project, self.presenceId, {
        type: 'presence_joined',
        peer: { name: self.name, presenceId: self.presenceId },
      })
    } catch (error) {
      const code = frame.protocolVersion !== A2A_PROTOCOL_VERSION
        ? 'protocol_mismatch'
        : error instanceof NameInUseError
          ? 'name_in_use'
          : 'claim_rejected'
      this.send(socket, {
        type: 'error',
        code,
        message: error instanceof Error ? error.message : String(error),
      })
      socket.close(1008, code)
    }
  }

  /** Append one message and deliver it to the current recipient snapshot. */
  private async handleMessage(
    presence: A2aPresence,
    frame: Partial<Extract<A2aClientFrame, { type: 'message' }>>,
  ): Promise<void> {
    const requestId = typeof frame.requestId === 'string' ? frame.requestId : undefined
    try {
      if (
        !requestId
        || typeof frame.messageId !== 'string'
        || !frame.target
        || !frame.payload
        || !frame.attachments
      ) {
        throw new Error('requestId, messageId, target, payload and attachments are required')
      }
      if (frame.replyTo !== undefined && typeof frame.replyTo !== 'string') {
        throw new Error('invalid replyTo')
      }
      let target: A2aMessageTarget
      let recipients: A2aPresence[]
      if (frame.target.type === 'agent') {
        if (typeof frame.target.name !== 'string') throw new Error('recipient name is required')
        const recipient = this.presences.get(presence.project, frame.target.name)
        if (!recipient) {
          throw new RecipientNotPresentError(`recipient is not present: ${frame.target.name}`)
        }
        if (recipient.presenceId === presence.presenceId) {
          throw new Error('cannot send to yourself')
        }
        target = { type: 'agent', name: recipient.name, presenceId: recipient.presenceId }
        recipients = [recipient]
      } else {
        target = { type: 'project' }
        recipients = this.presences
          .connections(presence.project)
          .filter(recipient => recipient.presenceId !== presence.presenceId)
      }
      const appended = await this.messages.append({
        messageId: frame.messageId,
        project: presence.project,
        from: { name: presence.name, presenceId: presence.presenceId },
        target,
        payload: frame.payload,
        attachments: frame.attachments,
        createdAt: Date.now(),
        ...(frame.replyTo === undefined ? {} : { replyTo: frame.replyTo }),
      })
      if (appended.inserted) {
        for (const recipient of recipients) {
          this.pendingDeliveries.set(`${appended.message.messageId}:${recipient.presenceId}`, {
            messageId: appended.message.messageId,
            senderPresenceId: presence.presenceId,
            recipientPresenceId: recipient.presenceId,
            recipientName: recipient.name,
          })
          this.send(recipient.socket, { type: 'message', message: appended.message })
        }
      }
      this.send(presence.socket, {
        type: 'accepted',
        requestId,
        message: appended.message,
        recipients: recipients.map(recipient => recipient.name),
      })
    } catch (error) {
      const code = error instanceof RecipientNotPresentError
        ? 'recipient_not_present'
        : error instanceof MessageIdConflictError
          ? 'message_id_conflict'
          : error instanceof UnknownReplyTargetError
            ? 'unknown_reply'
            : error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'message_rejected'
      this.send(presence.socket, {
        type: 'error',
        ...(requestId === undefined ? {} : { requestId }),
        code,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Settle one pending delivery from the recipient's acknowledgment. */
  private handleDeliveryResult(
    presence: A2aPresence,
    messageId: unknown,
    status: 'delivered' | 'failed',
    error?: string,
  ): void {
    if (typeof messageId !== 'string') throw new Error('messageId is required')
    const key = `${messageId}:${presence.presenceId}`
    const pending = this.pendingDeliveries.get(key)
    if (!pending) throw new Error(`unknown delivery: ${messageId}`)
    this.pendingDeliveries.delete(key)
    const sender = this.presences
      .connections(presence.project)
      .find(candidate => candidate.presenceId === pending.senderPresenceId)
    if (!sender) return
    if (status === 'failed') {
      this.send(sender.socket, {
        type: 'delivery',
        messageId: pending.messageId,
        to: pending.recipientName,
        status,
        error: error ?? 'receiver failed to inject message',
      })
      return
    }
    this.send(sender.socket, {
      type: 'delivery',
      messageId: pending.messageId,
      to: pending.recipientName,
      status,
    })
  }

  /** Fail every pending delivery bound to a closing presence. */
  private failDeliveriesFor(presence: A2aPresence): void {
    for (const [key, pending] of this.pendingDeliveries) {
      if (pending.recipientPresenceId !== presence.presenceId) continue
      this.pendingDeliveries.delete(key)
      const sender = this.presences
        .connections(presence.project)
        .find(candidate => candidate.presenceId === pending.senderPresenceId)
      if (sender) {
        this.send(sender.socket, {
          type: 'delivery',
          messageId: pending.messageId,
          to: pending.recipientName,
          status: 'disconnected',
        })
      }
    }
  }

  /** Send one frame to every presence of a project except one. */
  private broadcast(project: string, excludedPresenceId: string, frame: A2aServerFrame): void {
    for (const presence of this.presences.connections(project)) {
      if (presence.presenceId !== excludedPresenceId) this.send(presence.socket, frame)
    }
  }

  /** Send one frame on an open socket. */
  private send(socket: WebSocket, frame: A2aServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
  }

  /** Ping/pong heartbeat: a socket that misses a ping is terminated. */
  private heartbeatConnections(): void {
    for (const socket of this.wss.clients) {
      if (this.alive.get(socket) === false) {
        this.closeReasons.set(socket, 'heartbeat_timeout')
        socket.terminate()
        continue
      }
      this.alive.set(socket, false)
      socket.ping()
    }
  }
}
