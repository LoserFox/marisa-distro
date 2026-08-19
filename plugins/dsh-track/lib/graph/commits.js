/**
 * M3 — git artifact scan: read a project's commit log, persist commits, and
 * align them with sessions (activity time window → landed-in) and issues
 * (title token overlap + session-window → implements). The git runner is
 * injected so tests never exec git; production uses execFileSync.
 *
 * P1/P2 (2026-08-18, aligned with Better Harness evidence discipline):
 * - explicit channel first: typed commit-body trailers (`Track-Issue:`,
 *   `Harness-Session:`) produce `declared` links with confidence 1.0 —
 *   the only provenance-grade relation;
 * - heuristics (time window, title overlap) are always labeled `candidate`
 *   with a fixed limitation string — never promoted to observed/declared;
 * - correlation uses COMMITTER time (`%cI`), author time stays display-only;
 * - every fresh implements link records a `commit-observed` lifecycle signal
 *   so the state machine's done proposal is Output-gated (P0).
 * @module @fakechris/dsh-track/graph/commits
 */
import { execFileSync } from 'node:child_process';
import { hashCanonical } from "../sync/raw-event.js";
import { contentTokens } from "../sync/align.js";
import { titleSimilarity } from "../store.js";
import { semanticLinkId } from "./links.js";
import { projectIdFor, repoProjectIdFor } from "./projects.js";
import { repoUrlOf } from "./repos.js";
import { EVIDENCE_WINDOW_MS, evidenceWeight } from "../lifecycle/state-machine.js";
export const defaultGitRunner = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/** Grace added to a session's last-activity window when matching commits. */
export const SESSION_GRACE_MS = 10 * 60 * 1000;
/** Title-overlap threshold for issue → commit implements links. */
export const IMPLEMENTS_OVERLAP = 0.5;
/** Typed trailers recognized as an explicit commit→session/issue channel (P2). */
export const TRAILER_ISSUE = 'Track-Issue';
export const TRAILER_SESSION = 'Harness-Session';
export function commitIdFor(sha) {
    return 'track_commit_' + hashCanonical([sha]);
}
/**
 * Parse typed trailers out of a commit body: lines like
 * `Track-Issue: INV-12` / `Harness-Session: c-sess-1` at any position.
 */
export function parseTrailers(body) {
    const out = [];
    if (!body)
        return out;
    const re = /^(Track-Issue|Harness-Session):\s*(.+)$/gim;
    let m;
    while ((m = re.exec(body)) !== null) {
        const value = m[2].trim();
        if (value)
            out.push({ key: m[1], value });
    }
    return out;
}
/**
 * Parse `git log -z --format=%H%x00%aI%x00%cI%x00%s%x00%b` output into commit
 * artifacts. `-z` NUL-terminates each record, so multi-line bodies survive;
 * every record is exactly 5 NUL-fields (sha, author, committer, subject,
 * body) plus the `-z` terminator NUL. Malformed records are dropped.
 */
export function parseCommitLines(raw, repo) {
    if (!raw)
        return [];
    const fields = raw.split('\0');
    // Drop the trailing NUL git's `-z` appends after the last record.
    if (fields.length % 5 === 1)
        fields.pop();
    const commits = [];
    for (let i = 0; i + 4 < fields.length; i += 5) {
        const [sha, authorIso, committerIso, subject, body] = fields.slice(i, i + 5);
        const authorAt = Date.parse(authorIso ?? '');
        const committedAt = Date.parse(committerIso ?? '');
        if (!sha || !Number.isFinite(authorAt))
            continue;
        commits.push({
            id: commitIdFor(sha),
            sha,
            projectId: repoUrlOf(repo) !== undefined ? repoProjectIdFor(repoUrlOf(repo)) : projectIdFor(repo),
            repo,
            authorAt,
            // Committer time is the production-time anchor for correlation (P2);
            // fall back to author time for legacy/annotated commits.
            committedAt: Number.isFinite(committedAt) ? committedAt : authorAt,
            subject: (subject ?? '').slice(0, 200),
            body: (body ?? '').slice(0, 4000),
            trailers: parseTrailers(body ?? ''),
            createdAt: new Date().toISOString(),
        });
    }
    return commits;
}
/** Fixed limitation copy per evidence kind — the UI never upgrades weak wording. */
const LIMITATIONS = {
    declared: ['显式声明的引用（commit trailer），是最强的 provenance。'],
    observed: ['观测到的类型化证据。'],
    candidate: ['时间窗口 / 标题相似度为启发式关联，不代表该 commit 确由该 session/issue 产出。'],
    unmapped: ['真实存在但无法归属到可辩护的所有者。'],
};
/**
 * Scan one project repo: persist commits, then align with sessions (time
 * window) and issues (title overlap / session window), explicit trailer
 * links first. Idempotent: commit ids and link ids are deterministic hashes.
 * @param store track store.
 * @param cwd repo working directory.
 * @param opts dryRun previews counts without writing; limit caps the log;
 *        runGit injects the git runner (default execs git); now injects the
 *        clock for the P0 freshness window (tests use fixture times).
 */
export async function scanProjectCommits(store, cwd, opts = {}) {
    const runGit = opts.runGit ?? defaultGitRunner;
    const limit = opts.limit ?? 200;
    const dryRun = opts.dryRun ?? false;
    const now = opts.now ?? Date.now();
    let raw;
    try {
        raw = runGit(['-C', cwd, 'log', '-z', '--max-count=' + limit, '--format=%H%x00%aI%x00%cI%x00%s%x00%b']);
    }
    catch (e) {
        return { commits: 0, sessionsLinked: 0, issuesLinked: 0, byKind: {}, commitSignals: 0, error: e instanceof Error ? e.message : String(e) };
    }
    const commits = parseCommitLines(raw, cwd);
    const byKind = {};
    let count = 0;
    // Preload existing links/commits ONCE so a re-scan skips unchanged records
    // (the KV backend republishes the whole store file per putRecord — rewriting
    // identical links on every scan is minutes of disk churn for a large store).
    const existingLinks = new Map((await store.listLinks()).map((l) => [l.id, l]));
    const existingCommits = new Map((await store.listCommits()).map((c) => [c.id, c]));
    /** Semantic payload of a link — timestamps (createdAt/ingestedAt) excluded
     *  from equality so re-scans do not rewrite unchanged links. */
    const linkPayload = (l) => JSON.stringify([
        l.fromType, l.fromId, l.toType, l.toId, l.kind, l.eventTime ?? null,
        l.linkMethod ?? null, l.evidenceKind ?? null, l.confidence ?? null, l.limitations ?? null,
    ]);
    const commitPayload = (c) => JSON.stringify([
        c.sha, c.projectId, c.repo, c.authorAt, c.committedAt, c.subject, c.body ?? null, c.trailers ?? null,
    ]);
    const put = async (l) => {
        count += 1;
        byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
        if (dryRun)
            return;
        const link = {
            ...l,
            id: semanticLinkId(l.fromType, l.fromId, l.toType, l.toId, l.kind),
            createdAt: new Date().toISOString(),
            ingestedAt: new Date().toISOString(),
        };
        const existing = existingLinks.get(link.id);
        if (existing !== undefined && linkPayload(existing) === linkPayload(link))
            return; // unchanged — no publish
        existingLinks.set(link.id, link);
        await store.upsertLink(link);
    };
    if (!dryRun) {
        for (const c of commits) {
            const existing = existingCommits.get(c.id);
            if (existing !== undefined && commitPayload(existing) === commitPayload(c))
                continue;
            existingCommits.set(c.id, c);
            await store.upsertCommit(c);
        }
    }
    const issues = await store.listIssues();
    const issueByIdentifier = new Map(issues.map((i) => [i.identifier, i]));
    const graphs = await store.listGraphs();
    const cwdGraphs = graphs.filter((g) => g.header.cwd === cwd);
    const graphBySession = new Map(graphs.map((g) => [g.sessionId, g]));
    // ---- P2: explicit channel — typed trailers are declared provenance ----
    const explicitPairs = new Set(); // "kind|fromId|toId" already linked explicitly
    let sessionsLinked = 0;
    let issuesLinked = 0;
    for (const c of commits) {
        for (const t of c.trailers ?? []) {
            if (t.key === TRAILER_ISSUE) {
                const issue = issueByIdentifier.get(t.value);
                if (!issue)
                    continue;
                await put({
                    fromType: 'issue', fromId: issue.id, toType: 'commit', toId: c.id,
                    kind: 'implements', eventTime: c.committedAt,
                    linkMethod: 'trailer',
                    evidenceKind: 'declared', confidence: 1,
                    limitations: LIMITATIONS.declared,
                });
                explicitPairs.add(`implements|${issue.id}|${c.id}`);
                issuesLinked += 1;
            }
            else if (t.key === TRAILER_SESSION) {
                const graph = graphBySession.get(t.value);
                if (!graph)
                    continue;
                await put({
                    fromType: 'session', fromId: graph.sessionId, toType: 'commit', toId: c.id,
                    kind: 'landed-in', eventTime: c.committedAt,
                    linkMethod: 'trailer',
                    evidenceKind: 'declared', confidence: 1,
                    limitations: LIMITATIONS.declared,
                });
                explicitPairs.add(`landed-in|${graph.sessionId}|${c.id}`);
                sessionsLinked += 1;
            }
        }
    }
    // ---- heuristic: session alignment (committer time window → landed-in) ----
    for (const g of cwdGraphs) {
        const start = g.header.createdAt;
        // lastActivityAt is present on v2+ graphs; conservative fallback = no window.
        const end = (g.lastActivityAt ?? g.header.createdAt) + SESSION_GRACE_MS;
        for (const c of commits) {
            if (explicitPairs.has(`landed-in|${g.sessionId}|${c.id}`))
                continue;
            if (c.committedAt >= start && c.committedAt <= end) {
                await put({
                    fromType: 'session', fromId: g.sessionId, toType: 'commit', toId: c.id,
                    kind: 'landed-in', eventTime: c.committedAt,
                    linkMethod: 'commit-window',
                    evidenceKind: 'candidate', confidence: 0.4,
                    limitations: LIMITATIONS.candidate,
                });
                sessionsLinked += 1;
            }
        }
    }
    // ---- heuristic: issue alignment ----
    // An issue's implements link is candidate unless a typed trailer declared
    // it. Strength: the commit landed inside one of the issue's own sessions
    // (0.55) beats a bare title-overlap (0.25); both stay candidate.
    for (const i of issues) {
        const issueSessions = new Set(i.linkedSessionIds ?? []);
        const titleTokens = contentTokens(i.title);
        for (const c of commits) {
            if (explicitPairs.has(`implements|${i.id}|${c.id}`))
                continue;
            const windowHit = [...issueSessions].some((sid) => {
                const g = cwdGraphs.find((x) => x.sessionId === sid);
                return g !== undefined && c.committedAt >= g.header.createdAt && c.committedAt <= (g.lastActivityAt ?? g.header.createdAt) + SESSION_GRACE_MS;
            });
            const overlapHit = titleSimilarity(titleTokens, contentTokens(c.subject)) >= IMPLEMENTS_OVERLAP;
            if (windowHit || overlapHit) {
                await put({
                    fromType: 'issue', fromId: i.id, toType: 'commit', toId: c.id,
                    kind: 'implements', eventTime: c.committedAt,
                    linkMethod: windowHit ? 'commit-window' : 'title-overlap',
                    evidenceKind: 'candidate', confidence: windowHit ? 0.55 : 0.25,
                    limitations: LIMITATIONS.candidate,
                });
                issuesLinked += 1;
            }
        }
    }
    // ---- P0: commit-observed lifecycle signals (Output-first) ----
    // Fresh implements links (inside the evidence window) become evidence in
    // the issue ledger, so the state machine can propose done on Output.
    // Idempotent: a commit-observed entry for the same (link, time, pointer)
    // is not re-recorded on re-scans. Batched via recordIssueEvidenceMany so a
    // scan pays ONE store load + one write per affected issue.
    let commitSignals = 0;
    if (!dryRun) {
        const impl = await store.listLinks();
        const commitById = new Map([...existingCommits, ...commits.map((c) => [c.id, c])]);
        const signals = [];
        for (const l of impl) {
            if (l.kind !== 'implements')
                continue;
            if (l.eventTime === undefined || now - l.eventTime > EVIDENCE_WINDOW_MS)
                continue;
            const issue = issues.find((x) => x.id === l.fromId);
            if (!issue || issue.deletedAt !== undefined)
                continue;
            // Pointer must be deterministic across scans — derive from the stored
            // commit (same sha → same pointer), not from the current scan's log.
            const cm = commitById.get(l.toId);
            const pointer = cm !== undefined ? cm.sha.slice(0, 8) : l.toId.slice(-8);
            const already = (issue.inferred?.evidence ?? []).some((e) => e.signal === 'commit-observed' && e.at === l.eventTime && e.pointer === pointer);
            if (already)
                continue;
            signals.push({ issueId: issue.id, signal: { signal: 'commit-observed', at: l.eventTime, weight: evidenceWeight('commit-observed'), pointer } });
            commitSignals += 1;
        }
        if (signals.length > 0)
            await store.recordIssueEvidenceMany(signals, now);
    }
    return { commits: commits.length, sessionsLinked, issuesLinked, byKind, commitSignals };
}
