/**
 * dsh-llm-fallbacks host half (plan Task 3: settings + waterfall + state
 * machine + events).
 *
 * Cordis function plugin mounted by the profile bundle patch row
 * `llm-fallbacks` (see `bundle/cordis.patch.yml`), composed AFTER llm-retry.
 *
 * Wiring:
 * - `fallbacks` settings namespace via {@link installSettingsSection}
 *   (composition entry as base; `scope.watch` → `onChange` re-reads the
 *   runtime and re-validates selectors — spec §4).
 * - `agent/request-error` waterfall: `!enabled` / code ∉ `triggerCodes`
 *   (**always mode included**) → `next()`; otherwise resolve role + chain,
 *   and when a candidate survives the filter (current / cooldown /
 *   step-failed / `provider/*`-missing-id) write the pending switch +
 *   cooldown + failure bookkeeping, then return
 *   `{ kind: 'retry' }` (own recovery, no `next()`).
 * - `agent/request` waterfall: apply a pending switch after `await next()`
 *   (provider/model override, inherited `reasoningEffort` dropped — the
 *   `installModelSelection` `withoutInheritedEffort` pattern); a
 *   root-origin `FallbacksChain/Auto` seed then overrides to the
 *   effective chain's first exact head (select-is-primary, plan
 *   fallbacks-virtual-chain Task 2); then the always-mode cap check (count
 *   `llm/retry` events for the current turn/step/provider; ≥
 *   `alwaysModeRetryCap` → same decision path, reason `always-cap` —
 *   ADR-2).
 * - Per-agent state (`FallbackStateStore`): `agent/disposed` removes it,
 *   `agent/status` idle prunes per-step state defensively, plugin dispose
 *   clears everything (spec §6 — no residual state).
 *
 * @module dsh-llm-fallbacks
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { detectLegacyKeys, validateFallbacksConfig, type FallbacksConfig } from './config.ts';
import { Config } from './schema.ts';
import { resolveChain } from './chains.ts';
import { resolveRole } from './roles.ts';
import { FallbackStateStore } from './state.ts';
import { type EffectiveRolesReadback, type SeedDeclaration, type SeedDeclareOutcome, type SeedRevertOutcome } from './seeds.ts';
/** The plugin row id mounted by the profile bundle patch. */
export declare const name = "llm-fallbacks";
/**
 * Declarative service metadata (cordis `Plugin.Base.provide`, read by
 * loaders/tooling). The actual registration happens in `apply()` via
 * `ctx.provide('llm-fallbacks', …)` — the static array never registers
 * anything by itself.
 */
export declare const provide: readonly ["llm-fallbacks"];
/**
 * The named cordis service `ctx.get('llm-fallbacks')` exposes while the
 * plugin is applied: the pure-function library surface + `name`/`version`
 * metadata, plus the three ADDITIVE role-seed methods (spec §9.1, plan
 * fallbacks-role-seeds T2). Deliberately no state BEARING FIELDS (no
 * stateStore, no event emitters, no filter helpers) — the seed methods are
 * closures over the per-apply `FallbacksSeedManager`, so state stays behind
 * the closure and dies with the fiber (spec §9.5).
 */
export interface FallbacksService {
    /** Matches the plugin `name`. */
    name: 'llm-fallbacks';
    /** Package.json version string (module-load snapshot). */
    version: string;
    resolveRole: typeof resolveRole;
    resolveChain: typeof resolveChain;
    validateFallbacksConfig: typeof validateFallbacksConfig;
    detectLegacyKeys: typeof detectLegacyKeys;
    /** (a) Declare the companion's FULL current seed set (replacement semantics, spec §9.1). */
    declareSeeds(seeds: readonly SeedDeclaration[]): Promise<SeedDeclareOutcome>;
    /** (b) Sync readback — effective taxonomy with seed annotations. */
    getEffectiveRoles(): EffectiveRolesReadback;
    /** (c) Revert one id to the CURRENT declared seed default. */
    revertSeededPersona(id: string): Promise<SeedRevertOutcome>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The fallbacks service while the plugin is applied; `undefined` otherwise. */
        'llm-fallbacks'?: FallbacksService;
    }
}
export { Config };
/** The plugin's composition config — the `fallbacks` settings schema (spec §4). */
export type Config = FallbacksConfig;
export type { FallbackSwitchReason, FallbacksSwitchEventData } from './events.ts';
export type { AgentFallbackState, FallbackStateStore, PendingSwitch, StepFailures } from './state.ts';
export { resolveRole, type AgentLike, type Origin, } from './roles.ts';
export { annotateCandidates, createCandidateFilter, hasWildcardEntry, resolveCandidate, resolveChain, resolveChainViews, selectCandidates, type AnnotatedCandidate, type CandidateFilterOptions, type CandidateSkipReason, type FailingModel, } from './chains.ts';
export { defaultFallbacksConfig, detectLegacyKeys, INHERIT_ROLE_ID, ROLE_ID_PATTERN, validateFallbacksConfig, type FallbacksConfig, type FallbacksConfigLogger, type FallbacksRole, type FallbacksRoles, type FallbacksRoleRule, type FallbackStrategy, type RevertPolicy, } from './config.ts';
export { parseSelector, SelectorError, type Selector, } from './selectors.ts';
export { FallbacksSeedManager, type EffectiveRole, type EffectiveRolesReadback, type SeedConflict, type SeedDeclaration, type SeedDeclareOutcome, type SeedRevertFailReason, type SeedRevertOutcome, type SeedSkipReason, type SeedsIo, type SeedsWireStatus, } from './seeds.ts';
export { presetRoles } from './presets.ts';
/**
 * @internal Test seam (T3 review Minor 3): the per-agent fallback state store
 * of the plugin applied to `ctx` — last apply wins. Not part of the plugin's
 * public surface; lets tests assert the no-op purity invariant (a plain
 * request must not grow the store) without reaching into the closure.
 */
export declare function stateStore(ctx: Context): FallbackStateStore | undefined;
/**
 * Count durable `llm/retry` events for the current (turn, step, provider) in
 * **always mode** (ADR-2; spec §2 clause 5). Normal-mode retries belong to
 * llm-retry's bounded budget and must not preempt the fallback, so only
 * `mode: 'always'` events count toward `alwaysModeRetryCap` (T3 review
 * Minor 2 — the real event carries the discriminator, llm-retry types.ts).
 *
 * Fast path (T3 review Minor 4): the session log is append-ordered, so the
 * scan runs backwards and stops at the first event older than the target
 * (turn, step) — a long session's earlier turns are never scanned.
 *
 * Exported for direct unit testing of the counting + fast path.
 */
export declare function countRetryEvents(session: Session, turn: number, step: number, provider: string): number;
export declare function apply(ctx: Context, config?: FallbacksConfig): void;
