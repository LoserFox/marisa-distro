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
/** Which events of a log are new relative to a cursor. */
export function newEventsSince(sessionId, seqs, cursor) {
    const last = cursor?.lastSeq?.[sessionId] ?? -1;
    return seqs.filter((s) => s > last);
}
/** Advance a cursor after folding events. Returns a new cursor (immutable). */
export function advanceCursor(cursor, sessionId, lastSeq, lastActivityAt, cwd) {
    return {
        lastSeq: { ...cursor.lastSeq, [sessionId]: Math.max(cursor.lastSeq[sessionId] ?? -1, lastSeq) },
        lastActivityAt: cwd
            ? { ...cursor.lastActivityAt, [cwd]: Math.max(cursor.lastActivityAt[cwd] ?? 0, lastActivityAt) }
            : cursor.lastActivityAt,
    };
}
/** Empty cursor. */
export function emptyCursor() {
    return { lastSeq: {}, lastActivityAt: {} };
}
/**
 * Deduplicate normalized events by their content-hash event id, keeping the
 * first occurrence of each id (a replay-safe projection).
 */
export function dedupByEventId(events) {
    const seen = new Set();
    const out = [];
    for (const e of events) {
        if (seen.has(e.eventId))
            continue;
        seen.add(e.eventId);
        out.push(e);
    }
    return out;
}
