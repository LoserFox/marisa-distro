/**
 * M2 — semantic link pass: writes genealogy edges into the `links` table.
 *
 * Fork lineage (child session → parent), issue ↔ sessions (executed-in),
 * capture → issue (derives, from promotion), decision → session (raised-in),
 * issue parentId (derives). Link ids are deterministic hashes of
 * (fromType, fromId, toType, toId, kind), so re-runs are idempotent — the
 * same logical edge overwrites instead of duplicating.
 * @module @fakechris/dsh-track/graph/links
 */
import { hashCanonical } from "../sync/raw-event.js";
/** Deterministic link id — idempotent across re-runs. */
export function semanticLinkId(fromType, fromId, toType, toId, kind) {
    return 'track_link_' + hashCanonical([fromType, fromId, toType, toId, kind]);
}
/**
 * Write (or preview) the semantic link pass over the whole store.
 * @param store track store.
 * @param dryRun preview counts without writing (default false).
 */
export async function writeSemanticLinks(store, dryRun = false) {
    const [graphs, issues, captures, decisions] = await Promise.all([
        store.listGraphs(),
        store.listIssues(),
        store.listCaptures(),
        store.listDecisions(),
    ]);
    const byKind = {};
    let count = 0;
    const now = new Date().toISOString();
    const put = async (fromType, fromId, toType, toId, kind, eventTime, linkMethod) => {
        if (dryRun) {
            count += 1;
            byKind[kind] = (byKind[kind] ?? 0) + 1;
            return;
        }
        const link = {
            id: semanticLinkId(fromType, fromId, toType, toId, kind),
            fromType,
            fromId,
            toType,
            toId,
            kind,
            createdAt: now,
            eventTime,
            ingestedAt: now,
            linkMethod: linkMethod ?? 'deterministic',
        };
        await store.upsertLink(link);
        count += 1;
        byKind[kind] = (byKind[kind] ?? 0) + 1;
    };
    const sessionStart = new Map();
    for (const g of graphs)
        sessionStart.set(g.sessionId, g.header.createdAt);
    for (const g of graphs) {
        if (g.header.parentSession) {
            await put('session', g.sessionId, 'session', g.header.parentSession, 'forked-from', g.header.createdAt, 'session-lineage');
        }
    }
    for (const i of issues) {
        for (const sid of i.linkedSessionIds ?? []) {
            await put('issue', i.id, 'session', sid, 'executed-in', sessionStart.get(sid), 'session-link');
        }
        if (i.parentId)
            await put('issue', i.id, 'issue', i.parentId, 'derives', Date.parse(i.createdAt) || undefined, 'parent');
        if (i.supersedesIssueId)
            await put('issue', i.id, 'issue', i.supersedesIssueId, 'supersedes', Date.parse(i.createdAt) || undefined, 'supersedes');
    }
    for (const c of captures) {
        if (c.promotedToIssueId)
            await put('capture', c.id, 'issue', c.promotedToIssueId, 'derives', Date.parse(c.createdAt) || undefined, 'promotion');
    }
    for (const d of decisions) {
        if (d.sessionId)
            await put('decision', d.id, 'session', d.sessionId, 'raised-in', Date.parse(d.createdAt) || undefined, 'decision-record');
        if (d.supersedesDecisionId)
            await put('decision', d.id, 'decision', d.supersedesDecisionId, 'supersedes', Date.parse(d.answeredAt ?? d.createdAt) || undefined, 'supersedes');
    }
    return { links: count, byKind, sessions: graphs.length, issues: issues.length, captures: captures.length, decisions: decisions.length };
}
