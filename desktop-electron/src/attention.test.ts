import { describe, expect, it } from 'vitest'
import { AttentionManager, type AttentionWindow, type AttentionBadge } from '../src/attention.ts'

function makeHarness(focused: boolean) {
  const flashes: boolean[] = []
  const badges: number[] = []
  const window: AttentionWindow = {
    isFocused: () => focused,
    flashFrame: f => { flashes.push(f) },
  }
  const badge: AttentionBadge = { setBadgeCount: c => { badges.push(c) } }
  return { flashes, badges, window, badge }
}

describe('AttentionManager (anywhere notifyAttention/clearAttention port)', () => {
  it('focused window → suppress (no count, no flash, no badge)', () => {
    const h = makeHarness(true)
    const m = new AttentionManager('linux', h.window, h.badge)
    expect(m.escalate()).toBe(false)
    expect(m.attentionCount).toBe(0)
    expect(h.badges).toEqual([])
    expect(h.flashes).toEqual([])
  })
  it('unfocused linux/darwin → cumulative badge', () => {
    const h = makeHarness(false)
    const m = new AttentionManager('linux', h.window, h.badge)
    expect(m.escalate()).toBe(true)
    expect(m.escalate()).toBe(true)
    expect(h.badges).toEqual([1, 2])
    expect(h.flashes).toEqual([])
  })
  it('unfocused win32 → flashFrame(true), no badge', () => {
    const h = makeHarness(false)
    const m = new AttentionManager('win32', h.window, h.badge)
    expect(m.escalate()).toBe(true)
    expect(h.flashes).toEqual([true])
    expect(h.badges).toEqual([])
  })
  it('clear() resets badge/flash and is a no-op at zero', () => {
    const h = makeHarness(false)
    const m = new AttentionManager('darwin', h.window, h.badge)
    m.escalate()
    m.escalate()
    m.clear()
    expect(m.attentionCount).toBe(0)
    expect(h.badges).toEqual([1, 2, 0])
    m.clear() // no-op
    expect(h.badges).toEqual([1, 2, 0])
  })
  it('win32 clear() flashes false', () => {
    const h = makeHarness(false)
    const m = new AttentionManager('win32', h.window, h.badge)
    m.escalate()
    m.clear()
    expect(h.flashes).toEqual([true, false])
  })
})
