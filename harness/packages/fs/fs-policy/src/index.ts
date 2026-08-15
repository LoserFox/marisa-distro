/**
 * Event-only filesystem observation policy; it registers no service. A weak owner/target map
 * records every successful read or mutation, single-slot intent listeners supply that version,
 * and the provider performs the atomic freshness check. Without this plugin, tools retain the
 * bare provider's unconditional mutation behavior. See the package README for composition rules.
 * @module @deepseek-ai/dsh-fs-policy
 */

import type { Context } from 'cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget, FsVersion, FsWriteIntent } from '@deepseek-ai/dsh-fs'
import type { FsPolicyExec } from './types.ts'

export type { FsPolicyExec } from './types.ts'

/**
 * Per-context observed-file state and the three `fs/*` decisions over it. One
 * instance is created per `apply()` so disposal can drop all state for HMR.
 */
class ObservedStateGate {
  /**
   * Observed-file state, keyed first by the owner object (weakly held, so a
   * collected session frees its state), then by {@link FsTarget.targetKey}. An
   * entry's PRESENCE is the prior-observation record.
   */
  private observed = new WeakMap<object, Map<string, FsVersion>>()

  /**
   * Derive the observed-state owner from the opaque event actor — normally the
   * active agent session. `undefined` when no owner can be derived (e.g. a
   * direct tool call with no agent); such calls read freely but cannot satisfy
   * the write/edit prior-observation policy.
   */
  private owner(actor: object | undefined): object | undefined {
    // tsgolint treats object as assignable to weak FsPolicyExec, while tsc still requires the structural cast for property access.
    // See the analyzer-divergence consequence in .agents/notes/implemented/process/2026-07-29-oxlint-linter.md.
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- The analyzers disagree on this weak type.
    return (actor as FsPolicyExec | undefined)?.agent?.session
  }

  private get(owner: object, targetKey: string): FsVersion | undefined {
    return this.observed.get(owner)?.get(targetKey)
  }

  private set(owner: object, targetKey: string, version: FsVersion): void {
    let byTarget = this.observed.get(owner)
    if (!byTarget) {
      byTarget = new Map()
      this.observed.set(owner, byTarget)
    }
    byTarget.set(targetKey, version)
  }

  /** Drop all recorded state (HMR safety / disposal). */
  clear(): void {
    this.observed = new WeakMap()
  }

  /**
   * Decide the write intent: no prior observation ⇒ `createIfAbsent` (only
   * new files can be created blindly); a prior observation ⇒ `replaceIfVersion`
   * at the observed version (existing files replaced only if unchanged).
   */
  writeIntent(target: FsTarget, actor: object | undefined): FsWriteIntent {
    const owner = this.owner(actor)
    const prior = owner ? this.get(owner, target.targetKey) : undefined
    return prior ? { kind: 'replaceIfVersion', version: prior } : { kind: 'createIfAbsent' }
  }

  /**
   * Decide the edit version guard: requires a prior observation by this owner
   * (else `FS_NOT_OBSERVED`); returns the observed version as the CAS basis.
   */
  editIntent(target: FsTarget, actor: object | undefined): { version: FsVersion } {
    const owner = this.owner(actor)
    const prior = owner ? this.get(owner, target.targetKey) : undefined
    if (!owner || !prior) {
      throw new FsError(`edit requires reading "${target.displayPath}" first`, 'FS_NOT_OBSERVED')
    }
    return { version: prior }
  }

  /** Record a successful read/write/edit: this owner observed this target at this version. */
  observe(target: FsTarget, version: FsVersion, actor: object | undefined): void {
    const owner = this.owner(actor)
    if (owner) this.set(owner, target.targetKey, version)
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'fs-policy'

/**
 * Register the three `fs/*` listeners. No `inject` — this plugin reads no
 * services; it operates only on its own `WeakMap`. The waterfalls are unbound
 * (the tool dispatches them with no `this`), so the listeners take the raw
 * `(target, actor, next)` arguments.
 */
export function apply(ctx: Context): void {
  const gate = new ObservedStateGate()

  ctx.effect(() => () => {
    // Drop all recorded state on disposal so a reloaded plugin starts clean
    // (HMR safety). The WeakMap itself would be GC'd, but replacing it makes the
    // release observable and immediate for tests.
    gate.clear()
  }, 'fs-policy observed-state teardown')

  // fs/write-intent: occupy the single decision slot — do NOT call next().
  // Deferred through Promise.resolve().then so the declared Promise return type
  // holds (a throw rejects, never escapes synchronously through the waterfall).
  ctx.on('fs/write-intent', (target, actor) => Promise.resolve().then(() => { return gate.writeIntent(target, actor) }))

  // fs/edit-intent: occupy the single decision slot — do not call next().
  ctx.on('fs/edit-intent', (target, actor) => Promise.resolve().then(() => gate.editIntent(target, actor)))

  // fs/observed must remain synchronous and non-throwing: the mutation already succeeded, and
  // emit does not await promises. WeakMap.set satisfies that contract.
  ctx.on('fs/observed', (target, version, actor) => {
    gate.observe(target, version, actor)
  })
}
