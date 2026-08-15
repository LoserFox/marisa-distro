/**
 * Conversation-activity ledger: exchange windows, working windows, inbound
 * working flags, decay, and disposal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  A2aActivityTracker,
  CONVERSATION_WINDOW_MS,
  PEER_WORKING_WINDOW_MS,
} from '../src/activity.ts'

describe('A2aActivityTracker', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('marks both sides conversing after a send and decays back to idle', () => {
    const changes = vi.fn()
    const tracker = new A2aActivityTracker(changes)
    tracker.noteSent(['web'])
    expect(tracker.selfActivity(false)).toBe('conversing')
    expect(tracker.peerActivity('web')).toBe('conversing')
    expect(changes).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CONVERSATION_WINDOW_MS - 1)
    expect(tracker.peerActivity('web')).toBe('conversing')

    vi.advanceTimersByTime(2)
    expect(tracker.peerActivity('web')).toBe('idle')
    expect(tracker.selfActivity(false)).toBe('idle')
    expect(changes).toHaveBeenCalledTimes(2)
  })

  it('shows a delivered recipient working until the window ends; failures do not', () => {
    const tracker = new A2aActivityTracker(() => {})
    tracker.noteSent(['web'])
    tracker.noteDelivery('web', true)
    expect(tracker.peerActivity('web')).toBe('working')

    vi.advanceTimersByTime(CONVERSATION_WINDOW_MS)
    expect(tracker.peerActivity('web')).toBe('working')

    vi.advanceTimersByTime(PEER_WORKING_WINDOW_MS - CONVERSATION_WINDOW_MS + 1)
    expect(tracker.peerActivity('web')).toBe('idle')

    tracker.noteSent(['web'])
    tracker.noteDelivery('web', false)
    expect(tracker.peerActivity('web')).toBe('conversing')
  })

  it('stops showing a peer working once it answers', () => {
    const tracker = new A2aActivityTracker(() => {})
    tracker.noteSent(['web'])
    tracker.noteDelivery('web', true)
    tracker.noteReceived('web')
    expect(tracker.peerActivity('web')).toBe('conversing')
  })

  it('keeps the local presence working while the agent runs on an inbound message', () => {
    const tracker = new A2aActivityTracker(() => {})
    tracker.noteReceived('web')
    expect(tracker.selfActivity(false)).toBe('conversing')
    expect(tracker.selfActivity(true)).toBe('working')
    tracker.noteIdle()
    expect(tracker.selfActivity(true)).toBe('conversing')
  })

  it('ignores every note after disposal and fires no changes', () => {
    const changes = vi.fn()
    const tracker = new A2aActivityTracker(changes)
    tracker.dispose()
    tracker.noteSent(['web'])
    tracker.noteReceived('web')
    tracker.noteDelivery('web', true)
    tracker.noteIdle()
    expect(changes).not.toHaveBeenCalled()
    expect(tracker.peerActivity('web')).toBe('idle')
    expect(tracker.selfActivity(true)).toBe('idle')
  })
})
