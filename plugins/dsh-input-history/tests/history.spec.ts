/**
 * Pure-logic specs for the input-history state machine: history extraction
 * (kind filter, text join, blank skip, adjacent dedup) and the browse
 * transitions (enter/oldest/newest/live-restore) plus re-sync on external
 * draft changes.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import { down, extractHistory, IDLE, resync, textOf, up } from '../src/client/history.ts'

/** One user node with the given text blocks. */
function user(text: string): ConversationNode {
  return { kind: 'user', seq: 0, time: 0, content: [{ type: 'text', text }], source: undefined }
}

/** One non-user node that must be skipped. */
function assistant(): ConversationNode {
  return { kind: 'assistant', seq: 0, time: 0, turn: 1, step: 1, blocks: [] }
}

describe('textOf', () => {
  it('concatenates text blocks and ignores non-text blocks', () => {
    expect(textOf([
      { type: 'text', text: 'a' },
      { type: 'tool-call', name: 'x', arguments: '{}' },
      { type: 'text', text: 'b' },
    ])).toBe('ab')
  })

  it('skips text fields that are not strings', () => {
    expect(textOf([{ type: 'text', text: 42 }, { type: 'other', text: 'x' }])).toBe('')
  })
})

describe('extractHistory', () => {
  it('collects user messages in order, newest last', () => {
    expect(extractHistory([user('one'), assistant(), user('two'), user('three')]))
      .toEqual(['one', 'two', 'three'])
  })

  it('skips blank messages', () => {
    expect(extractHistory([user('  '), user('ok')])).toEqual(['ok'])
  })

  it('collapses adjacent duplicates but keeps non-adjacent ones', () => {
    expect(extractHistory([user('x'), user('x'), user('y'), user('x')]))
      .toEqual(['x', 'y', 'x'])
  })
})

describe('up (Ctrl+Up)', () => {
  const history = ['a', 'b']

  it('enters recall from live and fills the newest entry, saving the draft', () => {
    const step = up(history, 'draft', IDLE)
    expect(step).toEqual({ browse: { index: 1, savedDraft: 'draft' }, text: 'b' })
  })

  it('walks older on subsequent presses', () => {
    const first = up(history, 'draft', IDLE)
    const second = up(history, 'b', first.browse)
    expect(second).toEqual({ browse: { index: 0, savedDraft: 'draft' }, text: 'a' })
  })

  it('stops at the oldest entry', () => {
    const atOldest = up(history, 'a', { index: 0, savedDraft: '' })
    expect(atOldest).toEqual({ browse: { index: 0, savedDraft: '' }, text: null })
  })

  it('does nothing without history', () => {
    expect(up([], 'draft', IDLE)).toEqual({ browse: IDLE, text: null })
  })

  it('saves an empty live draft as empty', () => {
    const step = up(history, '', IDLE)
    expect(step.browse.savedDraft).toBe('')
  })
})

describe('down (Ctrl+Down)', () => {
  const history = ['a', 'b']

  it('does nothing while live', () => {
    expect(down(history, IDLE)).toEqual({ browse: IDLE, text: null })
  })

  it('walks newer from a recalled entry', () => {
    const step = down(history, { index: 0, savedDraft: 'draft' })
    expect(step).toEqual({ browse: { index: 1, savedDraft: 'draft' }, text: 'b' })
  })

  it('returns to live at the newest entry and restores the saved draft', () => {
    const step = down(history, { index: 1, savedDraft: 'draft' })
    expect(step).toEqual({ browse: IDLE, text: 'draft' })
  })

  it('restores an empty saved draft as empty', () => {
    const step = down(history, { index: 1, savedDraft: '' })
    expect(step).toEqual({ browse: IDLE, text: '' })
  })
})

describe('resync', () => {
  const history = ['a', 'b']

  it('keeps the browse state while the draft still equals the shown entry', () => {
    const browse = { index: 1, savedDraft: 'draft' }
    expect(resync(history, 'b', browse)).toBe(browse)
  })

  it('drops the browse state when the draft diverges (typing / send / paste)', () => {
    expect(resync(history, 'b-edited', { index: 1, savedDraft: 'draft' })).toBe(IDLE)
  })

  it('drops the browse state when a send clears the draft', () => {
    expect(resync(history, '', { index: 1, savedDraft: 'draft' })).toBe(IDLE)
  })

  it('keeps live state untouched', () => {
    expect(resync(history, 'anything', IDLE)).toBe(IDLE)
  })
})
