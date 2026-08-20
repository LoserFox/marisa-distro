/**
 * Dispatch-time three-stage role resolution (plan fallbacks-role-automatch
 * Task 2).
 *
 * Precedence (first hit wins):
 * 1. explicit — `session.header.agentPreset` trimmed matches a declared role
 *    id → that role's DECLARED RAW id (via the `roleIds` trimmed-id map, the
 *    same canonicalization the rules path uses); the reserved `'inherit'`
 *    and undeclared presets are NEVER dispatchable explicit roles and fall
 *    through to rules;
 * 2. rules — the existing `resolveRole` passthrough, unchanged (a declared
 *    role wins; no-rule-match / an explicit rule targeting `'inherit'`
 *    resolve to `'inherit'`);
 * 3. auto-match — only when stage 2 resolved to `'inherit'` AND
 *    `opts.automatchEnabled`: call `opts.automatch` with the agent. The hook
 *    (Task 3 supplies the bounded LLM caller) MUST return a declared raw id
 *    or `null`; the resolver defensively validates the return against
 *    `roleIds` — an unknown id warns and resolves to `'inherit'`, never an
 *    undeclared role. When `automatch` is undefined or `automatchEnabled`
 *    is false the hook is skipped.
 *
 * `'inherit'` is the single "no specific role" outcome — reached by
 * no-rule-match OR an explicit rule targeting `'inherit'` — and both are
 * auto-match eligible when enabled. An operator who wants a class to never
 * auto-match sets `roleAutoMatch: false` (→ `automatchEnabled: false`).
 *
 * Pure ordering logic: no config object and no LLM service inside this
 * module — the LLM is an injectable hook owned by Task 3/4.
 *
 * @module dsh-llm-fallbacks/role-resolution
 */
import { type FallbacksRoleRule } from './config.ts';
import { type AgentLike } from './roles.ts';
import type { Selector } from './selectors.ts';
export type { FallbacksRoleRule } from './config.ts';
/** Options for {@link resolveRoleAtDispatch}. */
export interface ResolveRoleAtDispatchOptions {
    /**
     * Whether the auto-match stage may run (the `roleAutoMatch` config switch).
     * When `false`, stage 3 never runs and the outcome is identical to the
     * rules stage alone.
     */
    automatchEnabled: boolean;
    /**
     * Auto-match hook — Task 3 supplies the bounded LLM caller; the resolver
     * itself contains no LLM. Contract: given the agent being resolved, return
     * a declared raw role id or `null`. The resolver defensively validates the
     * return against `roleIds` — an unknown id warns and resolves to
     * `'inherit'`, never an undeclared role. Skipped when undefined.
     */
    automatch?: (agent: AgentLike) => Promise<string | null>;
    /** Warning sink — the decision path injects the plugin logger. */
    warn: (message: string) => void;
}
/**
 * Resolve the dispatch-time role for an agent across three ordered stages
 * (explicit → rules → auto-match hook). Never throws on its own inputs; the
 * hook's own rejection is deliberately NOT caught here (the Task-3/4 wiring
 * bounds the LLM call so it never throws out of the request path).
 *
 * `roleIds` is the canonical trimmed-id map (`trimmed id → declared raw id`,
 * built in `src/index.ts` apply()): every stage canonicalizes its reference
 * by trim and returns the DECLARED RAW id, so roleDef lookups in
 * `chains.ts` / `commands.ts` find the stored `roles.list[]` entry exactly
 * (qc2 F-001 — no silent role inertness on padded YAML ids).
 */
export declare function resolveRoleAtDispatch(agent: AgentLike, rules: FallbacksRoleRule[], roleIds: ReadonlyMap<string, string>, opts: ResolveRoleAtDispatchOptions): Promise<string>;
/**
 * The dispatch-time chain head (plan fallbacks-role-automatch Task 4): the
 * FIRST candidate of a `resolveChainViews` pass whose `wildcard` flag is
 * false — an exact `provider/model` entry. `provider/*` entries are NOT
 * dispatch injection targets (no failing model to anchor them; a guessed
 * injection risks a hard failure whose code may sit outside `triggerCodes`),
 * so a wildcard-only chain yields `undefined` → no injection (today's
 * behavior). No cooldown/failed filtering and no existence probe run here —
 * a fresh subagent's first request has no failure-scoped state (see the Task
 * 4 decision) and exact heads are never probed. Pairs with
 * {@link resolveChainViews}'s parallel `wildcard` provenance (`src/chains.ts`);
 * the caller resolves the role's concatenated chain first.
 */
export declare function firstExactCandidate(all: readonly Selector[], wildcard: readonly boolean[]): Selector | undefined;
