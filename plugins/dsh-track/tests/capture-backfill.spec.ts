/**
 * Capture context backfill tests — legacy open captures get context from
 * their source session logs; idempotent; session-less captures skipped.
 * @module tests/capture-backfill.spec
 */

import { describe, expect, it, vi } from 'vitest'
import { backfillCaptureContext } from '../src/capture/backfill.ts'
import { latestUserRequestFromEvents } from '../src/capture/context.ts'
import type { TrackStore } from '../src/store.ts'

function makeStore(captures: any[]) {
  const upserted: any[] = []
  return {
    captures,
    upserted,
    listCaptures: vi.fn(async () => captures),
    upsertCapture: vi.fn(async (c: any) => { upserted.push(c) }),
  } as unknown as TrackStore & { upserted: any[] }
}

const sessionQuery = (eventsBySession: Record<string, any[]>) => ({
  readSession: async (id: string) => ({ events: eventsBySession[id] ?? [] }),
})

const cap = (id: string, extra: any = {}) => ({
  id, content: `content-${id}`, source: 'session', status: 'open', tags: [],
  createdAt: '2026-01-01T00:00:00.000Z', ...extra,
})

describe('latestUserRequestFromEvents', () => {
  it('returns the most recent full user instruction (text + message id)', () => {
    const events = [
      { type: 'user/message', data: { id: 'msg-1', content: [{ type: 'text', text: '请分析 dsh 仓库的整体结构' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { id: 'msg-2', content: [{ type: 'text', text: '再深入看下 context 组装和 memory 管理' }], source: { kind: 'user' } } },
      { type: 'tool/call', data: { name: 'bash', arguments: '{}' } },
    ]
    expect(latestUserRequestFromEvents(events)).toEqual({ text: '再深入看下 context 组装和 memory 管理', id: 'msg-2' })
  })

  it('message id is optional (older events without one)', () => {
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '做一个模块，记录所有 track 发起的 llm 数据' }], source: { kind: 'user' } } },
    ]
    expect(latestUserRequestFromEvents(events)).toEqual({ text: '做一个模块，记录所有 track 发起的 llm 数据' })
  })

  it('skips terse acknowledgements and keeps scanning to the full instruction', () => {
    // "可以" / "pr merge" / "CA先做" are acks, not motivation — the context
    // must be the full instruction that stated the goal.
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '做一个模块，记录所有 track 发起的 llm 数据，计算开销' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '可以' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: 'pr merge' }], source: { kind: 'user' } } },
    ]
    expect(latestUserRequestFromEvents(events)).toEqual({ text: '做一个模块，记录所有 track 发起的 llm 数据，计算开销' })
  })

  it('a short request with sentence punctuation is still a full instruction', () => {
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '继续？' }], source: { kind: 'user' } } },
    ]
    expect(latestUserRequestFromEvents(events)).toEqual({ text: '继续？' })
  })

  it('ignores non-user sources (plugin/system injections)', () => {
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '系统注入的系统提示很长' }], source: { kind: 'plugin' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '真实请求：请分析这个架构设计' }], source: { kind: 'user' } } },
    ]
    expect(latestUserRequestFromEvents(events)).toEqual({ text: '真实请求：请分析这个架构设计' })
  })

  it('returns undefined when there is no explicit user request', () => {
    expect(latestUserRequestFromEvents([])).toBeUndefined()
    expect(latestUserRequestFromEvents([{ type: 'tool/call', data: {} }])).toBeUndefined()
  })

  it('returns undefined when the session has only terse acks', () => {
    const events = [
      { type: 'user/message', data: { content: [{ type: 'text', text: '可以' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '好' }], source: { kind: 'user' } } },
    ]
    expect(latestUserRequestFromEvents(events)).toBeUndefined()
  })
})

describe('backfillCaptureContext', () => {
  const userMsg = (text: string, id?: string) => ({
    type: 'user/message' as const,
    data: { ...(id ? { id } : {}), content: [{ type: 'text' as const, text }], source: { kind: 'user' as const } },
  })

  it('fills context on legacy open captures from their session logs', async () => {
    const store = makeStore([
      cap('c1', { sourceSessionId: 's1' }),
      cap('c2', { sourceSessionId: 's2' }),
    ])
    const sq = sessionQuery({
      s1: [userMsg('第一个 session 的完整需求：调研跨会话记忆方案', 'msg-s1-1')],
      s2: [userMsg('第二个 session 的完整需求：实现任务分组', 'msg-s2-1')],
    })
    const result = await backfillCaptureContext(store, sq)
    expect(result.scanned).toBe(2)
    expect(result.filled).toBe(2)
    expect(store.upserted[0]!.context).toBe('第一个 session 的完整需求：调研跨会话记忆方案')
    expect(store.upserted[0]!.sourceMessageId).toBe('msg-s1-1')
    expect(store.upserted[1]!.context).toBe('第二个 session 的完整需求：实现任务分组')
    expect(store.upserted[1]!.sourceMessageId).toBe('msg-s2-1')
  })

  it('skips captures that already have context (idempotent)', async () => {
    const store = makeStore([
      cap('c1', { sourceSessionId: 's1', context: '已有的完整动机：跨会话记忆方案调研与暂缓决策' }),
      cap('c2', { sourceSessionId: 's2' }),
    ])
    const sq = sessionQuery({
      s2: [userMsg('第二个 session 的完整需求：实现任务分组')],
    })
    const result = await backfillCaptureContext(store, sq)
    expect(result.scanned).toBe(1) // c1 有真 context，不算
    expect(result.filled).toBe(1)
    expect(store.upserted).toHaveLength(1)
  })

  it('replaces a terse-ack context with the full instruction (re-run under the new rule)', async () => {
    // Context "pr merge" was filled by the OLD "latest request" rule — it is
    // a terse ack, not motivation. Backfill must re-scan and replace it.
    const store = makeStore([
      cap('c1', { sourceSessionId: 's1', context: 'pr merge' }),
    ])
    const sq = sessionQuery({
      s1: [
        userMsg('做一个模块，记录所有 track 发起的 llm 数据，计算开销'),
        userMsg('pr merge'),
      ],
    })
    const result = await backfillCaptureContext(store, sq)
    expect(result.scanned).toBe(1)
    expect(result.filled).toBe(1)
    expect(store.upserted[0]!.context).toBe('做一个模块，记录所有 track 发起的 llm 数据，计算开销')
  })

  it('leaves a real context untouched even when the session has a newer ack', async () => {
    const store = makeStore([
      cap('c1', { sourceSessionId: 's1', context: '完整动机：实现任务分组功能' }),
    ])
    const sq = sessionQuery({
      s1: [userMsg('完整动机：实现任务分组功能'), userMsg('可以')],
    })
    const result = await backfillCaptureContext(store, sq)
    expect(result.scanned).toBe(0) // real context → not a candidate
    expect(result.filled).toBe(0)
  })

  it('skips captures without a source session, and counts skipped for no-request sessions', async () => {
    const store = makeStore([
      cap('c1'), // no sourceSessionId → not scanned
      cap('c2', { sourceSessionId: 's2' }), // session with no user request → skipped
    ])
    const sq = sessionQuery({ s2: [{ type: 'tool/call', data: {} }] })
    const result = await backfillCaptureContext(store, sq)
    expect(result.scanned).toBe(1)
    expect(result.filled).toBe(0)
    expect(result.skipped).toBe(1)
    expect(store.upserted).toHaveLength(0)
  })

  it('tolerates a missing sessionQuery (no-op with counts)', async () => {
    const store = makeStore([cap('c1', { sourceSessionId: 's1' })])
    const result = await backfillCaptureContext(store, undefined)
    expect(result.scanned).toBe(1)
    expect(result.filled).toBe(0)
    expect(result.skipped).toBe(1)
  })
})
