/**
 * P2 unit tests — segmentation rules, intent layering (rule path + LLM
 * downgrade), candidate refinement, and synthesis fallback.
 * Keyless: the LLM facade is never invoked; every path exercised is the
 * deterministic downgrade.
 * @module tests/sync-p2.spec
 */

import { describe, expect, it, vi } from 'vitest'
import { normalizeLog } from '../src/sync/raw-event.ts'
import { segmentByRules, aggregateSpans, spanOverlap, isTodoReset, IDLE_BOUNDARY_MS } from '../src/sync/segment.ts'
import { ruleIntentPrefilter, resolveIntent } from '../src/sync/intent.ts'
import { candidateFromSpan, refineCandidate, isGenericTitle, synthesizeCandidate, titleHasObject } from '../src/sync/candidate.ts'
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

const newCtx = () => {
  // An empty cordis-ish context whose reflect.get returns undefined → LLM path degrades.
  return { reflect: { get: () => undefined } } as never
}

describe('segmentation rules', () => {
  it('splits on interrupted-turn signal', () => {
    const events = normalizeLog('s1', [
      ev('turn/start', 0, { turn: 1 }),
      userMsg(1, '调研 A'),
      ev('turn/end', 2, { turn: 1, reason: { kind: 'interrupted' } }),
      ev('turn/start', 3, { turn: 2 }),
      userMsg(4, '做 B'),
      ev('turn/end', 5, { turn: 2, reason: { kind: 'completed' } }),
    ])
    const spans = segmentByRules('s1', events)
    expect(spans.length).toBe(2)
    expect(spans[0]!.requests).toEqual(['调研 A'])
    expect(spans[1]!.openedBy).toContain('interrupted-turn')
  })

  it('todo-reset alone does NOT split (too noisy in real logs); recorded as note', () => {
    const events = normalizeLog('s1', [
      userMsg(0, '任务 X'),
      ev('todo/write', 1, { todos: [{ content: 'a', status: 'pending' }, { content: 'b', status: 'in_progress' }] }),
      userMsg(2, '任务 Y'),
      ev('todo/write', 3, { todos: [] }),
      userMsg(4, '任务 Z'),
    ])
    const spans = segmentByRules('s1', events)
    // No interrupted/idle/topic-marker → single span, todo-reset noted.
    expect(spans.length).toBe(1)
    expect(spans[0]!.requests).toEqual(['任务 X', '任务 Y', '任务 Z'])
  })

  it('todo-reset combines with a hard signal to split', () => {
    const events = normalizeLog('s1', [
      ev('turn/start', 0, { turn: 1 }),
      userMsg(1, '任务 X'),
      ev('turn/end', 2, { turn: 1, reason: { kind: 'interrupted' } }),
      ev('turn/start', 3, { turn: 2 }),
      userMsg(4, '任务 Y'),
      ev('todo/write', 5, { todos: [] }),
      ev('turn/end', 6, { turn: 2, reason: { kind: 'completed' } }),
    ])
    const spans = segmentByRules('s1', events)
    expect(spans.length).toBe(2)
    expect(spans[1]!.openedBy).toContain('interrupted-turn')
  })

  it('splits on long idle gap', () => {
    const t0 = 1000000
    const events = normalizeLog('s1', [
      userMsg(0, '早上做 A', t0),
      userMsg(1, '下午做 B', t0 + IDLE_BOUNDARY_MS + 1000),
    ])
    const spans = segmentByRules('s1', events)
    expect(spans.length).toBe(2)
    expect(spans[1]!.openedBy).toContain('long-idle')
  })

  it('splits on explicit topic markers', () => {
    const events = normalizeLog('s1', [
      userMsg(0, '先修这个 bug'),
      userMsg(1, '另外一个问题：分支能力'),
    ])
    const spans = segmentByRules('s1', events)
    expect(spans.length).toBe(2)
    expect(spans[1]!.openedBy).toContain('topic-marker')
  })

  it('isTodoReset: only fires on non-empty → empty transition', () => {
    expect(isTodoReset(0, 0)).toBe(false)
    expect(isTodoReset(2, 2)).toBe(false)
    expect(isTodoReset(2, 0)).toBe(true)
    expect(isTodoReset(0, 2)).toBe(false)
  })
})

describe('intent layering (rule path)', () => {
  it('flags fork/restart/commit/pr as directive-leaning', () => {
    for (const text of ['帮我 fork 这个仓库', '你 restart 一下 dsh', 'commit 这些改动', '提交 PR']) {
      expect(ruleIntentPrefilter(text).intent).toBe('directive')
    }
  })

  it('flags install of env tooling as directive-leaning', () => {
    expect(ruleIntentPrefilter('帮我安装配置 pnpm').intent).toBe('directive')
  })

  it('keeps plain goals as requirement-leaning', () => {
    expect(ruleIntentPrefilter('回到我们的目标，现在track和 epic/issue 捕捉差的很远').intent).toBe('requirement')
    expect(ruleIntentPrefilter('研究官方有没有 branch from this').intent).toBe('requirement')
  })

  it('resolveIntent degrades to the rule verdict when no LLM service', async () => {
    const v = await resolveIntent(newCtx(), { provider: 'x', model: 'y', requestText: '帮我 commit' })
    expect(v.decidedBy).toBe('rule')
    expect(v.intent).toBe('directive')
  })
})

describe('candidate refinement', () => {
  it('lints generic greeting titles to non_task', () => {
    const c = refineCandidate({
      id: 'c1', sessionId: 's1', span: { seqStart: 0, seqEnd: 1 },
      kind: 'implementation', authority: 'system_inferred',
      title: 'Hello', scope: [], nonGoals: [], constraints: [],
      acceptanceCriteria: [], evidenceRefs: [], confidence: 0.9,
      decidedBy: 'rule', requests: ['hi'],
    })
    expect(c.kind).toBe('non_task')
    expect(c.confidence).toBeLessThanOrEqual(0.2)
  })

  it('isGenericTitle catches greeting and pronoun-only titles', () => {
    expect(isGenericTitle('Hello')).toBe(true)
    expect(isGenericTitle('hi')).toBe(true)
    expect(isGenericTitle('这个')).toBe(true)
    expect(isGenericTitle('修复 OAuth 回调')).toBe(false)
    expect(isGenericTitle('')).toBe(true)
  })

  it('inferred AC default to proposed authority', () => {
    const c = refineCandidate({
      id: 'c2', sessionId: 's1', span: { seqStart: 0, seqEnd: 1 },
      kind: 'bug', authority: 'system_inferred',
      title: '修 bug', scope: [], nonGoals: [], constraints: [],
      acceptanceCriteria: [
        { text: '用户明确的验收', source: 'explicit_user', authority: 'confirmed', required: true },
        { text: '模型推断的验收', source: 'inferred', authority: 'confirmed', required: true },
      ],
      evidenceRefs: [], confidence: 0.8, decidedBy: 'rule', requests: [],
    })
    expect(c.acceptanceCriteria[0]!.authority).toBe('confirmed')
    expect(c.acceptanceCriteria[1]!.authority).toBe('proposed')
  })

  it('drops empty acceptance criteria', () => {
    const c = refineCandidate({
      id: 'c3', sessionId: 's1', span: { seqStart: 0, seqEnd: 1 },
      kind: 'docs', authority: 'system_inferred',
      title: '写文档', scope: [], nonGoals: [], constraints: [],
      acceptanceCriteria: [{ text: '  ', source: 'inferred', authority: 'proposed', required: true }],
      evidenceRefs: [], confidence: 0.5, decidedBy: 'rule', requests: [],
    })
    expect(c.acceptanceCriteria).toHaveLength(0)
  })

  describe('title self-sufficiency (P1)', () => {
    it('titleHasObject accepts titles with an explicit object', () => {
      expect(titleHasObject('更新 dsh-external/issues 的 issue 514 表述')).toBe(true)
      expect(titleHasObject('修复 OAuth 回调')).toBe(true)
      expect(titleHasObject('实现 involute 插件（方案C）')).toBe(true)
      expect(titleHasObject('调研任务管理产品如何用 AI 生成任务')).toBe(true)
      expect(titleHasObject('INV-58 实现侧边栏')).toBe(true)
      expect(titleHasObject('Install turtle-ui plugin')).toBe(true)
    })

    it('titleHasObject rejects bare verb phrases without an object', () => {
      expect(titleHasObject('调研一下')).toBe(false)
      expect(titleHasObject('分析看看')).toBe(false)
      expect(titleHasObject('更新')).toBe(false)
      expect(titleHasObject('确认')).toBe(false)
    })

    it('backfills an issue number from evidence into a bare title', () => {
      const c = refineCandidate({
        id: 'c4', sessionId: 's1', span: { seqStart: 0, seqEnd: 1 },
        kind: 'docs', authority: 'system_inferred',
        title: '更新表述', scope: [], nonGoals: [], constraints: [],
        acceptanceCriteria: [], evidenceRefs: [], confidence: 0.7,
        decidedBy: 'rule', requests: ['更新 https://github.com/dsh-external/issues/issues/514 的 issue 表述'],
      })
      expect(c.title).toMatch(/514/)
      expect(c.title).toContain('更新')
    })

    it('de-ranks confidence when no object can be backfilled', () => {
      const c = refineCandidate({
        id: 'c5', sessionId: 's1', span: { seqStart: 0, seqEnd: 1 },
        kind: 'investigation', authority: 'system_inferred',
        title: '调研一下', scope: [], nonGoals: [], constraints: [],
        acceptanceCriteria: [], evidenceRefs: [], confidence: 0.9,
        decidedBy: 'rule', requests: ['调研一下'],
      })
      expect(c.confidence).toBeLessThanOrEqual(0.25)
    })
  })
})

describe('candidate fallback (no LLM)', () => {
  it('candidateFromSpan produces a plain rule candidate', () => {
    const span = {
      id: 'span_s1_0', sessionId: 's1', seqStart: 0, seqEnd: 5,
      leadRequest: '研究多 session 通讯机制',
      requests: ['研究多 session 通讯机制', '继续查'],
      openedBy: ['session-start'], interruptedCount: 0, todoResetCount: 0, idleBeforeMs: 0,
    }
    const c = candidateFromSpan(span)
    expect(c.decidedBy).toBe('rule')
    expect(c.title).toContain('研究多 session')
    expect(c.evidenceRefs.length).toBe(2)
  })

  it('synthesizeCandidate degrades (undefined) without an LLM service', async () => {
    const span = {
      id: 'span_s1_0', sessionId: 's1', seqStart: 0, seqEnd: 5,
      leadRequest: 'x', requests: ['x'], openedBy: ['session-start'],
      interruptedCount: 0, todoResetCount: 0, idleBeforeMs: 0,
    }
    const c = await synthesizeCandidate(newCtx(), { provider: 'x', model: 'y', span })
    expect(c).toBeUndefined()
  })
})

describe('aggregateSpans (over-segmentation fix)', () => {
  const mkSpan = (id: string, seqStart: number, lead: string, reqs: string[], seqEnd?: number): any => ({
    id, sessionId: 's1', seqStart, seqEnd: seqEnd ?? seqStart, leadRequest: lead, requests: reqs,
    openedBy: ['topic-marker'], interruptedCount: 0, todoResetCount: 0, idleBeforeMs: 0,
  })

  it('merges a continuation-step span into the previous work line', async () => {
    const spans = [
      mkSpan('a', 0, '接入 runSync', ['接入 runSync']),
      mkSpan('b', 100, '继续查', ['继续查']),
    ]
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(1)
    expect(agg[0]!.requests).toEqual(['接入 runSync', '继续查'])
  })

  it('merges a short question/feedback span (step, not new task)', async () => {
    const spans = [
      mkSpan('a', 0, '调研任务状态机', ['调研任务状态机信号设计']),
      mkSpan('b', 100, '结论怎么样了', ['结论怎么样了']),
    ]
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(1)
  })

  it('keeps distinct-topic spans separate', async () => {
    const spans = [
      mkSpan('a', 0, '调研任务状态机', ['调研任务状态机信号设计 todo/in_progress']),
      mkSpan('b', 100, '修复 OAuth 回调', ['修复 OAuth 回调并补测试']),
    ]
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(2)
  })

  it('merges spans with high token overlap', async () => {
    const spans = [
      mkSpan('a', 0, '修复重启后无法自动拉回的问题', ['修复重启后无法自动拉回的问题']),
      mkSpan('b', 100, '修复重启拉回问题', ['修复重启拉回问题']),
    ]
    expect(spanOverlap(spans[0]!, spans[1]!)).toBeGreaterThan(0.5)
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(1)
  })

  it('uses the LLM judge for ambiguous adjacent pairs when provided', async () => {
    // Disjoint content (no overlap, not a continuation hint) → deterministic
    // paths skip, judge is consulted.
    const spans = [
      mkSpan('a', 0, '部署 Kubernetes 集群', ['部署 Kubernetes 集群到生产环境']),
      mkSpan('b', 100, '迁移数据库到 PostgreSQL', ['迁移数据库到 PostgreSQL']),
    ]
    const judge = vi.fn().mockResolvedValue(true) // LLM says SAME_TASK
    const agg = await aggregateSpans(spans, { judge })
    expect(judge).toHaveBeenCalled()
    expect(agg).toHaveLength(1)
  })

  it('does NOT swallow an unrelated short span via whole-span char-set inflation', async () => {
    // Regression (6c5c0b49): a 22-request research span swallowed
    // "重启了，slot a，你看看" because its char set had grown to overlap ANY
    // short follow-up. Overlap must be judged on LEAD requests + stop words.
    const spans = [
      mkSpan('a', 0, '看了一下，issue提取的质量不高', [
        '看了一下，issue提取的质量不高',
        '你交给research agent跑一轮',
        '结论怎么样了',
        '再看一个另外的research # 研究结论',
        '再参考一瓶 # dsh-track v2 研究报告',
        'p2',
      ]),
      mkSpan('b', 100, '重启了，slot a，你看看', ['重启了，slot a，你看看']),
    ]
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(2)
  })

  it('hint must OPEN the request — mid-sentence "看看" is not a step', async () => {
    // Regression: "重启了，slot a，你看看" contains 看看 mid-sentence; a bare
    // `includes` match wrongly treated it as a continuation step of ANY line.
    const spans = [
      mkSpan('a', 0, '接入 runSync 并验证', ['接入 runSync 并验证']),
      mkSpan('b', 100, '重启了，slot a，你看看', ['重启了，slot a，你看看']),
    ]
    const agg = await aggregateSpans(spans)
    expect(agg).toHaveLength(2)
  })
})
