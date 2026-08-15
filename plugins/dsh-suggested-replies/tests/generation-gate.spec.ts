/** Tests for per-session generation freshness and cancellation. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationGate } from '../src/generation-gate.ts'

afterEach(() => { vi.useRealTimers() })

describe('GenerationGate', () => {
  it('cancels an older lease when a newer one starts', () => {
    const gate = new GenerationGate()
    const first = gate.start('session', 1_000)
    const second = gate.start('session', 1_000)
    expect(first.signal.aborted).toBe(true)
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
    gate.dispose()
  })

  it('cancels one active session and leaves another current', () => {
    const gate = new GenerationGate()
    const first = gate.start('a', 1_000)
    const second = gate.start('b', 1_000)
    expect(gate.cancel('a')).toBe(true)
    expect(first.signal.aborted).toBe(true)
    expect(gate.isCurrent(second)).toBe(true)
    expect(gate.cancel('missing')).toBe(false)
    gate.dispose()
  })

  it('aborts after the configured timeout while retaining ownership for failure cleanup', () => {
    vi.useFakeTimers()
    const gate = new GenerationGate()
    const lease = gate.start('session', 50)
    vi.advanceTimersByTime(50)
    expect(lease.signal.aborted).toBe(true)
    expect(gate.isCurrent(lease)).toBe(false)
    expect(gate.owns(lease)).toBe(true)
    expect(gate.release(lease)).toBe(true)
  })

  it('does not let a stale lease release a newer generation', () => {
    const gate = new GenerationGate()
    const first = gate.start('session', 1_000)
    const second = gate.start('session', 1_000)
    expect(gate.release(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
    expect(gate.release(second)).toBe(true)
    expect(gate.owns(second)).toBe(false)
  })

  it('disposes every active lease', () => {
    const gate = new GenerationGate()
    const first = gate.start('a', 1_000)
    const second = gate.start('b', 1_000)
    expect(gate.cancelAll().sort()).toEqual(['a', 'b'])
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
    gate.dispose()
  })
})
