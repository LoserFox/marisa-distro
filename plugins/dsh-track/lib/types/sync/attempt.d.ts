/**
 * P1 — Attempt construction: one concrete execution pass over a task.
 *
 * v2-design §3.3: an Attempt is "initiating evidence + assistant plan + tool
 * calls/results + produced artifacts + turn end + outcome observations".
 * Attempts are keyed by (turn, step) and carry outcome observations so a
 * failed or interrupted attempt never masquerades as the issue's final state.
 * @module @fakechris/dsh-track/sync/attempt
 */
import type { RawEvent } from './raw-event.ts';
/** Outcome observations folded from a turn's events (v2-design §3.9). */
export interface AttemptOutcome {
    /** Did the turn end normally? */
    turnEnded: boolean;
    /** turn/end reason kind: completed | aborted | error | blocked | interrupted | max-tokens | unknown. */
    turnEndReason?: string;
    /** Count of tool/call events in this attempt. */
    toolCalls: number;
    /** Tool names invoked, in order (deduped). */
    tools: string[];
    /** Did any tool/result carry an explicit error? (best-effort shape check) */
    sawToolError: boolean;
    /** Assistant completion statements in this attempt (self-report — weakest signal). */
    assistantCompletions: string[];
}
/** One execution attempt (v2-design §3.3). */
export interface Attempt {
    /** Stable id: content-hash of (sessionId, turnId, stepId). */
    id: string;
    sessionId: string;
    turnId: number;
    stepId: number;
    /** Seq span of the events that make up this attempt. */
    seqStart: number;
    seqEnd: number;
    /** Ordered RawEvents of the attempt (initiating evidence first). */
    events: RawEvent[];
    outcome: AttemptOutcome;
    /** Optional linkage to a work item, assigned by later stages (P3 identity resolution). */
    workItemId?: string;
}
/** Deterministic attempt id. */
export declare function attemptIdFor(sessionId: string, turnId: number, stepId: number): string;
/** Fold outcome observations from one attempt's raw events. */
export declare function foldOutcome(events: readonly RawEvent[]): AttemptOutcome;
/**
 * Group raw events into attempts by (turn, step).
 *
 * Bucketing: `turn/start` opens a turn, `step/start` opens a step within it.
 * Events before any marker land in bucket `0:0`. Each bucket is one Attempt.
 */
export declare function buildAttempts(sessionId: string, events: readonly RawEvent[]): Attempt[];
