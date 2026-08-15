/** Tests for prompt construction and strict candidate parsing. */
import { describe, expect, it } from 'vitest'
import type { Message } from '@deepseek-ai/dsh-llm'
import {
  buildSuggestedRepliesUserPrompt,
  buildSuggestionSystemPrompt,
  fallbackSuggestedReplies,
  parseSuggestedReplies,
} from '../src/suggestion-prompt.ts'

const limits = { suggestionCount: 3, maxSuggestionChars: 10 }

/** Build a provider-neutral test message with only the fields used by the prompt. */
function message(role: Message['role'], textBlocks: readonly string[], extras: object = {}): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role,
    content: [...textBlocks.map(text => ({ type: 'text' as const, text })), ...Object.values(extras) as never[]],
    source: role === 'assistant'
      ? { kind: 'model', provider: 'p', model: 'm' }
      : { kind: 'user' },
  }
}

describe('buildSuggestionSystemPrompt', () => {
  it('pins count and character limits in the model instruction', () => {
    const prompt = buildSuggestionSystemPrompt(limits)
    expect(prompt).toContain('exactly 3')
    expect(prompt).toContain('at most 10 characters')
    expect(prompt).toContain('"suggestions"')
  })
})

describe('buildSuggestedRepliesUserPrompt', () => {
  it('requires the latest meaningful message to be an assistant answer', () => {
    expect(buildSuggestedRepliesUserPrompt([])).toBeNull()
    expect(buildSuggestedRepliesUserPrompt([message('user', ['question'])])).toBeNull()
    expect(buildSuggestedRepliesUserPrompt([message('assistant', ['answer']), message('user', ['follow-up'])])).toBeNull()
  })

  it('keeps text blocks and excludes non-text blocks', () => {
    const prompt = buildSuggestedRepliesUserPrompt([
      message('user', ['请继续']),
      message('assistant', ['好的', '这里是结果'], { tool: { type: 'tool-call', id: 'secret', name: 'bash', arguments: '{}' } }),
    ])
    expect(prompt).toContain('User: 请继续')
    expect(prompt).toContain('Assistant: 好的 这里是结果')
    expect(prompt).not.toContain('secret')
  })
})

describe('parseSuggestedReplies', () => {
  it('accepts plain and fenced JSON', () => {
    expect(parseSuggestedReplies(JSON.stringify({ suggestions: ['a', 'b', 'c'] }), limits)).toEqual(['a', 'b', 'c'])
    expect(parseSuggestedReplies('```json\n{"suggestions":["a","b","c"]}\n```', limits)).toEqual(['a', 'b', 'c'])
  })

  it('normalizes whitespace and bounds candidates', () => {
    const result = parseSuggestedReplies(JSON.stringify({ suggestions: ['  a\n b  ', 'c', 'x'.repeat(20)] }), limits)
    expect(result).toEqual(['a b', 'c', 'xxxxxxxxxx'])
  })

  it.each([
    '', 'not json', JSON.stringify({}), JSON.stringify({ suggestions: ['a', 'b'] }),
    JSON.stringify({ suggestions: ['a', 2, 'c'] }), JSON.stringify({ suggestions: ['a', ' ', 'c'] }),
    JSON.stringify({ suggestions: ['a', 'A', 'c'] }),
    JSON.stringify({ suggestions: ['abcdefghijk-1', 'abcdefghijk-2', 'c'] }),
  ])('rejects malformed response %s', raw => {
    expect(parseSuggestedReplies(raw, limits)).toBeNull()
  })
})

describe('fallbackSuggestedReplies', () => {
  it('returns the configured count in the recent conversation language', () => {
    expect(fallbackSuggestedReplies('User: 你好', limits)).toEqual(['继续', '请详细说明一下', '给我一个具体例子'])
    expect(fallbackSuggestedReplies('User: Hello', { ...limits, suggestionCount: 2 }))
      .toEqual(['Continue', 'Could you'])
  })
})
