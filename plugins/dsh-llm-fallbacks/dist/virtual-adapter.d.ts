/**
 * Virtual `FallbacksChain/Auto` LLM adapter (plan fallbacks-virtual-chain
 * Task 1, technical pins P1–P3; PR #62 feedback round): a mount-only
 * catalog row that makes the configured effective chain selectable as the
 * session **primary** in the host model picker, without patching dsh or
 * dsh-TUI (web and TUI share the adapter catalog).
 *
 * Wiring (P2): `installFallbacksAdapter` installs ONE conditional
 * `ctx.inject(['llm'])` child — absent `llm` service (test harness) is a
 * clean no-op, and fiber unload ⇒ the child's disposer unregisters the
 * route. Registration is an idempotent transition-reconcile on COMMITTED
 * config snapshots: register on `enabled` false→true, unregister on
 * true→false, driven by the settings `onChange` hook (the returned
 * reconcile thunk, wired by `apply()`) plus child activation. The row is
 * visible whenever the plugin is enabled — a non-conforming all-day chain
 * does NOT hide it (PR #62 feedback); conformance still gates a
 * successful override/delegate (`effectiveHeadOf` below refuses a
 * non-conforming all-day). The condition deliberately ignores `timeSlots`
 * and conformance, so slot-row edits and chain edits never churn
 * registration.
 *
 * Adapter behavior (P1/P3): `listModels` advertises exactly the one virtual
 * row; `stream()` is a THIN single-hop delegate to the effective chain head
 * through the host LLM runtime — no chain walk, no cooldown/caps/revert
 * bookkeeping, no state writes (a failure inside the delegate surfaces at
 * `agent/request-error`, where the existing engine walks from there).
 * `resolveModel` proxies the current effective head's metadata when
 * resolvable (modalities/context-window/reasoning follow the head) with a
 * permissive default otherwise — never throws.
 *
 * @module dsh-llm-fallbacks/virtual-adapter
 */
import type { Context } from '@deepseek-ai/cordis';
import type { FallbacksConfig } from './config.ts';
/** Provider route of the virtual adapter (exact string, spec lock). */
export declare const FALLBACKS_PROVIDER = "FallbacksChain";
/**
 * Model id of the virtual catalog row (exact string, spec lock). "Auto" is
 * the hardcoded picker id (not i18n — user decision 2026-08-18). The
 * catalog `name` the host picker renders is dynamic — see
 * {@link pickerDisplayName} (`Auto: <model>[<slot>]`).
 */
export declare const FALLBACKS_CHAIN_MODEL = "Auto";
/**
 * `LlmError` code: the effective chain is empty — the virtual route has no
 * head to delegate to (P1 guard).
 */
export declare const EMPTY_EFFECTIVE_CHAIN_CODE = "EMPTY_EFFECTIVE_CHAIN";
/**
 * `LlmError` code: the effective chain head is not a dispatchable real pair
 * (non-conforming all-day, wildcard selector, malformed selector, or a
 * self-route back to `FallbacksChain/*` — the P1 recursion guard).
 */
export declare const UNDISPATCHABLE_HEAD_CODE = "UNDISPATCHABLE_EFFECTIVE_HEAD";
/** `LlmError` code (defensive): the `llm` runtime disappeared mid-flight. */
export declare const LLM_UNAVAILABLE_CODE = "LLM_UNAVAILABLE";
/** One dispatchable exact head: `provider/model`. Wildcards are never seeds (P3). */
export interface EffectiveHead {
    provider: string;
    model: string;
}
/**
 * The FIRST DISPATCHABLE exact head of a chain — the single definition of
 * "effective head" (F-001) shared by the root select-is-primary override
 * (`src/index.ts`) and the virtual adapter's delegate paths. Walks the SAME
 * chain `resolveEffectiveChain` produces, skipping entries that can never
 * be dispatched: malformed selectors (config-warning path), `provider/*`
 * `provider/*` wildcards (no real pair), and self-routes back to
 * `FallbacksChain/*` (the P1 recursion guard). `undefined` when the chain
 * is empty or no entry is dispatchable.
 */
export declare function firstDispatchableExactHead(chain: readonly string[]): EffectiveHead | undefined;
/**
 * Host picker label: `Auto: <displayName>[<slot>]`.
 * Display name first so the trigger stays readable and platforms stay
 * distinguishable (catalog `name`, not the model id). Bare `Auto` when
 * there is no dispatchable head. Slot label from {@link resolveSlotState}.
 * @param modelDisplayName - catalog/resolved name; falls back to the id.
 */
export declare function pickerDisplayName(config: FallbacksConfig, now?: Date, modelDisplayName?: string): string;
/**
 * Install the virtual adapter registration lifecycle (P2).
 *
 * @param ctx - the plugin context.
 * @param readConfig - live config reader (the same `source()` the runtime
 *   reads, so reconcile always sees COMMITTED composed snapshots).
 * @returns the reconcile thunk — call it from the settings `onChange` hook
 *   (child activation runs one reconcile on its own).
 */
export declare function installFallbacksAdapter(ctx: Context, readConfig: () => FallbacksConfig): () => void;
