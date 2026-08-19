/**
 * Link ownership and containerized dispatch (#14, §13/§16 group 5/16.4):
 * the manager diverts managed listener registrations through the Cordis
 * `internal/listener` bail and holds the only two real registrations per
 * managed event — the outermost band on `prepend: true`, derived+innermost on
 * one normal registration. Every managed listener runs inside a container
 * that swallows throws, enforces declared return discipline, meters own-time
 * CPU (excluding awaited `next()` windows), and surfaces violations.
 * @module @r05en1cu/dsh-mygo/src/dispatch
 */

import { PluginError, formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type { Context, EventOptions } from '@deepseek-ai/cordis'
import { EVENT_VOCABULARY } from './event-vocabulary.ts'

/** Loose Cordis registration surface the machine needs for string event names. */
interface LooseOn {
  // The vendored `internal/listener` signature is stale (options vs boolean),
  // so the registration surface is loose by design at this seam.
  // oxlint-disable-next-line typescript/no-explicit-any -- loose cordis listener slot.
  on(name: string, listener: (...args: any[]) => unknown, options?: unknown): () => boolean
}

/** Symbol carrying managed-listener metadata through the Cordis options slot. */
export const MANAGED_META = Symbol('dsh.dsh-mygo.managed-listener')

/** Dispatch mode of one managed event (§7 ceiling table). */
export type EventDispatchMode = 'emit' | 'parallel' | 'serial' | 'waterfall'

/** A managed listener's declaration context, supplied by the env bridge. */
export interface ManagedListenerMetadata {
  /** Owning plugin id. */
  readonly pluginId: string
  /** Declared permission level for this event. */
  readonly mode: 'observe' | 'transform' | 'intercept'
  /** Manifest position; the only listener-option entry. */
  readonly position: 'outermost' | 'derived' | 'innermost'
  /** Declared intercept branch vocabulary, when the mode is `intercept`. */
  readonly returns?: readonly string[]
  /** Agent-scope key for scoped registrations; absent = unscoped. */
  readonly scope?: string
}

/** One diverted managed listener entry stored in the per-event arrays. */
export interface ManagedListenerEntry extends ManagedListenerMetadata {
  /** Managed event this listener was registered on. */
  readonly event: string
  /** The plugin's raw listener, called with the dispatch payload. */
  readonly listener: (...args: unknown[]) => unknown
}

/** A surfaced dispatch-boundary violation or 16.4 warn event. */
export interface DispatchViolation {
  /** §16.2 group-5 code or §16.4 warn-event name. */
  readonly code:
    | 'next-missing'
    | 'undeclared-veto'
    | 'undeclared-branch'
    | 'quota-cpu-exceeded'
    | 'veto-suppressed'
    | 'intercept-skipped'
  /** Machine-readable naming entities. */
  readonly details: Record<string, unknown>
  /** Human-readable message. */
  readonly message: string
}

/** Options for the dispatch machine. */
export interface DispatchMachineOptions {
  /** Managed events the machine takes over, with their dispatch modes. */
  readonly vocabulary?: ReadonlyMap<string, EventDispatchMode>
  /** Resolve a dispatch receiver's scope key; absent receivers are unscoped. */
  readonly scopeKeyOf?: (thisArg: unknown) => string | undefined
  /** Own-time CPU budget per listener call, milliseconds (§18). Internally: mana. Five empty casts and you're benched. */
  readonly cpuBudgetMs?: number
  /** Violation sink; defaults to `ctx.logger.warn`. */
  readonly onViolation?: (violation: DispatchViolation) => void
  /** Called when a plugin reaches five consecutive CPU-quota violations (SEC:148). */
  readonly onAutoDisable?: (pluginId: string) => void
}

/** The per-band arrays one dispatch walks. */
interface EventBandArrays {
  readonly outermost: readonly ManagedListenerEntry[]
  readonly middle: readonly ManagedListenerEntry[]
}

/** Outcome of one contained listener call. */
type ListenerOutcome =
  | { readonly kind: 'ok'; readonly result: unknown }
  | { readonly kind: 'veto'; readonly result: unknown }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'threw' }

/** Waterfall settlement outcomes (a throw never reaches this stage). */
type WaterfallOutcome =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'ok' | 'veto'; readonly result: unknown }

const MIGRATION_HINT = 'managed listeners cannot veto by throwing; keep the plugin raw or refactor to a grant-gated intercept on a decision event (§23.2 step 1)'

/**
 * Attach managed metadata to the options passed to `ctx.on` by the env bridge.
 * @param meta - the managed-listener metadata to carry.
 * @returns options carrying the metadata through the Cordis options slot.
 */
export function managedListenerOptions(meta: ManagedListenerMetadata): EventOptions & { [MANAGED_META]: ManagedListenerMetadata } {
  return { [MANAGED_META]: meta }
}

/**
 * Owns the managed event chain: real Cordis registrations, diverted managed
 * entries, immutable per-scope band arrays, and the containerized dispatch
 * wrapper. A dispatch reads one array snapshot, so every dispatch sees one
 * generation of the chain (PO:244).
 */
export class DispatchMachine {
  private readonly ctx: Context
  private readonly vocabulary: Map<string, EventDispatchMode>
  private readonly scopeKeyOf: (thisArg: unknown) => string | undefined
  private readonly cpuBudgetMs: number
  private readonly onViolation: (violation: DispatchViolation) => void
  private readonly onAutoDisable: (pluginId: string) => void

  private readonly entries = new Map<string, Map<string, ManagedListenerEntry[]>>()
  private orders = new Map<string, readonly string[]>()
  private arrays = new Map<string, ReadonlyMap<string, EventBandArrays>>()
  private readonly realDisposers: (() => boolean)[] = []
  private bailDisposer: (() => boolean) | undefined
  private readonly warnedThrows = new WeakSet<ManagedListenerEntry>()
  private readonly consecutiveQuota = new Map<string, number>()
  private readonly inflight = new Map<string, number>()
  private readonly idleListeners = new Map<string, Set<() => void>>()

  /**
   * Create a dispatch machine bound to one Cordis context.
   * @param ctx - context whose fiber owns the real registrations.
   * @param options - vocabulary, scope routing, quota, and violation sinks.
   */
  constructor(ctx: Context, options: DispatchMachineOptions = {}) {
    this.ctx = ctx
    this.vocabulary = new Map(options.vocabulary ?? EVENT_VOCABULARY.map(entry => [entry.name, entry.mode]))
    this.scopeKeyOf = options.scopeKeyOf ?? (() => undefined)
    this.cpuBudgetMs = options.cpuBudgetMs ?? 100
    this.onViolation = options.onViolation ?? ((violation) => { ctx.logger.warn(violation.message) })
    this.onAutoDisable = options.onAutoDisable ?? (() => {})
  }

  /**
   * Install the takeover: the `internal/listener` bail handler plus the two
   * real registrations per managed event. Registrations happen once; the
   * arrays are swapped, never reordered.
   */
  start(): void {
    // oxlint-disable-next-line typescript/no-this-alias -- the bail wrapper needs both the caller ctx (`this`) and the machine instance.
    const machine = this
    this.bailDisposer = this.loose().on(
      'internal/listener',
      function (this: Context, name: string, listener: (...args: unknown[]) => unknown, options: unknown) {
        return machine.handleBail(this, name, listener, options as EventOptions & { [MANAGED_META]?: ManagedListenerMetadata })
      },
      { prepend: true, global: true },
    )
    for (const event of this.vocabulary.keys()) {
      this.realDisposers.push(this.loose().on(event, this.makeRealListener(event, 'outermost'), { prepend: true, global: true }))
      this.realDisposers.push(this.loose().on(event, this.makeRealListener(event, 'middle'), { global: true }))
    }
  }

  /**
   * Divert one managed listener into the per-event arrays. The bail path
   * additionally binds the entry to the caller's fiber (Cordis's own effect
   * collection is skipped when the bail returns a disposer); direct callers
   * own that binding themselves.
   * @param event - managed event name.
   * @param entry - listener plus declaration context.
   * @returns a disposer removing the entry; idempotent.
   */
  register(event: string, entry: Omit<ManagedListenerEntry, 'event'>): () => void {
    if (!this.vocabulary.has(event)) {
      throw new PluginError(
        'event-not-mountable',
        formatPluginError('event-not-mountable', { event, tier: 'harness' }),
        { event, tier: 'harness' },
        entry.pluginId,
      )
    }
    const full: ManagedListenerEntry = { ...entry, event }
    const byPlugin = this.entries.get(event) ?? new Map<string, ManagedListenerEntry[]>()
    const list = byPlugin.get(entry.pluginId) ?? []
    list.push(full)
    byPlugin.set(entry.pluginId, list)
    this.entries.set(event, byPlugin)
    this.rebuild()
    const disposer = () => {
      const current = this.entries.get(event)?.get(entry.pluginId)
      if (current === undefined) return
      const index = current.indexOf(full)
      if (index === -1) return
      current.splice(index, 1)
      if (current.length === 0) byPlugin.delete(entry.pluginId)
      this.rebuild()
    }
    return disposer
  }

  /** Whether the event is in the dispatch vocabulary (harness or declared). */
  knows(event: string): boolean {
    return this.vocabulary.has(event)
  }

  /**
   * Declare one plugin-contributed custom event (emit mode) and wire its
   * real listeners; idempotent for already-known events.
   * @param event - custom event name (validated at mount).
   */
  declareEvent(event: string): void {
    if (this.vocabulary.has(event)) return
    this.vocabulary.set(event, 'emit')
    this.realDisposers.push(this.loose().on(event, this.makeRealListener(event, 'outermost'), { prepend: true, global: true }))
    this.realDisposers.push(this.loose().on(event, this.makeRealListener(event, 'middle'), { global: true }))
  }

  /**
   * Emit one managed event through the real Cordis context so the takeover
   * listeners walk the managed chain (plus any raw host listeners).
   * @param event - managed event name to emit.
   * @param args - dispatch arguments for the event.
   */
  emit(event: string, ...args: unknown[]): void {
    // The cordis emit signature is keyed on the declared Events map; managed
    // custom events are string-typed by construction, so the seam is loose.
    ;(this.ctx as unknown as { emit(name: string, ...rest: unknown[]): void }).emit(event, ...args)
  }

  /**
   * Swap the per-scope plugin orders (from the #13 derivation) and rebuild
   * every per-event per-scope band array in one step.
   * @param orders - scope key → ordered plugin ids (`'*'` = unscoped-only).
   */
  setOrders(orders: ReadonlyMap<string, readonly string[]>): void {
    this.orders = new Map(orders)
    this.rebuild()
  }

  /** Remove every real registration and clear all managed state (PO:245). */
  dispose(): void {
    this.bailDisposer?.()
    this.bailDisposer = undefined
    for (const disposer of this.realDisposers) disposer()
    this.realDisposers.length = 0
    this.entries.clear()
    this.orders.clear()
    this.arrays = new Map()
    this.consecutiveQuota.clear()
    this.inflight.clear()
    this.idleListeners.clear()
  }

  /**
   * Number of dispatches of one event currently walking a chain snapshot.
   * @param event - managed event name.
   * @returns the current in-flight count.
   */
  inFlightCount(event: string): number {
    return this.inflight.get(event) ?? 0
  }

  /**
   * Subscribe to an event becoming idle (its in-flight count dropping to
   * zero). Used by the lifecycle engine's hot-swap cache (HP:138).
   * @param event - managed event to observe.
   * @param listener - called when the count reaches zero.
   * @returns a disposer removing the subscription.
   */
  onIdle(event: string, listener: () => void): () => void {
    const listeners = this.idleListeners.get(event) ?? new Set<() => void>()
    listeners.add(listener)
    this.idleListeners.set(event, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.idleListeners.delete(event)
    }
  }

  /** The `internal/listener` bail: divert managed registrations only. */
  private handleBail(
    caller: Context,
    name: string,
    listener: (...args: unknown[]) => unknown,
    options: EventOptions & { [MANAGED_META]?: ManagedListenerMetadata } | undefined,
  ): (() => void) | undefined {
    if (!this.vocabulary.has(name)) return undefined
    const meta = options?.[MANAGED_META]
    if (meta === undefined) return undefined
    assertNoEventOptions(options, meta.pluginId)
    const base = {
      pluginId: meta.pluginId,
      mode: meta.mode,
      position: meta.position,
      listener,
    }
    const disposer = this.register(name, {
      ...base,
      ...(meta.returns === undefined ? {} : { returns: meta.returns }),
      ...(meta.scope === undefined ? {} : { scope: meta.scope }),
    })
    // The diverted registration is not an automatic fiber effect; bind it so
    // fiber teardown removes the array entry (PO:245/HMR-safety).
    caller.fiber.effect(() => disposer)
    return disposer
  }

  /** The registration surface, cast loose for string event names. */
  private loose(): LooseOn {
    return this.ctx
  }

  /** Build one real Cordis listener for an event band. */
  private makeRealListener(event: string, band: 'outermost' | 'middle'): (this: unknown, ...args: unknown[]) => unknown {
    const dispatch = (thisArg: unknown, args: readonly unknown[]): unknown => {
      const arrays = this.arrays.get(event)?.get(this.scopeKeyOf(thisArg) ?? '*')
        ?? this.unscopedArrays(event)
      if (band === 'outermost') return this.dispatchBand(event, arrays.outermost, thisArg, args)
      return this.dispatchBand(event, arrays.middle, thisArg, args)
    }
    return function (this: unknown, ...args: unknown[]) {
      return dispatch(this, args)
    }
  }

  /** Fallback arrays for scopes the orders do not cover yet. */
  private unscopedArrays(event: string): EventBandArrays {
    const entries = this.entriesFor(event, '*')
    return {
      outermost: entries.filter(entry => entry.position === 'outermost'),
      middle: entries.filter(entry => entry.position !== 'outermost'),
    }
  }

  /** Entries of one event+scope from the current immutable snapshots. */
  private entriesFor(event: string, scope: string): ManagedListenerEntry[] {
    const out: ManagedListenerEntry[] = []
    const ids = this.orders.get(scope) ?? []
    for (const id of ids) {
      for (const entry of this.entries.get(event)?.get(id) ?? []) {
        if (entry.scope === undefined || entry.scope === scope) out.push(entry)
      }
    }
    return out
  }

  /** Rebuild every per-event per-scope band array from current entries+orders. */
  private rebuild(): void {
    const next = new Map<string, ReadonlyMap<string, EventBandArrays>>()
    for (const event of this.vocabulary.keys()) {
      const byScope = new Map<string, EventBandArrays>()
      for (const scope of this.orders.keys()) {
        const entries = this.entriesFor(event, scope)
        byScope.set(scope, {
          outermost: entries.filter(entry => entry.position === 'outermost'),
          middle: entries.filter(entry => entry.position !== 'outermost'),
        })
      }
      next.set(event, byScope)
    }
    this.arrays = next
  }

  /** Run one band's containerized entries for the event's dispatch mode. */
  private dispatchBand(
    event: string,
    band: readonly ManagedListenerEntry[],
    thisArg: unknown,
    args: readonly unknown[],
  ): unknown {
    this.inflight.set(event, (this.inflight.get(event) ?? 0) + 1)
    const finish = (): void => {
      // The count was just incremented above, so the entry is always present.
      const next = (this.inflight.get(event) as number) - 1
      if (next <= 0) {
        this.inflight.delete(event)
        for (const listener of this.idleListeners.get(event) ?? []) listener()
      } else {
        this.inflight.set(event, next)
      }
    }
    const result = this.runBand(event, band, thisArg, args)
    if (isPromiseLike(result)) {
      return (result as Promise<unknown>).finally(() => { finish() })
    }
    finish()
    return result
  }

  /** Mode-specific band execution (kept separate so in-flight counting wraps it). */
  private runBand(
    event: string,
    band: readonly ManagedListenerEntry[],
    thisArg: unknown,
    args: readonly unknown[],
  ): unknown {
    // Bands only exist for vocabulary events, so the mode is always present.
    const mode = this.vocabulary.get(event) as EventDispatchMode
    if (mode === 'emit') {
      for (const entry of band) this.runEmit(entry, thisArg, args)
      return undefined
    }
    if (mode === 'parallel') {
      return Promise.all(band.map(entry => this.runAwaited(entry, thisArg, args)))
    }
    if (mode === 'serial') {
      return this.runSerial(band, thisArg, args)
    }
    return this.runWaterfall(band, thisArg, args)
  }

  /** Contain one emit listener: sync and async failures become veto-suppressed. */
  private runEmit(entry: ManagedListenerEntry, thisArg: unknown, args: readonly unknown[]): void {
    this.runSync(entry, thisArg, args)
  }

  /** Metered, contained sync call; async continuations are contained, not awaited. */
  private runSync(entry: ManagedListenerEntry, thisArg: unknown, args: readonly unknown[]): ListenerOutcome {
    const start = performance.now()
    let result: unknown
    try {
      result = entry.listener.call(thisArg, ...args)
    } catch {
      this.surfaceThrow(entry)
      return { kind: 'threw' }
    }
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => { this.surfaceThrow(entry) })
      return { kind: 'ok', result: undefined }
    }
    return this.finishMetered(entry, start, result)
  }

  /** Metered, contained async call for parallel/serial bands. */
  private async runAwaited(entry: ManagedListenerEntry, thisArg: unknown, args: readonly unknown[]): Promise<ListenerOutcome> {
    const start = performance.now()
    let result: unknown
    try {
      result = await entry.listener.call(thisArg, ...args)
    } catch {
      this.surfaceThrow(entry)
      return { kind: 'threw' }
    }
    return this.finishMetered(entry, start, result)
  }

  /** Quota verdict after a listener settled (no `next` channel). */
  private finishMetered(entry: ManagedListenerEntry, start: number, result: unknown): ListenerOutcome {
    const elapsed = performance.now() - start
    if (elapsed > this.cpuBudgetMs) {
      this.quotaViolation(entry)
      if (entry.mode === 'intercept' || entry.position === 'outermost') {
        this.violate('intercept-skipped', { plugin: entry.pluginId, event: entry.event })
      }
      return { kind: 'skipped' }
    }
    this.consecutiveQuota.delete(entry.pluginId)
    return { kind: 'ok', result }
  }

  /** Serial band: await in order; any bail is an undeclared veto (three-way test). */
  private async runSerial(
    band: readonly ManagedListenerEntry[],
    thisArg: unknown,
    args: readonly unknown[],
  ): Promise<unknown> {
    for (const entry of band) {
      const outcome = await this.runAwaited(entry, thisArg, args)
      if (outcome.kind === 'skipped' || outcome.kind === 'threw') continue
      const result = outcome.result
      if (result !== null && result !== false && result !== undefined) {
        this.violate('undeclared-veto', { plugin: entry.pluginId, event: entry.event })
        return result
      }
    }
    return undefined
  }

  /** Waterfall band: compose entries around the incoming next, outermost-first. */
  private runWaterfall(
    band: readonly ManagedListenerEntry[],
    thisArg: unknown,
    args: readonly unknown[],
  ): unknown {
    const payload = args.slice(0, -1)
    const inner = args.at(-1) as (...innerArgs: unknown[]) => unknown
    let current: () => unknown = () => inner(...payload)
    for (const entry of [...band].reverse()) {
      const next = current
      current = () => this.runWaterfallEntry(entry, thisArg, payload, next)
    }
    return current()
  }

  /** One contained waterfall entry: own-time metering around awaited `next()`. */
  private runWaterfallEntry(
    entry: ManagedListenerEntry,
    thisArg: unknown,
    payload: readonly unknown[],
    next: () => unknown,
  ): unknown {
    let ownStart = performance.now()
    let ownMs = 0
    let inNext = false
    let nextCalled = false
    const wrappedNext = (): unknown => {
      nextCalled = true
      if (!inNext) {
        ownMs += performance.now() - ownStart
        inNext = true
      }
      const result = next()
      const settle = (value: unknown): unknown => {
        inNext = false
        ownStart = performance.now()
        return value
      }
      return isPromiseLike(result)
        ? (result as Promise<unknown>).then(settle, settle)
        : settle(result)
    }
    const settle = (value: unknown): unknown => {
      const outcome = this.settleWaterfall(entry, value, nextCalled, inNext, ownStart, ownMs)
      if (outcome.kind === 'skipped') return next()
      return outcome.result
    }
    try {
      const result = entry.listener.call(thisArg, ...payload, wrappedNext)
      if (isPromiseLike(result)) {
        return (result as Promise<unknown>).then(
          value => settle(value),
          () => {
            this.surfaceThrow(entry)
            return next()
          },
        )
      }
      return settle(result)
    } catch {
      this.surfaceThrow(entry)
      return next()
    }
  }

  /** Finish one waterfall entry: quota verdict first, then return discipline. */
  private settleWaterfall(
    entry: ManagedListenerEntry,
    result: unknown,
    nextCalled: boolean,
    inNext: boolean,
    ownStart: number,
    ownMs: number,
  ): WaterfallOutcome {
    const elapsed = ownMs + (inNext ? 0 : performance.now() - ownStart)
    if (elapsed > this.cpuBudgetMs) {
      this.quotaViolation(entry)
      if (entry.mode === 'intercept' || entry.position === 'outermost') {
        this.violate('intercept-skipped', { plugin: entry.pluginId, event: entry.event })
      }
      return { kind: 'skipped' }
    }
    this.consecutiveQuota.delete(entry.pluginId)
    if (!nextCalled) {
      if (entry.mode === 'observe') {
        this.violate('undeclared-veto', { plugin: entry.pluginId, event: entry.event })
        return { kind: 'veto', result }
      }
      if (entry.mode === 'transform') {
        this.violate('next-missing', { plugin: entry.pluginId, event: entry.event })
        return { kind: 'veto', result }
      }
      const branch = branchOf(result)
      if (branch !== undefined && (entry.returns ?? []).includes(branch)) {
        return { kind: 'veto', result }
      }
      if (branch !== undefined) {
        this.violate('undeclared-branch', { plugin: entry.pluginId, event: entry.event, branch })
      } else {
        this.violate('undeclared-veto', { plugin: entry.pluginId, event: entry.event })
      }
      return { kind: 'veto', result }
    }
    return { kind: 'ok', result }
  }

  /** Record a CPU-quota violation and its five-consecutive auto-disable trigger. */
  private quotaViolation(entry: ManagedListenerEntry): void {
    this.violate('quota-cpu-exceeded', { plugin: entry.pluginId, event: entry.event })
    const count = (this.consecutiveQuota.get(entry.pluginId) ?? 0) + 1
    if (count >= 5) {
      this.consecutiveQuota.delete(entry.pluginId)
      this.onAutoDisable(entry.pluginId)
      return
    }
    this.consecutiveQuota.set(entry.pluginId, count)
  }

  /** Surface a group-5 code or 16.4 warn event through the violation sink. */
  private violate(
    code: DispatchViolation['code'],
    details: Record<string, unknown>,
  ): void {
    const message = code === 'veto-suppressed'
      ? `listener of plugin ${String(details.plugin)} on event ${String(details.event)} threw; ${MIGRATION_HINT}`
      : code === 'intercept-skipped'
        ? `intercept/outermost listener of plugin ${String(details.plugin)} on event ${String(details.event)} was skipped by the CPU quota; absence is surfaced (conflict B-3)`
        : formatPluginError(code, details)
    this.onViolation({ code, details, message })
  }

  /** veto-suppressed: warn once per listener per boot, then stay silent. */
  private surfaceThrow(entry: ManagedListenerEntry): void {
    if (this.warnedThrows.has(entry)) return
    this.warnedThrows.add(entry)
    this.violate('veto-suppressed', { plugin: entry.pluginId, event: entry.event })
  }
}

/** Reject any EventOptions the manifest `position` entry does not cover. */
function assertNoEventOptions(
  options: EventOptions & { [MANAGED_META]?: ManagedListenerMetadata } | undefined,
  pluginId: string,
): void {
  const option = options?.prepend === true
    ? 'prepend'
    : options?.global === true
      ? 'global'
      : undefined
  if (option === undefined) return
  throw new PluginError(
    'unsupported-event-option',
    formatPluginError('unsupported-event-option', { option }),
    { option },
    pluginId,
  )
}

/** Read a decision branch from an interceptor's return value, when present. */
function branchOf(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const kind = (result as Record<string, unknown>).kind
  return typeof kind === 'string' ? kind : undefined
}

function isPromiseLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).then === 'function'
}
