/**
 * Capture→issue mapping tests — a candidate that is the concrete form of a
 * captured thought must never silently duplicate it:
 *  - open capture  → create the issue and promote the capture to it
 *  - promoted capture → update the issue it already became (dedup)
 *  - unrelated capture → plain create
 * @module tests/sync-capture-align.spec
 */

import { describe, expect, it } from 'vitest'
import { alignCandidates, captureOverlaps } from '../src/sync/align.ts'
import { runSync } from '../src/sync/run.ts'
import type { Capture, Issue } from '../src/types.ts'
import type { IssueCandidate } from '../src/sync/cluster.ts'
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

const cand = (sessionId: string, title: string): IssueCandidate => ({
  key: sessionId,
  sessionId,
  title,
  description: 'desc',
  priority: 2,
  suggestedState: 'todo',
  labels: ['sync'],
  linkedSessionIds: [sessionId],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  epicKey: 'epic',
})

const capture = (id: string, content: string, extra: Partial<Capture> = {}): Capture => ({
  id,
  content,
  source: 'session',
  status: 'open',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const issue = (id: string, title: string): Issue => ({
  id,
  identifier: 'INV-1',
  title,
  description: '',
  priority: 2,
  state: 'todo',
  assignee: undefined,
  parentId: undefined,
  teamId: 'INV',
  labels: [],
  acceptanceCriteria: undefined,
  linkedSessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('captureOverlaps', () => {
  it('matches on shared CJK bigrams', () => {
    expect(captureOverlaps(capture('c1', '调研跨会话长期记忆方案'), cand('s1', '跨会话长期记忆方案调研'))).toBe(true)
  })

  it('matches on shared latin tokens', () => {
    expect(captureOverlaps(capture('c1', 'research linear webhook integration'), cand('s1', '研究 linear webhook 集成'))).toBe(true)
  })

  it('does not match unrelated content', () => {
    expect(captureOverlaps(capture('c1', '研究线性 webhook 集成'), cand('s1', '修复侧边栏不可见问题'))).toBe(false)
  })

  it('requires at least two shared tokens', () => {
    expect(captureOverlaps(capture('c1', 'hello world'), cand('s1', 'hello there friend'))).toBe(false)
  })

  it('matches via context when content alone does not overlap (C2)', () => {
    // Content is execution-level ("调研 StreamChunk…"); the candidate is
    // requirement-level ("LLM 用量计量模块"). Content alone fails, but the
    // capture's context (the user's explicit request) carries the overlap.
    const cap = capture('c1', '调研 StreamChunk 结构确认是否有 usage/token 字段', {
      context: '做一个模块，记录所有 track 发起的 llm 数据，计算我们的开销',
    })
    expect(captureOverlaps(cap, cand('s1', 'LLM 用量计量模块'))).toBe(true)
  })

  it('context does not rescue a genuinely unrelated capture (C2)', () => {
    const cap = capture('c1', '调研 StreamChunk usage/token 字段', {
      context: '做一个模块记录 llm 数据计算开销',
    })
    expect(captureOverlaps(cap, cand('s1', '修复侧边栏不可见问题'))).toBe(false)
  })

  it('long generic contexts do not match incidental candidates (C2 containment)', () => {
    // Real 2026-08-14 case: capture 2d394b (context = a long user request
    // about dsh internals) was promoted to 15+ unrelated issues because the
    // old C2 rule matched on 2 incidental shared tokens with no containment.
    const cap = capture('c1', '探索 dsh 仓库整体结构与入口', {
      context: '研究一下 dsh 代码，深入分析，尤其是 context 组装、memory 管理、compact 和 toolcall 的实现',
    })
    // 'dsh' + '分析' are the only shared tokens; containment ~0.17 < 0.25.
    expect(captureOverlaps(cap, cand('s1', '分析 ~/.dsh/source/web.log 中 node: not found 是否为当前问题'))).toBe(false)
    // The verbatim request match keeps working (containment well above 0.25).
    expect(captureOverlaps(cap, cand('s2', '研究 dsh 仓库整体结构与入口，深入分析 context 组装'))).toBe(true)
  })
})

describe('alignCandidates with captures', () => {
  it('creates + promotes when an open capture matches', () => {
    const aligned = alignCandidates(
      [cand('s1', '跨会话长期记忆方案调研')],
      [],
      [],
      [],
      [capture('cap1', '调研跨会话长期记忆方案，暂缓')],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('create')
    if (action.kind === 'create') {
      expect(action.promoteCaptureId).toBe('cap1')
    }
  })

  it('updates the promoted issue instead of creating a duplicate (dedup)', () => {
    const existing = issue('track_issue_x', '跨会话长期记忆方案调研')
    const aligned = alignCandidates(
      [cand('s9', '跨会话长期记忆方案调研')],
      [existing],
      [],
      [],
      [capture('cap1', '调研跨会话长期记忆方案', { status: 'promoted', promotedToIssueId: 'track_issue_x' })],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('update')
    if (action.kind === 'update') {
      expect(action.existing.id).toBe('track_issue_x')
    }
  })

  it('plain create when the capture is unrelated', () => {
    const aligned = alignCandidates(
      [cand('s1', '修复侧边栏不可见问题')],
      [],
      [],
      [],
      [capture('cap1', '研究线性 webhook 集成')],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('create')
    if (action.kind === 'create') {
      expect(action.promoteCaptureId).toBeUndefined()
    }
  })

  it('ignores archived captures', () => {
    const aligned = alignCandidates(
      [cand('s1', '跨会话长期记忆方案调研')],
      [],
      [],
      [],
      [capture('cap1', '调研跨会话长期记忆方案', { status: 'archived' })],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('create')
    if (action.kind === 'create') {
      expect(action.promoteCaptureId).toBeUndefined()
    }
  })

  it('promotes ALL same-context open captures when one matches (C3)', () => {
    // Three captures are fragments of one requirement — same context, but only
    // the first overlaps the candidate by content. All must be promoted.
    const ctxText = '做一个模块记录所有 llm 数据计算开销'
    const aligned = alignCandidates(
      [cand('s1', 'LLM 用量计量模块')],
      [],
      [],
      [],
      [
        capture('cap1', '调研 StreamChunk usage/token 字段', { context: ctxText }),
        capture('cap2', '新建分支 feat/track-llm-usage', { context: ctxText }),
        capture('cap3', '探索 dsh 仓库整体结构', { context: ctxText }),
      ],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('create')
    if (action.kind === 'create') {
      expect(action.promoteCaptureIds).toEqual(['cap1', 'cap2', 'cap3'])
    }
  })

  it('does NOT group captures without context (C3)', () => {
    const aligned = alignCandidates(
      [cand('s1', 'LLM 用量计量模块')],
      [],
      [],
      [],
      [
        capture('cap1', 'LLM 用量计量模块'), // matches by content, no context
        capture('cap2', '新建分支 feat/other', { context: '无关需求' }), // different context, no match
      ],
    )
    const action = aligned.actions[0]!
    expect(action.kind).toBe('create')
    if (action.kind === 'create') {
      // cap1 has no context → the group is just itself; cap2 carries a
      // DIFFERENT context and does not match → only cap1 is promoted.
      expect(action.promoteCaptureIds).toEqual(['cap1'])
    }
  })
})

describe('runSync write-back promotes captures', () => {
  const header = (id: string) => ({ version: 0, id, createdAt: 1000, cwd: '/ws' })

  function makeDeps(store: any) {
    return {
      sessionQuery: {
        filterSessions: async () => [{ header: header('s1'), live: true, persisted: true }],
        readSession: async () => ({
          session: header('s1'),
          events: [userMsg(0, '跨会话长期记忆方案调研', 5000)],
        }),
        readTitle: async () => undefined,
      },
      store,
    }
  }

  it('promotes the matched open capture on write-back', async () => {
    const promoted: Capture[] = []
    const created: unknown[] = []
    const store = {
      readGlobal: async () => null,
      listIssues: async () => [],
      listEpics: async () => [],
      listCaptures: async () => [capture('cap1', '调研跨会话长期记忆方案')],
      nextIdentifier: async () => 'INV-1',
      upsertIssue: async (i: unknown) => { created.push(i) },
      upsertEpic: async () => {},
      upsertCapture: async (c: Capture) => { promoted.push(c) },
      writeGlobal: async () => {},
    }
    const report = await runSync(makeDeps(store) as never, { cwd: '/ws', since: 0, dryRun: false })
    expect(report.created).toBe(1)
    expect(report.promotedCaptures).toBe(1)
    expect(promoted).toHaveLength(1)
    expect(promoted[0]!.status).toBe('promoted')
    expect(promoted[0]!.promotedToIssueId).toBe((created[0] as { id: string }).id)
  })

  it('promotes a capture at most once even when several candidates match it', async () => {
    const promoted: Capture[] = []
    const created: unknown[] = []
    const store = {
      readGlobal: async () => null,
      listIssues: async () => [],
      listEpics: async () => [],
      listCaptures: async () => [capture('cap1', '调研跨会话长期记忆方案')],
      nextIdentifier: async () => 'INV-1',
      upsertIssue: async (i: unknown) => { created.push(i) },
      upsertEpic: async () => {},
      upsertCapture: async (c: Capture) => { promoted.push(c) },
      writeGlobal: async () => {},
    }
    const deps = {
      sessionQuery: {
        filterSessions: async () => [
          { header: header('s1'), live: true, persisted: true },
          { header: header('s2'), live: true, persisted: true },
        ],
        readSession: async (id: string) => ({
          session: header(id),
          events: [userMsg(0, '跨会话长期记忆方案调研', 5000)],
        }),
        readTitle: async () => undefined,
      },
      store,
    }
    const report = await runSync(deps as never, { cwd: '/ws', since: 0, dryRun: false })
    expect(report.created).toBe(2) // two sessions, two candidates, both match cap1
    expect(report.promotedCaptures).toBe(1)
    expect(promoted).toHaveLength(1)
    // The capture links to the FIRST issue it matched (promote-once).
    expect(promoted[0]!.promotedToIssueId).toBe((created[0] as { id: string }).id)
  })

  it('reports promoted count in dry-run without writing', async () => {
    let writes = 0
    const store = {
      readGlobal: async () => null,
      listIssues: async () => [],
      listEpics: async () => [],
      listCaptures: async () => [capture('cap1', '调研跨会话长期记忆方案')],
      nextIdentifier: async () => 'INV-1',
      upsertIssue: async () => { writes += 1 },
      upsertEpic: async () => { writes += 1 },
      upsertCapture: async () => { writes += 1 },
      writeGlobal: async () => { writes += 1 },
    }
    const report = await runSync(makeDeps(store) as never, { cwd: '/ws', since: 0, dryRun: true })
    expect(report.created).toBe(1)
    expect(report.promotedCaptures).toBe(1)
    expect(writes).toBe(0)
  })
})
