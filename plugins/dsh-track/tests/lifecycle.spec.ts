/**
 * Lifecycle evidence observer tests (Part B, 2026-08-12) — signal mapping from
 * the structured event stream, attachment-gated recording, and store-level
 * integration (auto-commit todo → in_progress, done gating, confirm).
 * @module tests/lifecycle.spec
 */

import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import Storage from '@deepseek-ai/dsh-storage'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { apply as applyStorageJson } from '@deepseek-ai/dsh-storage-json'
import { apply as applyTrack, trackStore } from '../src/index.ts'
import { signalForEvent, createLifecycleObserver } from '../src/lifecycle/observe.ts'
import type { TrackStore } from '../src/store.ts'
import type { Issue } from '../src/types.ts'

function makeIssue(partial: Partial<Issue> = {}): Issue {
  return {
    id: 'track_issue_lc',
    identifier: 'INV-1',
    title: 'lifecycle',
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

describe('signalForEvent', () => {
  const now = 1_800_000_000_000

  it('maps user completion phrases to user-confirm', () => {
    const s = signalForEvent({ type: 'user/message', data: { content: [{ type: 'text', text: '可以了' }] } }, now)
    expect(s?.signal).toBe('user-confirm')
    expect(s?.weight).toBe(1)
  })

  it('ignores long or unrelated user messages', () => {
    expect(signalForEvent({ type: 'user/message', data: { content: [{ type: 'text', text: '继续吧，先别管那个' }] } }, now)).toBeUndefined()
    expect(signalForEvent({ type: 'user/message', data: { content: [{ type: 'text', text: '这个方案需要详细评估一下可行性再决定' }] } }, now)).toBeUndefined()
  })

  it('maps todo/write full-completion to todo-all-done', () => {
    const s = signalForEvent({
      type: 'todo/write',
      data: { todos: [{ status: 'completed' }, { status: 'completed' }] },
    }, now)
    expect(s?.signal).toBe('todo-all-done')
  })

  it('maps partial todo snapshots to activity', () => {
    const s = signalForEvent({
      type: 'todo/write',
      data: { todos: [{ status: 'completed' }, { status: 'in_progress' }] },
    }, now)
    expect(s?.signal).toBe('activity')
  })

  it('maps turn/end reasons', () => {
    expect(signalForEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }, now)?.signal).toBe('turn-completed')
    expect(signalForEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'blocked' } } }, now)?.signal).toBe('turn-blocked')
    expect(signalForEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: {} } } }, now)?.signal).toBe('turn-error')
    expect(signalForEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'interrupted' } } }, now)).toBeUndefined()
  })

  it('maps tool errors and activity tools', () => {
    expect(signalForEvent({ type: 'tool/result', data: { name: 'bash', error: 'boom' } }, now)?.signal).toBe('tool-error')
    expect(signalForEvent({ type: 'tool/result', data: { name: 'bash' } }, now)).toBeUndefined()
    expect(signalForEvent({ type: 'tool/call', data: { name: 'write' } }, now)?.signal).toBe('activity')
    expect(signalForEvent({ type: 'tool/call', data: { name: 'read' } }, now)).toBeUndefined()
  })
})

describe('createLifecycleObserver', () => {
  it('only records evidence for the attached session', async () => {
    const ctx = new Context()
    const record = vi.fn(async () => null)
    const store = { listIssues: vi.fn(async () => [makeIssue({ attachSessionId: 'session-a' })]), recordIssueEvidence: record } as unknown as TrackStore
    const obs = createLifecycleObserver(ctx, { store })
    // The attachment map is preloaded asynchronously from the store — flush
    // the microtask before emitting, exactly like a booted runtime.
    await new Promise((r) => setTimeout(r, 0))

    ctx.emit('session/event', { id: 'session-a' }, { type: 'tool/call', data: { name: 'write' } })
    ctx.emit('session/event', { id: 'session-b' }, { type: 'tool/call', data: { name: 'write' } })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0]![0]).toBe('track_issue_lc')
    expect(record.mock.calls[0]![1]?.signal).toBe('activity')
    expect(record.mock.calls[0]![2]).toBe('session-a')
    obs.dispose()
  })

  it('attach() makes the observer record for a newly attached session', () => {
    const ctx = new Context()
    const record = vi.fn(async () => null)
    const store = { listIssues: vi.fn(async () => []), recordIssueEvidence: record } as unknown as TrackStore
    const obs = createLifecycleObserver(ctx, { store })
    obs.attach('session-c', 'track_issue_lc')
    ctx.emit('session/event', { id: 'session-c' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0]![1]?.signal).toBe('turn-completed')
    obs.dispose()
  })
})

describe('lifecycle store integration (real json backend)', () => {
  let ctx: Context
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'track-lc-'))
    ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRegistry)
    applyTrack(ctx, { teamKey: 'INV' } as never)
    applyStorageJson(ctx, { root: dir })
    const deadline = Date.now() + 5000
    while (!trackStore.isOpen && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(trackStore.isOpen).toBe(true)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('registers the lifecycle tools', () => {
    const registry = ctx.tools as unknown as { get: (name: string) => unknown }
    for (const name of ['track_attach_issue', 'track_update_issue_state', 'track_issue_evidence']) {
      expect(registry.get(name), `tool ${name} should be registered`).toBeDefined()
    }
  })

  it('attach sets attachSessionId and appends linkedSessionIds', async () => {
    await trackStore.upsertIssue(makeIssue({ id: 'track_issue_att', identifier: 'INV-77' }))
    const updated = await trackStore.attachSession('track_issue_att', 'session-x')
    expect(updated?.attachSessionId).toBe('session-x')
    expect(updated?.linkedSessionIds).toContain('session-x')
  })

  it('recording evidence auto-commits todo → in_progress, and done stays gated', async () => {
    await trackStore.upsertIssue(makeIssue({ id: 'track_issue_flow', identifier: 'INV-78' }))
    await trackStore.attachSession('track_issue_flow', 'session-y')

    const now = Date.now()
    // activity×2 + turn-completed → conf 0.552 ≥ 0.5 → auto-commit in_progress.
    const r1 = await trackStore.recordIssueEvidence('track_issue_flow', { signal: 'activity', at: now - 3000, weight: 0.2, sessionId: 'session-y' }, 'session-y', now)
    await trackStore.recordIssueEvidence('track_issue_flow', { signal: 'activity', at: now - 2000, weight: 0.2, sessionId: 'session-y' }, 'session-y', now)
    const r2 = await trackStore.recordIssueEvidence('track_issue_flow', { signal: 'turn-completed', at: now - 1000, weight: 0.3, sessionId: 'session-y' }, 'session-y', now)
    expect(r2?.issue.state).toBe('in_progress') // auto-committed

    const r3 = await trackStore.recordIssueEvidence('track_issue_flow', { signal: 'todo-all-done', at: now - 500, weight: 0.6, sessionId: 'session-y' }, 'session-y', now)
    const r4 = await trackStore.recordIssueEvidence('track_issue_flow', { signal: 'turn-completed', at: now, weight: 0.3, sessionId: 'session-y' }, 'session-y', now)
    expect(r4?.issue.inferred?.state).toBe('done')
    expect(r4?.confirm?.to).toBe('done')
    expect(r4?.issue.state).toBe('in_progress') // still gated — NOT auto-done

    const confirmed = await trackStore.confirmIssueState('track_issue_flow', 'done')
    expect(confirmed?.state).toBe('done')
    expect(confirmed?.inferred?.by).toBe('user')
  })

  it('attach clears a stale attachment from the same session', async () => {
    await trackStore.upsertIssue(makeIssue({ id: 'track_issue_a', identifier: 'INV-80' }))
    await trackStore.upsertIssue(makeIssue({ id: 'track_issue_b', identifier: 'INV-81' }))
    await trackStore.attachSession('track_issue_a', 'session-z')
    await trackStore.attachSession('track_issue_b', 'session-z')
    const a = await trackStore.getIssue('track_issue_a')
    expect(a?.attachSessionId).toBeUndefined()
    const b = await trackStore.getIssue('track_issue_b')
    expect(b?.attachSessionId).toBe('session-z')
  })

  it('recordIssueEvidence persists pendingConfirm for a gated done proposal', async () => {
    const id = 'track_issue_pc1'
    const now = Date.now()
    await trackStore.upsertIssue(makeIssue({ id, identifier: 'INV-82', state: 'in_progress' }))
    await trackStore.recordIssueEvidence(id, { signal: 'todo-all-done', at: now - 1000, weight: 0.6 }, 's', now)
    const r = await trackStore.recordIssueEvidence(id, { signal: 'turn-completed', at: now, weight: 0.3 }, 's', now)
    expect(r?.confirm?.to).toBe('done')
    const issue = await trackStore.getIssue(id)
    expect(issue?.pendingConfirm?.to).toBe('done')
    expect(issue?.state).toBe('in_progress') // still gated
  })

  it('sweepLifecycle surfaces done/canceled proposals for unattached sync-created issues', async () => {
    const now = Date.now()
    // Stale completion evidence, NO attachSessionId (the observer never fires).
    await trackStore.upsertIssue(makeIssue({
      id: 'track_issue_sweep_done', identifier: 'INV-83', state: 'in_progress',
      inferred: {
        state: 'in_progress', confidence: 0.8, at: now - 3 * 86400_000, by: 'auto',
        evidence: [
          { signal: 'todo-all-done', at: now - 3 * 86400_000, weight: 0.6 },
          { signal: 'turn-completed', at: now - 3 * 86400_000, weight: 0.3 },
        ],
      },
    }))
    // Abandoned for 15 days, no evidence at all.
    await trackStore.upsertIssue(makeIssue({
      id: 'track_issue_sweep_cancel', identifier: 'INV-84', state: 'in_progress',
      lastProgressAt: now - 15 * 86400_000,
    }))
    // A healthy in_progress issue must stay untouched.
    await trackStore.upsertIssue(makeIssue({
      id: 'track_issue_sweep_ok', identifier: 'INV-85', state: 'in_progress',
      lastProgressAt: now - 1000,
    }))
    // Zombie sync-created issue: no evidence, no lastProgressAt, stale
    // updatedAt → review proposal (machine asks the user which way to go).
    await trackStore.upsertIssue(makeIssue({
      id: 'track_issue_sweep_review', identifier: 'INV-88', state: 'in_progress',
      updatedAt: new Date(now - 3 * 86400_000).toISOString(),
    }))

    const report = await trackStore.sweepLifecycle(now)
    // evaluated >= 4: the shared store also holds track_issue_pc1 (in_progress
    // with a pendingConfirm already set by the earlier evidence test).
    expect(report.evaluated).toBeGreaterThanOrEqual(4)
    expect(report.proposed).toBe(3)
    const done = await trackStore.getIssue('track_issue_sweep_done')
    expect(done?.pendingConfirm?.to).toBe('done')
    const cancel = await trackStore.getIssue('track_issue_sweep_cancel')
    expect(cancel?.pendingConfirm?.to).toBe('canceled')
    const review = await trackStore.getIssue('track_issue_sweep_review')
    expect(review?.pendingConfirm?.to).toBe('review')
    const ok = await trackStore.getIssue('track_issue_sweep_ok')
    expect(ok?.pendingConfirm).toBeUndefined()

    // Idempotent: a second sweep with the same proposals proposes nothing new.
    const again = await trackStore.sweepLifecycle(now)
    expect(again.proposed).toBe(0)
  })

  it('confirming a pending proposal commits state and clears the marker', async () => {
    const id = 'track_issue_pc2'
    const now = Date.now()
    await trackStore.upsertIssue(makeIssue({
      id, identifier: 'INV-86', state: 'in_progress',
      pendingConfirm: { to: 'done', reason: 'todo-all-done, turn-completed', at: now },
    }))
    const updated = await trackStore.confirmIssueState(id, 'done')
    expect(updated?.state).toBe('done')
    expect(updated?.pendingConfirm).toBeUndefined()
  })

  it('dismissPending clears the marker without changing state', async () => {
    const id = 'track_issue_pc3'
    const now = Date.now()
    await trackStore.upsertIssue(makeIssue({
      id, identifier: 'INV-87', state: 'in_progress',
      pendingConfirm: { to: 'canceled', reason: 'no progress for 15d', at: now },
    }))
    const updated = await trackStore.dismissPending(id)
    expect(updated?.state).toBe('in_progress')
    expect(updated?.pendingConfirm).toBeUndefined()
  })

  it('promoteCaptureToIssue carries context and dedupes by normalized title', async () => {
    await trackStore.upsertIssue(makeIssue({
      id: 'track_issue_dup', identifier: 'INV-88', state: 'todo',
      title: '调研 StreamChunk 结构',
    }))
    await trackStore.createCapture({
      id: 'track_capture_p1', content: '调研StreamChunk结构',
      source: 'session', sourceSessionId: 's1', sourceMessageId: 'm1',
      status: 'open', tags: ['auto', 'todo'],
      context: '做一个模块记录 llm 计算开销',
      createdAt: new Date().toISOString(),
    })
    const promoted = await trackStore.promoteCaptureToIssue('track_capture_p1')
    // Same normalized title as INV-88 → promote ONTO it, no new issue.
    expect(promoted.identifier).toBe('INV-88')
    const cap = await trackStore.getCapture('track_capture_p1')
    expect(cap?.status).toBe('promoted')
    expect(cap?.promotedToIssueId).toBe('track_issue_dup')
  })

  it('promoteCaptureToIssue mints a new issue with motivation context', async () => {
    await trackStore.createCapture({
      id: 'track_capture_p2', content: '新调研任务',
      source: 'user', status: 'open', tags: [],
      context: '因为要出一份调研报告',
      createdAt: new Date().toISOString(),
    })
    const issue = await trackStore.promoteCaptureToIssue('track_capture_p2')
    expect(issue.title).toBe('新调研任务')
    expect(issue.description).toContain('动机')
    expect(issue.description).toContain('因为要出一份调研报告')
  })
})
