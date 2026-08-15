/**
 * Lifecycle state machine tests (Part B, 2026-08-12) — pure functions over
 * Issue + EvidenceRef[]: composite confidence, todo → in_progress auto-commit,
 * done/canceled confirmation gating, freshness window, abandonment.
 * @module tests/state-machine.spec
 */

import { describe, expect, it } from 'vitest'
import {
  ABANDON_MS,
  STALE_REVIEW_MS,
  SWEEP_WINDOW_MS,
  compositeConfidence,
  describeEvidence,
  evidenceWeight,
  freshSignals,
  isAutoCommit,
  nextInferred,
  sweepProposal,
} from '../src/lifecycle/state-machine.ts'
import type { Issue } from '../src/types.ts'

function makeIssue(partial: Partial<Issue> = {}): Issue {
  return {
    id: 'track_issue_t',
    identifier: 'INV-1',
    title: 't',
    description: '',
    priority: 2,
    state: 'todo',
    teamId: 'INV',
    labels: [],
    linkedSessionIds: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...partial,
  }
}

const ev = (signal: Parameters<typeof evidenceWeight>[0], at: number, pointer?: string, target?: Parameters<typeof evidenceWeight>[1]) => ({
  signal,
  at,
  weight: evidenceWeight(signal, target),
  pointer,
})

describe('compositeConfidence', () => {
  it('combines independent positive signals', () => {
    // activity (0.2) + turn-completed (0.3): 1 - 0.8*0.7 = 0.44
    expect(compositeConfidence([ev('activity', 0), ev('turn-completed', 1)])).toBeCloseTo(0.44, 5)
  })

  it('user-confirm saturates to 1.0', () => {
    expect(compositeConfidence([ev('user-confirm', 0)])).toBe(1)
  })

  it('penalties subtract and clamp at 0', () => {
    expect(compositeConfidence([ev('tool-error', 0)])).toBe(0) // negative → clamped
    const heavy = [ev('tool-error', 0), ev('tool-error', 1), ev('turn-error', 2), ev('turn-error', 3), ev('timeout', 4)]
    expect(compositeConfidence(heavy)).toBe(0)
  })
})

describe('nextInferred', () => {
  const now = 1_800_000_000_000

  it('todo → in_progress auto-commits with enough fresh evidence', () => {
    const issue = makeIssue({ state: 'todo' })
    // activity(0.2) ×2 + turn-completed(0.3) → 1 − 0.8·0.8·0.7 = 0.552 ≥ 0.5
    const signals = [ev('activity', now - 2000), ev('activity', now - 1000), ev('turn-completed', now)]
    const next = nextInferred(issue, signals, now)
    expect(next.inferred.state).toBe('in_progress')
    expect(isAutoCommit(next, issue)).toBe(true)
    expect(next.confirm).toBeUndefined()
  })

  it('todo stays todo with weak evidence', () => {
    const issue = makeIssue({ state: 'todo' })
    const next = nextInferred(issue, [ev('activity', now)], now)
    expect(next.inferred.state).toBe('todo')
    expect(isAutoCommit(next, issue)).toBe(false)
  })

  it('in_progress → done proposal requires todo-all-done + turn-completed and gates confirmation', () => {
    const issue = makeIssue({ state: 'in_progress' })
    const signals = [ev('todo-all-done', now - 2000), ev('turn-completed', now - 1000), ev('turn-completed', now)]
    const next = nextInferred(issue, signals, now)
    expect(next.inferred.state).toBe('done')
    expect(next.confirm?.to).toBe('done')
    expect(isAutoCommit(next, issue)).toBe(false) // never auto-commits done
  })

  it('user-confirm alone on in_progress produces a done proposal (still gated)', () => {
    const issue = makeIssue({ state: 'in_progress' })
    const next = nextInferred(issue, [ev('user-confirm', now)], now)
    expect(next.inferred.state).toBe('done')
    expect(next.confirm?.to).toBe('done')
  })

  it('penalties keep an in-progress issue from proposing done', () => {
    const issue = makeIssue({ state: 'in_progress' })
    const signals = [
      ev('todo-all-done', now - 2000),
      ev('turn-completed', now - 1000),
      ev('turn-error', now), // fresh penalty drags confidence down
    ]
    const next = nextInferred(issue, signals, now)
    expect(next.inferred.state).toBe('in_progress')
    expect(next.confirm).toBeUndefined()
  })

  it('abandonment proposes canceled (gated), never auto-cancels', () => {
    const issue = makeIssue({ state: 'in_progress', lastProgressAt: now - ABANDON_MS - 1000 })
    const next = nextInferred(issue, [ev('activity', now - ABANDON_MS - 1000)], now)
    expect(next.inferred.state).toBe('canceled')
    expect(next.confirm?.to).toBe('canceled')
    expect(isAutoCommit(next, issue)).toBe(false)
  })

  it('done/canceled issues do not get canceled proposals', () => {
    for (const state of ['done', 'canceled'] as const) {
      const issue = makeIssue({ state, lastProgressAt: now - ABANDON_MS - 1000 })
      const next = nextInferred(issue, [], now)
      expect(next.inferred.state).toBe(state)
      expect(next.confirm).toBeUndefined()
    }
  })

  it('model proposal for done carries zero weight (no done via propose)', () => {
    const issue = makeIssue({ state: 'in_progress' })
    const signals = [ev('model-propose', now, 'done', 'done')]
    const next = nextInferred(issue, signals, now)
    expect(next.inferred.state).toBe('in_progress')
    expect(next.confirm).toBeUndefined()
  })

  it('model proposal for in_progress counts toward auto-advance from todo', () => {
    const issue = makeIssue({ state: 'todo' })
    const signals = [ev('model-propose', now, 'in_progress', 'in_progress'), ev('activity', now - 1000)]
    const next = nextInferred(issue, signals, now)
    expect(next.inferred.state).toBe('in_progress')
  })
})

describe('freshSignals / describeEvidence', () => {
  it('drops signals outside the 24h window', () => {
    const now = 1_800_000_000_000
    const old = ev('activity', now - 25 * 3600 * 1000)
    const fresh = freshSignals([old, ev('activity', now - 1000)], now)
    expect(fresh).toHaveLength(1)
  })

  it('summarizes evidence for the confirm prompt', () => {
    const now = 1_800_000_000_000
    expect(describeEvidence([ev('todo-all-done', now), ev('turn-completed', now), ev('turn-completed', now - 1)]))
      .toBe('todo-all-done, turn-completed×2')
  })
})

describe('sweepProposal', () => {
  const now = 1_800_000_000_000

  it('proposes done from completion evidence even when older than 24h (7d sweep window)', () => {
    const issue = makeIssue({
      state: 'in_progress',
      inferred: {
        state: 'in_progress', confidence: 0.8,
        at: now - 2 * 86400_000, by: 'auto',
        evidence: [ev('todo-all-done', now - 2 * 86400_000), ev('turn-completed', now - 2 * 86400_000)],
      },
    })
    const p = sweepProposal(issue, now)
    expect(p?.to).toBe('done')
  })

  it('proposes done from user-confirm evidence (stale allowed)', () => {
    const issue = makeIssue({
      state: 'in_progress',
      inferred: {
        state: 'in_progress', confidence: 1,
        at: now - 3 * 86400_000, by: 'auto',
        evidence: [ev('user-confirm', now - 3 * 86400_000, '可以了')],
      },
    })
    expect(sweepProposal(issue, now)?.to).toBe('done')
  })

  it('proposes canceled for abandonment (no progress for 14d), even with no signals', () => {
    const issue = makeIssue({ state: 'in_progress', lastProgressAt: now - ABANDON_MS - 1000 })
    const p = sweepProposal(issue, now)
    expect(p?.to).toBe('canceled')
    expect(p?.reason).toContain('no progress')
  })

  it('returns nothing for todo/done/canceled issues', () => {
    for (const state of ['todo', 'done', 'canceled'] as const) {
      const issue = makeIssue({ state, lastProgressAt: now - ABANDON_MS - 1000 })
      expect(sweepProposal(issue, now)).toBeUndefined()
    }
  })

  it('proposes review for idle issues without evidence (zombie-task case)', () => {
    // No lastProgressAt, no evidence — sync-created issues look exactly like
    // this. Idle (by updatedAt) beyond STALE_REVIEW_MS but under ABANDON_MS.
    const issue = makeIssue({
      state: 'in_progress',
      updatedAt: new Date(now - 3 * 86400_000).toISOString(),
    })
    const p = sweepProposal(issue, now)
    expect(p?.to).toBe('review')
    expect(p?.reason).toContain('no progress')
  })

  it('uses updatedAt as the progress proxy when lastProgressAt is absent', () => {
    const fresh = makeIssue({ state: 'in_progress', updatedAt: new Date(now - 3600_000).toISOString() })
    expect(sweepProposal(fresh, now)).toBeUndefined()
    const stale = makeIssue({ state: 'in_progress', updatedAt: new Date(now - STALE_REVIEW_MS - 1000).toISOString() })
    expect(sweepProposal(stale, now)?.to).toBe('review')
  })

  it('completion evidence wins over the stale-review fallback', () => {
    const issue = makeIssue({
      state: 'in_progress',
      updatedAt: new Date(now - 10 * 86400_000).toISOString(), // long idle
      inferred: {
        state: 'in_progress', confidence: 0.8,
        at: now - 5 * 86400_000, by: 'auto',
        evidence: [ev('todo-all-done', now - 5 * 86400_000), ev('turn-completed', now - 5 * 86400_000)],
      },
    })
    expect(sweepProposal(issue, now)?.to).toBe('done')
  })

  it('penalties in the sweep window suppress a done proposal', () => {
    const issue = makeIssue({
      state: 'in_progress',
      lastProgressAt: now - 1000, // fresh progress — no review either
      inferred: {
        state: 'in_progress', confidence: 0.5,
        at: now, by: 'auto',
        evidence: [
          ev('todo-all-done', now - 2000),
          ev('turn-completed', now - 1000),
          ev('turn-error', now),
        ],
      },
    })
    expect(sweepProposal(issue, now)).toBeUndefined()
  })
})
