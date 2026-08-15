/**
 * Unit tests for the live token-rate derivations: the weighted-char measure,
 * the self-calibrating density from settled provider usage, the streamed
 * estimate, the decode-window rate, and the compact formatter. Pure
 * functions — no React, no framework state, no DOM.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationNode, PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import {
  formatTokenRate, latestTokenDensity, liveTokenRate, streamedTokenEstimate, weightedChars,
  weightedPartialChars,
} from '../src/client/token-rate.ts'

function partialOf(blocks: PartialAssistant['blocks']): PartialAssistant {
  return { turn: 1, step: 1, blocks }
}

function assistantNode(blocks: PartialAssistant['blocks'], outputTokens: number | undefined): ConversationNode {
  return {
    kind: 'assistant',
    seq: 1,
    time: 1_000,
    turn: 1,
    step: 1,
    blocks,
    ...(outputTokens === undefined ? {} : { usage: { outputTokens } }),
  } as ConversationNode
}

describe('weightedChars / weightedPartialChars', () => {
  it('measures nothing when the model is not emitting', () => {
    expect(weightedPartialChars(null)).toBe(0)
  })

  it('measures nothing for an empty or content-free partial', () => {
    expect(weightedPartialChars(partialOf([]))).toBe(0)
    expect(weightedPartialChars(partialOf([{ kind: 'text', text: '' }]))).toBe(0)
  })

  it('weights narrow text at 0.25 per char (4 chars ≈ 1 token)', () => {
    expect(weightedChars([{ kind: 'text', text: 'abcd' }])).toBe(1)
    expect(weightedChars([{ kind: 'text', text: 'abcdefgh' }])).toBe(2)
    expect(weightedChars([{ kind: 'text', text: 'abcde' }])).toBe(1.25)
  })

  it('weights each CJK-wide character as one token', () => {
    // Han ideographs.
    expect(weightedChars([{ kind: 'text', text: '你好世界' }])).toBe(4)
    // Kana.
    expect(weightedChars([{ kind: 'text', text: 'こんにちは' }])).toBe(5)
    // Hangul.
    expect(weightedChars([{ kind: 'text', text: '안녕하세요' }])).toBe(5)
  })

  it('mixes wide and narrow characters', () => {
    // 2 wide + 3 narrow × 0.25 = 2.75.
    expect(weightedChars([{ kind: 'text', text: '你好abc' }])).toBe(2.75)
  })

  it('sums text and reasoning bodies', () => {
    const blocks: PartialAssistant['blocks'] = [
      { kind: 'reasoning', text: '思考' },
      { kind: 'text', text: 'answer' },
    ]
    expect(weightedChars(blocks)).toBe(2 + 1.5)
  })

  it('counts tool-call name and arguments, but not opaque blocks', () => {
    const blocks: PartialAssistant['blocks'] = [
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{"cmd":"ls"}' },
      { kind: 'other', block: { arbitrary: true } },
    ]
    // name "bash" = 4 narrow -> 1; args `{"cmd":"ls"}` = 12 narrow -> 3; total 4.
    expect(weightedChars(blocks)).toBe(4)
  })
})

describe('latestTokenDensity', () => {
  it('returns null before any usable step settled', () => {
    expect(latestTokenDensity([])).toBeNull()
    expect(latestTokenDensity([{ kind: 'user', seq: 1, time: 0, content: [], source: null } as ConversationNode])).toBeNull()
  })

  it('skips steps without usage, zero usage, or empty content', () => {
    const noUsage = assistantNode([{ kind: 'text', text: '你好世界' }], undefined)
    const zeroUsage = assistantNode([{ kind: 'text', text: '你好世界' }], 0)
    const empty = assistantNode([{ kind: 'text', text: '' }], 8)
    expect(latestTokenDensity([noUsage, zeroUsage, empty])).toBeNull()
  })

  it('derives tokens per weighted char from the latest usable step', () => {
    const step = assistantNode([{ kind: 'text', text: '你好世界' }], 8)
    expect(latestTokenDensity([step])).toBe(2)
  })

  it('scans backwards past unusable steps to the newest usable sample', () => {
    const older = assistantNode([{ kind: 'text', text: 'abcd' }], 4) // density 4
    const noUsage = assistantNode([{ kind: 'text', text: 'hello world' }], undefined)
    const newer = assistantNode([{ kind: 'text', text: '你好世界' }], 8) // density 2
    expect(latestTokenDensity([older, noUsage, newer])).toBe(2)
  })

  it('ignores non-assistant nodes', () => {
    const tool = {
      kind: 'tool-result', seq: 2, time: 0, callId: 'c', call: { name: 'bash', argsRaw: '' },
    } as ConversationNode
    const step = assistantNode([{ kind: 'text', text: 'abcd' }], 4)
    expect(latestTokenDensity([tool, step])).toBe(4)
  })
})

describe('streamedTokenEstimate', () => {
  it('estimates zero while nothing is emitting', () => {
    expect(streamedTokenEstimate(null, null)).toBe(0)
    expect(streamedTokenEstimate(partialOf([{ kind: 'text', text: '' }]), null)).toBe(0)
  })

  it('falls back to the weighted-char heuristic before calibration', () => {
    expect(streamedTokenEstimate(partialOf([{ kind: 'text', text: '你好世界' }]), null)).toBe(4)
    expect(streamedTokenEstimate(partialOf([{ kind: 'text', text: '你好abc' }]), null)).toBe(2.75)
  })

  it('scales the partial by the calibrated density', () => {
    expect(streamedTokenEstimate(partialOf([{ kind: 'text', text: '你好世界' }]), 2)).toBe(8)
    expect(streamedTokenEstimate(partialOf([{ kind: 'text', text: 'abcd' }]), 0.5)).toBe(0.5)
  })
})

describe('liveTokenRate', () => {
  it('stays null before the window opens or while empty', () => {
    expect(liveTokenRate(0, 1_000, 2_000)).toBeNull()
    expect(liveTokenRate(10, 2_000, 2_000)).toBeNull()
  })

  it('clamps a not-yet-open window to null', () => {
    expect(liveTokenRate(10, 2_000, 1_000)).toBeNull()
  })

  it('divides estimated tokens by the decode wall time', () => {
    expect(liveTokenRate(10, 0, 2_000)).toBe(5)
    expect(liveTokenRate(100, 0, 10_000)).toBe(10)
  })
})

describe('formatTokenRate', () => {
  it('shows one decimal below ten tokens per second', () => {
    expect(formatTokenRate(4.567)).toBe('4.6')
    expect(formatTokenRate(0)).toBe('0')
  })

  it('shows whole tokens from ten up', () => {
    expect(formatTokenRate(12.3)).toBe('12')
    expect(formatTokenRate(9.96)).toBe('10')
  })

  it('clamps negatives to zero', () => {
    expect(formatTokenRate(-3)).toBe('0')
  })
})
