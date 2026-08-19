/**
 * Rule-based clustering — turn extracted worklogs into epic/issue candidates.
 *
 * Deterministic, dependency-free clustering (the "rule skeleton" of the hybrid
 * engine): sessions whose normalized titles match form one epic (a work
 * thread); each session becomes one issue candidate under its epic. The LLM
 * refiner (P4) can later re-title, merge, or split these candidates.
 * @module @fakechris/dsh-track/sync/cluster
 */
const MAX_TITLE = 80;
/**
 * Normalize a title for clustering: lowercase, strip ALL non-alphanumeric
 * characters (so "OAuth 回调" and "OAuth回调" are identical), collapse space.
 */
export function normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim();
}
/** Fallback title from the first user request. */
export function titleFromRequest(worklog) {
    const first = worklog.requests[0];
    if (!first)
        return '(no user requests)';
    const line = first.text.split('\n')[0]?.trim() ?? '';
    return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE)}…` : line;
}
/** Short description listing the session's requests. */
export function describeRequests(worklog) {
    const lines = worklog.requests.map((r, i) => {
        const head = r.text.split('\n')[0]?.trim() ?? '';
        const when = new Date(r.time).toISOString();
        return `${i + 1}. [${when}] ${head}`;
    });
    const body = lines.join('\n');
    return body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
}
/**
 * Cluster worklogs into epic/issue candidates.
 *
 * Rules (v1):
 * - Sessions sharing a normalized title → one epic (work thread).
 * - Untitled sessions cluster under their own epic keyed by the first request.
 * - Each session → one issue candidate linked to its epic.
 * - State: `in_progress` when the log shows tool activity, else `todo`.
 *   Never auto-`done` — completion is confirmed by the user at write-back.
 */
export function clusterWorklogs(worklogs, metas) {
    // Sessions with no user requests carry no task content — never candidate them.
    const active = worklogs.filter((w) => w.requests.length > 0);
    // Group sessions by normalized title (or first-request fallback).
    const epicGroups = new Map(); // epicKey -> sessionIds
    for (const w of active) {
        const meta = metas[w.sessionId];
        const key = normalizeTitle(meta?.title ?? titleFromRequest(w)) || '(untitled)';
        const list = epicGroups.get(key) ?? [];
        list.push(w.sessionId);
        epicGroups.set(key, list);
    }
    const epics = [];
    const issues = [];
    for (const [epicKey, sessionIds] of epicGroups) {
        const firstId = sessionIds[0];
        const firstMeta = metas[firstId];
        const name = firstMeta?.title ?? titleFromRequest(active.find((w) => w.sessionId === firstId));
        const times = sessionIds
            .map((id) => metas[id]?.createdAt ?? 0)
            .filter((t) => t > 0)
            .sort((a, b) => a - b);
        const createdAt = times[0] ? new Date(times[0]).toISOString() : new Date().toISOString();
        const updatedAt = times.at(-1) ? new Date(times.at(-1)).toISOString() : createdAt;
        epics.push({
            key: epicKey,
            name: name || epicKey,
            description: `Work thread across ${sessionIds.length} session(s) in workspace ${firstMeta?.teamKey ?? '?'}.`,
            status: 'active',
            sessionIds,
            createdAt,
            updatedAt,
        });
        for (const sessionId of sessionIds) {
            const worklog = active.find((w) => w.sessionId === sessionId);
            const meta = metas[sessionId];
            const suggestedState = worklog.signals.toolCalls > 0 ? 'in_progress' : 'todo';
            issues.push({
                key: sessionId,
                sessionId,
                title: meta?.title ?? titleFromRequest(worklog),
                description: describeRequests(worklog),
                priority: 2,
                suggestedState,
                labels: ['sync'],
                linkedSessionIds: [sessionId],
                createdAt: meta?.createdAt ? new Date(meta.createdAt).toISOString() : new Date().toISOString(),
                updatedAt: new Date(worklog.signals.lastActivityAt || Date.now()).toISOString(),
                epicKey,
            });
        }
    }
    return { epics, issues };
}
