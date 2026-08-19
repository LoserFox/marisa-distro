/**
 * P2 — session-internal topic segmentation (v2-design §3.4).
 *
 * Splits a session's user-request sequence into EvidenceSpans so a
 * multi-topic session yields multiple issue candidates instead of one blob.
 * Hard boundaries are deterministic signals (interrupted turn, todo-list
 * reset, long idle, explicit topic markers); ambiguous boundaries are left for
 * an optional LLM judge. Rule-only output is the downgrade path when no LLM is
 * available.
 * @module @fakechris/dsh-track/sync/segment
 */
import type { RawEvent } from './raw-event.ts';
/** One evidence span: a contiguous run of the session that is one candidate task. */
export interface EvidenceSpan {
    id: string;
    sessionId: string;
    seqStart: number;
    seqEnd: number;
    /** First user-request text of the span (fallback title material). */
    leadRequest: string;
    /** User requests inside the span, in order. */
    requests: string[];
    /** Deterministic boundary signals that opened this span. */
    openedBy: string[];
    /** Interrupted turns inside the span (topic-shift evidence). */
    interruptedCount: number;
    /** todo/write resets inside the span. */
    todoResetCount: number;
    /** Idle gap (ms) between the previous span end and this span start. */
    idleBeforeMs: number;
}
/** Idle threshold: a gap longer than this (ms) suggests a topic boundary. */
export declare const IDLE_BOUNDARY_MS: number;
/** todo list "reset" heuristic: previous snapshot non-empty, next snapshot empty. */
export declare function isTodoReset(prevCount: number, nextCount: number): boolean;
/** Hard boundary signals at a user request. */
export interface BoundarySignals {
    interrupted: boolean;
    todoReset: boolean;
    idle: boolean;
    topicMarker: boolean;
}
/**
 * Rule-based segmentation over raw events.
 *
 * Walks the raw event log, tracks the current span, and opens a new span at a
 * user request when a HARD signal fires: interrupted turn, long idle, or
 * explicit topic marker. todo-list resets are too noisy in real logs (agents
 * clear the list frequently) — they are recorded as an auxiliary `openedBy`
 * note but never trigger a split by themselves. Tool/assistant/lifecycle
 * events are attributed to the current span (extending seqEnd).
 */
export declare function segmentByRules(sessionId: string, events: readonly RawEvent[]): EvidenceSpan[];
/**
 * Aggregate adjacent spans that belong to the same work line.
 *
 * Over-segmentation root cause (verified on 6c5c0b49: 29 spans for one work
 * line): hard split signals (long-idle, interrupted-turn) fire on
 * *continuation steps* of the same task — e.g. "看一下发生了什么" after "接
 * 入 runSync" is a step, not a new task. This pass re-merges adjacent spans
 * whose content overlaps (deterministic) or whose titles are similar enough
 * (LLM-judged when available).
 *
 * Strategy: greedy left-to-right merge. For each adjacent pair, decide merge
 * by, in order:
 *   1. strong re-merge signal: later span's lead request is a continuation
 *      phrase ("继续", "下一步", "接着", bare "p2"...) AND its request count
 *      is small (a step, not a new thread);
 *   2. title/token overlap above threshold (deterministic);
 *   3. LLM judge (SAME_TASK / CONTINUATION_OF) — only when `judge` provided.
 *
 * Merging concatenates requests and extends the span range; the merged span
 * keeps the earlier leadRequest and seqStart.
 */
export interface SpanAggregateOptions {
    /** Minimum overlap ratio (token-level) to merge deterministically. */
    overlapThreshold?: number;
    /** If provided, confirm ambiguous adjacent merges via this judge. */
    judge?: (a: EvidenceSpan, b: EvidenceSpan) => Promise<boolean> | boolean;
}
/**
 * Character-set overlap of two spans' LEAD requests (topic representatives).
 *
 * CJK has no word separators, so `\p{L}+` collapses a whole Chinese sentence
 * into one token (verified: "修复重启后无法自动拉回的问题" is ONE match).
 * Character-level sets work for both CJK (per-char) and Latin (per-word via
 * space-split fallback): we split on spaces AND take CJK chars individually.
 *
 * Two guards against false-positive merges (verified on 6c5c0b49: a merged
 * 22-request span swallowed "重启了，slot a，你看看" via inflated overlap):
 * 1. compare LEAD requests only — the whole-span char set grows with every
 *    merged request and eventually overlaps ANY short follow-up;
 * 2. drop CJK function words, which are shared by unrelated topics.
 */
export declare function spanOverlap(a: EvidenceSpan, b: EvidenceSpan): number;
/** Greedy left-to-right aggregation of adjacent spans. */
export declare function aggregateSpans(spans: EvidenceSpan[], opts?: SpanAggregateOptions): Promise<EvidenceSpan[]>;
