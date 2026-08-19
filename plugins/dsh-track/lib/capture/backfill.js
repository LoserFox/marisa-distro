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
import { latestUserRequest, isShortAck } from "./context.js";
/**
 * Backfill `context` on open captures from their source session logs.
 *
 * Candidates: captures with NO context, OR whose context is a terse
 * acknowledgement ("pr merge", "CA先做") — those were filled by the earlier
 * "latest request" rule and are not motivation; re-running under the
 * "latest FULL instruction" rule replaces them. Real (non-ack) contexts are
 * left untouched (idempotent). Safe to re-run.
 */
export async function backfillCaptureContext(store, sessionQuery) {
    const captures = await store.listCaptures();
    const candidates = captures.filter((c) => c.status === 'open' && c.sourceSessionId && (!c.context || isShortAck(c.context)));
    let filled = 0;
    let skipped = 0;
    for (const capture of candidates) {
        const prompt = await latestUserRequest(sessionQuery, capture.sourceSessionId);
        if (!prompt) {
            skipped += 1;
            continue;
        }
        // Also backfill the prompt's message id so legacy captures get the same
        // deep-link target as live captures.
        await store.upsertCapture({ ...capture, context: prompt.text, sourceMessageId: prompt.id });
        filled += 1;
    }
    return { scanned: candidates.length, filled, skipped };
}
