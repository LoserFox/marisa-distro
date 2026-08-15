/**
 * TrackStore — the single data face of the Track Bridge engine.
 *
 * Wraps one `ctx.storage` KV unit (`track`) with typed CRUD over
 * captures / issues / epics / links / decisions. The KV contract puts write
 * ordering on the caller, so every mutation funnels through one serialized
 * write chain per table (a simple in-flight promise queue).
 *
 * Storage is host-side only: the model never touches this store directly;
 * model-facing tools registered in index.ts are the only entry points.
 * @module @fakechris/dsh-track/store
 */

import { createHash } from 'node:crypto'
import type { KvFacet, KvUnit, KvUnitDescriptor } from '@deepseek-ai/dsh-storage'
import {
  TRACK_UNIT,
  type AuditEntry,
  type Capture,
  type Decision,
  type Epic,
  type TrackGlobal,
  type Issue,
  type Link,
  type LlmUsageRecord,
  type EvidenceRef,
} from './types.ts'
import { MAX_EVIDENCE, isAutoCommit, nextInferred, sweepProposal } from './lifecycle/state-machine.ts'
import { normalizeTitle } from './sync/cluster.ts'

/** Branded identifier prefixes keep record ids recognizable and collision-free. */
export const ID_PREFIX = {
  capture: 'track_capture_',
  issue: 'track_issue_',
  epic: 'track_epic_',
  link: 'track_link_',
  decision: 'track_decision_',
  audit: 'track_audit_',
  usage: 'track_usage_',
} as const

/** Random id with the given brand prefix. */
export function makeId(kind: keyof typeof ID_PREFIX): string {
  const rand = crypto.randomUUID().replaceAll('-', '')
  return `${ID_PREFIX[kind]}${rand}`
}

/**
 * Normalize capture content for dedup: trim and collapse every whitespace
 * run to a single space, so " 摸清 前提 " and "摸清 前提" hash the same.
 * Case is preserved — a case-fold would risk merging distinct thoughts
 * (conservative dedup: only obvious copies collapse).
 */
export function normalizeCaptureContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

/**
 * Stable content hash for capture dedup (sha256 of the normalized content,
 * first 16 hex chars). Used as the content-level fallback so an identical
 * thought never lands twice on the capture wall.
 */
export function captureContentHash(content: string): string {
  return createHash('sha256').update(normalizeCaptureContent(content)).digest('hex').slice(0, 16)
}

/** Result of a dedup-aware capture creation. */
export type CaptureCreateResult =
  | { status: 'created'; capture: Capture }
  /** The capture was not inserted — an equivalent one already exists. */
  | { status: 'duplicate'; existing?: Capture }

/** One serialized write chain per table keeps KV ordering sane. */
type WriteChain = Promise<unknown>

export class TrackStore {
  private unit!: KvUnit
  private chains: Record<string, WriteChain> = {}
  private opened = false
  private openPromise: Promise<void> | null = null

  constructor(private readonly descriptor: KvUnitDescriptor = TRACK_UNIT) {}

  /** Open the unit on a kv facet (json or sqlite backend). Call once at plugin apply. */
  open(kvFacet: KvFacet): Promise<void> {
    if (this.opened) return Promise.resolve()
    this.openPromise ??= kvFacet.open(this.descriptor).then((unit) => {
      this.unit = unit
      this.opened = true
    })
    return this.openPromise
  }

  /** Wait for the unit to be open before any store operation. */
  private async ready(): Promise<void> {
    if (this.opened) return
    if (this.openPromise) {
      await this.openPromise
      return
    }
    throw new Error('track: store is not open — the plugin did not complete initialization')
  }

  get isOpen(): boolean {
    return this.opened
  }

  /** Close the unit and drain in-flight writes. */
  async close(): Promise<void> {
    if (!this.opened) return
    await this.unit.close()
    this.opened = false
    // A later open() must mint a fresh unit instead of returning the closed
    // promise (test harnesses reopen the store on a new backend per case).
    this.openPromise = null
  }

  /** Serialize one write on a table: next write waits for the previous. */
  private chain<T>(table: string, run: () => Promise<T>): Promise<T> {
    const prev = this.chains[table] ?? Promise.resolve()
    const next = prev.then(run)
    // Keep the chain alive but swallow errors for the next waiter.
    this.chains[table] = next.catch(() => undefined)
    return next
  }

  // ---- global ----

  async readGlobal(): Promise<TrackGlobal | null> {
  await this.ready()
    const g = await this.unit.loadAll().then(({ global }) => global as TrackGlobal | null)
    return g
  }

  async writeGlobal(g: TrackGlobal): Promise<void> {
  await this.ready()
    await this.chain('__global', () => this.unit.setGlobal(g))
  }

  /** Mint the next Linear-style identifier, e.g. `INV-12`. */
  async nextIdentifier(teamKey = 'INV'): Promise<string> {
  await this.ready()
    const g = (await this.readGlobal()) ?? {
      version: 1 as const,
      teams: {},
      identifierCounter: 0,
    }
    g.identifierCounter += 1
    await this.writeGlobal(g)
    return `${teamKey}-${g.identifierCounter}`
  }

  // ---- captures ----

  async listCaptures(status?: Capture['status']): Promise<Capture[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    const caps = Object.values(tables.captures ?? {}) as Capture[]
    return status ? caps.filter((c) => c.status === status) : caps
  }

  async upsertCapture(capture: Capture): Promise<void> {
  await this.ready()
    await this.chain('captures', () =>
      this.unit.putRecord('captures', capture.id, capture))
  }

  /**
   * Find an open capture whose normalized content matches `content` — the
   * content-hash dedup fallback. Only OPEN captures count: promoted/archived
   * items left the wall, so the same thought resurfacing later is a fresh
   * instance, not a wall duplicate.
   */
  async findOpenCaptureByContent(content: string): Promise<Capture | undefined> {
  await this.ready()
    const hash = captureContentHash(content)
    const caps = await this.listCaptures()
    return caps.find((c) => c.status === 'open' && captureContentHash(c.content) === hash)
  }

  /**
   * Durable per-session "first todo already captured" marker — the fix for
   * the restart-resurrected observer: the in-memory `todoSeen` set dies with
   * the web process, so a continued session used to re-capture its first
   * todo after every restart. The marker lives in the unit global, so it
   * survives restarts.
   */
  async isSessionTodoCaptured(sessionId: string): Promise<boolean> {
  await this.ready()
    const g = await this.readGlobal()
    return g?.autoTodoSessions?.[sessionId] !== undefined
  }

  /** Persist the per-session todo-capture marker (idempotent). */
  async markSessionTodoCaptured(sessionId: string): Promise<void> {
  await this.ready()
    const g = (await this.readGlobal()) ?? {
      version: 1 as const,
      teams: {},
      identifierCounter: 0,
    }
    await this.writeGlobal({
      ...g,
      autoTodoSessions: {
        ...(g.autoTodoSessions ?? {}),
        [sessionId]: new Date().toISOString(),
      },
    })
  }

  /**
   * Dedup-aware capture creation — the single gate every capture path
   * (auto-observer, capture_thought, HTTP panel) goes through.
   *
   * Two guards, in order:
   *  1. `dedupeBySession` (auto-observer only): the durable per-session
   *     marker — one todo-capture per session even across restarts.
   *  2. Content hash: an identical open capture (any session) means the
   *     thought is already on the wall — do not re-insert.
   *
   * A duplicate returns `{ status: 'duplicate' }` and inserts nothing, so
   * callers can surface the existing capture instead of a silent drop.
   */
  async createCapture(capture: Capture, opts: { dedupeBySession?: boolean } = {}): Promise<CaptureCreateResult> {
  await this.ready()
    if (opts.dedupeBySession && capture.sourceSessionId !== undefined) {
      // Durable marker hit, OR the session already has a todo-derived capture
      // (pre-fix sessions have no marker — backfill it so the next restart
      // dedupes without scanning).
      const sessionCaps = (await this.listCaptures())
        .filter((c) => c.sourceSessionId === capture.sourceSessionId)
      const alreadyTodo = sessionCaps.some((c) => c.source === 'session' && c.tags.includes('todo'))
      if (await this.isSessionTodoCaptured(capture.sourceSessionId) || alreadyTodo) {
        await this.markSessionTodoCaptured(capture.sourceSessionId)
        return { status: 'duplicate', existing: sessionCaps[0] }
      }
    }
    const existing = await this.findOpenCaptureByContent(capture.content)
    if (existing !== undefined) return { status: 'duplicate', existing }
    await this.upsertCapture(capture)
    if (opts.dedupeBySession && capture.sourceSessionId !== undefined) {
      await this.markSessionTodoCaptured(capture.sourceSessionId)
    }
    return { status: 'created', capture }
  }

  async getCapture(id: string): Promise<Capture | undefined> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return (tables.captures ?? {})[id] as Capture | undefined
  }

  async deleteCapture(id: string): Promise<void> {
  await this.ready()
    await this.chain('captures', () => this.unit.deleteRecord('captures', id))
  }

  /**
   * Promote an open capture into a real issue: mint the issue from the
   * capture content and flip the capture to `promoted` with the issue id
   * attached (the same dedup contract the sync align pass uses).
   * @returns the freshly created issue.
   */
  async promoteCaptureToIssue(captureId: string, teamKey = 'INV'): Promise<Issue> {
  await this.ready()
    const capture = await this.getCapture(captureId)
    if (!capture) throw new Error(`capture not found: ${captureId}`)
    if (capture.status === 'promoted' && capture.promotedToIssueId) {
      const existing = await this.getIssue(capture.promotedToIssueId)
      if (existing) return existing
    }
    // Dedupe: a capture that is the concrete form of an existing issue
    // (same normalized title) promotes ONTO that issue instead of minting
    // a duplicate task — the same contract the sync align pass uses.
    const existingByTitle = (await this.listIssues())
      .find((i) => normalizeTitle(i.title) === normalizeTitle(capture.content))
    if (existingByTitle) {
      await this.chain('captures', () =>
        this.unit.putRecord('captures', capture.id, {
          ...capture,
          status: 'promoted' as const,
          promotedToIssueId: existingByTitle.id,
        }))
      return existingByTitle
    }
    const issue: Issue = {
      id: makeId('issue'),
      identifier: await this.nextIdentifier(teamKey),
      title: capture.content,
      // Carry the motivation context into the issue description so the task
      // keeps its 'why' (capture context = the most recent explicit request).
      description: capture.context
        ? `${capture.content}\n\n动机: ${capture.context}`
        : capture.content,
      priority: 2,
      state: 'todo',
      teamId: teamKey,
      labels: [...capture.tags],
      linkedSessionIds: capture.sourceSessionId ? [capture.sourceSessionId] : [],
      promptMessageId: capture.sourceMessageId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.chain('issues', () => this.unit.putRecord('issues', issue.id, issue))
    await this.chain('captures', () =>
      this.unit.putRecord('captures', capture.id, {
        ...capture,
        status: 'promoted' as const,
        promotedToIssueId: issue.id,
      }))
    return issue
  }

  // ---- decisions ----

  async upsertDecision(decision: Decision): Promise<void> {
  await this.ready()
    await this.chain('decisions', () => this.unit.putRecord('decisions', decision.id, decision))
  }

  async getDecision(id: string): Promise<Decision | undefined> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return (tables.decisions ?? {})[id] as Decision | undefined
  }

  /**
   * List decisions, newest first. Filters are optional and composable.
   * @param state   lifecycle filter (pending | answered | dismissed)
   * @param since   only decisions created at/after this epoch ms
   * @param sessionId  only decisions raised in this session
   */
  async listDecisions(state?: Decision['status'], since?: number, sessionId?: string): Promise<Decision[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    let decisions = Object.values(tables.decisions ?? {}) as Decision[]
    if (state) decisions = decisions.filter((d) => d.status === state)
    if (sessionId) decisions = decisions.filter((d) => d.sessionId === sessionId)
    if (since !== undefined) decisions = decisions.filter((d) => Date.parse(d.createdAt) >= since)
    return decisions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  // ---- issues ----

  async listIssues(teamId?: string, state?: Issue['state']): Promise<Issue[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    let issues = Object.values(tables.issues ?? {}) as Issue[]
    if (teamId) issues = issues.filter((i) => i.teamId === teamId)
    if (state) issues = issues.filter((i) => i.state === state)
    return issues
  }

  async getIssue(id: string): Promise<Issue | undefined> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return (tables.issues ?? {})[id] as Issue | undefined
  }

  async upsertIssue(issue: Issue): Promise<void> {
  await this.ready()
    await this.chain('issues', () => this.unit.putRecord('issues', issue.id, issue))
  }

  async deleteIssue(id: string): Promise<void> {
  await this.ready()
    await this.chain('issues', () => this.unit.deleteRecord('issues', id))
  }

  /** Resolve an issue by its store id OR Linear-style identifier (INV-12). */
  async getIssueByInput(input: string): Promise<Issue | undefined> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    const issues = Object.values(tables.issues ?? {}) as Issue[]
    return issues.find((i) => i.id === input || i.identifier === input)
  }

  /**
   * Declare that `sessionId` is driving this issue (track_attach_issue).
   * Sets attachSessionId, appends the session to linkedSessionIds (R8
   * traceability), and clears any previous attachment so one session owns
   * one issue at a time.
   */
  async attachSession(issueId: string, sessionId: string): Promise<Issue | undefined> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    const issues = Object.values(tables.issues ?? {}) as Issue[]
    const target = issues.find((i) => i.id === issueId || i.identifier === issueId)
    if (!target) return undefined
    // Clear a stale attachment pointing at another issue from the same session.
    for (const other of issues) {
      if (other.id !== target.id && other.attachSessionId === sessionId) {
        await this.chain('issues', () => this.unit.putRecord('issues', other.id, { ...other, attachSessionId: undefined }))
      }
    }
    const updated: Issue = {
      ...target,
      attachSessionId: sessionId,
      linkedSessionIds: target.linkedSessionIds.includes(sessionId)
        ? target.linkedSessionIds
        : [...target.linkedSessionIds, sessionId],
      updatedAt: new Date().toISOString(),
    }
    await this.chain('issues', () => this.unit.putRecord('issues', target.id, updated))
    return updated
  }

  /**
   * Record one evidence signal against an issue, re-evaluate the state
   * machine, and apply the result: write `inferred`, update `lastProgressAt`
   * on positive signals, and auto-commit `state` only for the safe
   * todo → in_progress transition. Confirmation-gated proposals (done /
   * canceled) are returned in `confirm` and NOT written to `state`.
   */
  async recordIssueEvidence(issueId: string, signal: EvidenceRef, sessionId: string, now = Date.now()): Promise<{ issue: Issue; confirm?: { to: Issue['state']; reason: string } } | null> {
  await this.ready()
    const issue = await this.getIssue(issueId)
    if (!issue) return null
    const evidence = [...(issue.inferred?.evidence ?? []), signal].slice(-MAX_EVIDENCE)
    const next = nextInferred(issue, evidence, now)
    const updated: Issue = {
      ...issue,
      lastProgressAt: signal.weight > 0 && signal.signal !== 'user-confirm'
        ? Math.max(issue.lastProgressAt ?? 0, signal.at)
        : issue.lastProgressAt,
      inferred: next.inferred,
      updatedAt: new Date().toISOString(),
    }
    // Auto-commit only the reversible todo → in_progress transition.
    if (isAutoCommit(next, issue)) {
      updated.state = 'in_progress'
    }
    // Surface confirmation-gated proposals as `pendingConfirm` (done/canceled):
    // the live observer callers are fire-and-forget, so returning `confirm`
    // alone used to drop the proposal; persisting it lets the panel render a
    // pending-confirmation section. Never cleared here — only confirm/dismiss.
    if (next.confirm) {
      // The machine only ever gates done/canceled (state-machine.ts) — cast
      // the union to the pendingConfirm contract.
      updated.pendingConfirm = { to: next.confirm.to as 'done' | 'canceled', reason: next.confirm.reason, at: now }
    }
    await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated))
    return { issue: updated, confirm: next.confirm }
  }

  /**
   * Commit a state change on explicit confirmation (user nod / panel / a
   * confirmed_by_user tool call). Writes `state` and records the confirmed
   * state as the current inference.
   */
  async confirmIssueState(issueId: string, state: Issue['state'], by: 'user' | 'model' = 'user', now = Date.now()): Promise<Issue | undefined> {
  await this.ready()
    const issue = await this.getIssue(issueId)
    if (!issue) return undefined
    const updated: Issue = {
      ...issue,
      state,
      // A committed done/canceled resolves any pending confirmation.
      pendingConfirm: (state === 'done' || state === 'canceled') ? undefined : issue.pendingConfirm,
      inferred: {
        state,
        confidence: 1,
        evidence: issue.inferred?.evidence ?? [],
        at: now,
        by,
      },
      updatedAt: new Date().toISOString(),
    }
    await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated))
    return updated
  }

  /**
   * Periodic lifecycle sweep: re-evaluate EVERY in_progress issue (not just
   * attached-session ones) and persist `pendingConfirm` where the machine sees
   * completion evidence or abandonment. The live observer only fires for the
   * attached session, so sync-created issues never accumulate evidence —
   * without this sweep their done/canceled proposals would never surface.
   * Confirmation stays user-gated: this only PROPOSES (writes pendingConfirm).
   * @returns how many issues were evaluated and how many got a fresh proposal.
   */
  async sweepLifecycle(now = Date.now()): Promise<{ evaluated: number; proposed: number }> {
    await this.ready()
    const issues = await this.listIssues()
    let evaluated = 0
    let proposed = 0
    for (const issue of issues) {
      if (issue.state !== 'in_progress') continue
      evaluated += 1
      const proposal = sweepProposal(issue, now)
      if (!proposal) continue
      const same = issue.pendingConfirm !== undefined
        && issue.pendingConfirm.to === proposal.to
        && issue.pendingConfirm.reason === proposal.reason
      if (same) continue
      await this.chain('issues', () =>
        this.unit.putRecord('issues', issue.id, {
          ...issue,
          pendingConfirm: { to: proposal.to, reason: proposal.reason, at: now },
          updatedAt: new Date().toISOString(),
        }))
      proposed += 1
    }
    return { evaluated, proposed }
  }

  /**
   * User dismissed a pending proposal: clear the marker without changing
   * `state`. The sweep may re-propose while the underlying evidence stands —
   * dismissal is a one-shot ack, not a veto; users can also delete the issue.
   */
  async dismissPending(issueId: string): Promise<Issue | undefined> {
    await this.ready()
    const issue = await this.getIssue(issueId)
    if (!issue) return undefined
    if (!issue.pendingConfirm) return issue
    const updated: Issue = {
      ...issue,
      pendingConfirm: undefined,
      updatedAt: new Date().toISOString(),
    }
    await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated))
    return updated
  }

  // ---- epics ----

  async listEpics(): Promise<Epic[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return Object.values(tables.epics ?? {}) as Epic[]
  }

  async upsertEpic(epic: Epic): Promise<void> {
  await this.ready()
    await this.chain('epics', () => this.unit.putRecord('epics', epic.id, epic))
  }

  // ---- links ----

  async listLinks(): Promise<Link[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return Object.values(tables.links ?? {}) as Link[]
  }

  async upsertLink(link: Link): Promise<void> {
  await this.ready()
    await this.chain('links', () => this.unit.putRecord('links', link.id, link))
  }

  /** All links touching one entity id (either direction). */
  async linksFor(id: string): Promise<Link[]> {
  await this.ready()
    const links = await this.listLinks()
    return links.filter((l) => l.fromId === id || l.toId === id)
  }

  // ---- audit (observability) ----

  async appendAudit(entry: AuditEntry): Promise<void> {
  await this.ready()
    await this.chain('audit', () => this.unit.putRecord('audit', entry.id, entry))
  }

  async listAudit(): Promise<AuditEntry[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return Object.values(tables.audit ?? {}) as AuditEntry[]
  }

  // ---- llm usage ledger (observability / cost accounting) ----

  /** Append one LLM usage record (append-only ledger, one per real request). */
  async appendUsage(record: LlmUsageRecord): Promise<void> {
  await this.ready()
    await this.chain('usage', () => this.unit.putRecord('usage', record.id, record))
  }

  async listUsage(): Promise<LlmUsageRecord[]> {
  await this.ready()
    const { tables } = await this.unit.loadAll()
    return Object.values(tables.usage ?? {}) as LlmUsageRecord[]
  }

  /**
   * Funnel summary over the audit trail — the observability face for the
   * capture/issue/decision pipeline. Answers "how many times was each tool
   * invoked, and what is the capture conversion" directly from the store,
   * instead of archaeology over session logs.
   */
  async funnel(): Promise<{
    tools: Record<string, { calls: number; ok: number; fail: number }>
    captures: { open: number; promoted: number }
    issues: { total: number }
    decisions: { pending: number; answered: number; dismissed: number; answerRate: number | null }
    captureConversion: number | null
  }> {
  await this.ready()
    const audit = await this.listAudit()
    const tools: Record<string, { calls: number; ok: number; fail: number }> = {}
    for (const entry of audit) {
      const acc = (tools[entry.tool] ??= { calls: 0, ok: 0, fail: 0 })
      acc.calls += 1
      if (entry.ok) acc.ok += 1
      else acc.fail += 1
    }
    const captures = await this.listCaptures()
    const open = captures.filter((c) => c.status === 'open').length
    const promoted = captures.filter((c) => c.status === 'promoted').length
    const issues = await this.listIssues()
    const decisions = await this.listDecisions()
    const pending = decisions.filter((d) => d.status === 'pending').length
    const answered = decisions.filter((d) => d.status === 'answered').length
    const dismissed = decisions.filter((d) => d.status === 'dismissed').length
    const captureCalls = tools['capture_thought']?.calls ?? 0
    return {
      tools,
      captures: { open, promoted },
      issues: { total: issues.length },
      decisions: {
        pending,
        answered,
        dismissed,
        answerRate: decisions.length > 0 ? Number((answered / decisions.length).toFixed(3)) : null,
      },
      captureConversion: captureCalls > 0 ? Number((promoted / captureCalls).toFixed(3)) : null,
    }
  }
}

export type { KvFacet }
