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
 *   cooldown + failure bookkeeping + append `fallbacks/switch`, then return
 *   `{ kind: 'retry' }` (own recovery, no `next()`).
 * - `agent/request` waterfall: apply a pending switch after `await next()`
 *   (provider/model override, inherited `reasoningEffort` dropped — the
 *   `installModelSelection` `withoutInheritedEffort` pattern), then the
 *   always-mode cap check (count `llm/retry` events for the current
 *   turn/step/provider; ≥ `alwaysModeRetryCap` → same decision path, reason
 *   `always-cap` — ADR-2).
 * - Per-agent state (`FallbackStateStore`): `agent/disposed` removes it,
 *   `agent/status` idle prunes per-step state defensively, plugin dispose
 *   clears everything (spec §6 — no residual state).
 *
 * @module dsh-llm-fallbacks
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { Config, type FallbacksConfig } from './config.ts';
import { FallbackStateStore } from './state.ts';
/** The plugin row id mounted by the profile bundle patch. */
export declare const name = "llm-fallbacks";
export { Config };
/** The plugin's composition config — the `fallbacks` settings schema (spec §4). */
export type Config = FallbacksConfig;
export type { FallbackSwitchReason, FallbacksSwitchEventData } from './events.ts';
export type { AgentFallbackState, FallbackStateStore, PendingSwitch, StepFailures } from './state.ts';
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
