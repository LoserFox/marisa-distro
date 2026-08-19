/**
 * M5 — lineage view: from any semantic entity (issue / decision / capture /
 * commit / project / session), resolve the local graph neighborhood — the
 * 'why does this exist, from which utterances, what superseded it, where did
 * it land' narrow chain. Deterministic: reads the store tables + graph docs,
 * no LLM. The first Lens per both research reports (Why/lineage before any
 * global force graph).
 * @module @fakechris/dsh-track/graph/lineage
 */
const sessionTitleOf = async (store, sessionId) => {
    const g = await store.getGraph(sessionId);
    if (!g)
        return undefined;
    const root = g.nodes.find((n) => n.kind === 'session');
    return root?.title ?? sessionId;
};
/** Resolve one entity id into its node view (auto-detects the table). */
export async function resolveNode(store, id, kindHint) {
    if (kindHint === 'issue' || (!kindHint && (id.startsWith('track_issue_') || /[A-Za-z]{2,}-\d+/.test(id)))) {
        const i = await store.getIssueByInput(id);
        if (i)
            return { id: i.id, kind: 'issue', title: i.title, meta: { state: i.state, origin: i.origin, semanticKind: i.semanticKind } };
    }
    if (kindHint === 'decision' || (!kindHint && id.startsWith('track_decision_'))) {
        const d = await store.getDecision(id);
        if (d)
            return { id: d.id, kind: 'decision', title: d.question, meta: { status: d.status } };
    }
    if (kindHint === 'capture' || (!kindHint && id.startsWith('track_capture_'))) {
        const c = await store.getCapture(id);
        if (c)
            return { id: c.id, kind: 'capture', title: c.content };
    }
    if (kindHint === 'commit' || (!kindHint && id.startsWith('track_commit_'))) {
        const cm = await store.getCommit(id);
        if (cm)
            return { id: cm.id, kind: 'commit', title: cm.subject, meta: { sha: cm.sha } };
    }
    if (kindHint === 'project' || (!kindHint && id.startsWith('track_project_'))) {
        const p = await store.getProject(id);
        if (p)
            return { id: p.id, kind: 'project', title: p.name, meta: { path: p.path, repoUrl: p.repoUrl } };
    }
    if (kindHint === 'epic' || (!kindHint && id.startsWith('track_epic_'))) {
        const epics = await store.listEpics();
        const ep = epics.find((x) => x.id === id);
        if (ep)
            return { id: ep.id, kind: 'epic', title: ep.name, meta: { status: ep.status } };
    }
    if (kindHint === 'session' || (!kindHint && id.startsWith('session'))) {
        const title = await sessionTitleOf(store, id);
        if (title)
            return { id, kind: 'session', title };
    }
    return null;
}
/**
 * Build the lineage view of one entity: neighbors via links, evidence spans
 * resolved against graphs, implementing commits. Returns null for unknown ids.
 */
export async function buildLineage(store, entity) {
    const target = await resolveNode(store, entity);
    if (!target)
        return null;
    const links = await store.linksFor(target.id);
    const neighbors = {};
    const edges = [];
    for (const l of links) {
        const out = l.fromId === target.id;
        const otherId = out ? l.toId : l.fromId;
        edges.push({ kind: l.kind, fromId: l.fromId, toId: l.toId, linkMethod: l.linkMethod, eventTime: l.eventTime, direction: out ? 'out' : 'in' });
        if (!neighbors[otherId]) {
            const n = await resolveNode(store, otherId, out ? l.toType : l.fromType);
            if (n)
                neighbors[otherId] = n;
        }
    }
    const evidence = [];
    if (target.kind === 'issue') {
        const issue = await store.getIssue(target.id);
        for (const c of issue?.citations ?? []) {
            const g = await store.getGraph(c.sessionId);
            const userMessages = (g?.nodes ?? [])
                .filter((n) => n.kind === 'user-message' && n.citation.seqStart >= c.seqStart && n.citation.seqStart <= c.seqEnd)
                .map((n) => ({ messageId: n.messageId, title: n.title, seqStart: n.citation.seqStart, seqEnd: n.citation.seqEnd }));
            evidence.push({ sessionId: c.sessionId, seqStart: c.seqStart, seqEnd: c.seqEnd, kind: c.kind, promptMessageId: issue?.promptMessageId, userMessages });
        }
    }
    const commits = [];
    for (const l of links) {
        if (l.kind != 'implements')
            continue;
        const commitId = l.fromId === target.id ? l.toId : l.fromId;
        const cm = await store.getCommit(commitId);
        if (cm)
            commits.push({ id: cm.id, sha: cm.sha, subject: cm.subject, authorAt: cm.authorAt, evidenceKind: l.evidenceKind ?? 'candidate', confidence: l.confidence, limitations: l.limitations });
    }
    const sorted = commits.slice().sort(function (a, b) { return b.authorAt - a.authorAt; });
    return {
        target: { ...target, state: target.meta?.state, origin: target.meta?.origin },
        edges,
        neighbors,
        evidence,
        commits: sorted,
    };
}
