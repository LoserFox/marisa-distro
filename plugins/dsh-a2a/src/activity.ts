/**
 * Conversation-activity tracking for one mesh membership: the local view
 * that drives the connection-graph animations. Activity is inferred from
 * message flow — a recent exchange marks both parties `conversing`, a
 * delivered send marks the recipient `working` until it answers, and the
 * local presence is `working` while its agent runs on a received message.
 * No wire state crosses the hub; windows are fixed UX constants.
 * @module @dpskh/a2a/activity
 */

import type { A2aPeerActivity } from './view.ts'

/** How long a message exchange keeps both parties visibly conversing. */
export const CONVERSATION_WINDOW_MS = 30_000

/** How long a delivered send keeps its recipient visibly working without an answer. */
export const PEER_WORKING_WINDOW_MS = 180_000

/**
 * Per-membership activity ledger. Timestamps are keyed by roster name;
 * every mutation reports through {@link onChange} so the browser refetches
 * the authoritative snapshot, and one rescheduling timer purges expired
 * entries.
 */
export class A2aActivityTracker {
  /** Peer name → last message-exchange timestamp (either direction). */
  private readonly exchanges = new Map<string, number>()
  /** Peer name → timestamp until which the peer shows working. */
  private readonly workingUntil = new Map<string, number>()
  /** An inbound message arrived since the agent last went idle. */
  private inboundSinceIdle = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /**
   * @param onChange - report every state-relevant mutation (including decay).
   * @param now - injectable clock for tests.
   */
  constructor(
    private readonly onChange: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Record one accepted send to its recipients (both sides start conversing).
   * @param recipients - roster names the send addressed.
   */
  noteSent(recipients: readonly string[]): void {
    if (this.disposed) return
    const at = this.now()
    for (const recipient of recipients) this.exchanges.set(recipient, at)
    this.schedule(at)
    this.onChange()
  }

  /**
   * Record one inbound message: the sender joins the conversation and is no
   * longer working, and the local agent has an inbound message to process.
   * @param from - roster name of the sender.
   */
  noteReceived(from: string): void {
    if (this.disposed) return
    const at = this.now()
    this.exchanges.set(from, at)
    this.workingUntil.delete(from)
    this.inboundSinceIdle = true
    this.schedule(at)
    this.onChange()
  }

  /**
   * Record one delivery outcome for a send from this membership.
   * @param to - roster name of the recipient.
   * @param delivered - whether the recipient injected the message.
   */
  noteDelivery(to: string, delivered: boolean): void {
    if (this.disposed) return
    const at = this.now()
    if (delivered) this.workingUntil.set(to, at + PEER_WORKING_WINDOW_MS)
    else this.workingUntil.delete(to)
    this.schedule(at)
    this.onChange()
  }

  /** Clear the local working flag when the owning agent returns to idle. */
  noteIdle(): void {
    if (this.disposed || !this.inboundSinceIdle) return
    this.inboundSinceIdle = false
    this.onChange()
  }

  /**
   * One peer's current activity.
   * @param name - roster name.
   * @returns `working` while a delivered send awaits its answer, else
   * `conversing` while an exchange is recent, else `idle`.
   */
  peerActivity(name: string): A2aPeerActivity {
    const at = this.now()
    if ((this.workingUntil.get(name) ?? 0) > at) return 'working'
    if ((this.exchanges.get(name) ?? 0) + CONVERSATION_WINDOW_MS > at) return 'conversing'
    return 'idle'
  }

  /**
   * The local presence's current activity.
   * @param running - whether the owning agent is currently running.
   * @returns `working` while the agent runs on a received message, else
   * `conversing` while any exchange is recent, else `idle`.
   */
  selfActivity(running: boolean): A2aPeerActivity {
    if (running && this.inboundSinceIdle) return 'working'
    const at = this.now()
    for (const exchangedAt of this.exchanges.values()) {
      if (exchangedAt + CONVERSATION_WINDOW_MS > at) return 'conversing'
    }
    return 'idle'
  }

  /** Stop the decay timer (membership teardown). */
  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  /** Reschedule the single decay timer to the earliest future expiry. */
  private schedule(at: number): void {
    let next = Number.POSITIVE_INFINITY
    for (const exchangedAt of this.exchanges.values()) {
      next = Math.min(next, exchangedAt + CONVERSATION_WINDOW_MS)
    }
    for (const until of this.workingUntil.values()) next = Math.min(next, until)
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (next > at && next !== Number.POSITIVE_INFINITY) {
      this.timer = setTimeout(() => { this.expire() }, next - at)
    }
  }

  /** Purge expired entries; report when anything actually decayed. */
  private expire(): void {
    const at = this.now()
    let changed = false
    for (const [name, exchangedAt] of this.exchanges) {
      if (exchangedAt + CONVERSATION_WINDOW_MS <= at) {
        this.exchanges.delete(name)
        changed = true
      }
    }
    for (const [name, until] of this.workingUntil) {
      if (until <= at) {
        this.workingUntil.delete(name)
        changed = true
      }
    }
    this.schedule(at)
    if (changed) this.onChange()
  }
}
