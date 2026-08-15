/**
 * Sync pipeline unit tests — extraction, clustering, alignment, and the
 * runSync orchestration (dry-run report, write-back, incremental cursor).
 * Keyless: no model calls.
 * @module tests/sync.spec
 */

import { describe, expect, it } from 'vitest'
import { extractWorklog } from '../src/sync/extract.ts'
import { clusterWorklogs, normalizeTitle } from '../src/sync/cluster.ts'
import { alignCandidates, mergeIntoIssue } from '../src/sync/align.ts'
import { runSync } from '../src/sync/run.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Build a minimal session event for tests. */
function ev<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
  time = 1000 + seq,
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time, data } as Extract<SessionEvent, { type: T }>
}

describe('extractWorklog', () => {
  it('keeps only user-initiated messages (source.kind === user)', () => {
    const events = [
      ev('user/message', 0, {
        id: 'a', role: 'user',
        content: [{ type: 'text', text: 'build the tracker' }],
        source: { kind: 'user' },
      }),
      // Plugin-injected context must be excluded.
      ev('user/message', 1, {
        id: 'b', role: 'user',
        content: [{ type: 'text', text: 'Current runtime context…' }],
        source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
      }),
    ]
    const w = extractWorklog('s1', events)
    expect(w.requests).toHaveLength(1)
    expect(w.requests[0]!.text).toBe('build the tracker')
  })

  it('attaches the answering assistant message to the pending request', () => {
    const events = [
      ev('user/message', 0, {
        id: 'a', role: 'user',
        content: [{ type: 'text', text: 'write tests' }],
        source: { kind: 'user' },
      }),
      ev('assistant/message', 1, {
        turn: 1, step: 1,
        message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'done, 8 tests green' }], source: { kind: 'model' } },
      }),
    ]
    const w = extractWorklog('s1', events)
    expect(w.requests[0]!.answerText).toContain('8 tests green')
    expect(w.requests[0]!.answeredBySeq).toBe(1)
  })

  it('counts tool calls and completed turns as work signals', () => {
    const events = [
      ev('user/message', 0, {
        id: 'a', role: 'user',
        content: [{ type: 'text', text: 'fix the bug' }],
        source: { kind: 'user' },
      }),
      ev('tool/call', 1, { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: 'ls' }),
      ev('turn/end', 2, { turn: 1, reason: { kind: 'completed' } }),
    ]
    const w = extractWorklog('s1', events)
    expect(w.signals.toolCalls).toBe(1)
    expect(w.signals.completedTurns).toBe(1)
    expect(w.signals.lastActivityAt).toBe(1002)
  })

  it('treats empty user messages as no request', () => {
    const events = [
      ev('user/message', 0, {
        id: 'a', role: 'user',
        content: [{ type: 'tool-result', tool: 'bash', content: [] }],
        source: { kind: 'user' },
      }),
    ]
    const w = extractWorklog('s1', events)
    expect(w.requests).toHaveLength(0)
  })
})

describe('normalizeTitle', () => {
  it('normalizes case, punctuation, and whitespace (all non-alphanumerics stripped)', () => {
    expect(normalizeTitle('  Build  The Tracker!! ')).toBe('buildthetracker')
    // Space variants are identical for clustering ("OAuth 回调" == "OAuth回调").
    expect(normalizeTitle('修复 OAuth 回调')).toBe(normalizeTitle('修复OAuth回调'))
  })
})

describe('clusterWorklogs', () => {
  const wlog = (id: string, text: string, toolCalls = 0) => ({
    sessionId: id,
    requests: [{ seq: 0, time: 1000, text }],
    signals: { toolCalls, completedTurns: 0, failedTurns: 0, lastActivityAt: 1000 },
  })

  it('groups sessions with the same normalized title into one epic', () => {
    const a = wlog('s1', 'sync history into track')
    const b = wlog('s2', 'sync history into track')
    const { epics, issues } = clusterWorklogs([a, b], {
      s1: { id: 's1', title: 'Sync history', teamKey: 'INV', createdAt: 1000 },
      s2: { id: 's2', title: 'Sync history', teamKey: 'INV', createdAt: 2000 },
    })
    expect(epics).toHaveLength(1)
    expect(epics[0]!.sessionIds).toEqual(['s1', 's2'])
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.epicKey === epics[0]!.key)).toBe(true)
  })

  it('suggests in_progress when the session shows tool activity, else todo', () => {
    const active = wlog('s1', 'fix the bug', 3)
    const quiet = wlog('s2', 'think about design')
    const { issues } = clusterWorklogs([active, quiet], {
      s1: { id: 's1', title: 'Fix bug', teamKey: 'INV', createdAt: 1000 },
      s2: { id: 's2', title: 'Design', teamKey: 'INV', createdAt: 2000 },
    })
    const byId = new Map(issues.map((i) => [i.sessionId, i]))
    expect(byId.get('s1')!.suggestedState).toBe('in_progress')
    expect(byId.get('s2')!.suggestedState).toBe('todo')
  })

  it('skips sessions with no user requests (empty shells)', () => {
    const empty = { sessionId: 's3', requests: [], signals: { toolCalls: 0, completedTurns: 0, failedTurns: 0, lastActivityAt: 0 } }
    const real = wlog('s1', 'build the tracker')
    const { epics, issues } = clusterWorklogs([empty, real], {
      s3: { id: 's3', title: 'Empty shell', teamKey: 'INV', createdAt: 1000 },
      s1: { id: 's1', title: 'Build tracker', teamKey: 'INV', createdAt: 2000 },
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.sessionId).toBe('s1')
    expect(epics[0]!.sessionIds).toEqual(['s1'])
  })
})

describe('alignCandidates', () => {
  const cand = (sessionId: string, title: string, state: 'todo' | 'in_progress' = 'todo') => ({
    key: sessionId,
    sessionId,
    title,
    description: 'desc',
    priority: 2 as const,
    suggestedState: state,
    labels: ['sync'],
    linkedSessionIds: [sessionId],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    epicKey: 'epic',
  })

  it('creates a candidate with no existing match', () => {
    const aligned = alignCandidates([cand('s1', 'New task')], [])
    expect(aligned.actions[0]!.kind).toBe('create')
  })

  it('updates when the session is already linked to an issue', () => {
    const existing = {
      id: 'track_issue_x', identifier: 'INV-1', title: 'New task', description: '',
      priority: 2 as const, state: 'todo' as const, assignee: undefined,
      parentId: undefined, teamId: 'INV', labels: [], acceptanceCriteria: undefined,
      linkedSessionIds: ['s1'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const aligned = alignCandidates([cand('s1', 'New task', 'in_progress')], [existing])
    const action = aligned.actions[0]!
    expect(action.kind).toBe('update')
    if (action.kind === 'update') {
      expect(action.changes).toContain('state todo → in_progress')
    }
  })

  it('never auto-dones an existing issue', () => {
    const existing = {
      id: 'track_issue_y', identifier: 'INV-2', title: 'Stable', description: '',
      priority: 2 as const, state: 'todo' as const, assignee: undefined,
      parentId: undefined, teamId: 'INV', labels: [], acceptanceCriteria: undefined,
      linkedSessionIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const candidate = { ...cand('s9', 'Stable'), suggestedState: 'done' as const }
    const merged = mergeIntoIssue(existing, candidate)
    expect(merged.state).toBe('todo')
  })

  it('skips epic candidates whose key already exists', () => {
    const epic = {
      key: 'sync history', name: 'Sync history', description: 'd',
      status: 'active' as const, sessionIds: ['s1'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const aligned = alignCandidates([], [], [epic], ['sync history'])
    expect(aligned.epicActions[0]!.kind).toBe('skip')
    expect(aligned.epicActions[1]).toBeUndefined()
  })
})

describe('runSync', () => {
  const header = (id: string, createdAt: number, cwd = '/ws') => ({
    version: 0, id, createdAt, cwd,
  })

  function makeDeps(eventsBySession: Record<string, SessionEvent[]>, store: any) {
    const readTitle = async () => ({ title: 'Session title', messageSeqs: [], source: 'fallback' as const })
    return {
      sessionQuery: {
        filterSessions: async () =>
          Object.keys(eventsBySession).map((id) => ({ header: header(id, 1000), live: true, persisted: true })),
        readSession: async (id: string) => ({ session: header(id, 1000), events: eventsBySession[id] ?? [] }),
        readTitle,
      },
      store,
    }
  }

  const userMsg = (seq: number, text: string, time: number): SessionEvent =>
    ({ type: 'user/message', seq, time, data: { id: `m${seq}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } } }) as SessionEvent

  it('dry-runs: reports candidates without writing', async () => {
    let writes = 0
    const store = {
      readGlobal: async () => null,
      listIssues: async () => [],
      listCaptures: async () => [],
      listEpics: async () => [],
      nextIdentifier: async () => 'INV-1',
      upsertIssue: async () => { writes += 1 },
      upsertEpic: async () => { writes += 1 },
      writeGlobal: async () => { writes += 1 },
    }
    const deps = makeDeps({ s1: [userMsg(0, 'build the tracker', 5000)] }, store)
    const report = await runSync(deps as never, { cwd: '/ws', since: 0, dryRun: true })
    expect(report.scannedSessions).toBe(1)
    expect(report.userRequests).toBe(1)
    expect(report.issueCandidates).toHaveLength(1)
    expect(report.created).toBe(1)
    expect(writes).toBe(0)
  })

  it('writes back when dryRun=false and advances the cursor', async () => {
    const created: unknown[] = []
    const globalRef: any = {}
    const store = {
      readGlobal: async () => globalRef.global ?? null,
      listIssues: async () => [],
      listCaptures: async () => [],
      listEpics: async () => [],
      nextIdentifier: async () => 'INV-1',
      upsertIssue: async (issue: unknown) => { created.push(issue) },
      upsertEpic: async () => {},
      writeGlobal: async (g: unknown) => { globalRef.global = g },
    }
    const deps = makeDeps({ s1: [userMsg(0, 'build the tracker', 5000)] }, store)
    const report = await runSync(deps as never, { cwd: '/ws', since: 0, dryRun: false })
    expect(report.created).toBe(1)
    expect(created).toHaveLength(1)
    expect(globalRef.global.lastSync['/ws']).toBe(5000)
  })

  it('skips sessions whose last activity predates the cursor', async () => {
    const store = {
      readGlobal: async () => ({ version: 1 as const, teams: {}, identifierCounter: 0, lastSync: { '/ws': 9000 } }),
      listIssues: async () => [],
      listCaptures: async () => [],
      listEpics: async () => [],
    }
    // Last activity 5000 < cursor 9000 → skipped.
    const deps = makeDeps({ s1: [userMsg(0, 'old request', 5000)] }, store)
    const report = await runSync(deps as never, { cwd: '/ws', since: 0, dryRun: true })
    expect(report.scannedSessions).toBe(0)
    expect(report.skippedByCursor).toBe(1)
    expect(report.userRequests).toBe(0)
  })

  it('filters sessions by the requested cwd', async () => {
    let filterArg: unknown
    const store = {
      readGlobal: async () => null,
      listIssues: async () => [],
      listCaptures: async () => [],
      listEpics: async () => [],
    }
    const deps = makeDeps({}, store)
    deps.sessionQuery.filterSessions = async (filters: unknown) => {
      filterArg = filters
      return []
    }
    await runSync(deps as never, { cwd: '/other-ws', dryRun: true })
    expect(filterArg).toEqual([{ kind: 'cwd', values: ['/other-ws'] }])
  })
})
