/**
 * Track Bridge — embedded task-management engine for DeepSeek Harness.
 *
 * The model-facing tools (capture_thought, report_decision_point, track_*)
 * are the ONLY entry points to the store; the model never touches storage or
 * session events directly (storage is host-side; cross-session reads are
 * cwd-fenced for the model). This plugin is the thin data face: it owns the
 * KV store, subscribes to session events, and registers the tools the fat
 * skill (skills/dsh-track/SKILL.md) instructs the model to call.
 *
 * Registrations are effects: unloading the plugin disposes tools and store.
 * @module @fakechris/dsh-track
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvFacet } from '@deepseek-ai/dsh-storage'
// Type-only: pulls the ctx.webServer Context merge from dsh-host-webserver.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { TrackStore, makeId } from './store.ts'
import type { Capture, Decision, EvidenceRef, Issue, IssueState, Link, LlmUsageRecord, TrackConfig } from './types.ts'
import { runSync } from './sync/run.ts'
import { createAutoCapture, type CaptureSignalsConfig } from './capture/observe.ts'
import { backfillCaptureContext } from './capture/backfill.ts'
import { latestUserRequest, type ContextSessionQuery, type UserPromptRef } from './capture/context.ts'
import { setUsageRecorder } from './sync/llm.ts'
import { createUsageRecorder, formatUsageReport, summarizeUsage } from './usage.ts'
import { createLifecycleObserver } from './lifecycle/observe.ts'
import { evidenceWeight, describeEvidence } from './lifecycle/state-machine.ts'
import type { SyncOptions, SyncReport, SyncDeps as SyncReportDeps } from './sync/run.ts'
import { ensureSessionGraph, buildWorkspaceGraphs, type GraphServiceDeps } from './graph/service.ts'
import { renderGraphSummary, renderGraphText } from './graph/render.ts'
import { writeSemanticLinks, type LinkPassResult } from './graph/links.ts'
import { induceProjects, attributeIssuesBySpan, type ProjectInductionResult } from './graph/projects.ts'
import { scanProjectCommits, type CommitScanResult } from './graph/commits.ts'
import { buildLineage } from './graph/lineage.ts'
import { relatedSessions, projectGraphView } from './graph/service.ts'
import { buildEvolutionBrief } from './graph/brief.ts'
import { buildCalendar } from './graph/calendar.ts'

export const name = '@fakechris/dsh-track'
export const inject = ['tools', 'storage']

/** Track Bridge plugin configuration. */
export interface Config {
  /** Workspace / team key used for Linear-style identifiers (default INV). */
  teamKey?: string
  /** Auto-capture signal mask — which structured signals produce captures.
   *  Default: every signal on (todo / goal / delegate / requirement). */
  captureSignals?: CaptureSignalsConfig
  /** G2 requirement-capture thresholds: minChars (below = terse ask, skipped)
   *  and maxChars (truncation bound). Defaults 40 / 500. */
  requirementCapture?: { minChars?: number; maxChars?: number }
}

/** Default team key when config omits it. */
export const DEFAULT_TEAM_KEY = 'INV'

/** Lifecycle sweep cadence: re-evaluate in_progress issues this often (6h). */
export const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

export const store = new TrackStore()

/**
 * Resolve a kv-capable backend, waiting for storage-json/sqlite to register.
 * Cordis starts plugins with no mutual dependency in parallel, so the json
 * backend may land after this plugin's apply; poll a short grace period and
 * fail loud rather than hanging or silently proceeding without storage.
 */
function resolveKv(ctx: Context): Promise<KvFacet> {
  return new Promise((resolve, reject) => {
    let deadline: ReturnType<typeof setTimeout> | undefined
    const check = (): KvFacet | null => {
      // BackendRegistry.get throws for an unregistered name, so probe the
      // registered names first — a backend may land after this plugin's apply.
      const names = ctx.storage.backend.names()
      const name = ['json', 'sqlite'].find((candidate) => names.includes(candidate))
      if (!name) return null
      return ctx.storage.backend.get(name).kv ?? null
    }
    const found = check()
    if (found) { resolve(found); return }
    // Cordis starts plugins with no mutual dependency in parallel; the json
    // backend may register after this plugin's apply. Poll generously (30s)
    // — the web boot registers storage-json only after its deps settle.
    const timer = setInterval(() => {
      const kv = check()
      if (kv) { clearInterval(timer); if (deadline) clearTimeout(deadline); resolve(kv) }
    }, 200)
    deadline = setTimeout(() => {
      clearInterval(timer)
      reject(new Error('track: no storage backend with kv facet mounted (json or sqlite)'))
    }, 30000)
  })
}

export function apply(ctx: Context, config?: Config) {
  const teamKey = config?.teamKey ?? DEFAULT_TEAM_KEY
  // Resume auto-continue: after a restart, an interrupted agent turn continues
  // automatically (host-side agent/created listener — no browser timing races).
  // HTTP handlers may fire before the store effect opens the unit; keep a
  // lazily-resolved open so the API works regardless of boot ordering.
  let openPromise: Promise<void> | null = null
  const ensureStoreOpen = (): Promise<void> => {
    if (store.isOpen) return Promise.resolve()
    openPromise ??= resolveKv(ctx).then((kv) => store.open(kv))
    return openPromise
  }
  /** Lifecycle evidence observer handle — wired once the store opens. */
  let lifecycle: ReturnType<typeof createLifecycleObserver> | undefined

  /**
   * Per-session cache of the latest explicit user request (text + message
   * id). The auto-observer fills it on every live `user/message` and on
   * log-seed; the tools below read it (with a persisted-log fallback) so
   * captures/decisions/issues carry the id of the prompt they happened
   * under — the web panel's deep-link target into the conversation.
   */
  const recentUser = new Map<string, UserPromptRef>()

  /** Resolve the current prompt (text + message id) of a session, cached. */
  const promptOf = async (sessionId: string | undefined): Promise<UserPromptRef | undefined> => {
    if (!sessionId) return undefined
    const cached = recentUser.get(sessionId)
    if (cached) return cached
    const found = await latestUserRequest(getSessionQuery(ctx) as ContextSessionQuery | undefined, sessionId)
    if (found) recentUser.set(sessionId, found)
    return found
  }

  // Observability: one audit row per model-facing tool call so funnel
  // questions are answered by the store, not by session-log archaeology.
  // Fire-and-forget: audit must never break the tool's real work.
  const audit = (tool: 'capture_thought' | 'report_decision_point' | 'track_create_issue' | 'track_sync_history' | 'track_usage' | 'track_backfill_captures' | 'track_respond_decision' | 'track_list_decisions' | 'track_attach_issue' | 'track_update_issue_state' | 'track_issue_evidence' | 'track_session_graph' | 'track_genealogy' | 'track_git_artifacts' | 'track_evolution_brief', exec: { agent?: { id?: string } }, ok: boolean, detail?: string): void => {
    void ensureStoreOpen()
      .then(() => store.appendAudit({
        id: makeId('audit'),
        tool,
        ts: Date.now(),
        sessionId: exec.agent?.id,
        ok,
        detail,
      }))
      .catch(() => { /* observability is best-effort */ })
  }

  // Open the KV unit once a kv-capable backend lands (see resolveKv).
  let sweepTimer: ReturnType<typeof setInterval> | undefined
  let syncTicker: ReturnType<typeof setInterval> | undefined
  ctx.effect(async () => {
    try {
      const kv = await resolveKv(ctx)
      console.log('[dsh-track] kv backend resolved, opening store')
      await store.open(kv)
      console.log('[dsh-track] store open:', store.isOpen)
      // Wire the LLM usage ledger: every ctx.llm call the engine makes is
      // appended to the store (fire-and-forget; see sync/llm.ts metering).
      setUsageRecorder(createUsageRecorder(store))
      // Wire the lifecycle evidence observer (Part B): converts the structured
      // tool stream into evidence for the attached issue of each session.
      lifecycle = createLifecycleObserver(ctx, { store })
      // Auto-maintenance loop (every SWEEP_INTERVAL_MS): five deterministic
      // passes — (1) lifecycle sweep (done/canceled/review proposals); (2)
      // auto-confirm canceled past the config grace (default 14d); (3) capture
      // triage (auto-promote title-matched captures, count stale); (4) near-dup
      // auto-merge (token similarity ≥ config threshold); (5) scheduled sync
      // (separate ticker, config interval/cap/engine — see below). Zero LLM.
      const runSweep = (): void => {
        void ensureStoreOpen()
          .then(async () => {
            const s = await store.sweepLifecycle()
            if (s.proposed > 0) {
              console.log(`[dsh-track] sweep: ${s.proposed}/${s.evaluated} in_progress → pending confirmation`)
            }
            const ac = await store.autoConfirmPendingCanceled()
            if (ac.confirmed > 0) {
              console.log(`[dsh-track] auto-confirm: ${ac.confirmed} abandoned issue(s) canceled`)
            }
            const c = await store.triageCaptures()
            if (c.promoted > 0 || c.stale > 0) {
              console.log(`[dsh-track] capture triage: ${c.promoted} promoted, ${c.stale} stale of ${c.open} open`)
            }
            const m = await store.autoMergeDuplicates()
            if (m.merged > 0) {
              console.log(`[dsh-track] dup-merge: ${m.merged} issues merged into ${m.groups} canonical(s)`)
            }
          })
          .catch((e) => console.error('[dsh-track] maintenance loop failed:', e))
      }
      runSweep() // first pass right after boot so existing zombies surface
      sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS)
      // Scheduled sync ticker: a 1h heartbeat checks the config interval
      // (default 7d) and last-run time, so a config change takes effect within
      // an hour without a restart. Scans ONLY the workspaces that were synced
      // before (lastSync keys — the incremental cursor keeps it idempotent),
      // bounded by syncMaxSessions (memory guard: the v2 LLM passes previously
      // killed the web under this machine's swap pressure).
      let lastAutoSync = Date.now()
      const runScheduledSync = async (): Promise<void> => {
        const cfg = await store.readConfig()
        if (!cfg.syncIntervalDays) return
        if (Date.now() - lastAutoSync < cfg.syncIntervalDays * 86_400_000) return
        const sessionQuery = getSessionQuery(ctx)
        if (!sessionQuery) return
        const global = await store.readGlobal()
        const workspaces = Object.keys(global?.lastSync ?? {})
        if (workspaces.length === 0) return
        lastAutoSync = Date.now()
        for (const ws of workspaces) {
          try {
            const report = await runSync(
              { sessionQuery: sessionQuery as SyncReportDeps['sessionQuery'], store, ctx },
              { cwd: ws, dryRun: false, maxSessions: cfg.syncMaxSessions, engine: cfg.syncEngine },
            )
            console.log(`[dsh-track] scheduled sync ${ws}: ${report.created} create / ${report.updated} update / ${report.promotedCaptures} promoted`)
          } catch (e) {
            console.error(`[dsh-track] scheduled sync ${ws} failed:`, e)
          }
        }
      }
      syncTicker = setInterval(() => void runScheduledSync().catch((e) => console.error('[dsh-track] sync ticker failed:', e)), 3600_000)
    } catch (e) {
      console.error('[dsh-track] store open failed:', e)
      throw e
    }
    return () => {
      if (sweepTimer !== undefined) clearInterval(sweepTimer)
      if (syncTicker !== undefined) clearInterval(syncTicker)
      lifecycle?.dispose()
      store.close()
    }
  })

  // ---- capture_thought: drop a thought into the capture wall ----
  ctx.tools.register(defineTool({
    name: 'capture_thought',
    description:
      'Capture an unstructured thought into the Track capture wall for later triage. '
      + 'Use when the user mentions something unrelated to the current work, a future plan, '
      + 'or a half-formed idea — never let it interrupt the current task.',
    parameters: {
      content: { type: 'string', required: true, description: 'The thought, in the user\'s words if possible.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional free-form tags for later clustering.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const prompt = await promptOf(exec.agent?.id)
      const capture: Capture = {
        id: makeId('capture'),
        content: args.content,
        source: exec.agent ? 'session' : 'user',
        sourceSessionId: exec.agent?.id,
        sourceMessageId: prompt?.id,
        status: 'open',
        tags: args.tags ?? [],
        context: prompt?.text,
        createdAt: new Date().toISOString(),
      }
      const result = await store.createCapture(capture)
      if (result.status === 'duplicate') {
        // Content-hash dedup: an identical thought is already on the wall —
        // surface the existing capture instead of creating a second row.
        audit('capture_thought', exec, true, `duplicate of ${result.existing?.id ?? 'capture'}`)
        return result.existing
          ? `Already captured: ${result.existing.id} (open) — not re-captured`
          : 'Already captured (open) — not re-captured'
      }
      audit('capture_thought', exec, true, capture.id)
      return `Captured: ${capture.id} (open)`
    },
    presentCall: (args) => ({ card: 'generic', title: 'Capture thought', kind: 'other', rawInput: args.content }),
  }))

  // ---- report_decision_point: AI raises a decision, user answers ----
  ctx.tools.register(defineTool({
    name: 'report_decision_point',
    description:
      'Raise a decision point that the user must answer before you continue. '
      + 'Use ONLY when the choice is irreversible, involves risk or values, changes scope or '
      + 'acceptance, or cannot be inferred from context — NOT for reversible routine choices. '
      + 'Always state your preference and rationale so the user makes a lightweight decision. '
      + 'After the user answers, record the outcome.',
    parameters: {
      question: { type: 'string', required: true, description: 'The decision in one sentence.' },
      options: { type: 'array', required: true, items: { type: 'string' }, description: 'Candidate options.' },
      my_preference: { type: 'string', required: true, description: 'Your preferred option.' },
      rationale: { type: 'string', required: true, description: 'Why you prefer it.' },
      impact: { type: 'string', description: 'What choosing your preference means.' },
      criteria: { type: 'array', items: { type: 'string' }, description: 'QOC evaluation criteria — the yardsticks used to pick the option (cost, complexity, privacy, coupling...).' },
      need: { type: 'string', enum: ['confirm', 'choose', 'supplement'], description: 'confirm: approve my preference; choose: pick an option; supplement: give me more info.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('report_decision_point requires an owning agent session')
      }
      await ensureStoreOpen()
      const prompt = await promptOf(exec.agent.id)
      const decision: Decision = {
        id: makeId('decision'),
        sessionId: exec.agent.id,
        question: args.question,
        options: args.options,
        aiPreference: args.my_preference,
        aiRationale: args.rationale,
        impact: args.impact ?? '',
        criteria: args.criteria,
        need: args.need ?? 'confirm',
        status: 'pending',
        context: prompt?.text,
        contextMessageId: prompt?.id,
        createdAt: new Date().toISOString(),
      }
      // Persist to the KV decisions table (the 20260811 harness refuses to
      // resume a session containing an unknown custom event type, so the
      // decision record lives in storage — the returned text below is the
      // stable pointer that anchors it in the conversation transcript).
      // The id is pre-allocated, so a retried call is an idempotent overwrite.
      await store.upsertDecision(decision)
      audit('report_decision_point', exec, true, decision.id)
      return formatDecisionRaised(decision)
    },
    presentCall: (args) => ({ card: 'generic', title: 'Decision point', kind: 'other', rawInput: args.question }),
  }))

  // ---- track_respond_decision: record the user's answer to a raised decision ----
  // The user answers inline in the conversation; the model relays that answer
  // here so the choice + rationale become first-class, queryable data instead
  // of chat text. Idempotent: re-answering overwrites (last answer wins).
  ctx.tools.register(defineTool({
    name: 'track_respond_decision',
    description:
      'Record the user\'s answer to a raised decision point. Call this AFTER the user '
      + 'answers a decision you raised via report_decision_point — it persists their '
      + 'choice and rationale so decisions become queryable history instead of chat text. '
      + 'Use choice=\'dismissed\' when the user declines to decide / the question is moot.',
    parameters: {
      decision_id: { type: 'string', required: true, description: 'The decision id returned by report_decision_point (dec_…).' },
      choice: { type: 'string', required: true, description: "The user's answer as stated, or 'dismissed'." },
      rationale: { type: 'string', description: "Optional user rationale / note from the conversation." },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      await ensureStoreOpen()
      const decision = await store.getDecision(args.decision_id)
      if (!decision) {
        throw new Error(`decision not found: ${args.decision_id}`)
      }
      const dismissed = args.choice === 'dismissed'
      const updated: Decision = {
        ...decision,
        status: dismissed ? 'dismissed' : 'answered',
        answer: dismissed ? 'dismissed' : args.choice,
        rationale: args.rationale,
        answeredBy: 'user',
        answeredAt: new Date().toISOString(),
      }
      await store.upsertDecision(updated)
      audit('track_respond_decision', exec, true, `${decision.id} → ${updated.status}`)
      return dismissed
        ? `Decision ${decision.id} recorded as dismissed.`
        : `Decision ${decision.id} recorded: ${updated.answer}${updated.rationale ? ` — ${updated.rationale}` : ''}`
    },
    presentCall: (args) => ({ card: 'generic', title: 'Record decision answer', kind: 'other', rawInput: `${args.decision_id} → ${args.choice}` }),
  }))

  // ---- track_list_decisions: read back decision history ----
  ctx.tools.register(defineTool({
    name: 'track_list_decisions',
    description:
      'List decision points from the Track store, optionally filtered by state, time, '
      + 'or session. Answers "which decisions are still pending", "what did the user '
      + 'decide about X", "why did we choose A".',
    parameters: {
      state: { type: 'string', enum: ['pending', 'answered', 'dismissed'], description: 'Lifecycle filter.' },
      since: { type: 'string', description: 'Only decisions raised after this ISO timestamp or epoch-ms number.' },
      session_id: { type: 'string', description: 'Only decisions raised in this session.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      await ensureStoreOpen()
      const since = args.since !== undefined
        ? (/^\d+$/.test(String(args.since)) ? Number(args.since) : Date.parse(String(args.since)))
        : undefined
      if (since !== undefined && Number.isNaN(since)) {
        throw new Error(`invalid since timestamp: ${String(args.since)}`)
      }
      const decisions = await store.listDecisions(args.state, since, args.session_id)
      audit('track_list_decisions', exec, true, `${decisions.length} decision(s)`)
      if (decisions.length === 0) return 'No decisions.'
      return decisions
        .map((d) => {
          const head = d.status === 'pending' ? 'PENDING' : d.status.toUpperCase()
          const answer = d.status === 'answered' ? ` → ${d.answer}` : d.status === 'dismissed' ? ' → dismissed' : ''
          const when = new Date(Date.parse(d.createdAt)).toISOString().slice(0, 16).replace('T', ' ')
          return `${d.id} [${head}] ${when} ${d.question}${answer}${d.rationale ? ` — ${d.rationale}` : ''}`
        })
        .join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'List decisions', kind: 'other', rawInput: args.state ?? 'all' }),
  }))

  // ---- track_attach_issue: declare the current session is driving an issue ----
  // The evidence observer only records signals for the attached issue; this is
  // the model-driven attachment (Part B). One session owns one issue at a time.
  ctx.tools.register(defineTool({
    name: 'track_attach_issue',
    description:
      'Declare that the current session is driving a specific issue. Call this when '
      + 'starting work on an issue (e.g. at plan time, with the first todo) — the '
      + 'lifecycle observer then records execution evidence (todo completion, turn '
      + 'outcomes, tool errors) against this issue automatically, and the state '
      + 'machine proposes progress. Accepts an issue id or identifier (INV-12).',
    parameters: {
      issue_id: { type: 'string', required: true, description: 'Issue id or identifier (e.g. INV-12).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('track_attach_issue requires an owning agent session')
      }
      await ensureStoreOpen()
      const issue = await store.attachSession(args.issue_id, exec.agent.id)
      if (!issue) {
        throw new Error(`issue not found: ${args.issue_id}`)
      }
      lifecycle?.attach(exec.agent.id, issue.id)
      audit('track_attach_issue', exec, true, `${issue.identifier} ← ${exec.agent.id}`)
      return (
        `Attached ${issue.identifier} (${issue.title}) to this session.\n`
        + 'Execution evidence will be recorded against it automatically; I will ask '
        + 'for confirmation before marking it done.'
      )
    },
    presentCall: (args) => ({ card: 'generic', title: 'Attach issue', kind: 'other', rawInput: args.issue_id }),
  }))

  // ---- track_update_issue_state: propose or confirm an issue state change ----
  ctx.tools.register(defineTool({
    name: 'track_update_issue_state',
    description:
      'Propose an issue state change (recorded as model evidence) or confirm one. '
      + 'For in_progress/todo, a proposal is enough. For done/canceled you MUST pass '
      + 'confirmed_by_user=true — the user has to confirm completion or abandonment '
      + 'explicitly; the system never auto-marks an issue done.',
    parameters: {
      issue_id: { type: 'string', required: true, description: 'Issue id or identifier (e.g. INV-12).' },
      target: { type: 'string', required: true, enum: ['todo', 'in_progress', 'done', 'canceled'], description: 'Target state.' },
      note: { type: 'string', description: 'Optional human note (recorded as evidence pointer).' },
      confirmed_by_user: { type: 'boolean', description: 'MUST be true for done/canceled: the user explicitly confirmed this change.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('track_update_issue_state requires an owning agent session')
      }
      await ensureStoreOpen()
      const issue = await store.getIssueByInput(args.issue_id)
      if (!issue) {
        throw new Error(`issue not found: ${args.issue_id}`)
      }
      const target = args.target as IssueState
      if ((target === 'done' || target === 'canceled') && !args.confirmed_by_user) {
        return (
          `${issue.identifier} is ${issue.state}; marking it ${target} requires explicit `
          + 'user confirmation — ask the user first, then call again with confirmed_by_user=true.'
        )
      }
      if (args.confirmed_by_user) {
        const updated = await store.confirmIssueState(issue.id, target)
        audit('track_update_issue_state', exec, true, `${issue.identifier} → ${target} (confirmed)`)
        return `${issue.identifier} marked ${target} (confirmed).`
      }
      // Plain proposal: record model-propose evidence; the machine decides.
      const signal: EvidenceRef = {
        signal: 'model-propose',
        at: Date.now(),
        weight: evidenceWeight('model-propose', target),
        sessionId: exec.agent.id,
        pointer: args.note ?? target,
      }
      const result = await store.recordIssueEvidence(issue.id, signal, exec.agent.id)
      audit('track_update_issue_state', exec, true, `${issue.identifier} propose ${target}`)
      if (!result) throw new Error(`issue not found: ${args.issue_id}`)
      const state = result.issue.state
      const inferred = result.issue.inferred
      const lines = [
        `${issue.identifier} proposal recorded (${target}).`,
        `Current state: ${state}${state !== issue.state ? ' (auto-advanced from ' + issue.state + ')' : ''}`,
        inferred ? `Inferred: ${inferred.state} @ ${(inferred.confidence * 100).toFixed(0)}%` : '',
      ]
      const pending = result.confirm
        ?? (result.issue.pendingConfirm
          ? { to: result.issue.pendingConfirm.to, reason: result.issue.pendingConfirm.reason }
          : undefined)
      if (pending) {
        lines.push(`Pending confirmation: mark ${pending.to} (${pending.reason}). Ask the user or confirm in the panel.`)
      }
      return lines.filter(Boolean).join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'Update issue state', kind: 'other', rawInput: `${args.issue_id} → ${args.target}` }),
  }))

  // ---- track_issue_evidence: read the evidence ledger of one issue ----
  ctx.tools.register(defineTool({
    name: 'track_issue_evidence',
    description:
      'Read the evidence ledger and machine-inferred state of one issue: which signals '
      + 'were observed (todo completion, turn outcomes, tool errors, user confirm), the '
      + 'composite confidence, and whether a done/canceled change is pending confirmation. '
      + 'Accepts an issue id or identifier.',
    parameters: {
      issue_id: { type: 'string', required: true, description: 'Issue id or identifier (e.g. INV-12).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      await ensureStoreOpen()
      const issue = await store.getIssueByInput(args.issue_id)
      if (!issue) {
        throw new Error(`issue not found: ${args.issue_id}`)
      }
      audit('track_issue_evidence', exec, true, issue.identifier)
      const inferred = issue.inferred
      const lines = [
        `${issue.identifier} [${issue.state}] ${issue.title}`,
        `Last progress: ${issue.lastProgressAt ? new Date(issue.lastProgressAt).toLocaleString() : '—'}`,
        issue.attachSessionId ? `Attached session: ${issue.attachSessionId}` : '',
        inferred
          ? `Inferred: ${inferred.state} @ ${(inferred.confidence * 100).toFixed(0)}% (by ${inferred.by})`
          : 'Inferred: none yet (no evidence recorded)',
        issue.pendingConfirm
          ? `PENDING CONFIRMATION: mark ${issue.pendingConfirm.to} (${issue.pendingConfirm.reason}) — resolve via the panel or track_update_issue_state with confirmed_by_user=true`
          : '',
        '',
        'Evidence (newest last):',
        ...(inferred?.evidence.length
          ? inferred.evidence.map((e) => `  ${e.signal}${e.pointer ? ` (${e.pointer})` : ''} @ ${new Date(e.at).toLocaleString()}${e.sessionId ? ` [${e.sessionId}]` : ''}`)
          : ['  (none)']),
      ]
      return lines.join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'Issue evidence', kind: 'other', rawInput: args.issue_id }),
  }))

  // ---- track_create_issue: promote structured work ----
  ctx.tools.register(defineTool({
    name: 'track_create_issue',
    description:
      'Create a structured issue (Linear-compatible) in the Track store. '
      + 'Use when a captured thought or a derived requirement becomes concrete work with '
      + 'acceptance criteria. Issues map to Track/Linear-style epics and teams.',
    parameters: {
      title: { type: 'string', required: true, description: 'One-line title.' },
      description: { type: 'string', description: 'Full description.' },
      priority: { type: 'integer', enum: [0, 1, 2, 3, 4], description: '0=urgent, 1=high, 2=medium, 3=low, 4=no priority (default 2).' },
      acceptance: { type: 'string', description: 'Acceptance criteria — the contract field.' },
      parent_id: { type: 'string', description: 'Parent epic or issue id.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          identifier: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Created ${value.identifier} (${value.id})` }],
    },
    async execute(args, exec) {
      const prompt = await promptOf(exec.agent?.id)
      const issue: Issue = {
        id: makeId('issue'),
        identifier: await store.nextIdentifier(teamKey),
        title: args.title,
        description: args.description ?? '',
        priority: (args.priority ?? 2) as Issue['priority'],
        state: 'todo',
        assignee: undefined,
        parentId: args.parent_id,
        teamId: teamKey,
        labels: [],
        acceptanceCriteria: args.acceptance,
        // Link the creating session so the web panel can jump back to the
        // originating conversation (promptMessageId targets its prompt).
        linkedSessionIds: exec.agent?.id ? [exec.agent.id] : [],
        promptMessageId: prompt?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await store.upsertIssue(issue)
      audit('track_create_issue', exec, true, issue.identifier)
      return { id: issue.id, identifier: issue.identifier }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Create issue', kind: 'other', rawInput: args.title }),
  }))

  // ---- track_list_issues: read back issues (Linear shape) ----
  ctx.tools.register(defineTool({
    name: 'track_list_issues',
    description:
      'List issues from the Track store, optionally filtered by team and state. '
      + 'Returns the Linear-compatible shape (identifier, title, priority, state, labels).',
    parameters: {
      team_id: { type: 'string', description: 'Team/workspace id filter.' },
      state: { type: 'string', enum: ['todo', 'in_progress', 'done', 'canceled'], description: 'State filter.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const issues = await store.listIssues(args.team_id, args.state)
      if (issues.length === 0) return 'No issues.'
      return issues
        .map((i) => `${i.identifier} [${i.state}] (${i.priority}) ${i.title}${i.acceptanceCriteria ? ` — acceptance: ${i.acceptanceCriteria}` : ''}`)
        .join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'List issues', kind: 'other', rawInput: args.state ?? 'all' }),
  }))

  // ---- track_sync_history: review workspace sessions → epic/issue history ----
  // The "plugin command": folds user-initiated requests from past sessions in
  // the current workspace into epic/issue-level candidates, aligns them with
  // the existing store, and (after confirmation) writes them back. Requires the
  // session-query service, which the web profile mounts; runs dry-run by
  // default so write-back stays track-confirmed.
  ctx.tools.register(defineTool({
    name: 'track_sync_history',
    description:
      'Review past user sessions in the current workspace and sync epic/issue-level task history into the Track store. '
      + 'Scans sessions whose cwd matches this workspace, extracts user-initiated requests, clusters them into epic/issue '
      + 'candidates, and reconciles with existing issues (create or update). Defaults to a dry-run preview listing candidates '
      + 'and the planned create/update actions; set dry_run=false to write back. Incremental: only folds sessions with new '
      + 'activity since the last sync. Use when the user asks to "sync history", "整理最近的工作", or wants past sessions '
      + 'tracked as tasks.',
    parameters: {
      workspace: { type: 'string', description: 'Exact workspace cwd to scan. Defaults to the current session\'s cwd.' },
      since: { type: 'string', description: 'Only fold sessions active after this ISO timestamp or epoch-ms number. Defaults to 7 days ago.' },
      dry_run: { type: 'boolean', description: 'Preview only — list candidates and planned actions without writing. Default true.' },
      max_sessions: { type: 'integer', description: 'Safety cap on sessions scanned per run (default 200).' },
      engine: { type: 'string', enum: ['v1', 'v2'], description: "Extraction engine: 'v1' (one issue per session, default) or 'v2' (segment + intent + synthesize + merge)." },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('track_sync_history requires an owning agent session')
      }
      const sessionQuery = getSessionQuery(ctx)
      if (!sessionQuery) {
        throw new Error('track_sync_history requires the session-query service (mounted by the web profile)')
      }
      // Probe: does the llm service resolve in the TOOL execution context?
      const reflect = (ctx as unknown as { reflect?: { get: (n: string, s?: boolean) => unknown } }).reflect
      console.error('[dsh-track-tool-probe]', JSON.stringify({ llm: reflect?.get('llm', false) ? 'present' : 'MISSING', sq: !!sessionQuery, cwd: exec.agent.session.header.cwd }))
      const workspace = args.workspace ?? exec.agent.session.header.cwd
      if (!workspace) {
        throw new Error('track_sync_history needs a workspace cwd: pass workspace= or run from a session with one')
      }
      const since = args.since !== undefined
        ? (/^\d+$/.test(String(args.since)) ? Number(args.since) : Date.parse(String(args.since)))
        : undefined
      if (since !== undefined && Number.isNaN(since)) {
        throw new Error(`invalid since timestamp: ${String(args.since)}`)
      }
      const options: SyncOptions = {
        cwd: workspace,
        since,
        dryRun: args.dry_run ?? true,
        maxSessions: args.max_sessions,
        engine: args.engine === 'v2' ? 'v2' : 'v1',
      }
      const report: SyncReport = await runSync(
        { sessionQuery: sessionQuery as SyncReportDeps['sessionQuery'], store, ctx },
        options,
      )
      const text = formatSyncReport(report, options.dryRun ?? true)
      audit('track_sync_history', exec, true, `${report.scannedSessions} sessions, ${report.created} create / ${report.updated} update (${options.dryRun ? 'dry' : 'written'})`)
      return text
    },
    presentCall: (args) => ({ card: 'generic', title: 'Sync session history', kind: 'other', rawInput: args.workspace ?? 'current workspace' }),
  }))

  // ---- track_usage: LLM usage ledger + cost estimate ----
  // Every ctx.llm call the track engine makes (v2 sync: intent layering,
  // candidate synthesis, relation classification) is metered into the store
  // by sync/llm.ts. This tool answers "how many requests / tokens / dollars
  // did track spend" from the store — req counts, input/output/cache tokens,
  // and an estimated cost against the PRICING table in src/usage.ts.
  ctx.tools.register(defineTool({
    name: 'track_usage',
    description:
      'Report LLM token usage and estimated cost accumulated by the track engine (v2 sync semantic '
      + 'judgement: intent layering, candidate synthesis, relation classification). Returns request counts, '
      + 'input/output/cache/reasoning tokens, wall time, and an estimated USD cost per provider/model route. '
      + 'Use when the user asks how many LLM requests track made, how many tokens it consumed, or how much '
      + 'it cost — e.g. "track 花了多少 token", "LLM 开销统计".',
    parameters: {
      since: { type: 'string', description: 'Only count calls after this ISO timestamp or epoch-ms number. Defaults to all recorded usage.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      await ensureStoreOpen()
      const since = args.since !== undefined
        ? (/^\d+$/.test(String(args.since)) ? Number(args.since) : Date.parse(String(args.since)))
        : undefined
      if (since !== undefined && Number.isNaN(since)) {
        throw new Error(`invalid since timestamp: ${String(args.since)}`)
      }
      const records = await store.listUsage()
      const summary = summarizeUsage(records, since)
      audit('track_usage', exec, true, `${summary.total.calls} calls, ${summary.total.billedTokens} tokens`)
      return formatUsageReport(summary)
    },
    presentCall: (args) => ({ card: 'generic', title: 'Track LLM usage', kind: 'other', rawInput: args.since ?? 'all time' }),
  }))

  // ---- track_backfill_captures: one-shot context migration for legacy captures ----
  // Captures created before the motivation-context work (PR #20) have no
  // `context`, so C2/C3 (context-based fold) cannot map them. This tool fills
  // each open capture's context from its source session log (most recent
  // explicit user request). Idempotent and safe to re-run.
  ctx.tools.register(defineTool({
    name: 'track_backfill_captures',
    description:
      'Backfill motivation context on legacy open captures. Captures created before '
      + 'the motivation-context feature have no context field, so context-based issue '
      + 'mapping (C2/C3) cannot fold them. Reads each open capture\'s source session log '
      + 'and writes the most recent explicit user request as its context. Idempotent: '
      + 'skips captures that already have context. Use after upgrading an older store, '
      + 'or when the capture wall shows many context-less entries.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      await ensureStoreOpen()
      const sessionQuery = getSessionQuery(ctx) as ContextSessionQuery | undefined
      const result = await backfillCaptureContext(store, sessionQuery)
      audit('track_backfill_captures', exec, true, `${result.filled} filled, ${result.skipped} skipped`)
      return (
        `Capture context backfill — ${result.scanned} legacy open capture(s) inspected.\n`
        + `Filled ${result.filled}, skipped ${result.skipped} (no explicit user request in session log).`
      )
    },
    presentCall: () => ({ card: 'generic', title: 'Backfill capture contexts', kind: 'other', rawInput: 'all legacy open captures' }),
  }))

  // ---- track_session_graph: build/read the execution graph of a session ----
  // M1 of the genealogy vision (docs/genealogy-vision.md): the deterministic
  // session→turn→step→tool tree with seq citations, persisted in the graph
  // table. Reads raw logs through the session-query service (web profile).
  ctx.tools.register(defineTool({
    name: 'track_session_graph',
    description:
      'Build and read the execution graph (会话结构图) of a session: the deterministic '
      + 'tree of turns, steps and tool calls with seq citations, plus header facts '
      + '(parent session / subagent origin). With workspace= it batch-builds graphs '
      + 'for that workspace\'s sessions (bounded by max_sessions) and reports counts. '
      + 'Every node and edge carries a (sessionId, seq) citation back into the raw '
      + 'session log. Use when the user asks to expand a session\'s execution tree, '
      + 'see what a session did, or turn past sessions into a graph.',
    parameters: {
      session_id: { type: 'string', description: 'Session id to build/read. Required unless workspace= is given.' },
      workspace: { type: 'string', description: 'Workspace cwd to batch-build graphs for (bounded by max_sessions).' },
      max_sessions: { type: 'integer', description: 'Cap for workspace batch builds (default 200).' },
      rebuild: { type: 'boolean', description: 'Force a rebuild even when a fresh graph exists (default false).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) {
        throw new Error('track_session_graph requires an owning agent session')
      }
      const sessionQuery = getSessionQuery(ctx)
      if (!sessionQuery) {
        throw new Error('track_session_graph requires the session-query service (mounted by the web profile)')
      }
      await ensureStoreOpen()
      const deps = { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store }
      if (args.workspace !== undefined) {
        const result = await buildWorkspaceGraphs(deps, args.workspace, args.max_sessions)
        audit('track_session_graph', exec, true, 'workspace build: ' + result.built + ' built / ' + result.skipped + ' fresh / ' + result.failed + ' failed')
        return 'Session graph build for ' + args.workspace + ' — ' + result.total + ' session(s) scanned: '
          + result.built + ' built, ' + result.skipped + ' already fresh, ' + result.failed + ' failed.'
      }
      if (typeof args.session_id !== 'string' || args.session_id === '') {
        throw new Error('track_session_graph needs session_id= or workspace=')
      }
      const graph = await ensureSessionGraph(deps, args.session_id, args.rebuild ?? false)
      audit('track_session_graph', exec, true, graph.sessionId)
      return renderGraphSummary(graph) + '\n\n' + renderGraphText(graph)
    },
    presentCall: (args) => ({ card: 'generic', title: 'Session graph', kind: 'other', rawInput: args.session_id ?? args.workspace ?? '' }),
  }))

  // ---- track_genealogy: build the semantic layer (links + projects) ----
  // M2 of the genealogy vision: after session graphs exist, write the
  // semantic edges (fork lineage / issue↔session / capture→issue derives /
  // decision→session / issue parent derives) and induct projects (sessions
  // grouped by cwd + git remote). Deterministic + idempotent; dry-run by
  // default reports counts without writing.
  ctx.tools.register(defineTool({
    name: 'track_genealogy',
    description:
      'Build the genealogy semantic layer: ensure session graphs (with workspace=), write semantic '
      + 'links (fork lineage / issue↔session executed-in / capture→issue derives / decision→session '
      + 'raised-in / issue parent derives), and induct projects (sessions grouped by cwd + git remote). '
      + 'Defaults to a dry-run preview; set dry_run=false to write. Idempotent — re-runs never duplicate. '
      + 'Use when the user asks to "归纳项目", "把需求串成图", or "看工作区怎么分组".',
    parameters: {
      workspace: { type: 'string', description: 'Workspace cwd to build graphs for first (optional).' },
      dry_run: { type: 'boolean', description: 'Preview only — list counts without writing. Default true.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('track_genealogy requires an owning agent session')
      await ensureStoreOpen()
      const dryRun = args.dry_run ?? true
      const sessionQuery = getSessionQuery(ctx)
      const deps = sessionQuery ? { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store } : undefined
      let graphs = ''
      if (args.workspace !== undefined) {
        if (!deps) throw new Error('track_genealogy with workspace= requires the session-query service (web profile)')
        const built = await buildWorkspaceGraphs(deps, args.workspace, 200)
        graphs = ` graphs: ${built.built} built / ${built.skipped} fresh / ${built.failed} failed;`
      }
      const links = await writeSemanticLinks(store, dryRun)
      const projects = await induceProjects(store, dryRun)
      const kindLine = Object.entries(links.byKind).map(([k, n]) => `${k}=${n}`).join(' ') || 'none'
      audit('track_genealogy', exec, true, `${dryRun ? 'dry' : 'written'} links=${links.links} projects=${projects.projects}`)
      return (`Genealogy semantic layer — ${dryRun ? 'DRY RUN (no writes)' : 'WRITTEN'}.`
        + `${graphs}`
        + ` Links: ${links.links} (${kindLine}) across ${links.sessions} session(s), ${links.issues} issue(s), ${links.captures} capture(s), ${links.decisions} decision(s).`
        + ` Projects: ${projects.projects} (${projects.sessionsMapped} session(s) mapped, ${projects.issuesAssigned} issue(s) assigned).`
        + (dryRun ? ' Run with dry_run=false to write.' : ''))
    },
    presentCall: (args) => ({ card: 'generic', title: 'Build genealogy layer', kind: 'other', rawInput: args.workspace ?? 'whole store' }),
  }))

  // ---- track_git_artifacts: scan a repo's commits and align with the graph ----
  // M3 of the genealogy vision: commits are the Layer-0 code anchor. Each
  // scanned commit links to the session whose activity window it falls in
  // (landed-in) and to issues it implements (title overlap / session window).
  ctx.tools.register(defineTool({
    name: 'track_git_artifacts',
    description:
      'Scan a repository\'s git commits into the Track store and align them with the genealogy graph: '
      + 'each commit links to the session whose activity window it falls in (landed-in) and to issues it '
      + 'implements (title token overlap or same-session window). Workspace defaults to the current '
      + 'session\'s cwd; use project-level to scan every inducted project. Dry-run by default. '
      + 'Use when the user asks "这个需求落到哪个 commit", "代码落地在哪儿", or wants git history linked.',
    parameters: {
      workspace: { type: 'string', description: 'Repo cwd to scan. Defaults to the current session\'s cwd.' },
      project_level: { type: 'boolean', description: 'Scan every inducted project (overrides workspace=).' },
      dry_run: { type: 'boolean', description: 'Preview only — list counts without writing. Default true.' },
      limit: { type: 'integer', description: 'Max commits per repo (default 200).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('track_git_artifacts requires an owning agent session')
      await ensureStoreOpen()
      const dryRun = args.dry_run ?? true
      const limit = args.limit ?? 200
      const targets: string[] = []
      if (args.project_level === true) {
        targets.push(...(await store.listProjects()).map((p) => p.path))
      } else {
        const cwd = args.workspace ?? exec.agent.session.header.cwd
        if (!cwd) throw new Error('track_git_artifacts needs workspace= or a session cwd')
        targets.push(cwd)
      }
      const lines: string[] = [`Git artifact scan — ${dryRun ? 'DRY RUN (no writes)' : 'WRITTEN'}.`]
      let totalCommits = 0, totalSessions = 0, totalIssues = 0
      for (const cwd of targets) {
        const result = await scanProjectCommits(store, cwd, { dryRun, limit })
        if (result.error) { lines.push(`  ! ${cwd}: ${result.error.slice(0, 120)}`); continue }
        totalCommits += result.commits; totalSessions += result.sessionsLinked; totalIssues += result.issuesLinked
        const kinds = Object.entries(result.byKind).map(([k, n]) => `${k}=${n}`).join(' ') || 'none'
        lines.push(`  ${cwd}: ${result.commits} commit(s), ${result.sessionsLinked} session link(s), ${result.issuesLinked} issue link(s) [${kinds}]`)
      }
      audit('track_git_artifacts', exec, true, `${dryRun ? 'dry' : 'written'} ${targets.length} repo(s), ${totalCommits} commits`)
      lines.push(`Total: ${totalCommits} commit(s) / ${totalSessions} session link(s) / ${totalIssues} issue link(s) across ${targets.length} repo(s).`
        + (dryRun ? ' Run with dry_run=false to write.' : ''))
      return lines.join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'Scan git artifacts', kind: 'other', rawInput: args.workspace ?? args.project_level ? 'all projects' : '' }),
  }))

  // ---- track_evolution_brief: deterministic project-intent brief (M7) ----
  ctx.tools.register(defineTool({
    name: 'track_evolution_brief',
    description:
      'Generate the deterministic Evolution Brief for a project (or the whole store): current issue '
      + 'stats by state/semantic kind, recent activity, open decisions, recent commits, supersede chains, '
      + 'and proposed gaps (issues without implementing commits, stale in_progress, unresolved questions). '
      + 'Zero LLM — every line is store fact; gaps are proposed findings, never auto-confirmed. '
      + 'Use before planning to answer "这个项目现在什么状态", "有哪些缺口", or "下一步该做什么".',
    parameters: {
      project_id: { type: 'string', description: 'Project id (track_project_...) to scope the brief to. Defaults to all.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('track_evolution_brief requires an owning agent session')
      await ensureStoreOpen()
      const brief = await buildEvolutionBrief(store, args.project_id)
      audit('track_evolution_brief', exec, true, (args.project_id ?? 'all') + ', gaps=' + brief.gaps.length)
      const lines: string[] = []
      if (brief.project) lines.push('项目: ' + brief.project.name + ' (' + brief.project.path + ')' + (brief.project.repoUrl ? ' · ' + brief.project.repoUrl : ''))
      const states = Object.entries(brief.issues.byState).map(([k, v]) => k + '=' + v).join(' ') || 'none'
      lines.push('Issue 统计: ' + brief.issues.total + ' 条 [' + states + ']')
      if (Object.keys(brief.issues.bySemantic).length > 0) lines.push('语义分布: ' + Object.entries(brief.issues.bySemantic).map(([k, v]) => k + '=' + v).join(' '))
      if (brief.recentCommits.length > 0) lines.push('最近 commit: ' + brief.recentCommits.map((c) => c.sha.slice(0, 8)).join(', '))
      if (brief.openDecisions.length > 0) lines.push('待确认决策 (' + brief.openDecisions.length + '): ' + brief.openDecisions.map((d) => d.question.slice(0, 40)).join(' | '))
      if (brief.superseded.length > 0) lines.push('supersede 链 (' + brief.superseded.length + '): ' + brief.superseded.map((s) => s.newer + ' -> ' + s.older.slice(0, 16)).join(' | '))
      lines.push('')
      lines.push('Proposed gaps (' + brief.gaps.length + '):')
      if (brief.gaps.length === 0) lines.push('  (无)')
      for (const g of brief.gaps.slice(0, 20)) {
        lines.push('  [' + g.type + '] ' + (g.issue ? g.issue.identifier + ' ' + g.issue.title.slice(0, 50) : (g.question ?? '').slice(0, 50)) + ' — ' + g.detail)
      }
      return lines.join('\n')
    },
    presentCall: (args) => ({ card: 'generic', title: 'Evolution brief', kind: 'other', rawInput: args.project_id ?? 'all' }),
  }))

  // ---- rule-based auto-capture: todo_write + git branch signals ----
  // Zero-cost determinism (no LLM): the capture_thought tool almost never
  // fires on its own (~1/148 measured), so the store also listens to the
  // structured tool stream and captures planning (todo_write) and execution
  // (git branch creation) signals as captures (2026-08-11).
  ctx.effect(() => {
    // Seed motivation context from the persisted log: after a restart the
    // continued (spliced) session's earlier user requests happened in the
    // PREVIOUS process, so the observer's in-memory cache is empty. Backfill
    // the most recent explicit user request per session (observe.ts seeds
    // lazily on first signal). The shared `recentUser` cache is written by
    // the observer and read by the tools (promptOf), so captures/decisions/
    // issues created after a restart still carry the prompt's message id.
    const seedContext = (sessionId: string) => latestUserRequest(getSessionQuery(ctx) as ContextSessionQuery | undefined, sessionId)
    const disposeAutoCapture = createAutoCapture(ctx, { store, seedContext, recentUser }, {
      signals: config?.captureSignals,
      requirement: config?.requirementCapture,
    })
    return () => disposeAutoCapture()
  })

  // ---- HTTP API for the Web client panel (optional: needs webServer) ----
  // The client plugin fetches captures/decisions/issues over these routes so
  // the panel has a data face without an api-remotes generated pipeline.
  ctx.inject(['webServer'], (serverCtx) => {
    console.log('[dsh-track] webServer inject fired')
    const json = (res: ServerResponse, body: unknown, status = 200): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (c) => { data += c })
        req.on('end', () => {
          try { resolve(data ? JSON.parse(data) as Record<string, unknown> : {}) }
          catch (e) { reject(e) }
        })
        req.on('error', reject)
      })

    // Register the three GET routes + the POST capture route immediately.
    // (A prior version wrapped register in an `api(path)` helper that was
    // returned but never invoked — routes were never registered.)
    const registerRoute = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void) =>
      serverCtx.webServer.register({
        kind: 'exact',
        path: `/api/track${path}`,
        handler: (req, res) => Promise.resolve(handler(req, res)).catch((e) => {
          json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
        }),
      })
    registerRoute('/captures', async (req, res) => {
      await ensureStoreOpen()
      if (req.method === 'POST') {
        const body = await readBody(req)
        const content = typeof body.content === 'string' ? body.content : ''
        if (!content) { json(res, { error: 'content required' }, 400); return }        const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : []
        const capture: Capture = {
          id: makeId('capture'),
          content,
          source: 'user',
          status: 'open',
          tags,
          createdAt: new Date().toISOString(),
        }
        const result = await store.createCapture(capture)
        if (result.status === 'duplicate') {
          json(res, { ok: true, duplicate: true, capture: result.existing ?? capture }); return
        }
        json(res, { ok: true, capture }); return
      }
      if (req.method === 'GET') { json(res, { captures: await store.listCaptures() }); return }
      json(res, { error: 'method not allowed' }, 405)
    })
    registerRoute('/issues', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const includeDeleted = url.searchParams.get('includeDeleted') === '1'
      const issues = await store.listIssues(undefined, undefined, { includeDeleted })
      // P0 (Output-first): annotate each issue with its best commit evidence
      // so the panel can mark done-without-commit work instead of hiding it.
      if (!includeDeleted) {
        const links = await store.listLinks()
        const implByIssue = new Map<string, { best: Link['evidenceKind'] | undefined; confidence: number; count: number; limitations?: string[] }>()
        for (const l of links) {
          if (l.kind !== 'implements') continue
          const cur = implByIssue.get(l.fromId) ?? { best: undefined, confidence: 0, count: 0, limitations: undefined }
          cur.count += 1
          const conf = l.confidence ?? 0
          if (conf > cur.confidence) { cur.confidence = conf; cur.best = l.evidenceKind ?? 'candidate'; cur.limitations = l.limitations }
          implByIssue.set(l.fromId, cur)
        }
        const annotated = issues.map((i) => {
          const ev = implByIssue.get(i.id)
          return ev !== undefined ? { ...i, commitEvidence: ev } : { ...i, commitEvidence: null }
        })
        json(res, { issues: annotated }); return
      }
      json(res, { issues }); return
    })
    registerRoute('/funnel', async (_req, res) => {
      await ensureStoreOpen()
      json(res, { funnel: await store.funnel() })
    })
    // GET /api/track/usage[?since=<epoch-ms>&limit=<n>] — LLM usage ledger:
    // summary (req counts, tokens, est. cost) + the most recent records.
    registerRoute('/usage', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const since = url.searchParams.get('since')
      const limitRaw = url.searchParams.get('limit')
      const sinceMs = since !== null
        ? (/^\d+$/.test(since) ? Number(since) : Date.parse(since))
        : undefined
      const limit = limitRaw !== null && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 50
      const records = await store.listUsage()
      const summary = summarizeUsage(records, sinceMs)
      const recent = [...records].sort((a, b) => b.at - a.at).slice(0, limit)
      json(res, { usage: recent, summary })
    })
    // GET /api/track/decisions[?state=&since=&session_id=] — decision history.
    registerRoute('/decisions', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const state = url.searchParams.get('state') as Decision['status'] | null
      const sinceRaw = url.searchParams.get('since')
      const sessionId = url.searchParams.get('session_id')
      const since = sinceRaw !== null
        ? (/^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw))
        : undefined
      if (state !== null && !['pending', 'answered', 'dismissed'].includes(state)) {
        json(res, { error: `invalid state: ${state}` }, 400); return
      }
      json(res, { decisions: await store.listDecisions(state ?? undefined, since, sessionId ?? undefined) })
    })
    // GET /api/track/config — effective auto-maintenance config; POST with a
    // partial body persists a patch (missing fields keep their current value).
    registerRoute('/config', async (req, res) => {
      await ensureStoreOpen()
      if (req.method === 'GET') { json(res, { config: await store.readConfig() }); return }
      if (req.method === 'POST') {
        const body = await readBody(req)
        const patch: Partial<TrackConfig> = {}
        const num = (k: string): number | undefined => typeof body[k] === 'number' && Number.isFinite(body[k]) ? body[k] as number : undefined
        const d = num('autoCancelPendingDays')
        const i = num('syncIntervalDays')
        const m = num('syncMaxSessions')
        const t = num('nearDupThreshold')
        if (d !== undefined && d >= 0) patch.autoCancelPendingDays = d
        if (i !== undefined && i >= 0) patch.syncIntervalDays = i
        if (m !== undefined && m >= 1) patch.syncMaxSessions = m
        if (t !== undefined && t >= 0 && t <= 1) patch.nearDupThreshold = t
        if (body.syncEngine === 'v1' || body.syncEngine === 'v2') patch.syncEngine = body.syncEngine
        if (Object.keys(patch).length === 0) { json(res, { error: 'no valid config fields' }, 400); return }
        const config = await store.writeConfig(patch)
        json(res, { ok: true, config }); return
      }
      json(res, { error: 'method not allowed' }, 405)
    })

    // ---- action routes (prefix kind: exact wins for the base path, so
    // GET/POST /captures and GET /issues keep their handlers above) ----

    /** Extract the id path segment after `prefix`, or null when absent. */
    const idFromUrl = (req: IncomingMessage, prefix: string): string | null => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (!pathname.startsWith(`${prefix}/`)) return null
      const segments = pathname.slice(prefix.length + 1).split('/').filter(Boolean)
      return segments.length >= 1 ? decodeURIComponent(segments[0]) : null
    }
    const registerAction = (prefix: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void) =>
      serverCtx.webServer.register({
        kind: 'prefix',
        path: `/api/track${prefix}`,
        handler: (req, res) => Promise.resolve(handler(req, res)).catch((e) => {
          json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
        }),
      })

    // DELETE /api/track/captures/:id — remove a captured thought.
    // POST  /api/track/captures/:id/promote — promote a capture into an issue.
    registerAction('/captures', async (req, res) => {
      await ensureStoreOpen()
      const id = idFromUrl(req, '/api/track/captures')
      if (id === null) { json(res, { error: 'capture id required' }, 400); return }
      if (req.method === 'DELETE') {
        const body = await readBody(req).catch((): Record<string, unknown> => ({}))
        await store.deleteCapture(id, {
          by: 'user',
          reason: typeof body.reason === 'string' && body.reason !== '' ? body.reason.slice(0, 200) : undefined,
        })
        json(res, { ok: true }); return
      }
      if (req.method === 'POST' && new URL(req.url ?? '/', 'http://x').pathname.endsWith('/promote')) {
        const issue = await store.promoteCaptureToIssue(id, teamKey)
        json(res, { ok: true, issue }); return
      }
      json(res, { error: 'method not allowed' }, 405)
    })
    // DELETE /api/track/issues/:id — remove a task (cleanup).
    registerAction('/issues', async (req, res) => {
      await ensureStoreOpen()
      const id = idFromUrl(req, '/api/track/issues')
      if (id === null) { json(res, { error: 'issue id required' }, 400); return }
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      // GET /api/track/issues/:id/evidence — the evidence ledger (Part B).
      if (req.method === 'GET' && pathname.endsWith('/evidence')) {
        const issue = await store.getIssueByInput(id)
        if (!issue) { json(res, { error: 'issue not found' }, 404); return }
        json(res, {
          issue: { id: issue.id, identifier: issue.identifier, state: issue.state, title: issue.title },
          lastProgressAt: issue.lastProgressAt ?? null,
          attachSessionId: issue.attachSessionId ?? null,
          inferred: issue.inferred ?? null,
          pendingConfirm: issue.pendingConfirm ?? null,
        }); return
      }
      // POST /api/track/issues/:id/confirm — user confirms a pending
      // done/canceled proposal (the panel's 本确认 section).
      if (req.method === 'POST' && pathname.endsWith('/confirm')) {
        const body = await readBody(req)
        const to = body.to
        if (to !== 'done' && to !== 'canceled') {
          json(res, { error: 'to must be "done" or "canceled"' }, 400); return
        }
        // Resolve by store id OR Linear identifier (INV-12) — the panel
        // passes store ids, callers may pass identifiers.
        const found = await store.getIssueByInput(id)
        if (!found) { json(res, { error: 'issue not found' }, 404); return }
        const updated = await store.confirmIssueState(found.id, to, 'user')
        json(res, { ok: true, issue: { id: updated?.id ?? found.id, identifier: updated?.identifier ?? found.identifier, state: updated?.state ?? found.state } }); return
      }
      // POST /api/track/issues/:id/dismiss — reject the pending proposal
      // without changing state (the sweep may re-propose later).
      if (req.method === 'POST' && pathname.endsWith('/dismiss')) {
        const found = await store.getIssueByInput(id)
        if (!found) { json(res, { error: 'issue not found' }, 404); return }
        await store.dismissPending(found.id)
        json(res, { ok: true, issue: { id: found.id, identifier: found.identifier, state: found.state } }); return
      }
      // POST /api/track/issues/:id/merge — merge a duplicate task into its
      // canonical ({ into: <issue id or identifier> }): union sessions,
      // cancel the source. User-confirmed (by='user') — the auto loop only
      // merges EXACT-title duplicates on its own.
      if (req.method === 'POST' && pathname.endsWith('/merge')) {
        const body = await readBody(req)
        const into = typeof body.into === 'string' ? body.into : ''
        if (!into) { json(res, { error: 'into (canonical issue id/identifier) required' }, 400); return }
        const source = await store.getIssueByInput(id)
        const canonical = await store.getIssueByInput(into)
        if (!source || !canonical) { json(res, { error: 'issue not found' }, 404); return }
        const merged = await store.mergeIntoCanonical(source.id, canonical.id, 'user')
        json(res, { ok: true, canonical: { id: merged?.id ?? canonical.id, identifier: merged?.identifier ?? canonical.identifier, state: merged?.state ?? canonical.state } }); return
      }
      if (req.method === 'DELETE') {
        // Soft delete (2026-08-18): the row is tombstoned, the `user-delete`
        // negation is recorded in the issue's ledger, and an audit entry is
        // appended — deletion never removes the record. Optional `reason`
        // body carries the user's stated reason.
        const body = await readBody(req).catch((): Record<string, unknown> => ({}))
        const deleted = await store.deleteIssue(id, {
          by: 'user',
          reason: typeof body.reason === 'string' && body.reason !== '' ? body.reason.slice(0, 200) : undefined,
        })
        json(res, { ok: true, deleted: deleted !== undefined }); return
      }
      json(res, { error: 'method not allowed' }, 405)
    })
    // POST /api/track/issues/batch — batch state change: mark many issues
    // done/canceled in ONE request ({ ids: [...], to }). Each id resolves by
    // store id OR Linear identifier; results are per-id so partial failures
    // surface instead of aborting the batch. The panel batch mode and scripts
    // use this instead of looping the per-id confirm endpoint.
    registerRoute('/issues/batch', async (req, res) => {
      if (req.method !== 'POST') { json(res, { error: 'method not allowed' }, 405); return }
      const body = await readBody(req)
      const raw = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
      const to = body.to
      if (raw.length === 0) { json(res, { error: 'ids (non-empty array) required' }, 400); return }
      if (to !== 'done' && to !== 'canceled') { json(res, { error: 'to must be "done" or "canceled"' }, 400); return }
      const results: Array<Record<string, unknown>> = []
      for (const id of raw) {
        const found = await store.getIssueByInput(id)
        if (!found) {
          results.push({ id, status: 'failed', error: 'issue not found' })
          continue
        }
        const updated = await store.confirmIssueState(found.id, to, 'user')
        results.push({
          id,
          identifier: found.identifier,
          state: updated?.state ?? found.state,
          status: 'done',
        })
      }
      json(res, { ok: true, results })
    })
    registerRoute('/sync', async (req, res) => {      await ensureStoreOpen()
      if (req.method !== 'POST') { json(res, { error: 'method not allowed' }, 405); return }
      const sessionQuery = getSessionQuery(ctx)
      if (!sessionQuery) {
        json(res, { error: 'session-query service unavailable (web profile only)' }, 503)
        return
      }
      const body = await readBody(req)
      const workspace = typeof body.workspace === 'string' ? body.workspace : undefined
      const since = typeof body.since === 'number' ? body.since : undefined
      const dryRun = typeof body.dry_run === 'boolean' ? body.dry_run : true
      const maxSessions = typeof body.max_sessions === 'number' ? body.max_sessions : undefined
      try {
        const report = await runSync(
          { sessionQuery: sessionQuery as SyncReportDeps['sessionQuery'], store, ctx },
          { cwd: workspace ?? (ctx as unknown as { workspace?: { cwd?: string } }).workspace?.cwd ?? '', since, dryRun, maxSessions, engine: body.engine === 'v2' ? 'v2' : 'v1' },
        )
        json(res, { ok: true, dryRun, report })
      } catch (e) {
        json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
      }
    })
    // ---- session execution graphs (M1 genealogy floor) ----
    // GET  /api/track/graph?sessionId= — the stored graph (doc null when not built).
    // POST /api/track/graph { sessionId, rebuild? } — build and return it.
    // POST /api/track/graph/build-all { cwd, max_sessions? } — batch build a workspace.
    registerRoute('/graph', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      if (req.method === 'GET') {
        const sessionId = url.searchParams.get('sessionId')
        if (!sessionId) { json(res, { error: 'sessionId required' }, 400); return }
        const doc = await store.getGraph(sessionId)
        json(res, { ok: true, doc: doc ?? null })
        return
      }
      if (req.method === 'POST') {
        const body = await readBody(req)
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : url.searchParams.get('sessionId')
        if (!sessionId) { json(res, { error: 'sessionId required' }, 400); return }
        const sessionQuery = getSessionQuery(ctx)
        if (!sessionQuery) { json(res, { error: 'session-query service unavailable (web profile only)' }, 503); return }
        const graph = await ensureSessionGraph(
          { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store },
          sessionId,
          body.rebuild === true,
        )
        json(res, { ok: true, doc: graph })
        return
      }
      json(res, { error: 'method not allowed' }, 405)
    })
    registerRoute('/graph/build-all', async (req, res) => {
      await ensureStoreOpen()
      if (req.method !== 'POST') { json(res, { error: 'method not allowed' }, 405); return }
      const sessionQuery = getSessionQuery(ctx)
      if (!sessionQuery) { json(res, { error: 'session-query service unavailable (web profile only)' }, 503); return }
      const body = await readBody(req)
      const cwd = typeof body.cwd === 'string' ? body.cwd : ''
      if (!cwd) { json(res, { error: 'cwd required' }, 400); return }
      const max = typeof body.max_sessions === 'number' ? body.max_sessions : 200
      const result = await buildWorkspaceGraphs(
        { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store },
        cwd,
        max,
      )
      json(res, { ok: true, result })
    })
    // POST /api/track/graph/link-all { cwd?, dry_run? } — semantic links + projects.
    registerRoute('/graph/link-all', async (req, res) => {
      await ensureStoreOpen()
      if (req.method !== 'POST') { json(res, { error: 'method not allowed' }, 405); return }
      const body = await readBody(req)
      const dryRun = body.dry_run === true
      const sessionQuery = getSessionQuery(ctx)
      let graphs: { total: number; built: number; skipped: number; failed: number } | undefined
      if (typeof body.cwd === 'string' && body.cwd !== '') {
        if (!sessionQuery) { json(res, { error: 'session-query service unavailable (web profile only)' }, 503); return }
        graphs = await buildWorkspaceGraphs(
          { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store },
          body.cwd,
          typeof body.max_sessions === 'number' ? body.max_sessions : 200,
        )
      } else if (sessionQuery) {
        // No cwd → build EVERY workspace's graphs (distinct cwds across the corpus),
        // so the calendar/matrix see ALL projects (dsh-track, harness-ops, harness…).
        const sq = sessionQuery as { listSessions(): Promise<Array<{ header: { cwd?: string } }>> }
        const all = await sq.listSessions()
        const cwds = [...new Set(all.map((s) => s.header.cwd).filter((c): c is string => typeof c === 'string' && c !== ''))]
        const totals = { total: 0, built: 0, skipped: 0, failed: 0 }
        for (const cwd of cwds) {
          const r = await buildWorkspaceGraphs(
            { sessionQuery: sessionQuery as GraphServiceDeps['sessionQuery'], store },
            cwd,
            typeof body.max_sessions === 'number' ? body.max_sessions : 200,
          )
          totals.total += r.total; totals.built += r.built; totals.skipped += r.skipped; totals.failed += r.failed
        }
        graphs = totals
      }
      const links = await writeSemanticLinks(store, dryRun)
      // Requirement-level project attribution: an issue belongs to the repo its
      // own span's work touched, not the session's first repo. Needs events.
      let attributed = 0
      if (!dryRun) {
        try {
          attributed = await attributeIssuesBySpan(store, false)
        } catch { /* attribution is best-effort */ }
      }
      const projects = await induceProjects(store, dryRun)
      json(res, { ok: true, dryRun, graphs, links, projects, attributed })
    })
    // GET /api/track/projects — inducted projects (project dimension).
    registerRoute('/projects', async (_req, res) => {
      await ensureStoreOpen()
      json(res, { projects: await store.listProjects() })
    })
    // POST /api/track/git/scan { cwd?, project_level?, dry_run?, limit? } — commit scan.
    registerRoute('/git/scan', async (req, res) => {
      await ensureStoreOpen()
      if (req.method !== 'POST') { json(res, { error: 'method not allowed' }, 405); return }
      const body = await readBody(req)
      const dryRun = body.dry_run === true
      const limit = typeof body.limit === 'number' ? body.limit : 200
      const targets: string[] = []
      if (body.project_level === true) {
        targets.push(...(await store.listProjects()).map((p) => p.path))
      } else if (typeof body.cwd === 'string' && body.cwd !== '') {
        targets.push(body.cwd)
      } else {
        json(res, { error: 'cwd or project_level required' }, 400); return
      }
      const results: Array<{ cwd: string; result: CommitScanResult }> = []
      for (const cwd of targets) {
        results.push({ cwd, result: await scanProjectCommits(store, cwd, { dryRun, limit }) })
      }
      json(res, { ok: true, dryRun, results })
    })
    // GET /api/track/calendar — calendar-yarn dataset over ALL projects.
    registerRoute('/calendar', async (_req, res) => {
      await ensureStoreOpen()
      json(res, { ok: true, calendar: await buildCalendar(store) })
    })
    // GET /api/track/graph/view[?projectId= | ?cwd=] — project-level graph for the visual tab.
    registerRoute('/graph/view', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      let pid = url.searchParams.get('projectId') ?? undefined
      const cwd = url.searchParams.get('cwd')
      if (pid === undefined && cwd !== null && cwd !== '') {
        const proj = (await store.listProjects()).find((p) => p.path === cwd)
        pid = proj?.id
      }
      json(res, { ok: true, view: await projectGraphView(store, pid) })
    })
    // GET /api/track/lineage?entity=<id|identifier> — the Why/lineage view.
    registerRoute('/lineage', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const entity = url.searchParams.get('entity')
      if (!entity) { json(res, { error: 'entity required' }, 400); return }
      const view = await buildLineage(store, entity)
      if (!view) { json(res, { error: 'entity not found' }, 404); return }
      json(res, { ok: true, view })
    })
    // GET /api/track/graph/related?sessionId= — parent/children sessions (M6).
    registerRoute('/graph/related', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId) { json(res, { error: 'sessionId required' }, 400); return }
      json(res, { ok: true, related: await relatedSessions(store, sessionId) })
    })
    // GET /api/track/brief[?projectId=] — evolution brief (M7).
    registerRoute('/brief', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const projectId = url.searchParams.get('projectId') ?? undefined
      json(res, { ok: true, brief: await buildEvolutionBrief(store, projectId) })
    })
    // GET /api/track/extractions[?limit=] — durable extraction runs.
    registerRoute('/extractions', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const limitRaw = url.searchParams.get('limit')
      const limit = limitRaw !== null && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 20
      json(res, { extractions: await store.listExtractions(limit) })
    })
    // GET /api/track/commits?projectId= — scanned commit artifacts.
    registerRoute('/commits', async (req, res) => {
      await ensureStoreOpen()
      const url = new URL(req.url ?? '/', 'http://x')
      const projectId = url.searchParams.get('projectId') ?? undefined
      json(res, { commits: await store.listCommits(projectId) })
    })
  })
}

export { store as trackStore }

/**
 * Non-throwing access to the optional session-query service. cordis proxy get
 * throws "without inject" for undeclared services; `reflect.get(name, false)`
 * returns the value or undefined, so the plugin still applies in host
 * compositions that do not mount session-query (tests, headless).
 */
function getSessionQuery(ctx: Context): unknown {
  const reflect = (ctx as unknown as { reflect?: { get: (name: string, strict?: boolean) => unknown } }).reflect
  return reflect?.get('sessionQuery', false)
}

/** Render a sync report as the tool's text result. */
function formatSyncReport(report: SyncReport, dryRun: boolean): string {
  const mode = dryRun ? 'DRY RUN (no writes)' : 'WRITTEN'
  const lines: string[] = [
    `Track history sync — ${mode}`,
    `Scanned ${report.scannedSessions} session(s), ${report.userRequests} user request(s), skipped ${report.skippedByCursor} by cursor.`,
    `Candidates: ${report.issueCandidates.length} issue(s), ${report.epicCandidates.length} epic(s).`,
  ]
  if (report.issueCandidates.length === 0) {
    lines.push('No new session activity in scope.')
    return lines.join('\n')
  }
  lines.push('')
  lines.push('Planned actions:')
  for (const action of report.actions) {
    if (action.kind === 'create') {
      lines.push(`  + create ${action.candidate.title} (${action.candidate.suggestedState})${action.promoteCaptureId ? ' [promotes capture]' : ''}`)
    } else if (action.kind === 'update') {
      lines.push(`  ~ update ${action.existing.identifier} ${action.existing.title} — ${action.changes.join('; ')}`)
    } else {
      lines.push(`  = skip ${action.existing.identifier} (${action.reason})`)
    }
  }
  lines.push('')
  lines.push(`Summary: ${report.created} create / ${report.updated} update / ${report.skipped} skip / ${report.promotedCaptures} capture(s) promoted.`)
  if (dryRun) {
    lines.push('Run again with dry_run=false to write these changes.')
  }
  return lines.join('\n')
}

/**
 * Render a raised decision as the tool result — the first line carries the
 * stable decision id that anchors the record in the conversation transcript
 * (the KV record is the source of truth; this text is the pointer).
 */
export function formatDecisionRaised(decision: Decision): string {
  return (
    `Decision recorded: ${decision.id}\n`
    + `Question: ${decision.question}\n`
    + `Options: ${decision.options.join(' | ')}\n`
    + `My preference: ${decision.aiPreference} — ${decision.aiRationale}\n`
    + (decision.impact ? `Impact: ${decision.impact}\n` : '')
    + `Waiting on: ${decision.need}\n`
    + '（用户回答后请调用 track_respond_decision 记录选择与理由）'
  )
}
