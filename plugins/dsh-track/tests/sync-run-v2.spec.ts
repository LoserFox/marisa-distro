/**
 * P2 integration tests — the v2 engine inside runSync: segmentation-driven
 * candidate count, intent drop (rule path without LLM), projection shape,
 * and backward-compatible v1 default.
 * Keyless: no ctx → v2 degrades to rule intent prefilter + candidateFromSpan.
 * @module tests/sync-run-v2.spec
 */

import { describe, expect, it } from 'vitest'
import { runSync, mapLimit } from '../src/sync/run.ts'
import { projectToIssueCandidate } from '../src/sync/candidate.ts'
import { candidateFromSpan } from '../src/sync/candidate.ts'
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

/** Build deps with a stubbed sessionQuery over synthetic events. */
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

describe('runSync v2 engine', () => {
  it('segments a multi-topic session into multiple candidates (not 1)', async () => {
    const events = [
      ev('turn/start', 0, { turn: 1 }),
      userMsg(1, '请你先分析一下 test-fakechris 项目结构', 1100),
      ev('turn/end', 2, { turn: 1, reason: { kind: 'completed' } }),
      ev('turn/start', 3, { turn: 2 }),
      // topic marker opens a new span
      userMsg(4, '另外一个问题：研究官方 branch from this 能力', 1200),
      ev('turn/end', 5, { turn: 2, reason: { kind: 'completed' } }),
    ]
    const d = deps({ s1: events })
    const report = await runSync(d as never, { cwd: '/ws', since: 0, dryRun: true, engine: 'v2' })
    // 2 spans → 2 candidates (rule intent keeps both as requirement-leaning).
    expect(report.issueCandidates.length).toBe(2)
  })

  it('drops directive spans via the rule intent prefilter (no LLM)', async () => {
    const events = [
      // span 1: pure directive (no hard split signal between the two is fine —
      // the lead "帮我 commit" makes the WHOLE span directive-leaning).
      userMsg(0, '帮我 commit 这些改动', 1000),
      userMsg(1, '帮我 push 一下', 1100),
      // topic marker opens span 2: pure requirement.
      userMsg(2, '另外一个问题：研究官方 branch from this 能力', 1200),
    ]
    const d = deps({ s1: events })
    const report = await runSync(d as never, { cwd: '/ws', since: 0, dryRun: true, engine: 'v2' })
    // span 1 (commit+push) → directive-leaning → dropped; span 2 (topic
    // marker + requirement lead) → kept.
    expect(report.issueCandidates.length).toBe(1)
    expect(report.issueCandidates[0]!.title).toContain('branch')
  })

  it('v1 engine remains the default and emits one candidate per session', async () => {
    const events = [
      userMsg(0, '任务 A', 1000),
      userMsg(1, '任务 B', 1100),
    ]
    const d = deps({ s1: events })
    const report = await runSync(d as never, { cwd: '/ws', since: 0, dryRun: true })
    // v1: one issue per session regardless of topics.
    expect(report.issueCandidates.length).toBe(1)
  })

  it('projectToIssueCandidate flattens v2 fields into the store shape', () => {
    const span = {
      id: 'span_s1_0', sessionId: 's1', seqStart: 0, seqEnd: 5,
      leadRequest: '研究官方分支能力', requests: ['研究官方分支能力'],
      openedBy: ['session-start'], interruptedCount: 0, todoResetCount: 0, idleBeforeMs: 0,
    }
    const c = candidateFromSpan(span)
    const p = projectToIssueCandidate(c)
    expect(p.sessionId).toBe('s1')
    expect(p.title).toContain('研究官方分支能力')
    expect(p.labels).toContain('investigation')
    expect(p.suggestedState).toBe('todo')
  })
})

describe('mapLimit (v2 Phase A concurrency pool)', () => {
  it('runs all items and preserves input order', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('handles limit larger than input and empty input', async () => {
    expect(await mapLimit([1, 2], 10, async (n) => n + 1)).toEqual([2, 3])
    expect(await mapLimit([], 3, async () => 1)).toEqual([])
  })
})

describe('runSync v2 maxSessions cap', () => {
  it('honors maxSessions in v2 (inScopeRecords, not the raw record list)', async () => {
    // 3 sessions; maxSessions=1 must process exactly one.
    const eventsOf = (text: string) => [userMsg(0, text, 1000)]
    const d = deps({
      s1: eventsOf('第一个 session 的任务'),
      s2: eventsOf('第二个 session 的任务'),
      s3: eventsOf('第三个 session 的任务'),
    })
    const report = await runSync(d as never, { cwd: '/ws', since: 0, dryRun: true, engine: 'v2', maxSessions: 1 })
    expect(report.scannedSessions).toBe(1)
    expect(report.issueCandidates.length).toBeGreaterThan(0)
    // Every candidate must come from the first session.
    for (const c of report.issueCandidates) {
      expect(c.sessionId).toBe('s1')
    }
  })

  it('cursor-skipped sessions do not consume the maxSessions budget', async () => {
    const eventsOf = (text: string, time: number) => [userMsg(0, text, time)]
    const d = deps({
      s1: eventsOf('旧 session（被 cursor 跳过）', 500), // before scanFrom
      s2: eventsOf('新 session', 5000),
    })
    const report = await runSync(d as never, { cwd: '/ws', since: 1000, dryRun: true, engine: 'v2', maxSessions: 1 })
    // s1 skipped by cursor; budget must still allow s2.
    expect(report.scannedSessions).toBe(1)
    for (const c of report.issueCandidates) {
      expect(c.sessionId).toBe('s2')
    }
  })
})
