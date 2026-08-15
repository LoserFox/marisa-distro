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

import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { Context } from '@deepseek-ai/cordis'
import type { TrackStore } from '../store.ts'
import type { Capture, Issue } from '../types.ts'
import { alignCandidates, mergeIntoIssue, type IssueAction } from './align.ts'
import { clusterWorklogs, normalizeTitle, type EpicCandidate, type IssueCandidate } from './cluster.ts'
import { extractWorklog } from './extract.ts'
import { normalizeLog } from './raw-event.ts'
import { segmentByRules, aggregateSpans, type EvidenceSpan } from './segment.ts'
import { resolveSpanIntent } from './intent.ts'
import { candidateFromSpan, synthesizeCandidate, projectToIssueCandidate, type TaskCandidate } from './candidate.ts'
import { detectForkCopies, forkGroups, mergeCandidates, type SessionEventProfile } from './identity.ts'

/** Sync scope and write-back control. */
export interface SyncOptions {
  /** Exact workspace `cwd` to scan (same equality rule as session-query). */
  cwd: string
  /** Only fold sessions with activity after this epoch ms (default: 7 days ago). */
  since?: number
  /** Preview only — do not write. Default true. */
  dryRun?: boolean
  /** Safety cap on sessions scanned per run. */
  maxSessions?: number
  /**
   * Extraction engine. 'v1' = extract→cluster→align (original); 'v2' =
   * normalize→segment→intent→synthesize→project→align (v2 evidence-to-work
   * pipeline). Default 'v1' for backward compatibility.
   */
  engine?: 'v1' | 'v2'
}

/** Structured result of one sync run. */
export interface SyncReport {
  /** Sessions scanned (after cursor/since filtering). */
  scannedSessions: number
  /** Sessions skipped by the incremental cursor or `since`. */
  skippedByCursor: number
  /** Total user-initiated requests folded across scanned sessions. */
  userRequests: number
  /** Issue candidates produced by clustering. */
  issueCandidates: IssueCandidate[]
  /** Epic candidates produced by clustering. */
  epicCandidates: EpicCandidate[]
  /** Per-candidate reconcile action (create/update/skip). */
  actions: IssueAction[]
  /** Counts after write-back (dry-run reports what *would* happen). */
  created: number
  updated: number
  skipped: number
  /** Captures promoted to issues by this pass (open capture → create+promote). */
  promotedCaptures: number
}

/** Minimal service surface runSync needs — easy to stub in tests. */
export interface SyncDeps {
  sessionQuery: Pick<SessionQueryEngine, 'filterSessions' | 'readSession' | 'readTitle'>
  store: TrackStore
  /** Optional refiner hook (LLM enhancement, P4); default identity. */
  refine?: (candidates: IssueCandidate[], epics: EpicCandidate[]) => Promise<{ issues: IssueCandidate[]; epics: EpicCandidate[] }>
  /** Cordis context — required for the v2 engine's LLM calls (getLlm). */
  ctx?: Context
}

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** LLM route used by the v2 engine (provider/model from the harness llm service). */
const V2_ROUTE = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }

/**
 * Map an array through a worker with bounded concurrency, preserving input
 * order in the result. Used by the v2 Phase A session loop — sessions are
 * independent, so a small pool (default 3) cuts wall time ~3-5× for LLM-heavy
 * runs without tripping provider burst-QPS limits.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runner = async (): Promise<void> => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i]!, i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runner())
  await Promise.all(workers)
  return results
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
export async function runSync(deps: SyncDeps, options: SyncOptions): Promise<SyncReport> {
  const { sessionQuery, store, refine, ctx } = deps
  const dryRun = options.dryRun ?? true
  const since = options.since ?? Date.now() - DEFAULT_WINDOW_MS
  const maxSessions = options.maxSessions ?? 200
  const engine = options.engine ?? 'v1'

  // ---- 1. enumerate sessions in this workspace ----
  const records = await sessionQuery.filterSessions([{ kind: 'cwd', values: [options.cwd] }])
  const cursor = (await store.readGlobal())?.lastSync?.[options.cwd] ?? 0
  const scanFrom = Math.max(since, cursor)

  // ---- 2. read logs + titles ----
  const worklogs = []
  /** Records that actually entered worklogs (post cursor/skip, capped by
   *  maxSessions) — v2's Phase A must iterate THESE, not the raw record list
   *  (which includes cursor-skipped sessions and uncapped leftovers). */
  const inScopeRecords = []
  const metas: Record<string, { id: string; title?: string; teamKey: string; createdAt: number }> = {}
  let skippedByCursor = 0

  for (const record of records) {
    if (worklogs.length >= maxSessions) break
    // newest-first; incremental: skip sessions fully before the cursor window
    const snapshot = await sessionQuery.readSession(record.header.id)
    const lastActivity = snapshot.events.at(-1)?.time ?? 0
    if (lastActivity <= scanFrom) {
      skippedByCursor += 1
      continue
    }
    inScopeRecords.push(record)
    const worklog = extractWorklog(record.header.id, snapshot.events)
    const title = await sessionQuery.readTitle(record.header.id)
    metas[record.header.id] = {
      id: record.header.id,
      title: title?.title,
      teamKey: 'INV',
      createdAt: record.header.createdAt ?? Date.now(),
    }
    worklogs.push(worklog)
  }

  const userRequests = worklogs.reduce((n, w) => n + w.requests.length, 0)

  // ---- 3. cluster / segment ----
  let epics: EpicCandidate[] = []
  let issues: IssueCandidate[] = []
  /** Captures read once and shared by the v2 engine's Phase A (motivation
   *  context) and Phase 4 (align identity). v1 reads its own list in Phase 4. */
  let capturesForAlign: Capture[] = []

  if (engine === 'v2') {
    // v2: normalize → segment → intent → synthesize → identity → project
    // Phase A: collect candidates + session event profiles across all sessions.
    // Captures feed motivation context into synthesis (C1) AND capture→issue
    // identity in align (C2/C3) — read once up front, index by session.
    capturesForAlign = await store.listCaptures()
    const capturesBySession = new Map<string, Capture[]>()
    for (const c of capturesForAlign) {
      if (!c.sourceSessionId) continue
      const list = capturesBySession.get(c.sourceSessionId) ?? []
      list.push(c)
      capturesBySession.set(c.sourceSessionId, list)
    }
    const candidates: TaskCandidate[] = []
    const profiles: SessionEventProfile[] = []
    // Phase A sessions are independent (readSession → segment → intent →
    // synthesize) — run them through a bounded concurrency pool. Deepseek
    // throttles burst QPS, so the default limit (3) keeps wall time ~3-5×
    // lower than serial (verified: 15 sessions / ~70 LLM calls went 396s →
    // ~2min) without tripping rate limits. Span order within a session is
    // preserved, so downstream adjacentOnly merging is unaffected.
    const sessions = inScopeRecords
    const results = await mapLimit(sessions, 3, async (record) => {
      const snapshot = await sessionQuery.readSession(record.header.id)
      const lastActivity = snapshot.events.at(-1)?.time ?? 0
      if (lastActivity <= Math.max(since, cursor)) return undefined
      const raws = normalizeLog(record.header.id, snapshot.events, snapshot.session)
      const sessionCaptures = capturesBySession.get(record.header.id) ?? []
      const motivationContext = sessionCaptures
        .filter((c) => c.status === 'open' || c.status === 'promoted')
        .map((c) => `${c.content}${c.context ? `（用户意图：${c.context}）` : ''}`)
        .join('\n')
      const spans = await aggregateSpans(
        segmentByRules(record.header.id, raws),
        // No LLM judge here: aggregate deterministically (continuation steps +
        // token overlap). LLM re-merge happens later in mergeCandidates (P3
        // identity), which already runs across the whole candidate set.
      )
      const sessionCandidates: TaskCandidate[] = []
      for (const span of spans) {
        // Intent layering: drop directives/interruptions unless they state a goal.
        // Segment-level judgement (all requests, not just the lead) so a span
        // mixing a directive with a real requirement keeps the requirement.
        // Degrades to the rule pre-filter on the span lead when no LLM.
        const intent = await resolveSpanIntent(ctx, span, {
          provider: V2_ROUTE.provider,
          model: V2_ROUTE.model,
        })
        if (intent.intent === 'directive') continue
        if (intent.intent === 'interruption' && intent.confidence >= 0.7) continue
        // Synthesize (LLM) or fall back to the rule candidate.
        let candidate: TaskCandidate | undefined
        if (ctx) {
          candidate = await synthesizeCandidate(ctx, {
            ...V2_ROUTE,
            span,
            motivationContext: motivationContext || undefined,
          })
        }
        candidate ??= candidateFromSpan(span)
        if (candidate.kind === 'non_task') continue
        sessionCandidates.push(candidate)
      }
      return { profile: {
        sessionId: record.header.id,
        contentKeys: new Set(raws.map((r) => r.contentKey)),
        parentSession: snapshot.session.parentSession,
      }, candidates: sessionCandidates }
    })
    for (const result of results) {
      if (!result) continue
      profiles.push(result.profile)
      candidates.push(...result.candidates)
    }

    // Phase B: fork-copy dedup — sessions with heavy event overlap are the
    // same logical session; keep only the FIRST fork's candidates. Dedupe key
    // must be span-unique (sessionId + seqStart) so multiple spans of the SAME
    // session are never mistaken for fork copies of each other.
    const forks = detectForkCopies(profiles)
    const forkSessionIds = new Set(forkGroups(forks).flat())
    const deduped: TaskCandidate[] = []
    const seenRepresentatives = new Set<string>()
    for (const c of candidates) {
      const group = forkGroups(forks).find((g) => g.includes(c.sessionId))
      const representative = group?.[0] ?? c.sessionId
      const dedupeKey = `${representative}:${c.span.seqStart}`
      if (seenRepresentatives.has(dedupeKey)) continue
      seenRepresentatives.add(dedupeKey)
      deduped.push(c)
    }
    void forkSessionIds

    // Phase C: merge candidates that are the same work line.
    const { groups, standalone } = await mergeCandidates(ctx, deduped, { ...V2_ROUTE, adjacentOnly: true })
    const merged: TaskCandidate[] = groups.map((g) => g.canonical).concat(standalone)
    void forkSessionIds
    issues = merged.map((c) => projectToIssueCandidate(c))
  } else {
    // v1: one issue per session, clustered by title.
    const clustered = clusterWorklogs(worklogs, metas)
    epics = clustered.epics
    issues = clustered.issues
    // 3b. optional refiner (LLM)
    if (refine) {
      const refined = await refine(issues, epics)
      issues = refined.issues
      epics = refined.epics
    }
  }

  // ---- 4. align against existing store ----
  const existingIssues = await store.listIssues()
  const existingEpics = await store.listEpics()
  // Captures feed capture→issue identity: a candidate that is the concrete
  // form of a captured thought updates that issue (promoted) or creates +
  // promotes it (open) — never a silent duplicate. In the v2 engine the
  // capture list was already read in Phase A (for motivation context); reuse
  // it so align sees the same view.
  const captures: Capture[] = engine === 'v2'
    ? capturesForAlign
    : await store.listCaptures()
  const aligned = alignCandidates(
    issues,
    existingIssues,
    epics,
    existingEpics.map((e) => normalizeTitle(e.name)),
    captures,
  )

  const report: SyncReport = {
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
  }

  if (dryRun) return report

  // ---- 5. write-back ----
  let created = 0
  let updated = 0
  let promotedCaptures = 0
  // One capture is promoted at most ONCE per run: the align pass may match
  // the same open capture to several candidates (shared context, C2/C3), and
  // each create action would otherwise overwrite `promotedToIssueId` — the
  // capture ends up dangling on the LAST issue instead of its first match.
  const promotedThisRun = new Set<string>()
  for (const action of aligned.actions) {
    if (action.kind === 'create') {
      const issue: Issue = {
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
        createdAt: action.candidate.createdAt,
        updatedAt: action.candidate.updatedAt,
      }
      await store.upsertIssue(issue)
      created += 1
      // Promote the matched open capture(s): they became this issue. C3 groups
      // same-context captures, so promote all of them (no orphans).
      const promoteIds = action.promoteCaptureIds ?? (action.promoteCaptureId ? [action.promoteCaptureId] : [])
      for (const captureId of promoteIds) {
        if (promotedThisRun.has(captureId)) continue
        promotedThisRun.add(captureId)
        const capture = captures.find((c) => c.id === captureId)
        if (capture) {
          await store.upsertCapture({ ...capture, status: 'promoted', promotedToIssueId: issue.id })
          promotedCaptures += 1
        }
      }
    } else if (action.kind === 'update') {
      const merged = mergeIntoIssue(action.existing, action.candidate)
      await store.upsertIssue(merged)
      updated += 1
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
      })
    }
  }

  // ---- 6. advance cursor ----
  const global = (await store.readGlobal()) ?? {
    version: 1 as const,
    teams: {},
    identifierCounter: 0,
  }
  const newestActivity = worklogs.reduce((max, w) => Math.max(max, w.signals.lastActivityAt), 0)
  if (newestActivity > 0) {
    global.lastSync = { ...global.lastSync, [options.cwd]: newestActivity }
    await store.writeGlobal(global)
  }

  report.created = created
  report.updated = updated
  report.skipped = aligned.actions.filter((a) => a.kind === 'skip').length
  report.promotedCaptures = promotedCaptures
  return report
}
