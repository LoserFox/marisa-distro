/**
 * Selector parsing for `fallbacks` chains (spec §4, plan Task 2).
 *
 * Grammar: `provider/model` (exact — the model segment may itself contain
 * `/`, e.g. NVIDIA NIM `nvidia/minimaxai/minimax-m3`) and `provider/*`
 * (wildcard — the parsed `model` is `undefined`; `*` is only valid as the
 * entire model segment). Illegal selectors throw {@link SelectorError} —
 * the catchable "config warning" path; warn-and-continue lives in Task 3.
 * These modules never crash on their own.
 *
 * @module dsh-llm-fallbacks/selectors
 */
/** A parsed selector: `provider` + optional `model` (`undefined` = wildcard). */
export interface Selector {
    provider: string;
    model?: string;
    /** Original selector string, kept for diagnostics/logging. */
    raw: string;
}
/** Catchable error for illegal/unknown selectors (config-warning path). */
export declare class SelectorError extends Error {
    constructor(message: string);
}
/** Canonical key: `provider/model`, or `provider/*` for a wildcard model. */
export declare function selectorKey(provider: string, model?: string): string;
/**
 * Parse a chain key or entry selector.
 *
 * Accepts `provider/model` and `provider/*`; throws {@link SelectorError}
 * on anything else (missing separator, empty parts, wildcard inside the
 * model segment).
 */
export declare function parseSelector(input: string): Selector;
/**
 * Wildcard-entry resolution: keep the failing model id, swap only the
 * provider (`provider/*` entry semantics, spec §2 clause 2).
 */
export declare function resolveWildcardEntry(failingModel: string, provider: string): Selector;
