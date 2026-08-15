/**
 * P1 unit tests — event normalization, authority gate, attempt construction,
 * and replay idempotency.
 * @module tests/sync-p1.spec
 */

import { describe, expect, it } from 'vitest'
import { normalizeEvent, normalizeLog, eventIdFor, hashCanonical, classifyEvent } from '../src/sync/raw-event.ts'
import { buildAttempts, attemptIdFor, foldOutcome } from '../src/sync/attempt.ts'
import { newEventsSince, advanceCursor, emptyCursor, dedupByEventId } from '../src/sync/replay.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Minimal session event builder. */
function ev<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
  time = 1000 + seq,
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time, data } as Extract<SessionEvent, { type: T }>
}

const userMsg = (seq: number, text: string) => ev('user/message', seq, {
  id: `m${seq}`, role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

describe('raw-event normalization', () => {
  it('mints deterministic content-hash event ids (idempotent across runs)', () => {
    const e = userMsg(7, 'build the tracker')
    const a = normalizeEvent('s1', e)
    const b = normalizeEvent('s1', e)
    expect(a.eventId).toBe(b.eventId)
    expect(a.eventId).toMatch(/^evt_[0-9a-f]{8}$/)
    // Same payload at same seq in a different session → different id.
    const other = normalizeEvent('s2', e)
    expect(other.eventId).not.toBe(a.eventId)
  })

  it('classifies only source.kind===user messages as user-request authority', () => {
    const user = ev('user/message', 0, {
      id: 'a', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' },
    })
    const plugin = ev('user/message', 1, {
      id: 'b', role: 'user', content: [{ type: 'text', text: 'ctx' }], source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
    })
    expect(classifyEvent(user)).toEqual({ authority: 'user-request', actor: 'user' })
    expect(classifyEvent(plugin)).toEqual({ authority: 'plugin', actor: 'plugin' })
    expect(classifyEvent(ev('tool/call', 2, { turn: 1, step: 1, callId: 'c', name: 'bash', arguments: 'ls' })))
      .toEqual({ authority: 'tool', actor: 'agent' })
    expect(classifyEvent(ev('turn/end', 3, { turn: 1, reason: { kind: 'completed' } })))
      .toEqual({ authority: 'lifecycle', actor: 'system' })
  })

  it('captures tool name/callId and turn-end reason', () => {
    const tool = normalizeEvent('s1', ev('tool/call', 5, { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: 'x' }))
    expect(tool.toolName).toBe('bash')
    expect(tool.callId).toBe('c1')
    const end = normalizeEvent('s1', ev('turn/end', 9, { turn: 1, reason: { kind: 'interrupted' } }))
    expect(end.turnEndReason).toBe('interrupted')
  })

  it('hashCanonical is stable and sensitive to payload', () => {
    expect(hashCanonical({ a: 1, b: 'x' })).toBe(hashCanonical({ a: 1, b: 'x' }))
    expect(hashCanonical({ a: 1, b: 'x' })).not.toBe(hashCanonical({ a: 1, b: 'y' }))
  })
})

describe('attempt construction', () => {
  const events = normalizeLog('s1', [
    ev('turn/start', 0, { turn: 1 }),
    userMsg(1, 'fix the bug'),
    ev('tool/call', 2, { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: 'pytest' }),
    ev('tool/result', 3, { turn: 1, step: 1, callId: 'c1' }),
    ev('turn/end', 4, { turn: 1, reason: { kind: 'completed' } }),
  ])

  it('builds one attempt per turn with outcome observations', () => {
    const attempts = buildAttempts('s1', events)
    expect(attempts.length).toBeGreaterThanOrEqual(1)
    const first = attempts[0]!
    expect(first.outcome.toolCalls).toBe(1)
    expect(first.outcome.tools).toContain('bash')
    expect(first.outcome.turnEnded).toBe(true)
    expect(first.outcome.turnEndReason).toBe('completed')
  })

  it('attempt id is deterministic', () => {
    expect(attemptIdFor('s1', 1, 1)).toBe(attemptIdFor('s1', 1, 1))
    expect(attemptIdFor('s1', 1, 1)).not.toBe(attemptIdFor('s1', 1, 2))
  })

  it('foldOutcome records assistant self-report but flags it as weak (never done)', () => {
    const withClaim = normalizeLog('s1', [
      ev('assistant/message', 0, {
        turn: 1, step: 1,
        message: { id: 'm', role: 'assistant', content: [{ type: 'text', text: '全部完成，测试通过' }], source: { kind: 'model' } },
      }),
    ])
    const outcome = foldOutcome(withClaim)
    expect(outcome.assistantCompletions).toHaveLength(1)
    // No turn/end, no verifier → not done by any strong signal.
    expect(outcome.turnEnded).toBe(false)
  })

  it('flags sawToolError on error-carrying tool results', () => {
    const err = ev('tool/result', 3, {
      turn: 1, step: 1,
      message: { id: 'r1', role: 'user', content: [{ type: 'tool-result', toolCallId: 'c1', content: [] }], source: { kind: 'tool' } },
      error: { name: 'ShellError', code: 'EXIT_1' },
    })
    const outcome = foldOutcome(normalizeLog('s1', [err]))
    expect(outcome.sawToolError).toBe(true)
  })
})

describe('replay idempotency', () => {
  it('newEventsSince only returns events above the per-session watermark', () => {
    const cursor = { lastSeq: { s1: 4 }, lastActivityAt: {} }
    expect(newEventsSince('s1', [1, 2, 3, 4, 5, 6], cursor)).toEqual([5, 6])
    expect(newEventsSince('s1', [1, 2, 3, 4], cursor)).toEqual([])
    expect(newEventsSince('s2', [1, 2], cursor)).toEqual([1, 2])
  })

  it('advanceCursor is monotonic and immutable', () => {
    const c = advanceCursor(emptyCursor(), 's1', 9, 5000, '/ws')
    expect(c.lastSeq.s1).toBe(9)
    expect(c.lastActivityAt['/ws']).toBe(5000)
    // Later cursor with smaller seq never rewinds.
    const c2 = advanceCursor(c, 's1', 3, 1000, '/ws')
    expect(c2.lastSeq.s1).toBe(9)
    expect(c2.lastActivityAt['/ws']).toBe(5000)
  })

  it('dedupByEventId keeps first occurrence of each content-hash id', () => {
    const e = userMsg(7, 'dup')
    const a = normalizeEvent('s1', e)
    const b = normalizeEvent('s1', e) // same id (same session/seq/payload)
    const c = normalizeEvent('s1', userMsg(8, 'other'))
    const out = dedupByEventId([a, b, c])
    expect(out).toHaveLength(2)
    expect(out.map((x) => x.eventId)).toEqual([a.eventId, c.eventId])
  })

  it('replay of the same log yields identical event ids (no dup on re-run)', () => {
    const log: SessionEvent[] = [userMsg(0, 'a'), userMsg(1, 'b')]
    const pass1 = normalizeLog('s1', log)
    const pass2 = normalizeLog('s1', log)
    expect(pass1.map((e) => e.eventId)).toEqual(pass2.map((e) => e.eventId))
    expect(eventIdFor('s1', 0, hashCanonical(log[0]!.data))).toBe(pass1[0]!.eventId)
  })
})
