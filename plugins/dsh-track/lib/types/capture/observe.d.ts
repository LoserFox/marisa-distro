/**
 * Rule-based auto-capture — the deterministic half of Track observability.
 *
 * The model-facing `capture_thought` tool depends on the agent's judgment,
 * which in practice almost never fires (measured ~1/148 in 62 sessions). This
 * observer instead watches the *structured tool stream* (session/event) for
 * ONE signal that is reliable by construction, with zero model cost:
 *
 *  - todo_write (planning path): an agent that plans a work unit issues a
 *    todo_write whose FIRST entry is the requirement summary. Only the first
 *    change of the first entry captures once (B — a later refresh is the same
 *    requirement's execution, not a new thought). Reacts to the canonical
 *    `todo/write` event OR the `todo_write` tool call (same per-session gate).
 *  - goal/change (goal creation): a `create_goal` carries the FULL objective
 *    (A/B/C…), which the todo signal alone misses — the first todo entry is
 *    often a sub-task. Every goal creation captures its objective once
 *    (2026-08-14: session "任务转派与历史状态清理机制讨论" planned a 10-item
 *    todo + one goal; only the first todo entry ("C 调研…") captured and the
 *    A/B requirements in the goal were never seen).
 *  - subagent delegation (G1): a subagent child's first user message IS its
 *    delegation prompt — captured once per child session (tag
 *    `auto:delegate`), so a direct subagent/workflow/ralph spawn without a
 *    prior todo still lands. Children are detected from the session header
 *    (`origin: 'subagent'`); the `subagent/descriptor` event is a seed-phase
 *    write that never publishes to live observers.
 *  - requirement-level user messages (G2): the first long (≥ minChars),
 *    non-ack user request per session captures as `auto:requirement`, so a
 *    discussion-style requirement that no todo/goal carries ("任务转派与历史
 *    状态清理机制讨论") still reaches the wall.
 *
 * Every signal is a configurable flag (`AutoCaptureOptions.signals`); the
 * default mask enables all four (todo / goal / delegate / requirement).
 *
 * Git branch creation was REMOVED as a signal (2026-08-11): "新建分支 feat/…"
 * is an execution carrier, not a requirement — in practice it dominated the
 * capture wall with noise (9 of 17 captures) even when context was attached.
 * The todo_write signal covers the same work lines with the requirement's
 * own wording.
 *
 * Exact pattern match on structured fields — no LLM, no semantic guesswork,
 * no per-message cost. Captures land with `source: 'session'` and an
 * `auto:*` tag so they are distinguishable from explicit `capture_thought`
 * calls.
 *
 * Motivation context (A): every capture carries `context` = the most recent
 * FULL user instruction (user/message with source.kind === 'user', skipping
 * terse acks — see capture/context.ts), so an execution-level capture
 * ("调研 StreamChunk usage/token 字段") keeps its "why" ("做一个模块记录所有
 * llm 数据计算开销"). The observer keeps a per-session one-entry cache of the
 * latest full user request.
 *
 * Reentrancy: our own appends (track/* events) never match the signal.
 * @module @fakechris/dsh-track/capture/observe
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TrackStore } from '../store.ts';
import { type UserPromptRef } from './context.ts';
/** Signal mask — which structured signals auto-capture. Default: all on. */
export interface CaptureSignalsConfig {
    /** todo_write / todo/write → the first planned entry per session. */
    todo?: boolean;
    /** goal/change (create) → the goal objective, once per goal id. */
    goal?: boolean;
    /** subagent delegation → the child session's first user message (the
     *  delegation prompt), once per subagent session. */
    delegate?: boolean;
    /** requirement-level user messages → the first long, non-ack user request
     *  per session (bounded by the requirement thresholds). */
    requirement?: boolean;
}
/** Signals the observer reacts to, for testability and logging. */
export interface AutoCaptureOptions {
    /** Tag applied to rule-captured thoughts. */
    tag?: string;
    /** Signal mask. Defaults: every signal on. */
    signals?: CaptureSignalsConfig;
    /** G2 requirement-capture thresholds (bounded, minimal version). */
    requirement?: {
        /** Min chars for a user message to count as a requirement (default 40). */
        minChars?: number;
        /** Max chars captured (truncation bound, default 500). */
        maxChars?: number;
    };
}
/**
 * Wire the rule-based capture observer onto session/event. Returns a
 * disposer that unregisters the listener.
 *
 * `deps.seedContext` (optional): on the FIRST event of a session, the observer
 * has no in-memory context (fresh process — e.g. after a restart, where the
 * spliced continuation session's earlier user requests happened in the
 * PREVIOUS process). seedContext backfills the most recent explicit user
 * request from the persisted session log so a continued session still gets
 * motivation context. Without it, continued sessions never capture context.
 *
 * `deps.recentUser` (optional): a caller-owned per-session cache of the latest
 * explicit user request (`UserPromptRef` — text + message id). The observer
 * writes into it on every live `user/message` and on seed; the model-facing
 * tools (capture_thought, report_decision_point, track_create_issue) read the
 * same map so captures/decisions/issues carry the message id of the prompt
 * they happened under — the web panel's deep-link target.
 */
export declare function createAutoCapture(ctx: Context, deps: {
    store: TrackStore;
    seedContext?: (sessionId: string) => Promise<string | {
        text: string;
        id?: string;
    } | undefined>;
    recentUser?: Map<string, UserPromptRef>;
}, options?: AutoCaptureOptions): () => void;
