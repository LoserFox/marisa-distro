/**
 * Calendar-yarn data v2 — ALL projects, requirement-level nodes, data-range
 * day window. The yarn plots REQUIREMENTS (issues/captures) on a day×project
 * grid; sessions thread their requirements. Matches the design mock's data
 * model (matrix/table views consume the same projection).
 * @module @fakechris/dsh-track/graph/calendar
 */
import { repoProjectIdFor } from "./projects.js";
const HUE_PALETTE = ['#E06A4E', '#E3A63B', '#3FA79B', '#5B8DE0', '#C77DDF', '#E0609E', '#8AA05B', '#D0604E'];
export const UNK_ID = 'unk';
export function hueFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++)
        h = (h * 31 + id.charCodeAt(i)) | 0;
    return HUE_PALETTE[Math.abs(h) % HUE_PALETTE.length];
}
const dayIndexOf = (t, base) => Math.floor((t - base) / 86400000);
export function dayLabel(day, base) {
    const t = new Date(base + day * 86400000);
    return String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
/**
 * Build the calendar dataset over the WHOLE store (all projects).
 * @param store track store.
 * @param maxDays window cap (default 18).
 */
export async function buildCalendar(store, maxDays = 18) {
    const projects = await store.listProjects();
    const graphs = await store.listGraphs();
    const issues = await store.listIssues();
    const storeLinks = await store.listLinks();
    const projById = new Map(projects.map((p) => [p.id, p]));
    // Day window from the DATA range (no empty leading days).
    let minT = Number.MAX_SAFE_INTEGER, maxT = 0;
    for (const g of graphs)
        for (const n of g.nodes) {
            if (n.createdAt < minT)
                minT = n.createdAt;
            if (n.createdAt > maxT)
                maxT = n.createdAt;
        }
    if (maxT === 0) {
        return { days: 0, dayBase: new Date().toISOString(), projects: [], sessions: [], requirements: [], links: [] };
    }
    const span = Math.floor((maxT - minT) / 86400000) + 1;
    const days = Math.min(maxDays, Math.max(7, span));
    const base = span > maxDays ? (Math.floor(maxT / 86400000) * 86400000 - (days - 1) * 86400000) : Math.floor(minT / 86400000) * 86400000;
    // executed-in: sessionId -> issues (sorted by sourceSpan.seqStart).
    const issuesBySession = new Map();
    for (const l of storeLinks) {
        if (l.kind !== 'executed-in' || l.fromType !== 'issue' || l.toType !== 'session')
            continue;
        const issue = issues.find((i) => i.id === l.fromId);
        if (!issue)
            continue;
        const list = issuesBySession.get(l.toId) ?? [];
        list.push(issue);
        issuesBySession.set(l.toId, list);
    }
    for (const list of issuesBySession.values()) {
        list.sort((a, b) => (a.sourceSpan?.seqStart ?? 0) - (b.sourceSpan?.seqStart ?? 0));
    }
    const sessions = [];
    const requirements = [];
    for (const g of graphs) {
        const nodes = [...g.nodes].sort((a, b) => a.citation.seqStart - b.citation.seqStart);
        const userMsgs = nodes.filter((n) => n.kind === 'user-message');
        // Session origin: subagent (delegated) > user (has a real user utterance) > auto (no user input — scheduled/background).
        const origin = (g.header.origin === 'subagent' || (g.header.delegationDepth ?? 0) > 0) ? 'subagent' : (userMsgs.length > 0 ? 'user' : 'auto');
        const segIssues = issuesBySession.get(g.sessionId) ?? [];
        // Anchor points: prefer the issue's own sourceSpan.seqStart; when absent
        // (legacy issues carry no span), distribute by ORDER — the k-th requirement
        // of a session anchors at the k-th user message. This fixes the degenerate
        // case where every requirement landed on the session's first day with the
        // whole session's node count as its "events".
        const anchors = segIssues.map((issue, k) => {
            const own = issue.sourceSpan?.seqStart;
            if (typeof own === 'number' && own > 0)
                return own;
            const msg = userMsgs[k];
            return msg?.citation.seqStart ?? (userMsgs[userMsgs.length - 1]?.citation.seqStart ?? 0);
        });
        const bounds = [];
        for (let k = 0; k < segIssues.length; k++) {
            const start = anchors[k];
            const end = k + 1 < anchors.length ? anchors[k + 1] : Number.MAX_SAFE_INTEGER;
            bounds.push({ start, end });
        }
        if (segIssues.length === 0 && userMsgs.length > 0)
            bounds.push({ start: userMsgs[0].citation.seqStart, end: Number.MAX_SAFE_INTEGER });
        const segments = [];
        for (let k = 0; k < bounds.length; k++) {
            const issue = segIssues[k];
            const bnd = bounds[k];
            const inRange = nodes.filter((n) => n.citation.seqEnd >= bnd.start && n.citation.seqStart < bnd.end);
            const inUser = userMsgs.filter((n) => n.citation.seqEnd >= bnd.start && n.citation.seqStart < bnd.end);
            const lead = inUser[0];
            const dayRaw = lead ? dayIndexOf(lead.createdAt, base) : (g.header.createdAt ? dayIndexOf(g.header.createdAt, base) : 0);
            const day = Math.max(0, Math.min(days - 1, dayRaw));
            const instr = inUser.slice(1).map((n) => ({ text: n.title, messageId: n.messageId }));
            const turns = inRange.filter((n) => n.kind === 'turn' && n.outcome !== undefined).map((n) => ({ outcome: n.outcome }));
            const tools = Array.from(new Set(inRange.filter((n) => n.kind === 'tool' && n.toolName).map((n) => n.toolName))).slice(0, 6);
            const proj = (issue?.projectId !== undefined && projById.has(issue.projectId)) ? issue.projectId : UNK_ID;
            segments.push({
                day, proj,
                req: issue?.title ?? (lead?.title ?? '(未归入需求)'),
                reqMessageId: issue?.promptMessageId ?? lead?.messageId,
                sessionId: g.sessionId, instr, events: inRange.length, turns, tools,
            });
            // Yarn node = the REQUIREMENT (issue/capture), not the session.
            if (issue) {
                requirements.push({
                    id: issue.id, sessionId: g.sessionId, proj, req: issue.title, day, events: inRange.length, messageId: issue.promptMessageId, origin,
                });
            }
        }
        const perDayMap = new Map();
        for (const seg of segments) {
            const acc = perDayMap.get(seg.day) ?? { dom: seg.proj, events: 0, multi: false, projCount: new Map() };
            acc.events += seg.events;
            acc.projCount.set(seg.proj, (acc.projCount.get(seg.proj) ?? 0) + seg.events);
            acc.dom = [...acc.projCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
            acc.multi = [...acc.projCount.keys()].filter((p) => p !== UNK_ID).length > 1;
            perDayMap.set(seg.day, acc);
        }
        for (const n of nodes) {
            const day = dayIndexOf(n.createdAt, base);
            if (day < 0 || day >= days)
                continue;
            const acc = perDayMap.get(day) ?? { dom: UNK_ID, events: 0, multi: false, projCount: new Map() };
            acc.events += 1;
            perDayMap.set(day, acc);
        }
        const perDay = [...perDayMap.entries()].sort((a, b) => a[0] - b[0]).map(([day, acc]) => ({ day, dom: acc.dom, events: acc.events, multi: acc.multi }));
        // A session's projects = ALL repos its tool calls touched (graph.header.repos), not
        // just the first repo its issues happen to map to. This is the user-visible
        // cross-project association: the dsh-track daily session also touches
        // test-fakechris / dsh-harness-ops and must show all three.
        const repoProjs = (g.header.repos ?? [])
            .map((r) => repoProjectIdFor(r.url))
            .filter((id) => projById.has(id));
        const known = segments.filter((s) => s.proj !== UNK_ID).map((s) => s.proj);
        let switches = 0;
        for (let k = 1; k < known.length; k++)
            if (known[k] !== known[k - 1])
                switches++;
        const root = nodes.find((n) => n.kind === 'session');
        sessions.push({
            id: g.sessionId, title: root?.title ?? g.sessionId, origin, userMsgCount: userMsgs.length, startDay: perDay[0]?.day ?? 0,
            activeDays: perDay.map((p) => p.day), perDay, segments, switches,
            nReq: segments.length, nInstr: segments.reduce((a, s) => a + s.instr.length, 0),
            projects: repoProjs.length > 0 ? [...new Set(repoProjs)] : [...new Set(known)],
        });
    }
    sessions.sort((a, b) => a.startDay - b.startDay);
    requirements.sort((a, b) => a.day - b.day);
    // Cross-session edges between yarn nodes: session fork lineage (child -> parent)
    // and issue derives (issue -> parent issue). Only pairs whose both endpoints are
    // calendar requirements become visible links.
    const reqById = new Map(requirements.map((r) => [r.id, r]));
    const firstReqOfSession = new Map();
    for (const r of requirements) {
        if (!firstReqOfSession.has(r.sessionId))
            firstReqOfSession.set(r.sessionId, r.id);
    }
    const calLinks = [];
    const seenLink = new Set();
    for (const g of graphs) {
        if (!g.header.parentSession)
            continue;
        const from = firstReqOfSession.get(g.sessionId);
        const to = firstReqOfSession.get(g.header.parentSession);
        if (from === undefined || to === undefined || from === to)
            continue;
        if (!reqById.has(from) || !reqById.has(to))
            continue;
        const key = from + '|' + to + '|forked-from';
        if (seenLink.has(key))
            continue;
        seenLink.add(key);
        calLinks.push({ from, to, kind: 'forked-from' });
    }
    for (const i of issues) {
        if (!i.parentId)
            continue;
        const from = i.id, to = i.parentId;
        if (!reqById.has(from) || !reqById.has(to))
            continue;
        const key = from + '|' + to + '|derives';
        if (seenLink.has(key))
            continue;
        seenLink.add(key);
        calLinks.push({ from, to, kind: 'derives' });
    }
    // executed-in across sessions: an issue executed in 2+ sessions has a yarn
    // node in EACH session (same id, different sessionId) — connect those nodes
    // so the cross-session execution becomes visible on the yarn.
    const byIssueSession = new Map();
    for (const r of requirements) {
        const list = byIssueSession.get(r.id) ?? [];
        list.push(r);
        byIssueSession.set(r.id, list);
    }
    for (const list of byIssueSession.values()) {
        if (list.length < 2)
            continue;
        const first = list[0];
        for (let a = 1; a < list.length; a++) {
            const other = list[a];
            const key = first.id + '|' + other.id + '|' + other.sessionId + '|executed-in';
            if (seenLink.has(key))
                continue;
            seenLink.add(key);
            calLinks.push({ from: first.id, to: other.id, kind: 'executed-in', toSession: other.sessionId });
        }
    }
    return {
        days, dayBase: new Date(base).toISOString(),
        projects: projects.map((p) => ({ id: p.id, name: p.name, hue: hueFor(p.id) })),
        sessions, requirements, links: calLinks,
    };
}
