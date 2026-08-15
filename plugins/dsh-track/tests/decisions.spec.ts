/**
 * Decision ledger tests — the 2026-08-12 decision-persistence feature:
 * report_decision_point persists to the KV decisions table, the returned text
 * carries a stable pointer, track_respond_decision records the user's answer
 * (idempotent, dismissed support), and track_list_decisions reads it back.
 *
 * Follows the integration spec pattern: real storage hub + json backend +
 * tools registry + applied plugin, then exercises the store directly.
 * @module tests/decisions.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import Storage from '@deepseek-ai/dsh-storage'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { apply as applyStorageJson } from '@deepseek-ai/dsh-storage-json'
import { apply as applyTrack, trackStore, formatDecisionRaised } from '../src/index.ts'
import { makeId } from '../src/store.ts'

describe('decision ledger', () => {
  let ctx: Context
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'track-dec-'))
    ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRegistry)
    applyTrack(ctx, { teamKey: 'INV' } as never)
    applyStorageJson(ctx, { root: dir })
    const deadline = Date.now() + 5000
    while (!trackStore.isOpen && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(trackStore.isOpen).toBe(true)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('registers the decision tools on ctx.tools', () => {
    const registry = ctx.tools as unknown as { get: (name: string) => unknown }
    for (const name of ['report_decision_point', 'track_respond_decision', 'track_list_decisions']) {
      expect(registry.get(name), `tool ${name} should be registered`).toBeDefined()
    }
  })

  it('round-trips a decision through the real unit', async () => {
    const decision = {
      id: makeId('decision'),
      sessionId: 'session-dec-1',
      question: '用框架 A 还是 B？',
      options: ['A', 'B'],
      aiPreference: 'A',
      aiRationale: 'A 更简单',
      impact: '影响架构',
      need: 'choose' as const,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }
    await trackStore.upsertDecision(decision)
    const got = await trackStore.getDecision(decision.id)
    expect(got?.question).toBe('用框架 A 还是 B？')
    expect(got?.status).toBe('pending')
  })

  it('lists decisions newest-first and filters by state / since / session', async () => {
    const now = Date.now()
    const mk = (id: string, sessionId: string, status: 'pending' | 'answered' | 'dismissed', offsetMs: number) => ({
      id: makeId('decision'),
      sessionId,
      question: `q-${id}`,
      options: ['y', 'n'],
      aiPreference: 'y',
      aiRationale: 'r',
      impact: '',
      need: 'confirm' as const,
      status,
      answer: status === 'answered' ? 'y' : undefined,
      createdAt: new Date(now + offsetMs).toISOString(),
    })
    await trackStore.upsertDecision(mk('d1', 's1', 'pending', 0))
    await trackStore.upsertDecision(mk('d2', 's1', 'answered', 1000))
    await trackStore.upsertDecision(mk('d3', 's2', 'pending', 2000))

    const all = await trackStore.listDecisions()
    // Newest first — the store may hold decisions from earlier tests, so
    // assert the ordering of THIS test's entries rather than exact length.
    expect(all.slice(0, 3).map((d) => d.question)).toEqual(['q-d3', 'q-d2', 'q-d1'])

    const answered = await trackStore.listDecisions('answered')
    expect(answered.map((d) => d.question)).toEqual(['q-d2'])

    const session1 = await trackStore.listDecisions(undefined, undefined, 's1')
    expect(session1.map((d) => d.question).sort()).toEqual(['q-d1', 'q-d2'])

    const since = await trackStore.listDecisions(undefined, now + 500)
    expect(since.map((d) => d.question)).toEqual(['q-d3', 'q-d2'])
  })

  it('formatDecisionRaised renders a stable pointer in the transcript text', () => {
    const decision = {
      id: 'track_decision_abc123',
      sessionId: 's',
      question: '要动数据库 schema 吗？',
      options: ['值得', '不值得'],
      aiPreference: '值得',
      aiRationale: '长期收益',
      impact: '不可逆成本',
      need: 'confirm' as const,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }
    const text = formatDecisionRaised(decision)
    expect(text).toContain('Decision recorded: track_decision_abc123')
    expect(text).toContain('要动数据库 schema 吗？')
    expect(text).toContain('track_respond_decision')
  })

  it('answer recording flips a pending decision to answered with the user choice', async () => {
    const decision = {
      id: makeId('decision'),
      sessionId: 'session-dec-2',
      question: '扫码登录可以吗？',
      options: ['可以', '不可以'],
      aiPreference: '可以',
      aiRationale: '方便',
      impact: '',
      need: 'confirm' as const,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }
    await trackStore.upsertDecision(decision)
    const updated = {
      ...decision,
      status: 'answered' as const,
      answer: '可以',
      rationale: '用户说确定，扫码方便',
      answeredBy: 'user' as const,
      answeredAt: new Date().toISOString(),
    }
    await trackStore.upsertDecision(updated)
    const got = await trackStore.getDecision(decision.id)
    expect(got?.status).toBe('answered')
    expect(got?.answer).toBe('可以')
    expect(got?.answeredBy).toBe('user')
    expect(got?.rationale).toContain('扫码方便')
  })

  it('dismissal records as dismissed', async () => {
    const decision = {
      id: makeId('decision'),
      sessionId: 'session-dec-3',
      question: '要不要现在重构？',
      options: ['现在', '以后'],
      aiPreference: '以后',
      aiRationale: '先发功能',
      impact: '',
      need: 'confirm' as const,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }
    await trackStore.upsertDecision(decision)
    const dismissed = {
      ...decision,
      status: 'dismissed' as const,
      answer: 'dismissed',
      answeredBy: 'user' as const,
      answeredAt: new Date().toISOString(),
    }
    await trackStore.upsertDecision(dismissed)
    const got = await trackStore.getDecision(decision.id)
    expect(got?.status).toBe('dismissed')
  })

  it('funnel reports decision counts and answer rate', async () => {
    const funnel = await trackStore.funnel()
    expect(funnel.decisions.pending).toBeGreaterThanOrEqual(2)
    expect(funnel.decisions.answered).toBeGreaterThanOrEqual(2)
    expect(funnel.decisions.dismissed).toBeGreaterThanOrEqual(1)
    expect(funnel.decisions.answerRate).toBeGreaterThan(0)
    expect(typeof funnel.decisions.answerRate).toBe('number')
  })
})
