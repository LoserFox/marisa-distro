/**
 * Per-session cancellation and freshness gate for auxiliary model calls.
 *
 * @module @dsh-external/dsh-suggested-replies/generation-gate
 */

/** Opaque capability to commit the result of one started generation. */
export interface GenerationLease {
  /** Session-local key supplied by the host. */
  readonly key: string
  /** Monotonic session-local generation revision. */
  readonly revision: number
  /** Cancellation signal supplied to the auxiliary LLM call. */
  readonly signal: AbortSignal
}

interface ActiveGeneration extends GenerationLease {
  readonly controller: AbortController
  readonly timeout: ReturnType<typeof setTimeout>
}

/**
 * Ensures at most one candidate-generation request can commit per session.
 * Starting a later request, receiving new user input, timing out, or disposing
 * the plugin invalidates the prior lease before it can commit stale sidecar state.
 */
export class GenerationGate {
  private readonly active = new Map<string, ActiveGeneration>()
  private readonly revisions = new Map<string, number>()

  /**
   * Start the current generation for a session, cancelling an older one first.
   * @param key - stable session-local identity.
   * @param timeoutMs - maximum time the auxiliary model call may remain active.
   * @returns the lease whose holder may commit if it remains current.
   */
  start(key: string, timeoutMs: number): GenerationLease {
    this.cancel(key)
    const revision = (this.revisions.get(key) ?? 0) + 1
    this.revisions.set(key, revision)

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort(new Error('suggested replies generation timed out'))
    }, timeoutMs)
    const active: ActiveGeneration = { key, revision, signal: controller.signal, controller, timeout }
    this.active.set(key, active)
    return active
  }

  /**
   * Test whether a lease is still the current, non-aborted generation.
   * @param lease - a lease returned by {@link start}.
   * @returns whether the lease may commit its generation state.
   */
  isCurrent(lease: GenerationLease): boolean {
    const active = this.active.get(lease.key)
    return active?.revision === lease.revision && !lease.signal.aborted
  }

  /**
   * Test whether a lease still owns the current map entry, even when its own
   * timeout signal has fired. Callers use this to replace a loading state with
   * cleared state after a timeout without allowing explicitly cancelled work to commit.
   * @param lease - a lease returned by {@link start}.
   * @returns whether no newer request or explicit invalidation replaced it.
   */
  owns(lease: GenerationLease): boolean {
    return this.active.get(lease.key)?.revision === lease.revision
  }

  /**
   * Release a completed current lease. A stale lease cannot release a newer one.
   * @param lease - the finished generation lease.
   * @returns whether this lease owned the active generation.
   */
  release(lease: GenerationLease): boolean {
    if (!this.owns(lease)) return false
    const active = this.active.get(lease.key)
    if (active === undefined) return false
    clearTimeout(active.timeout)
    this.active.delete(lease.key)
    return true
  }

  /**
   * Invalidate a session's active generation.
   * @param key - stable session-local identity.
   * @returns whether a generation was cancelled.
   */
  cancel(key: string): boolean {
    const active = this.active.get(key)
    if (active === undefined) return false
    clearTimeout(active.timeout)
    this.active.delete(key)
    active.controller.abort(new Error('suggested replies generation invalidated'))
    return true
  }

  /**
   * Invalidate every active generation during settings changes or teardown.
   * @returns affected session keys.
   */
  cancelAll(): string[] {
    const keys = [...this.active.keys()]
    for (const key of keys) this.cancel(key)
    return keys
  }

  /** Abort all active requests and clear retained session state. */
  dispose(): void {
    this.cancelAll()
    this.revisions.clear()
  }
}
