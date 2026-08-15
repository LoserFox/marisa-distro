import { describe, expect, it, vi } from 'vitest'
import { createToastTimer, type ToastTimerHost } from '../src/client/toast-timer.ts'

function host() {
  let now = 0
  let callback: (() => void) | undefined
  let delay = 0
  const timerHost: ToastTimerHost = {
    now: () => now,
    set: (next, ms) => { callback = next; delay = ms; return next },
    clear: handle => { if (callback === handle) callback = undefined },
  }
  return { timerHost, advance: (ms: number) => { now += ms }, fire: () => { callback?.() }, delay: () => delay, active: () => callback !== undefined }
}

describe('toast timer', () => {
  it('auto-dismisses after the configured duration', () => {
    const clock = host()
    const dismiss = vi.fn()
    const timer = createToastTimer(8000, dismiss, clock.timerHost)
    timer.arm()
    expect(clock.delay()).toBe(8000)
    clock.fire()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('pauses on hover and resumes with remaining time', () => {
    const clock = host()
    const timer = createToastTimer(8000, vi.fn(), clock.timerHost)
    timer.arm()
    clock.advance(3000)
    timer.pause()
    expect(clock.active()).toBe(false)
    timer.resume()
    expect(clock.delay()).toBe(5000)
  })

  it('cancels manual dismissal and resets when re-armed', () => {
    const clock = host()
    const timer = createToastTimer(8000, vi.fn(), clock.timerHost)
    timer.arm()
    clock.advance(6000)
    timer.cancel()
    expect(clock.active()).toBe(false)
    timer.arm()
    expect(clock.delay()).toBe(8000)
  })
})
