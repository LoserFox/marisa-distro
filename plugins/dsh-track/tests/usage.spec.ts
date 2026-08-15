/**
 * LLM usage ledger tests — stream metering in sync/llm.ts (recorder capture
 * of usage/finish chunks), aggregation + cost estimation in usage.ts.
 * Keyless: the harness llm service is faked with hand-built chunk streams.
 * @module tests/usage.spec
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { assembleText, llmJson, setUsageRecorder, type UsageRecorder } from '../src/sync/llm.ts'
import type { LlmLike } from '../src/sync/llm.ts'
import { PRICING, estimateCost, formatUsageReport, priceFor, summarizeUsage } from '../src/usage.ts'
import type { LlmUsageRecord } from '../src/types.ts'

const OPTIONS = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  system: 'system',
  messages: [{ id: 'm1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: '@fakechris/dsh-track' } }],
} as never

/** Fake llm service yielding a hand-built chunk stream. */
function fakeLlm(chunks: StreamChunk[] | (() => AsyncIterable<StreamChunk>)): LlmLike {
  return {
    stream: async function* () {
      const iterable = typeof chunks === 'function' ? chunks() : chunks
      for (const c of iterable) yield c
    },
  }
}

/** Successful text stream with a usage chunk. */
const okChunks = (text: string): StreamChunk[] => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 80, reasoningTokens: 0 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

function collect(): { records: Array<Omit<LlmUsageRecord, 'id'>>; recorder: UsageRecorder } {
  const records: Array<Omit<LlmUsageRecord, 'id'>> = []
  const recorder: UsageRecorder = (r) => { records.push(r) }
  setUsageRecorder(recorder)
  return { records, recorder }
}

afterEach(() => setUsageRecorder(undefined))

describe('assembleText metering', () => {
  it('records usage + finish from the stream chunks', async () => {
    const { records } = collect()
    const text = await assembleText(fakeLlm(okChunks('{"a":1}')), OPTIONS, { label: 'intent', attempt: 1 })
    expect(text).toBe('{"a":1}')
    expect(records).toHaveLength(1)
    const r = records[0]!
    expect(r.label).toBe('intent')
    expect(r.attempt).toBe(1)
    expect(r.provider).toBe('deepseek-official')
    expect(r.model).toBe('deepseek-v4-flash')
    expect(r.ok).toBe(true)
    expect(r.finishKind).toBe('stop')
    expect(r.inputTokens).toBe(120)
    expect(r.outputTokens).toBe(30)
    expect(r.cacheReadTokens).toBe(80)
    expect(r.reasoningTokens).toBe(0)
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
    expect(r.at).toBeGreaterThan(0)
  })

  it('marks a tool-call-only stream as a failed call', async () => {
    const { records } = collect()
    const result = await assembleText(fakeLlm([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'fn', argumentsDelta: '{}' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call-1', name: 'fn', arguments: '{}' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]), OPTIONS, { label: 'synthesize', attempt: 1 })
    expect(result).toBeUndefined()
    expect(records).toHaveLength(1)
    expect(records[0]!.ok).toBe(false)
    expect(records[0]!.label).toBe('synthesize')
  })

  it('records a stream throw as an error-kind failed call', async () => {
    const { records } = collect()
    const boom: LlmLike = {
      stream: async function* () { throw new Error('provider down') },
    }
    const result = await assembleText(boom, OPTIONS, { label: 'relation', attempt: 1 })
    expect(result).toBeUndefined()
    expect(records).toHaveLength(1)
    expect(records[0]!.ok).toBe(false)
    expect(records[0]!.finishKind).toBe('error')
    expect(records[0]!.label).toBe('relation')
  })

  it('records max-tokens truncation as a failed finish', async () => {
    const { records } = collect()
    const text = '{"a":' // truncated JSON, finish=max-tokens
    await assembleText(fakeLlm([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 50, outputTokens: 1000 } },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ]), OPTIONS, { label: 'intent', attempt: 1 })
    expect(records[0]!.ok).toBe(true) // text non-empty → ok; truncation is a parse-level failure
    expect(records[0]!.finishKind).toBe('max-tokens')
  })
})

describe('llmJson metering across retries', () => {
  it('meters each attempt separately (one record per real request)', async () => {
    const { records } = collect()
    // Attempt 1: valid JSON text but wrong key → structural failure → retry.
    // Attempt 2: valid JSON with the required key → success.
    const attempts = [
      ['{"wrong":1}', 100, 10],
      ['{"intent":"requirement","confidence":0.9}', 100, 20],
    ] as const
    let n = 0
    const llm = fakeLlm(() => {
      const [text, input, output] = attempts[n++]!
      return okChunks(text).map((c) =>
        c.type === 'usage' ? { ...c, usage: { inputTokens: input, outputTokens: output } } : c)
    })
    const json = await llmJson(llm, {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      system: 'sys',
      prompt: 'p',
      requiredKeys: ['intent'],
      label: 'intent',
    })
    expect(json).toEqual({ intent: 'requirement', confidence: 0.9 })
    expect(records).toHaveLength(2)
    expect(records[0]!.attempt).toBe(1)
    expect(records[0]!.ok).toBe(true) // transport-level ok (text produced); parse failure is llmJson-level
    expect(records[1]!.attempt).toBe(2)
  })
})

describe('summarizeUsage', () => {
  const base: Omit<LlmUsageRecord, 'id' | 'at'> = {
    label: 'intent', provider: 'deepseek-official', model: 'deepseek-v4-flash',
    ok: true, finishKind: 'stop', durationMs: 100, attempt: 1,
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, reasoningTokens: 0,
  }
  const rec = (n: number, overrides: Partial<LlmUsageRecord> = {}): LlmUsageRecord => ({
    id: `track_usage_${n}`, at: 1_000_000 + n, ...base, ...overrides,
  })

  it('aggregates totals, per-model lines, and per-label counts', () => {
    const summary = summarizeUsage([
      rec(1),
      rec(2, { ok: false, finishKind: 'error', inputTokens: 0, outputTokens: 0 }),
      rec(3, { label: 'synthesize', model: 'deepseek-v4-pro', inputTokens: 500, outputTokens: 100 }),
    ])
    expect(summary.total.calls).toBe(3)
    expect(summary.total.ok).toBe(2)
    expect(summary.total.fail).toBe(1)
    expect(summary.total.inputTokens).toBe(600)
    expect(summary.total.outputTokens).toBe(120)
    expect(summary.total.cacheReadTokens).toBe(30)
    expect(summary.total.billedTokens).toBe(600 + 120 + 30)
    expect(summary.byModel).toHaveLength(2)
    expect(summary.byModel[0]!.model).toBe('deepseek-v4-pro') // sorted by billed desc: pro 600 > flash 130
    expect(summary.byLabel['intent']!.calls).toBe(2)
    expect(summary.byLabel['synthesize']!.calls).toBe(1)
    expect(summary.unpriced).toBe(false)
    expect(summary.total.costUsd).not.toBeNull()
  })

  it('honors the since window', () => {
    const summary = summarizeUsage([rec(1, { at: 1000 }), rec(2, { at: 5000 })], 2000)
    expect(summary.total.calls).toBe(1)
    expect(summary.since).toBe(2000)
  })

  it('flags unpriced routes without dropping token counts', () => {
    const summary = summarizeUsage([rec(1, { provider: 'unknown-prov', model: 'mystery-1' })])
    expect(summary.total.calls).toBe(1)
    expect(summary.total.costUsd).toBeNull()
    expect(summary.unpriced).toBe(true)
    expect(summary.byModel[0]!.costUsd).toBeNull()
  })

  it('empty ledger reports zero cost, not unpriced', () => {
    const summary = summarizeUsage([])
    expect(summary.total.calls).toBe(0)
    expect(summary.total.costUsd).toBe(0)
    expect(summary.unpriced).toBe(false)
  })
})

describe('estimateCost', () => {
  it('prices deepseek-v4-flash at the official flat rate (2026-08-01)', () => {
    const price = priceFor('deepseek-official', 'deepseek-v4-flash')
    expect(price).toEqual({ inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028 })
    const cost = estimateCost('deepseek-official', 'deepseek-v4-flash', {
      calls: 1, ok: 1, fail: 0,
      inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000, cacheWriteTokens: 0,
      reasoningTokens: 0, billedTokens: 3_000_000, durationMs: 0,
    })
    expect(cost).toBeCloseTo(0.14 + 0.28 + 0.0028, 6)
  })

  it('returns null for unknown routes', () => {
    expect(estimateCost('deepseek-official', 'deepseek-unknown', { calls: 1, ok: 1, fail: 0, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, billedTokens: 2, durationMs: 0 })).toBeNull()
  })

  it('PRICING table is non-empty and references the real v2 route', () => {
    expect(PRICING['deepseek-official']?.['deepseek-v4-flash']).toBeDefined()
  })
})

describe('formatUsageReport', () => {
  it('renders counts, tokens, cost, and per-model lines', () => {
    const summary = summarizeUsage([{
      id: 'track_usage_1', at: 1, label: 'intent', provider: 'deepseek-official',
      model: 'deepseek-v4-flash', ok: true, finishKind: 'stop', durationMs: 150,
      attempt: 1, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300,
    }])
    const report = formatUsageReport(summary)
    expect(report).toContain('calls: 1 (ok 1 / fail 0)')
    expect(report).toContain('input 1000')
    expect(report).toContain('cache read 300')
    expect(report).toContain('output 200')
    expect(report).toContain('est. cost: $')
    expect(report).toContain('deepseek-official/deepseek-v4-flash: 1 calls')
    expect(report).toContain('by label: intent 1')
  })
})
