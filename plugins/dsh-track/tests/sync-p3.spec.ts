/**
 * P3 unit tests — cross-session identity resolution: fork-copy detection,
 * merge thresholds, conservative relations, and runSync-level fork dedup.
 * @module tests/sync-p3.spec
 */

import { describe, expect, it } from 'vitest'
import { detectForkCopies, forkGroups, jaccard, mergeCandidates, ruleRelation } from '../src/sync/identity.ts'
import { runSync } from '../src/sync/run.ts'
import { normalizeLog } from '../src/sync/raw-event.ts'
import type { TaskCandidate } from '../src/sync/candidate.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

function ev<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
  time = 1000 + seq,
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time, data } as Extract<SessionEvent, { type: T }>
}

const userMsg = (seq: number, text: string, time?: number) => ev('user/message', seq, {
  id: `m${seq}`, role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
}, time)

const cand = (id: string, title: string, requests: string[], goal?: string): TaskCandidate => ({
  id, sessionId: id, span: { seqStart: 0, seqEnd: 1 },
  kind: 'investigation', authority: 'system_inferred', title, goal,
  scope: [], nonGoals: [], constraints: [], acceptanceCriteria: [],
  evidenceRefs: [], confidence: 0.8, decidedBy: 'rule', requests,
})

describe('fork-copy detection', () => {
  it('jaccard measures event-set overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3)
    expect(jaccard(new Set(['a']), new Set(['a']))).toBe(1)
    expect(jaccard(new Set(), new Set())).toBe(1)
  })

  it('detects fork copies from identical event content', () => {
    // Two sessions with identical normalized events → 1.0 overlap.
    const log = [userMsg(0, '研究 TUI'), userMsg(1, '继续查')]
    const rawsA = normalizeLog('sA', log)
    const rawsB = normalizeLog('sB', log)
    const pairs = detectForkCopies([
      { sessionId: 'sA', contentKeys: new Set(rawsA.map((r) => r.contentKey)) },
      { sessionId: 'sB', contentKeys: new Set(rawsB.map((r) => r.contentKey)) },
    ])
    expect(pairs).toEqual([['sA', 'sB']])
  })

  it('does not merge unrelated sessions', () => {
    const rawsA = normalizeLog('sA', [userMsg(0, '研究 TUI')])
    const rawsB = normalizeLog('sB', [userMsg(0, '修复 bug')])
    const pairs = detectForkCopies([
      { sessionId: 'sA', contentKeys: new Set(rawsA.map((r) => r.contentKey)) },
      { sessionId: 'sB', contentKeys: new Set(rawsB.map((r) => r.contentKey)) },
    ])
    expect(pairs).toHaveLength(0)
  })

  it('treats direct parent/child forks with moderate overlap as copies', () => {
    // Child inherits parent's leading events (seed), then diverges.
    const shared = [userMsg(0, '开始任务')]
    const parentRaw = normalizeLog('p', shared)
    const childRaw = normalizeLog('c', [...shared, userMsg(1, '继续')])
    const pairs = detectForkCopies([
      { sessionId: 'p', contentKeys: new Set(parentRaw.map((r) => r.contentKey)), parentSession: undefined },
      { sessionId: 'c', contentKeys: new Set(childRaw.map((r) => r.contentKey)), parentSession: 'p' },
    ])
    expect(pairs.length).toBe(1)
  })

  it('forkGroups unions overlapping pairs', () => {
    const groups = forkGroups([['a', 'b'], ['b', 'c']])
    expect(groups.length).toBe(1)
    expect(groups[0]!.sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('relation classification (rule path)', () => {
  it('same normalized title → SAME_TASK', () => {
    const r = ruleRelation(cand('a', '修复 OAuth 回调', ['x']), cand('b', '修复OAuth回调', ['y']))
    expect(r.relation).toBe('SAME_TASK')
  })

  it('title containment → CONTINUATION_OF', () => {
    const r = ruleRelation(cand('a', '修复 OAuth 回调', ['x']), cand('b', '修复 OAuth 回调并补测试', ['y']))
    expect(r.relation).toBe('CONTINUATION_OF')
  })

  it('unrelated titles → NEW_TASK (conservative)', () => {
    const r = ruleRelation(cand('a', '研究 TUI', ['x']), cand('b', '修复 bug', ['y']))
    expect(r.relation).toBe('NEW_TASK')
  })
})

describe('mergeCandidates', () => {
  it('merges SAME_TASK pairs above threshold, keeps NEW_TASK separate', async () => {
    const a = cand('a', '修复 OAuth 回调', ['修复 OAuth 回调'])
    const b = cand('b', '修复 OAuth 回调', ['继续修复 OAuth'])
    const c = cand('c', '研究 TUI', ['研究 TUI'])
    const { groups, standalone } = await mergeCandidates(undefined, [a, b, c], { provider: 'x', model: 'y' })
    expect(groups.length).toBe(1)
    expect(groups[0]!.members.length).toBe(2)
    expect(standalone.length).toBe(1)
    expect(standalone[0]!.id).toBe('c')
  })

  it('below threshold → no merge (conservative over-merge guard)', async () => {
    const a = cand('a', '修复 OAuth 回调', ['x'])
    const b = cand('b', '修复 OAuth 回调', ['y'])
    const { groups } = await mergeCandidates(undefined, [a, b], { provider: 'x', model: 'y', mergeThreshold: 0.9 })
    expect(groups.length).toBe(0)
  })
})

describe('runSync v2 fork dedup', () => {
  function deps(eventsBySession: Record<string, SessionEvent[]>) {
    const header = (id: string) => ({ version: 0, id, createdAt: 1000, cwd: '/ws' })
    return {
      sessionQuery: {
        filterSessions: async () =>
          Object.keys(eventsBySession).map((id) => ({ header: header(id), live: true, persisted: true })),
        readSession: async (id: string) => ({ session: header(id), events: eventsBySession[id] ?? [] }),
        readTitle: async () => undefined,
      },
      store: {
        readGlobal: async () => null,
        listIssues: async () => [],
      listCaptures: async () => [],
        listEpics: async () => [],
        nextIdentifier: async () => 'INV-1',
        upsertIssue: async () => {},
        upsertEpic: async () => {},
        writeGlobal: async () => {},
      },
    }
  }

  it('emits ONE candidate for fork-copy sessions (not two)', async () => {
    // Two sessions with identical content → fork copies → deduped.
    const shared = [
      ev('turn/start', 0, { turn: 1 }),
      userMsg(1, '研究 TUI 支持情况', 1100),
      ev('turn/end', 2, { turn: 1, reason: { kind: 'completed' } }),
    ]
    const d = deps({ sA: shared, sB: shared })
    const report = await runSync(d as never, { cwd: '/ws', since: 0, dryRun: true, engine: 'v2' })
    // Both sessions are fork copies → their candidates dedupe to one.
    expect(report.issueCandidates.length).toBe(1)
  })
})

describe('mergeCandidates adjacentOnly', () => {
  const cand = (id: string, sessionId: string, seqStart: number, title: string): any => ({
    id, sessionId, span: { seqStart, seqEnd: seqStart + 10 }, kind: 'investigation',
    authority: 'system_inferred', title, scope: [], nonGoals: [], constraints: [],
    acceptanceCriteria: [], evidenceRefs: [], confidence: 0.8, decidedBy: 'rule', requests: [title],
  })

  it('only compares adjacent candidates (same session) — O(n) not O(n²)', async () => {
    const a = cand('a', 's1', 0, '修复 A')
    const b = cand('b', 's1', 100, '修复 A')
    const c = cand('c', 's1', 200, '研究 B')
    const { groups, standalone } = await mergeCandidates(undefined, [a, b, c], { provider: 'x', model: 'y', adjacentOnly: true })
    // a↔b same title → SAME_TASK merge; b↔c would not be checked (adjacent only is a-b, then b merged, c standalone)
    expect(groups.length).toBe(1)
    expect(standalone.length).toBe(1)
    expect(standalone[0]!.id).toBe('c')
  })

  it('does not cross session boundaries in adjacent mode', async () => {
    const a = cand('a', 's1', 0, '修复 A')
    const b = cand('b', 's2', 0, '修复 A')
    const { groups, standalone } = await mergeCandidates(undefined, [a, b], { provider: 'x', model: 'y', adjacentOnly: true })
    // Different sessions → not adjacent → no merge.
    expect(groups.length).toBe(0)
    expect(standalone.length).toBe(2)
  })
})
