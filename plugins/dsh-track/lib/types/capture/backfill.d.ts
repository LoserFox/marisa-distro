/**
 * Capture context backfill — one-shot migration for legacy captures.
 *
 * Captures created before the motivation-context work (PR #20) have no
 * `context`. The observer only seeds LIVE sessions, so legacy captures stay
 * context-less forever and C2/C3 (context-based fold) cannot map them.
 * This pass reads each open capture's source session log and writes the most
 * recent explicit user request as its context.
 * @module @fakechris/dsh-track/capture/backfill
 */
import type { TrackStore } from '../store.ts';
import { type ContextSessionQuery } from './context.ts';
export interface BackfillResult {
    /** Captures inspected (open, no context, with a source session). */
    scanned: number;
    /** Captures that received a context. */
    filled: number;
    /** Captures whose session had no explicit user request (left as-is). */
    skipped: number;
}
/**
 * Backfill `context` on open captures from their source session logs.
 *
 * Candidates: captures with NO context, OR whose context is a terse
 * acknowledgement ("pr merge", "CA先做") — those were filled by the earlier
 * "latest request" rule and are not motivation; re-running under the
 * "latest FULL instruction" rule replaces them. Real (non-ack) contexts are
 * left untouched (idempotent). Safe to re-run.
 */
export declare function backfillCaptureContext(store: TrackStore, sessionQuery: ContextSessionQuery | undefined): Promise<BackfillResult>;
