import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  PersistedViewState,
  TeamworkProjection,
  ViewActivity,
  ViewCandidate,
  ViewContentType,
  ViewEntry,
  ViewOperation,
  ViewPrimitive,
  ViewReadMode,
  ViewSnapshot,
  ViewSource,
  ViewStatus,
  ViewUiConfig,
  ViewWriteMode,
} from './types.ts'

export interface ProposeInput {
  operation?: ViewOperation
  sourceId: string
  type: ViewContentType
  readMode?: ViewReadMode
  writeMode?: ViewWriteMode
  writeTarget?: string
  title: string
  summary?: string
  content?: string
  targetId?: string
  derivedFrom?: string
  teamwork?: TeamworkProjection
  proposedBy: ViewCandidate['proposedBy']
}

const SOURCE_SEED: Array<Omit<ViewSource, 'updatedAt'>> = [
  { id: 'project-memory', label: 'Project Memory', type: 'memory', readMode: 'direct', enabled: true, provider: 'local-preview' },
  { id: 'project-skills', label: 'Project Skills', type: 'skill', readMode: 'expand', enabled: true, provider: 'local-preview' },
  { id: 'teamwork', label: 'Teamwork Signals', type: 'teamwork', readMode: 'query', enabled: true, provider: 'local-preview' },
]

function initialState(now: string): PersistedViewState {
  return {
    schemaVersion: 1,
    generation: 1,
    sources: SOURCE_SEED.map(source => ({ ...source, updatedAt: now })),
    entries: [],
    candidates: [],
    activity: [],
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? ''
}

function normalizeTeamwork(value: TeamworkProjection | undefined): TeamworkProjection | undefined {
  if (!value) return undefined
  return {
    owner: normalizeText(value.owner) || undefined,
    state: value.state ?? 'queued',
    progress: typeof value.progress === 'number' ? Math.max(0, Math.min(100, value.progress)) : undefined,
  }
}

export class ViewService {
  private state: PersistedViewState
  private activeSnapshot: ViewSnapshot

  constructor(
    readonly workspace: string,
    private readonly statePath: string,
    private ui: ViewUiConfig = {
      locale: 'zh-CN',
      refreshIntervalMs: 500,
      motion: 'full',
      backgroundReviewEnabled: true,
      backgroundReviewIntervalMs: 15_000,
    },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load()
    this.activeSnapshot = this.buildSnapshot(this.state)
  }

  setUiConfig(ui: ViewUiConfig): void {
    this.ui = clone(ui)
  }

  private timestamp(): string {
    return this.now().toISOString()
  }

  private load(): PersistedViewState {
    try {
      return this.readStored()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const state = initialState(this.timestamp())
      this.persist(state)
      return state
    }
  }

  private readStored(): PersistedViewState {
    const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as PersistedViewState
    if (parsed.schemaVersion !== 1) throw new Error(`unsupported schema ${String(parsed.schemaVersion)}`)
    // Schema 1 predates explicit write-mode provenance. Normalize old local
    // preview data in memory so an installed development state stays usable.
    parsed.entries = parsed.entries.map(entry => ({
      ...entry,
      writeMode: entry.writeMode ?? 'record',
      teamwork: normalizeTeamwork(entry.teamwork),
    }))
    parsed.candidates = parsed.candidates.map(candidate => ({
      ...candidate,
      writeMode: candidate.writeMode ?? (candidate.proposedBy === 'background' ? 'background' : 'record'),
      teamwork: normalizeTeamwork(candidate.teamwork),
    }))
    return parsed
  }

  private refresh(): void {
    this.state = this.readStored()
    this.activeSnapshot = this.buildSnapshot(this.state)
  }

  private persist(state: PersistedViewState): void {
    mkdirSync(dirname(this.statePath), { recursive: true })
    const temporary = `${this.statePath}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(temporary, this.statePath)
  }

  private commit(mutator: (draft: PersistedViewState) => void): void {
    const draft = clone(this.readStored())
    mutator(draft)
    draft.activity = draft.activity.slice(-120)
    this.persist(draft)
    this.state = draft
    this.activeSnapshot = this.buildSnapshot(draft)
  }

  private activity(
    action: ViewActivity['action'],
    subjectId: string,
    label: string,
    actor: ViewActivity['actor'],
    primitive?: ViewPrimitive,
    contentType?: ViewContentType,
  ): ViewActivity {
    return { id: randomUUID(), action, subjectId, label, actor, primitive, contentType, at: this.timestamp() }
  }

  private buildSnapshot(state: PersistedViewState): ViewSnapshot {
    const enabled = new Set(state.sources.filter(source => source.enabled).map(source => source.id))
    const entries = state.entries
      .filter(entry => !entry.revokedAt && enabled.has(entry.sourceId))
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt) || left.id.localeCompare(right.id))
    const sourceRevisions = Object.fromEntries(state.sources.map(source => [source.id, source.updatedAt]))
    const material = { generation: state.generation, entries, sourceRevisions }
    const fingerprint = digest(material)
    const builtAt = [
      ...state.sources.map(source => source.updatedAt),
      ...state.entries.flatMap(entry => [entry.acceptedAt, entry.revokedAt].filter((value): value is string => Boolean(value))),
    ].sort().at(-1) ?? this.timestamp()
    return {
      id: `view-${state.generation}-${fingerprint.slice(0, 10)}`,
      generation: state.generation,
      builtAt,
      workspace: this.workspace,
      digest: fingerprint,
      entries: clone(entries),
      sourceRevisions,
    }
  }

  status(): ViewStatus {
    this.refresh()
    const next = this.buildSnapshot(this.state)
    return clone({
      provider: 'local-preview' as const,
      workspace: this.workspace,
      active: this.activeSnapshot,
      next,
      pendingActivation: next.digest !== this.activeSnapshot.digest,
      sources: this.state.sources,
      candidates: this.state.candidates,
      activity: [...this.state.activity].reverse(),
      ui: this.ui,
    })
  }

  query(query = '', type?: ViewContentType, readMode?: ViewReadMode): ViewEntry[] {
    this.refresh()
    const needle = query.trim().toLocaleLowerCase()
    return clone(this.activeSnapshot.entries.filter(entry => {
      if (type && entry.type !== type) return false
      if (readMode && entry.readMode !== readMode) return false
      if (!needle) return true
      return `${entry.title}\n${entry.summary}\n${entry.content}`.toLocaleLowerCase().includes(needle)
    }))
  }

  read(id: string): ViewEntry | undefined {
    this.refresh()
    return clone(this.activeSnapshot.entries.find(entry => entry.id === id))
  }

  observeRead(mode: ViewReadMode, label: string, actor: ViewActivity['actor'] = 'model', contentType?: ViewContentType): void {
    this.commit(draft => {
      draft.activity.push(this.activity('read', this.activeSnapshot.id, label, actor, mode, contentType))
    })
  }

  propose(input: ProposeInput): ViewCandidate {
    this.refresh()
    const source = this.state.sources.find(candidate => candidate.id === input.sourceId)
    if (!source) throw new Error(`unknown source: ${input.sourceId}`)
    if (source.type !== input.type) throw new Error(`source ${input.sourceId} only accepts ${source.type}`)
    const operation = input.operation ?? 'add'
    const writeMode = input.writeMode ?? (input.proposedBy === 'background' ? 'background' : 'record')
    if (operation !== 'add' && !input.targetId) throw new Error(`${operation} requires targetId`)
    if (writeMode === 'target' && !normalizeText(input.writeTarget)) throw new Error('target write requires writeTarget')
    if (operation !== 'remove' && !normalizeText(input.title)) throw new Error('title is required')

    const candidate: ViewCandidate = {
      id: randomUUID(),
      operation,
      sourceId: input.sourceId,
      type: input.type,
      readMode: input.readMode ?? source.readMode,
      writeMode,
      writeTarget: normalizeText(input.writeTarget) || undefined,
      title: normalizeText(input.title),
      summary: normalizeText(input.summary) || normalizeText(input.content).slice(0, 180),
      content: normalizeText(input.content),
      targetId: input.targetId,
      derivedFrom: input.derivedFrom,
      teamwork: input.type === 'teamwork' ? normalizeTeamwork(input.teamwork) ?? { state: 'queued' } : undefined,
      status: 'pending',
      proposedBy: input.proposedBy,
      proposedAt: this.timestamp(),
    }
    this.commit(draft => {
      draft.candidates.push(candidate)
      draft.activity.push(this.activity('proposed', candidate.id, candidate.title || `${operation} ${candidate.targetId}`, input.proposedBy, writeMode, input.type))
    })
    return clone(candidate)
  }

  decide(id: string, decision: 'accept' | 'reject'): ViewCandidate {
    let decided: ViewCandidate | undefined
    this.commit(draft => {
      const candidate = draft.candidates.find(item => item.id === id)
      if (!candidate) throw new Error(`candidate not found: ${id}`)
      if (candidate.status !== 'pending') throw new Error(`candidate already ${candidate.status}`)
      candidate.status = decision === 'accept' ? 'accepted' : 'rejected'
      candidate.decidedAt = this.timestamp()

      if (decision === 'accept') {
        if (candidate.operation === 'replace' || candidate.operation === 'remove') {
          const target = draft.entries.find(entry => entry.id === candidate.targetId && !entry.revokedAt)
          if (!target) throw new Error(`active target not found: ${candidate.targetId}`)
          if (target.sourceId !== candidate.sourceId || target.type !== candidate.type) {
            throw new Error('target must belong to the same View source and content type')
          }
          target.revokedAt = candidate.decidedAt
        }
        if (candidate.operation !== 'remove') {
          const previous = candidate.targetId ? draft.entries.find(entry => entry.id === candidate.targetId) : undefined
          draft.entries.push({
            id: randomUUID(),
            sourceId: candidate.sourceId,
            type: candidate.type,
            readMode: candidate.readMode,
            writeMode: candidate.writeMode,
            writeTarget: candidate.writeTarget,
            title: candidate.title,
            summary: candidate.summary,
            content: candidate.content,
            revision: (previous?.revision ?? 0) + 1,
            acceptedAt: candidate.decidedAt,
            replaces: candidate.operation === 'replace' ? candidate.targetId : undefined,
            derivedFrom: candidate.derivedFrom,
            teamwork: candidate.teamwork,
          })
        }
        draft.generation += 1
      }
      draft.activity.push(this.activity(decision === 'accept' ? 'accepted' : 'rejected', candidate.id, candidate.title || `${candidate.operation} ${candidate.targetId}`, 'user', candidate.writeMode, candidate.type))
      decided = clone(candidate)
    })
    return decided as ViewCandidate
  }

  setSourceEnabled(id: string, enabled: boolean): ViewSource {
    let updated: ViewSource | undefined
    this.commit(draft => {
      const source = draft.sources.find(item => item.id === id)
      if (!source) throw new Error(`source not found: ${id}`)
      if (source.enabled === enabled) {
        updated = clone(source)
        return
      }
      source.enabled = enabled
      source.updatedAt = this.timestamp()
      draft.generation += 1
      draft.activity.push(this.activity(enabled ? 'source-enabled' : 'source-disabled', source.id, source.label, 'user'))
      updated = clone(source)
    })
    return updated as ViewSource
  }

  organizeEntry(id: string, targetType: ViewContentType = 'memory'): ViewCandidate {
    this.refresh()
    const entry = this.activeSnapshot.entries.find(item => item.id === id)
    if (!entry) throw new Error(`active entry not found: ${id}`)
    const existing = this.state.candidates.find(candidate => candidate.derivedFrom === id && candidate.type === targetType)
    if (existing) return clone(existing)
    const source = this.state.sources.find(item => item.type === targetType)
    if (!source) throw new Error(`no source accepts ${targetType}`)
    return this.propose({
      sourceId: source.id,
      type: targetType,
      readMode: source.readMode,
      writeMode: 'background',
      title: `Outcome: ${entry.title}`,
      summary: entry.summary || entry.content.slice(0, 180),
      content: entry.content || entry.summary,
      derivedFrom: entry.id,
      proposedBy: 'background',
    })
  }

  organizeCompletedTeamwork(): ViewCandidate[] {
    this.refresh()
    const reviewed = new Set(this.state.candidates.map(candidate => candidate.derivedFrom).filter(Boolean))
    const eligible = this.activeSnapshot.entries.filter(entry =>
      entry.type === 'teamwork' && entry.teamwork?.state === 'done' && !reviewed.has(entry.id),
    )
    return eligible.map(entry => this.organizeEntry(entry.id, 'memory'))
  }

  renderPrompt(): string {
    this.refresh()
    const direct = this.activeSnapshot.entries.filter(entry => entry.readMode === 'direct')
    const expandable = this.activeSnapshot.entries.filter(entry => entry.readMode === 'expand')
    const queryable = this.activeSnapshot.entries.filter(entry => entry.readMode === 'query')
    const lines = [
      '## Project View',
      `Active confirmed View: ${this.activeSnapshot.id} (generation ${this.activeSnapshot.generation}, digest ${this.activeSnapshot.digest.slice(0, 12)}).`,
      'Use the `view` tool to query or read this View. Proposed writes remain pending and invisible until a user accepts them. Acceptance immediately rebuilds the active View; the next model action reads the new generation without a Runtime restart.',
      '',
      '### Natural-language View requests',
      'When a user message starts with `/view`, treat the remaining text as their desired project-context behavior. You decide the smallest useful operation path; do not ask the user to choose infrastructure primitives unless a material ambiguity cannot be resolved from the project.',
      '- Read before writing when existing context or a replacement target may matter.',
      '- `view(action=query)` searches only entries whose read mode is query. Use status plus read for known direct or expandable entries; an empty query result does not mean those other directories are missing or unindexed.',
      '- Use memory for durable project continuity, skill for reusable procedures, and teamwork for shared ownership, status, or progress signals.',
      '- For teamwork, never ask for or mention a session identifier. Associate updates by the existing View entry internally; in user-facing language refer only to the work, owner, status, and progress. A natural progress update must read the existing teamwork entry and propose a replacement, never simulate a transition.',
      '- A skill entry is the reusable procedure itself inside the View. If it exists in the active View, it is already effective as a View skill; `writeTarget` is provenance for a targeted write, not a placeholder.',
      '- For `/view` requests, do not inspect or require an external memory or skill registry to validate View content unless the user explicitly asks about interoperability outside the View.',
      '- Self-evolution is not a separate content store: inspect evidence, then propose a targeted replacement or addition to memory or skill.',
      '- Choose direct, expand, or query according to when the model should see accepted content. Choose record or target according to whether the request names a durable destination.',
      '- Every write must use `view(action=propose)` and remain pending. Never claim that a proposal is accepted or active before the user confirms it.',
      '- After confirmation, describe the result only as part of the current Active View. There is no staged future View, activation timeout, or required Runtime restart. Never instruct the user to check a future View or restart before the accepted change becomes effective.',
      '- When replacing stale content, update its title, summary, and full content consistently. Do not preserve an old step or phrase that contradicts the requested behavior.',
      '- Keep internal ids, schema field names, and enum labels out of the user-facing explanation unless the user explicitly asks for technical details.',
      '- Final answers must use product language. Say “not started / in progress / waiting for input / blocked / completed” in the user language, never `queued`, `active`, `waiting`, `blocked`, or `done`; say that future conversations can find the work, never `readMode=query`; say collaboration information, never `type=teamwork`.',
      '- Briefly explain the chosen path in natural language and state whether the result is current, pending confirmation, or active after confirmation.',
    ]
    if (direct.length) {
      lines.push('', '### Direct context')
      for (const entry of direct) lines.push(`\n#### ${entry.title}\n${entry.content || entry.summary}`)
    }
    if (expandable.length) {
      lines.push('', '### Expandable directory')
      for (const entry of expandable) lines.push(`- ${entry.id}: ${entry.title} — ${entry.summary}`)
    }
    if (queryable.length) {
      lines.push('', `### Queryable context\n${queryable.length} item(s) are available through the view tool.`)
    }
    return lines.join('\n').slice(0, 16_000)
  }
}
