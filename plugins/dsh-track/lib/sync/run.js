/**
 * Sync pipeline — review workspace sessions and fold epic/issue-level task
 * history into the Track store.
 *
 * The "plugin command" entry: `track_sync_history` (model tool) and
 * `POST /api/track/sync` (panel) both funnel through `runSync`. The pipeline
 * is dependency-injected (session-query service + store) so it is testable
 * without a live harness, and dry-run-first so write-back stays human/track
 * confirmed (the triage discipline).
 * @module @fakechris/dsh-track/sync/run
 */
import { alignCandidates, mergeIntoIssue } from "./align.js";
import { clusterWorklogs, normalizeTitle } from "./cluster.js";
import { extractWorklog } from "./extract.js";
import { normalizeLog } from "./raw-event.js";
import { segmentByRules, aggregateSpans } from "./segment.js";
import { resolveSpanIntent } from "./intent.js";
import { candidateFromSpan, synthesizeCandidate, projectToIssueCandidate } from "./candidate.js";
import { detectForkCopies, forkGroups, mergeCandidates } from "./identity.js";
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** LLM route used by the v2 engine (provider/model from the harness llm service). */
const V2_ROUTE = { provider: 'deepseek-official', model: 'deepseek-v4-flash' };
/**
 * Map an array through a worker with bounded concurrency, preserving input
 * order in the result. Used by the v2 Phase A session loop — sessions are
 * independent, so a small pool (default 3) cuts wall time ~3-5× for LLM-heavy
 * runs without tripping provider burst-QPS limits.
 */
export async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runner = async () => {
        while (true) {
            const i = next++;
            if (i >= items.length)
                return;
            results[i] = await worker(items[i], i);
        }
    };
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => runner());
    await Promise.all(workers);
    return results;
}
/**
 * Run one sync pass.
 *
 * Pipeline (v1): filterSessions(cwd) → readSession+readTitle per session →
 * extractWorklog → clusterWorklogs → alignCandidates → dry-run report or
 * write-back (upsert issues/epics + advance the cursor).
 *
 * Pipeline (v2, engine:'v2'): …→ normalizeLog → segmentByRules →
 * intent-layering per span (LLM, drops directives) → synthesizeCandidate
 * (LLM) or candidateFromSpan (downgrade) → projectToIssueCandidate →
 * alignCandidates → same report/write-back.
 */
export async function runSync(deps, options) {
    const { sessionQuery, store, refine, ctx } = deps;
    const dryRun = options.dryRun ?? true;
    const since = options.since ?? Date.now() - DEFAULT_WINDOW_MS;
    const maxSessions = options.maxSessions ?? 200;
    const engine = options.engine ?? 'v1';
    // ---- 1. enumerate sessions in this workspace ----
    const records = await sessionQuery.filterSessions([{ kind: 'cwd', values: [options.cwd] }]);
    const cursor = (await store.readGlobal())?.lastSync?.[options.cwd] ?? 0;
    const scanFrom = Math.max(since, cursor);
    // ---- 2. read logs + titles ----
    const worklogs = [];
    /** Records that actually entered worklogs (post cursor/skip, capped by
     *  maxSessions) — v2's Phase A must iterate THESE, not the raw record list
     *  (which includes cursor-skipped sessions and uncapped leftovers). */
    const inScopeRecords = [];
    const metas = {};
    let skippedByCursor = 0;
    for (const record of records) {
        if (worklogs.length >= maxSessions)
            break;
        // newest-first; incremental: skip sessions fully before the cursor window
        const snapshot = await sessionQuery.readSession(record.header.id);
        const lastActivity = snapshot.events.at(-1)?.time ?? 0;
        if (lastActivity <= scanFrom) {
            skippedByCursor += 1;
            continue;
        }
        inScopeRecords.push(record);
        const worklog = extractWorklog(record.header.id, snapshot.events);
        const title = await sessionQuery.readTitle(record.header.id);
        metas[record.header.id] = {
            id: record.header.id,
            title: title?.title,
            teamKey: 'INV',
            createdAt: record.header.createdAt ?? Date.now(),
        };
        worklogs.push(worklog);
    }
    const userRequests = worklogs.reduce((n, w) => n + w.requests.length, 0);
    // ---- 3. cluster / segment ----
    let epics = [];
    let issues = [];
    /** Captures read once and shared by the v2 engine's Phase A (motivation
     *  context) and Phase 4 (align identity). v1 reads its own list in Phase 4. */
    let capturesForAlign = [];
    if (engine === 'v2') {
        // v2: normalize → segment → intent → synthesize → identity → project
        // Phase A: collect candidates + session event profiles across all sessions.
        // Captures feed motivation context into synthesis (C1) AND capture→issue
        // identity in align (C2/C3) — read once up front, index by session.
        capturesForAlign = await store.listCaptures();
        const capturesBySession = new Map();
        for (const c of capturesForAlign) {
            if (!c.sourceSessionId)
                continue;
            const list = capturesBySession.get(c.sourceSessionId) ?? [];
            list.push(c);
            capturesBySession.set(c.sourceSessionId, list);
        }
        const candidates = [];
        const profiles = [];
        // Phase A sessions are independent (readSession → segment → intent →
        // synthesize) — run them through a bounded concurrency pool. Deepseek
        // throttles burst QPS, so the default limit (3) keeps wall time ~3-5×
        // lower than serial (verified: 15 sessions / ~70 LLM calls went 396s →
        // ~2min) without tripping rate limits. Span order within a session is
        // preserved, so downstream adjacentOnly merging is unaffected.
        const sessions = inScopeRecords;
        const results = await mapLimit(sessions, 3, async (record) => {
            const snapshot = await sessionQuery.readSession(record.header.id);
            const lastActivity = snapshot.events.at(-1)?.time ?? 0;
            if (lastActivity <= Math.max(since, cursor))
                return undefined;
            const raws = normalizeLog(record.header.id, snapshot.events, snapshot.session);
            const sessionCaptures = capturesBySession.get(record.header.id) ?? [];
            const motivationContext = sessionCaptures
                .filter((c) => c.status === 'open' || c.status === 'promoted')
                .map((c) => `${c.content}${c.context ? `（用户意图：${c.context}）` : ''}`)
                .join('\n');
            const spans = await aggregateSpans(segmentByRules(record.header.id, raws));
            const sessionCandidates = [];
            for (const span of spans) {
                // Intent layering: drop directives/interruptions unless they state a goal.
                // Segment-level judgement (all requests, not just the lead) so a span
                // mixing a directive with a real requirement keeps the requirement.
                // Degrades to the rule pre-filter on the span lead when no LLM.
                const intent = await resolveSpanIntent(ctx, span, {
                    provider: V2_ROUTE.provider,
                    model: V2_ROUTE.model,
                });
                if (intent.intent === 'directive')
                    continue;
                if (intent.intent === 'interruption' && intent.confidence >= 0.7)
                    continue;
                // Synthesize (LLM) or fall back to the rule candidate.
                let candidate;
                if (ctx) {
                    candidate = await synthesizeCandidate(ctx, {
                        ...V2_ROUTE,
                        span,
                        motivationContext: motivationContext || undefined,
                    });
                }
                candidate ??= candidateFromSpan(span);
                if (candidate.kind === 'non_task')
                    continue;
                sessionCandidates.push(candidate);
            }
            return { profile: {
                    sessionId: record.header.id,
                    contentKeys: new Set(raws.map((r) => r.contentKey)),
                    parentSession: snapshot.session.parentSession,
                }, candidates: sessionCandidates };
        });
        for (const result of results) {
            if (!result)
                continue;
            profiles.push(result.profile);
            candidates.push(...result.candidates);
        }
        // Phase B: fork-copy dedup — sessions with heavy event overlap are the
        // same logical session; keep only the FIRST fork's candidates. Dedupe key
        // must be span-unique (sessionId + seqStart) so multiple spans of the SAME
        // session are never mistaken for fork copies of each other.
        const forks = detectForkCopies(profiles);
        const forkSessionIds = new Set(forkGroups(forks).flat());
        const deduped = [];
        const seenRepresentatives = new Set();
        for (const c of candidates) {
            const group = forkGroups(forks).find((g) => g.includes(c.sessionId));
            const representative = group?.[0] ?? c.sessionId;
            const dedupeKey = `${representative}:${c.span.seqStart}`;
            if (seenRepresentatives.has(dedupeKey))
                continue;
            seenRepresentatives.add(dedupeKey);
            deduped.push(c);
        }
        void forkSessionIds;
        // Phase C: merge candidates that are the same work line.
        const { groups, standalone } = await mergeCandidates(ctx, deduped, { ...V2_ROUTE, adjacentOnly: true });
        const merged = groups.map((g) => g.canonical).concat(standalone);
        void forkSessionIds;
        issues = merged.map((c) => projectToIssueCandidate(c));
    }
    else {
        // v1: one issue per session, clustered by title.
        const clustered = clusterWorklogs(worklogs, metas);
        epics = clustered.epics;
        issues = clustered.issues;
        // 3b. optional refiner (LLM)
        if (refine) {
            const refined = await refine(issues, epics);
            issues = refined.issues;
            epics = refined.epics;
        }
    }
    // ---- 4. align against existing store ----
    const existingIssues = await store.listIssues();
    const existingEpics = await store.listEpics();
    // Captures feed capture→issue identity: a candidate that is the concrete
    // form of a captured thought updates that issue (promoted) or creates +
    // promotes it (open) — never a silent duplicate. In the v2 engine the
    // capture list was already read in Phase A (for motivation context); reuse
    // it so align sees the same view.
    const captures = engine === 'v2'
        ? capturesForAlign
        : await store.listCaptures();
    const aligned = alignCandidates(issues, existingIssues, epics, existingEpics.map((e) => normalizeTitle(e.name)), captures);
    const report = {
        scannedSessions: worklogs.length,
        skippedByCursor,
        userRequests,
        issueCandidates: issues,
        epicCandidates: epics,
        actions: aligned.actions,
        created: aligned.actions.filter((a) => a.kind === 'create').length,
        updated: aligned.actions.filter((a) => a.kind === 'update').length,
        skipped: aligned.actions.filter((a) => a.kind === 'skip').length,
        promotedCaptures: aligned.actions.filter((a) => a.kind === 'create' && a.promoteCaptureId).length,
    };
    if (dryRun)
        return report;
    // ---- 4b. persist the extraction run (ledger-first: candidates are
    // knowledge, not throwaway intermediates — Issues are projections). ----
    if (typeof store.upsertExtraction === 'function') {
        await store.upsertExtraction({
            id: 'track_extract_' + crypto.randomUUID().replaceAll('-', ''),
            workspace: options.cwd,
            engine: options.engine === 'v2' ? 'v2' : 'v1',
            model: V2_ROUTE.model,
            scannedSessions: worklogs.length,
            spanCount: issues.filter((i) => i.span !== undefined).length,
            candidates: issues.map((i) => ({
                id: i.key,
                sessionId: i.sessionId,
                seqStart: i.span?.seqStart ?? 0,
                seqEnd: i.span?.seqEnd ?? 0,
                kind: i.labels[0] ?? 'task',
                authority: i.origin ?? 'system_inferred',
                title: i.title,
                confidence: 0.5,
            })).slice(0, 200),
            createdAt: new Date().toISOString(),
        });
    }
    // ---- 5. write-back ----
    let created = 0;
    let updated = 0;
    let promotedCaptures = 0;
    // One capture is promoted at most ONCE per run: the align pass may match
    // the same open capture to several candidates (shared context, C2/C3), and
    // each create action would otherwise overwrite `promotedToIssueId` — the
    // capture ends up dangling on the LAST issue instead of its first match.
    const promotedThisRun = new Set();
    for (const action of aligned.actions) {
        if (action.kind === 'create') {
            const issue = {
                id: `track_issue_${crypto.randomUUID().replaceAll('-', '')}`,
                identifier: await store.nextIdentifier('INV'),
                title: action.candidate.title,
                description: action.candidate.description,
                priority: action.candidate.priority,
                state: action.candidate.suggestedState,
                assignee: undefined,
                parentId: undefined,
                teamId: 'INV',
                labels: action.candidate.labels,
                acceptanceCriteria: undefined,
                linkedSessionIds: action.candidate.linkedSessionIds,
                semanticKind: action.candidate.semanticKind,
                origin: action.candidate.origin,
                citations: action.candidate.span !== undefined && action.candidate.sessionId !== undefined
                    ? [{ sessionId: action.candidate.sessionId, seqStart: action.candidate.span.seqStart, seqEnd: action.candidate.span.seqEnd, kind: 'span' }]
                    : undefined,
                sourceSpan: action.candidate.span !== undefined && action.candidate.sessionId !== undefined
                    ? { sessionId: action.candidate.sessionId, seqStart: action.candidate.span.seqStart, seqEnd: action.candidate.span.seqEnd, kind: 'span' }
                    : undefined,
                createdAt: action.candidate.createdAt,
                updatedAt: action.candidate.updatedAt,
            };
            await store.upsertIssue(issue);
            created += 1;
            // Promote the matched open capture(s): they became this issue. C3 groups
            // same-context captures, so promote all of them (no orphans).
            const promoteIds = action.promoteCaptureIds ?? (action.promoteCaptureId ? [action.promoteCaptureId] : []);
            for (const captureId of promoteIds) {
                if (promotedThisRun.has(captureId))
                    continue;
                promotedThisRun.add(captureId);
                const capture = captures.find((c) => c.id === captureId);
                if (capture) {
                    await store.upsertCapture({ ...capture, status: 'promoted', promotedToIssueId: issue.id });
                    promotedCaptures += 1;
                }
            }
        }
        else if (action.kind === 'update') {
            const merged = mergeIntoIssue(action.existing, action.candidate);
            await store.upsertIssue(merged);
            updated += 1;
        }
    }
    // Upsert epics (new ones only; existing kept as-is).
    for (const ea of aligned.epicActions) {
        if (ea.kind === 'create') {
            await store.upsertEpic({
                id: `track_epic_${crypto.randomUUID().replaceAll('-', '')}`,
                name: ea.candidate.name,
                description: ea.candidate.description,
                status: ea.candidate.status,
                teamId: 'INV',
                issueIds: [],
                createdAt: ea.candidate.createdAt,
                updatedAt: ea.candidate.updatedAt,
            });
        }
    }
    // ---- 6. advance cursor ----
    const global = (await store.readGlobal()) ?? {
        version: 1,
        teams: {},
        identifierCounter: 0,
    };
    const newestActivity = worklogs.reduce((max, w) => Math.max(max, w.signals.lastActivityAt), 0);
    if (newestActivity > 0) {
        global.lastSync = { ...global.lastSync, [options.cwd]: newestActivity };
        await store.writeGlobal(global);
    }
    report.created = created;
    report.updated = updated;
    report.skipped = aligned.actions.filter((a) => a.kind === 'skip').length;
    report.promotedCaptures = promotedCaptures;
    return report;
}
