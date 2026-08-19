/**
 * M2 — project induction: group graph docs by the REPOSITORIES their tool
 * calls actually touched (`header.repos` — resolved at graph build time from
 * file_path / workdir / `git -C` targets), falling back to the workspace cwd
 * when a session touched no repo. A workspace directory like
 * ~/source/dsh/explorer is NOT a project — the user works on dsh-track,
 * dsh-harness-ops, the dsh web harness etc. from inside it, and those repos
 * carry the work.
 *
 * Deterministic: project ids are hashes of the repo URL (or cwd), so re-runs
 * are idempotent. `repoProjectIdFor(url)` is the canonical id for repo-touch
 * projects; `projectIdFor(cwd)` remains for cwd-fallback (tests, commits).
 * @module @fakechris/dsh-track/graph/projects
 */
import { basename } from 'node:path';
import { hashCanonical } from "../sync/raw-event.js";
import { nameOfUrl, repoUrlOf as repoUrlOfPath } from "./repos.js";
/** Deterministic project id from a repo origin URL (repo-touch induction). */
export function repoProjectIdFor(url) {
    return 'track_project_' + hashCanonical([url]);
}
/** Deterministic project id from the workspace cwd (cwd-fallback). */
export function projectIdFor(cwd) {
    return 'track_project_' + hashCanonical([cwd]);
}
/** Parse <path>/.git/config for the origin remote URL (pure fs read). */
export function repoUrlOf(cwd) {
    return repoUrlOfPath(cwd);
}
/**
 * Requirement-level project attribution: an issue's project is the repo its
 * own span's tool calls touched (sourceSpan window), NOT the session's first
 * repo. This fixes the extraction defect where every requirement of a
 * multi-repo session collapsed onto repos[0] — the user-visible symptom was
 * 'no requirement ever crosses projects' while 36 sessions touched 2-4 repos.
 *
 * Legacy issues (no sourceSpan) anchor at their k-th user message so the span
 * is recoverable from the graph. Events come from the injected reader.
 */
export async function attributeIssuesBySpan(store, dryRun = false) {
    const [issues, graphs] = await Promise.all([store.listIssues(), store.listGraphs()]);
    const userMsgsBySession = new Map();
    const touchBySession = new Map();
    for (const g of graphs) {
        const msgs = g.nodes
            .filter((n) => n.kind === 'user-message')
            .sort((a, b) => a.citation.seqStart - b.citation.seqStart)
            .map((n) => ({ seq: n.citation.seqStart }));
        if (msgs.length > 0)
            userMsgsBySession.set(g.sessionId, msgs);
        if (Array.isArray(g.header.repoTouch) && g.header.repoTouch.length > 0) {
            touchBySession.set(g.sessionId, g.header.repoTouch.sort((a, b) => a.seq - b.seq));
        }
    }
    // Only multi-repo sessions can have requirement-level cross-project issues.
    const sessionRepoCount = new Map();
    for (const g of graphs)
        sessionRepoCount.set(g.sessionId, Array.isArray(g.header.repos) ? g.header.repos.length : 0);
    const bySession = new Map();
    for (const issue of issues) {
        const sid = issue.linkedSessionIds?.[0];
        if (!sid)
            continue;
        if ((sessionRepoCount.get(sid) ?? 0) <= 1)
            continue;
        const list = bySession.get(sid) ?? [];
        list.push(issue);
        bySession.set(sid, list);
    }
    let changed = 0;
    for (const [sid, sessIssues] of bySession) {
        const msgs = userMsgsBySession.get(sid) ?? [];
        const touch = touchBySession.get(sid) ?? [];
        const sorted = sessIssues
            .slice()
            .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || (a.id < b.id ? -1 : 1));
        for (const issue of sorted) {
            const k = sorted.findIndex((i) => i.id === issue.id);
            const span = issue.sourceSpan?.seqStart !== undefined && issue.sourceSpan.seqStart > 0
                ? { start: issue.sourceSpan.seqStart, end: issue.sourceSpan.seqEnd ?? Number.MAX_SAFE_INTEGER }
                : msgs[k] !== undefined
                    ? { start: msgs[k].seq, end: msgs[k + 1]?.seq ?? Number.MAX_SAFE_INTEGER }
                    : undefined;
            if (!span)
                continue;
            // First repoTouch entry at/after span.start, before span.end.
            let lo = 0, hi = touch.length - 1, pos = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (touch[mid].seq >= span.start) {
                    pos = mid;
                    hi = mid - 1;
                }
                else
                    lo = mid + 1;
            }
            if (pos < 0 || touch[pos].seq >= span.end)
                continue;
            const projectId = repoProjectIdFor(touch[pos].url);
            if (issue.projectId === projectId)
                continue;
            if (dryRun) {
                changed += 1;
                continue;
            }
            await store.upsertIssue({ ...issue, projectId, updatedAt: new Date().toISOString() });
            changed += 1;
        }
    }
    return changed;
}
/**
 * Induct projects from stored graphs and assign issues to them.
 * @param store track store.
 * @param dryRun preview without writing (default false).
 */
export async function induceProjects(store, dryRun = false, now = Date.now()) {
    const graphs = await store.listGraphs();
    // Map of projectId -> project draft (repo-touch) or cwd fallback.
    const drafts = new Map();
    let sessionsMapped = 0;
    for (const g of graphs) {
        const repos = Array.isArray(g.header.repos) ? g.header.repos : [];
        if (repos.length > 0) {
            // Repo-touch: one project per repo URL; a session may touch several.
            for (const r of repos) {
                const id = repoProjectIdFor(r.url);
                let d = drafts.get(id);
                if (!d) {
                    d = { id, name: r.name, path: r.root, repoUrl: r.url, sessionIds: new Set() };
                    drafts.set(id, d);
                }
                d.sessionIds.add(g.sessionId);
            }
            sessionsMapped += 1;
            continue;
        }
        // cwd fallback ONLY for legacy/synthetic graphs (header.repos undefined —
        // tests build graphs directly). Real graphs carry repos=[] when the session
        // touched no repo: those sessions map to NO project (unk), they must not
        // re-create a workspace-directory project (explorer is not a project).
        if (Array.isArray(g.header.repos))
            continue;
        const cwd = g.header.cwd;
        if (!cwd)
            continue;
        const id = projectIdFor(cwd);
        let d = drafts.get(id);
        if (!d) {
            d = { id, name: basename(cwd) || cwd, path: cwd, repoUrl: repoUrlOf(cwd), sessionIds: new Set() };
            drafts.set(id, d);
        }
        d.sessionIds.add(g.sessionId);
        sessionsMapped += 1;
    }
    if (!dryRun) {
        for (const d of drafts.values()) {
            const existing = await store.getProject(d.id);
            const project = {
                id: d.id,
                name: d.name,
                path: d.path,
                repoUrl: d.repoUrl,
                sessionIds: Array.from(new Set([...(existing?.sessionIds ?? []), ...d.sessionIds])),
                createdAt: existing?.createdAt ?? new Date(now).toISOString(),
                updatedAt: new Date(now).toISOString(),
            };
            await store.upsertProject(project);
        }
    }
    // Session -> primary project map (used for issue assignment + pruning).
    const projBySession = new Map();
    for (const g of graphs) {
        const repos = Array.isArray(g.header.repos) ? g.header.repos : [];
        if (repos.length > 0)
            projBySession.set(g.sessionId, repoProjectIdFor(repos[0].url));
        else if (!Array.isArray(g.header.repos) && g.header.cwd)
            projBySession.set(g.sessionId, projectIdFor(g.header.cwd));
    }
    // Prune stale projects: repo-touch induction supersedes old cwd-based
    // projects and broken worktree artifacts; drop any project no graph maps to.
    if (!dryRun) {
        const active = new Set(drafts.keys());
        const existingAll = await store.listProjects();
        for (const p0 of existingAll) {
            if (active.has(p0.id))
                continue;
            const referenced = (p0.sessionIds ?? []).some((sid) => projBySession.has(sid) && projBySession.get(sid) === p0.id);
            if (referenced)
                continue;
            await store.deleteProject(p0.id);
        }
    }
    // Assign issue.projectId from the first linked session's PRIMARY repo
    // (first repo touched; cwd fallback when none).
    const issues = await store.listIssues();
    let issuesAssigned = 0;
    for (const issue of issues) {
        const sid = issue.linkedSessionIds?.[0];
        const projectId = sid !== undefined ? projBySession.get(sid) : undefined;
        // Clear dangling ids: a no-repo session's issue must not keep pointing at
        // a pruned cwd project (its project no longer exists).
        if (sid !== undefined && !projBySession.has(sid) && issue.projectId !== undefined) {
            if (dryRun) {
                issuesAssigned += 1;
                continue;
            }
            await store.upsertIssue({ ...issue, projectId: undefined, updatedAt: new Date(now).toISOString() });
            issuesAssigned += 1;
            continue;
        }
        if (projectId === undefined || issue.projectId === projectId)
            continue;
        if (dryRun) {
            issuesAssigned += 1;
            continue;
        }
        await store.upsertIssue({ ...issue, projectId, updatedAt: new Date(now).toISOString() });
        issuesAssigned += 1;
    }
    return { projects: drafts.size, sessionsMapped, issuesAssigned };
}
export { nameOfUrl };
