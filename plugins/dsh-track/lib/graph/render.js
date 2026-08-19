/**
 * M1 — textual tree renderer for a SessionGraph (the track_session_graph
 * tool's output). Indented session→turn→step→tool tree, citations on every
 * line, error flags on tool calls.
 * @module @fakechris/dsh-track/graph/render
 */
const truncate = (s, max) => (s.length > max ? s.slice(0, max) + '…' : s);
const shortId = (s) => (s.length > 10 ? s.slice(0, 8) + '…' : s);
const seqLabel = (n) => (n.citation.seqStart === n.citation.seqEnd
    ? '#' + n.citation.seqStart
    : '#' + n.citation.seqStart + '-' + n.citation.seqEnd);
/**
 * Render a session's execution graph as an indented text tree.
 * Display tree: session → turns → (steps → tools | assistant replies | the
 * user requests that provoked each turn). Every line carries its seq citation
 * — the jump-back pointer into the raw session log.
 */
export function renderGraphText(g) {
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const children = new Map();
    const provokedTurn = new Map(); // user-message id → turn id
    for (const e of g.edges) {
        if (e.kind === 'provoked') {
            provokedTurn.set(e.fromId, e.toId);
            continue;
        }
        const list = children.get(e.fromId) ?? [];
        list.push(e.toId);
        children.set(e.fromId, list);
    }
    const kidsOf = (id) => (children.get(id) ?? []).sort((a, b) => (nodeById.get(a)?.citation.seqStart ?? 0) - (nodeById.get(b)?.citation.seqStart ?? 0)
        || (a < b ? -1 : 1));
    const lines = [];
    const render = (id, depth) => {
        const n = nodeById.get(id);
        if (n === undefined)
            return;
        const pad = '  '.repeat(depth);
        switch (n.kind) {
            case 'session': {
                const facts = [];
                if (g.header.cwd)
                    facts.push(g.header.cwd);
                if (g.header.parentSession)
                    facts.push('forked from ' + g.header.parentSession);
                if (g.header.origin === 'subagent')
                    facts.push('subagent (depth ' + (g.header.delegationDepth ?? 1) + ')');
                lines.push(pad + '◉ ' + (g.header.origin === 'subagent' ? 'subagent' : 'session') + ' ' + g.sessionId
                    + (facts.length > 0 ? ' (' + facts.join(' · ') + ')' : '')
                    + ' [' + g.nodes.length + ' nodes · ' + g.edges.length + ' edges · ' + seqLabel(n) + ']');
                break;
            }
            case 'turn':
                lines.push(pad + '▸ ' + n.title + ' [' + seqLabel(n) + ']');
                break;
            case 'step':
                lines.push(pad + '· step ' + (n.step ?? '') + ' [' + seqLabel(n) + ']');
                break;
            case 'tool': {
                const call = n.callId ? ' (' + shortId(n.callId) + ')' : '';
                lines.push(pad + '⚙ ' + (n.toolName ?? n.title) + call + (n.toolError ? ' ✗' : ' ✓') + ' [' + seqLabel(n) + ']');
                break;
            }
            case 'user-message':
                lines.push(pad + '💬 ' + truncate(n.title, 64) + (n.messageId ? ' [' + shortId(n.messageId) + ']' : '') + ' [' + seqLabel(n) + ']');
                break;
            case 'assistant':
                lines.push(pad + '↩ ' + truncate(n.title, 64) + ' [' + seqLabel(n) + ']');
                break;
        }
        if (n.kind === 'session') {
            for (const kid of kidsOf(id)) {
                // A user-message that provoked a turn renders under that turn; the
                // session-level containment edge is kept for provenance only.
                const k = nodeById.get(kid);
                if (k?.kind === 'user-message' && provokedTurn.has(kid))
                    continue;
                render(kid, depth + 1);
            }
        }
        else if (n.kind === 'turn') {
            for (const kid of kidsOf(id))
                render(kid, depth + 1);
            for (const [uid, tid] of provokedTurn) {
                if (tid === id)
                    render(uid, depth + 1);
            }
        }
        else {
            for (const kid of kidsOf(id))
                render(kid, depth + 1);
        }
    };
    const root = g.nodes.find((n) => n.kind === 'session') ?? g.nodes[0];
    if (root)
        render(root.id, 0);
    // User messages that never got a turn (still pending at log end).
    for (const [uid, tid] of provokedTurn) {
        const u = nodeById.get(uid);
        if (u === undefined || tid === undefined)
            continue;
        if (!g.nodes.some((n) => n.kind === 'turn' && n.id === tid))
            lines.push('  💬 (no turn) ' + truncate(u.title, 64) + ' [' + seqLabel(u) + ']');
    }
    return lines.join('\n');
}
/** One-line summary of a session graph (status output). */
export function renderGraphSummary(g) {
    const turns = g.nodes.filter((n) => n.kind === 'turn').length;
    const tools = g.nodes.filter((n) => n.kind === 'tool').length;
    const users = g.nodes.filter((n) => n.kind === 'user-message').length;
    const errors = g.nodes.filter((n) => n.kind === 'tool' && n.toolError).length;
    return 'Graph ' + g.sessionId + ': ' + turns + ' turn(s), ' + tools + ' tool call(s)'
        + (errors ? ', ' + errors + ' error(s)' : '') + ', ' + users + ' user request(s) — built ' + new Date(g.builtAt).toLocaleString();
}
