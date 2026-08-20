/**
 * LLM auto-match role selection (plan fallbacks-role-automatch Task 3).
 *
 * This module is the bounded LLM caller behind the resolver's stage-3
 * auto-match hook (`resolveRoleAtDispatch`, `role-resolution.ts`). When the
 * explicit and rules stages resolve to `'inherit'` and `roleAutoMatch` is
 * enabled, `pickRoleByLlm` asks the model to pick the best-fit declared role
 * from the taxonomy and returns its declared RAW id, or `null` (= `'inherit'`).
 *
 * Contract (architect-locked, plan Global Constraints · Auto-match bounded):
 * - ONE bounded completion per decision: small `maxTokens`
 *   ({@link AUTOMATCH_MAX_TOKENS}) and a timeout
 *   ({@link AUTOMATCH_TIMEOUT_MS}, default 5s) that abandons the stream via
 *   the streaming contract's cancellation (`options.signal`) — no dangling
 *   iterator, no unhandled rejection.
 * - Never throws. Every failure mode — throw, timeout, `none`, no valid id,
 *   garbage answer, malformed inputs — resolves to `null`, so the "never
 *   throws out of `agent/request`" invariant holds end-to-end (the resolver
 *   deliberately does NOT catch the hook).
 * - Fast paths that avoid an LLM call entirely: empty taxonomy, absent
 *   `ctx.llm` service, and no concrete provider/model route for the judgment
 *   call. The plugin does NOT listen on `llm/stream`, so this call cannot
 *   recurse into the plugin.
 *
 * Judgment-call route choice (documented): the concrete provider/model for the
 * judgment call is taken from the roles' DECLARED context first — the first
 * exact (non-wildcard) `provider/model` selector across the declared chains,
 * in declaration order (the operator's own taxonomy is the most stable route
 * set). If no declared chain yields an exact selector, the agent's current
 * `options.provider`/`options.model` is used when both halves are present;
 * otherwise the call is skipped (`null`).
 *
 * Pure helpers exported for unit testing:
 * - {@link buildAutomatchPrompt} — the taxonomy prompt (declared ids +
 *   personas + agent origin/agentPreset; instructs exactly-one-declared-id-or-
 *   `none`).
 * - {@link parseAutomatchAnswer} — parses a declared id out of the model
 *   answer with surrounding whitespace/punctuation/quote/backtick tolerance;
 *   `none` (case-insensitive) and unknown ids → `null`. `roleIds` is the
 *   trimmed-id → declared-raw-id map, the same canonicalization the resolver
 *   uses.
 *
 * @module dsh-llm-fallbacks/automatch
 */
import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { FallbacksRole, FallbacksRoles } from './config.ts';
import type { AgentLike } from './roles.ts';
/** Default auto-match completion timeout in ms — abandons the stream. */
export declare const AUTOMATCH_TIMEOUT_MS = 5000;
/** Output bound (tokens) for the judgment call: one id or the literal `none`. */
export declare const AUTOMATCH_MAX_TOKENS = 32;
/**
 * Minimal `llm` service surface {@link pickRoleByLlm} reads. The real
 * `LlmRuntime.stream(options)` matches structurally; this face keeps the
 * module free of the full cordis Context merge.
 */
export interface AutomatchLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Minimal context surface: `ctx.get('llm')` (optional service — absent →
 * `null` fast-path). The broad `get(name: string)` face is satisfied by the
 * real cordis `Context` (`ReflectService.get` overloads return `any`/the
 * merged service), so the Task-4 wiring can pass `ctx` directly.
 */
export interface AutomatchContext {
    get(name: string): AutomatchLlm | undefined;
}
/** Options for {@link pickRoleByLlm}. */
export interface PickRoleByLlmOptions {
    /** Completion timeout in ms; defaults to {@link AUTOMATCH_TIMEOUT_MS}. */
    timeoutMs?: number;
    /** Warning sink — the decision path injects the plugin logger. */
    warn: (message: string) => void;
}
/**
 * Build the auto-match taxonomy prompt: every declared role's trimmed id and
 * persona, the agent's origin (and non-empty `agentPreset` when present), and
 * the exactly-one-declared-id-or-`none` instruction. Pure — no I/O.
 */
export declare function buildAutomatchPrompt(roles: readonly FallbacksRole[], agent: AgentLike): string;
/**
 * Parse the model's answer into a declared role id.
 *
 * The answer is expected to BE an id (possibly wrapped in whitespace, quotes,
 * backticks, or trailing punctuation); surrounding characters outside the id
 * grammar (`[a-zA-Z0-9-]`) are stripped, then the remaining string must match
 * a declared id exactly (case-insensitive) via `roleIds` (trimmed id →
 * declared RAW id, the resolver's canonicalization). `none` (case-insensitive)
 * and any unknown/malformed answer → `null`.
 */
export declare function parseAutomatchAnswer(answer: string, roleIds: ReadonlyMap<string, string>): string | null;
/**
 * Bounded LLM role-selection call (see module header). Resolves the declared
 * RAW id of the best-fit role, or `null` on any fast path or failure. NEVER
 * throws.
 */
export declare function pickRoleByLlm(ctx: AutomatchContext, roles: FallbacksRoles, agent: AgentLike, opts: PickRoleByLlmOptions): Promise<string | null>;
