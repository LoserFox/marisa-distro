/**
 * P2 — request intent layering (v2-design §3.5).
 *
 * Decides whether a user request is a task candidate (requirement), an
 * execution step (directive), or a correction (interruption). This is a
 * SEMANTIC judgement — the LLM judges it few-shot using workspace context;
 * rules only provide cheap pre-filters (verb/object heuristics) that the LLM
 * can override. Without an LLM, the rule pre-filter is the downgrade path.
 *
 * The golden proto's intentLayering block is the few-shot exemplar set.
 * @module @fakechris/dsh-track/sync/intent
 */
import type { Context } from '@deepseek-ai/cordis';
export type RequestIntent = 'requirement' | 'directive' | 'interruption';
export interface IntentVerdict {
    intent: RequestIntent;
    /** LLM judgment: whether the object belongs to the product domain. */
    objectDomainRelevant?: boolean;
    confidence: number;
    decidedBy: 'rule' | 'model';
    /** Human-readable reason (for triage display). */
    reason: string;
}
/** Rule-only pre-filter. Never authoritative alone — the LLM can override. */
export declare function ruleIntentPrefilter(text: string): {
    intent: RequestIntent;
    confidence: number;
    reason: string;
};
/** LLM intent verdict for one request. Returns undefined on failure (downgrade). */
export declare function judgeIntent(ctx: Context | undefined, opts: {
    provider: string;
    model: string;
    requestText: string;
    workspaceContext?: string;
}): Promise<IntentVerdict | undefined>;
/**
 * Segment-level intent judgement: classify a whole EvidenceSpan (its ordered
 * requests) rather than one isolated message. A single request may read as an
 * interruption ("回到我们的目标…") while the span as a whole is a clear
 * requirement ("…请你计划一下") — the span view resolves that. Returns
 * undefined on failure (downgrade to the rule pre-filter per span lead).
 */
export declare function judgeSpanIntent(ctx: Context | undefined, opts: {
    provider: string;
    model: string;
    requests: string[];
    workspaceContext?: string;
}): Promise<IntentVerdict | undefined>;
/** Resolve the final verdict: prefer the LLM, fall back to the rule pre-filter. */
export declare function resolveIntent(ctx: Context | undefined, opts: {
    provider: string;
    model: string;
    requestText: string;
    workspaceContext?: string;
}): Promise<IntentVerdict>;
/**
 * Resolve the final span verdict: prefer the LLM segment judgement, fall back
 * to the rule pre-filter on the span lead. Unlike `resolveIntent` (single
 * request), this inspects ALL requests of the span, so a span that mixes a
 * directive with a real requirement keeps the requirement.
 */
export declare function resolveSpanIntent(ctx: Context | undefined, span: {
    leadRequest: string;
    requests: string[];
}, opts: {
    provider: string;
    model: string;
    workspaceContext?: string;
}): Promise<IntentVerdict>;
