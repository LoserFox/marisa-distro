/**
 * Session log extraction — turn a raw session event log into a worklog:
 * the sequence of user-initiated requests plus completion signals.
 *
 * Pure functions over `SessionEvent[]` so they are trivially testable without
 * a live session-query service. The sync pipeline (sync/run.ts) feeds these
 * with `ctx.sessionQuery.readSession` output.
 * @module @fakechris/dsh-track/sync/extract
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** One user-initiated request: a `user/message` event with `source.kind === 'user'`. */
export interface UserRequest {
    /** Event seq within the session log (monotonic). */
    seq: number;
    /** Event timestamp in Unix epoch milliseconds. */
    time: number;
    /** Concatenated text of the message's text blocks. */
    text: string;
    /** Event seq of the assistant message that answered this request, when present. */
    answeredBySeq?: number;
    /** Concatenated text of the answering assistant message, when present. */
    answerText?: string;
}
/** Completion/activity signals folded from the whole log. */
export interface WorkSignals {
    /** Count of `tool/call` events (real work happened). */
    toolCalls: number;
    /** Count of `turn/end` events with `reason.kind === 'completed'`. */
    completedTurns: number;
    /** Count of `turn/end` events with any non-completed reason. */
    failedTurns: number;
    /** Timestamp of the last event in the log. */
    lastActivityAt: number;
}
/** Extracted view of one session log. */
export interface SessionWorklog {
    /** Session id (from the header, injected by the caller). */
    sessionId: string;
    /** Complete user-initiated requests in ascending seq order. */
    requests: UserRequest[];
    /** Activity/completion signals across the whole log. */
    signals: WorkSignals;
}
/**
 * Extract the worklog from one session log.
 *
 * Only `user/message` events whose `source.kind === 'user'` count as requests —
 * plugin-injected context (system-prompt snapshots, skill content, goal
 * continuations) carries a different `source.kind` and is excluded. Assistant
 * answers are attached to the preceding un-answered request (or the most
 * recent one when batched) by seq ordering.
 */
export declare function extractWorklog(sessionId: string, events: readonly SessionEvent[]): SessionWorklog;
