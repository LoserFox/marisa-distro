// @vitest-environment jsdom
// GenUI v2.7 durable interaction state:
// 1) interaction-store: save/load/clear/fingerprint/LRU;
// 2) GenuiBlock restores answers + lock + field values after remount
//    (refresh / replay simulation) — seed for re-renders of same content;
// 3) different content fingerprint → fresh state;
// 4) Enter / Ctrl+Enter submit the field value immediately;
// 5) fields with id are collected into the submit fallback payload.
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenuiActionContext } from '../src/client/action-context.ts'
import { GenuiBlock, GENUI_ACTION_DEBOUNCE_MS } from '../src/client/GenuiBlock.tsx'
import { fingerprint, loadBlockState, saveBlockState, clearBlockState } from '../src/client/interaction-store.ts'

/** 300ms durable-save debounce (see GenuiBlock). */
const SAVE_MS = 300

const paper = {
  items: [
    { type: 'radio', label: '1. 9+6=？', group: 'q1', answer: 1, explanation: '个位相加', options: ['14', '15', '16'] },
    { type: 'radio', label: '2. 首都是？', group: 'q2', answer: '北京', explanation: '北京是首都', options: ['上海', '广州', '北京'] },
    { type: 'submit', label: '交卷', action: 'grade', groups: ['q1', 'q2'] },
  ],
}

function renderBlock(spec: unknown, stateKey: string | undefined, onAction?: (a: string, p: Record<string, unknown>) => void) {
  return render(
    <GenuiActionContext.Provider value={onAction ?? (() => {})}>
      <GenuiBlock spec={spec as never} stateKey={stateKey} />
    </GenuiActionContext.Provider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers()
})

describe('v2.7: interaction-store', () => {
  it('round-trips state and fingerprints deterministically', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'))
    saveBlockState('k:1', { answers: { q1: 'B' }, locked: true, fields: { name: '阿' } })
    expect(loadBlockState('k:1')).toEqual({ answers: { q1: 'B' }, locked: true, fields: { name: '阿' } })
    clearBlockState('k:1')
    expect(loadBlockState('k:1')).toBeNull()
  })

  it('keeps different keys isolated and evicts LRU beyond the cap', () => {
    saveBlockState('a', { answers: { q: 'x' } })
    saveBlockState('b', { answers: { q: 'y' } })
    expect(loadBlockState('a')).toEqual({ answers: { q: 'x' } })
    // 205 writes with the 200-block cap: the oldest (a) falls off, the newest survive
    for (let i = 0; i < 205; i++) saveBlockState(`bulk:${i}`, { answers: { q: String(i) } })
    expect(loadBlockState('a')).toBeNull()
    expect(loadBlockState('bulk:204')).not.toBeNull()
  })
})

describe('v2.7: durable restore (refresh / replay)', () => {
  it('restores radio answers, lock and grade panel after remount with the same stateKey', () => {
    const KEY = 't:paper:1'
    const first = renderBlock(paper, KEY)
    const groups = first.container.querySelectorAll('[role="radiogroup"]')
    fireEvent.click(groups[0]!.querySelectorAll('input')[1]!) // q1: 15 ✓
    fireEvent.click(groups[1]!.querySelectorAll('input')[2]!) // q2: 北京 ✓
    fireEvent.click(first.container.querySelector('[class*="submitRow"] button')!) // 交卷 → local grade
    act(() => { vi.advanceTimersByTime(SAVE_MS) }) // durable save settles
    first.unmount()

    // "refresh": a brand-new mount with the same stateKey restores everything
    const second = renderBlock(paper, KEY)
    const inputs = [...second.container.querySelectorAll('[role="radiogroup"] input')] as HTMLInputElement[]
    expect(inputs[1]!.checked).toBe(true) // q1: 15 restored
    expect(inputs[5]!.checked).toBe(true) // q2: 北京 restored
    expect(inputs.every(i => i.disabled)).toBe(true) // graded → locked
    expect(second.container.querySelector('[data-genui-grade]')!.textContent).toContain('2 / 2')
  })

  it('restores field values into inputs with an id', () => {
    const KEY = 't:form:1'
    const spec = { items: [{ type: 'input', id: 'name', label: '姓名', placeholder: '你的名字' }] }
    const first = renderBlock(spec, KEY)
    const input = first.container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '小明' } })
    act(() => { vi.advanceTimersByTime(SAVE_MS) })
    first.unmount()

    const second = renderBlock(spec, KEY)
    expect((second.container.querySelector('input') as HTMLInputElement).value).toBe('小明')
  })

  it('fresh content (different fingerprint) starts clean', () => {
    const KEY_A = 't:paper:a'
    const KEY_B = 't:paper:b'
    const first = renderBlock(paper, KEY_A)
    fireEvent.click(first.container.querySelectorAll('[role="radiogroup"] input')[1]!)
    fireEvent.click(first.container.querySelectorAll('[role="radiogroup"] input')[2]!)
    act(() => { vi.advanceTimersByTime(SAVE_MS) })
    first.unmount()

    // different stateKey (different content) → no restore, submit disabled
    const second = renderBlock(paper, KEY_B)
    const inputs = [...second.container.querySelectorAll('[role="radiogroup"] input')] as HTMLInputElement[]
    expect(inputs.some(i => i.checked)).toBe(false)
    expect((second.container.querySelector('[class*="submitRow"] button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a reset clears the durable state too', () => {
    const KEY = 't:paper:r'
    const first = renderBlock(paper, KEY)
    const groups = first.container.querySelectorAll('[role="radiogroup"]')
    fireEvent.click(groups[0]!.querySelectorAll('input')[1]!)
    fireEvent.click(groups[1]!.querySelectorAll('input')[2]!)
    fireEvent.click(first.container.querySelector('[class*="submitRow"] button')!)
    act(() => { vi.advanceTimersByTime(SAVE_MS) })
    // 重新作答 → cleared + saved
    fireEvent.click(first.container.querySelector('[data-genui-grade] button')!)
    act(() => { vi.advanceTimersByTime(SAVE_MS) })
    first.unmount()

    const second = renderBlock(paper, KEY)
    const inputs = [...second.container.querySelectorAll('[role="radiogroup"] input')] as HTMLInputElement[]
    expect(inputs.some(i => i.checked)).toBe(false)
    expect(second.container.querySelector('[data-genui-grade]')).toBeNull()
  })
})

describe('v2.7: form submit semantics', () => {
  it('input Enter submits the value immediately (submit:true)', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    const { container } = renderBlock(
      { items: [{ type: 'input', label: '搜索', action: 'search' }] },
      undefined,
      (a, p) => actions.push([a, p]),
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '生成式UI' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toEqual([['search', { type: 'input', value: '生成式UI', submit: true }]])
  })

  it('textarea Ctrl+Enter submits; plain Enter does not', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    const { container } = renderBlock(
      { items: [{ type: 'textarea', label: '备注', action: 'save-note' }] },
      undefined,
      (a, p) => actions.push([a, p]),
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '正文' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toHaveLength(0) // plain Enter keeps the newline
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toEqual([['save-note', { type: 'textarea', value: '正文', submit: true }]])
  })

  it('submit fallback collects fields with an id (fields-only form)', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    const { container } = renderBlock(
      { items: [
        { type: 'input', id: 'name', label: '姓名', action: 'n' },
        { type: 'input', id: 'email', label: '邮箱', action: 'e' },
        { type: 'submit', label: '提交', action: 'go' },
      ] },
      undefined,
      (a, p) => actions.push([a, p]),
    )
    const inputs = container.querySelectorAll('input') as NodeListOf<HTMLInputElement>
    fireEvent.change(inputs[0]!, { target: { value: '小明' } })
    fireEvent.change(inputs[1]!, { target: { value: 'a@b.c' } })
    const submit = container.querySelector('[class*="submitRow"] button') as HTMLButtonElement
    expect(submit.disabled).toBe(false) // fields-only form enables on any filled field
    fireEvent.click(submit)
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toEqual([['go', { type: 'submit', answers: {}, fields: { name: '小明', email: 'a@b.c' }, total: 2, answered: 2 }]])
  })

  it('submit fallback with radios AND fields carries both', () => {
    const actions: Array<[string, Record<string, unknown>]> = []
    const { container } = renderBlock(
      { items: [
        { type: 'radio', label: '第1题', group: 'q1', options: ['A', 'B'] },
        { type: 'input', id: 'note', label: '备注' },
        { type: 'submit', label: '交卷', action: 'grade', groups: ['q1'] },
      ] },
      undefined,
      (a, p) => actions.push([a, p]),
    )
    fireEvent.click(container.querySelectorAll('[role="radiogroup"] input')[1]!)
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: '已核对' } })
    fireEvent.click(container.querySelector('[class*="submitRow"] button')!)
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(actions).toEqual([['grade', {
      type: 'submit', answers: { q1: 'B' }, fields: { note: '已核对' }, total: 1, answered: 1,
    }]])
  })
})
