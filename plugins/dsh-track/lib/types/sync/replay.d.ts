/**
 * P1 — replay & idempotency: per-session sequence cursor + dedup.
 *
 * v2-design §4.1/§4.2: ids are content-addressed, writes are upserts, and the
 * pipeline tracks a per-session watermark so a replay of the same log (or the
 * same events arriving twice) produces no duplicates. Cursor semantics:
 * `lastSeq` per session = highest raw-log seq already folded; replay resumes
 * at lastSeq+1.
 * @module @fakechris/dsh-track/sync/replay
 */
/** Per-session incremental cursor (v2-design §4.1 double cursor). */
export interface SyncCursor {
    /** sessionId → highest raw-log seq already processed. */
    lastSeq: Record<string, number>;
    /** cwd → last folded activity timestamp (epoch ms). */
    lastActivityAt: Record<string, number>;
}
/** Which events of a log are new relative to a cursor. */
export declare function newEventsSince(sessionId: string, seqs: readonly number[], cursor: SyncCursor | null | undefined): number[];
/** Advance a cursor after folding events. Returns a new cursor (immutable). */
export declare function advanceCursor(cursor: SyncCursor, sessionId: string, lastSeq: number, lastActivityAt: number, cwd?: string): SyncCursor;
/** Empty cursor. */
export declare function emptyCursor(): SyncCursor;
/**
 * Deduplicate normalized events by their content-hash event id, keeping the
 * first occurrence of each id (a replay-safe projection).
 */
export declare function dedupByEventId<T extends {
    eventId: string;
}>(events: readonly T[]): T[];
