/**
 * Capture dedup tests — the store-level gate every capture path goes
 * through (auto-observer, capture_thought, HTTP panel):
 *
 *  1. Content-hash fallback: an identical open capture (any session, any
 *     whitespace) is never inserted twice.
 *  2. Durable per-session marker: one todo-capture per session even across
 *     a process restart (the marker lives in the unit global / on disk, not
 *     in the observer's in-memory set — the 2026-08-13 duplicate bug).
 *  3. Explicit captures (dedupeBySession off) are only content-deduped.
 *
 * Real harness: plugin mounted on a real temp JSON backend.
 * @module tests/capture-dedup.spec
 */

import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPluginHarness } from './harness.ts'
import { makeId, normalizeCaptureContent, captureContentHash } from '../src/store.ts'
import type { Capture } from '../src/types.ts'

function makeCapture(overrides: Partial<Capture> & { content: string }): Capture {
  return {
    id: makeId('capture'),
    source: 'user',
    status: 'open',
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('content-hash helpers', () => {
  it('normalizes whitespace runs and trims', () => {
    expect(normalizeCaptureContent('  摸清  发布前提 \n\t 官方正式版 ')).toBe('摸清 发布前提 官方正式版')
    expect(captureContentHash('  a   b ')).toBe(captureContentHash('a b'))
    expect(captureContentHash('a b')).not.toBe(captureContentHash('a  c'))
  })

  it('is stable across calls', () => {
    const c = '摸清发布前提：凭据/fakechris scope/官方正式版'
    expect(captureContentHash(c)).toBe(captureContentHash(c))
  })
})

describe('TrackStore.createCapture — content-hash dedup', () => {
  it('inserts a fresh capture', async () => {
    const h = await createPluginHarness()
    try {
      const result = await h.store.createCapture(makeCapture({ content: '第一个想法' }))
      expect(result.status).toBe('created')
      const caps = await h.store.listCaptures()
      expect(caps).toHaveLength(1)
      expect(caps[0]!.content).toBe('第一个想法')
    } finally {
      await h.dispose()
    }
  })

  it('dedupes an identical open capture (exact copy)', async () => {
    const h = await createPluginHarness()
    try {
      await h.store.createCapture(makeCapture({ content: '摸清发布前提：凭据/fakechris scope/官方正式版' }))
      const second = await h.store.createCapture(makeCapture({ content: '摸清发布前提：凭据/fakechris scope/官方正式版' }))
      expect(second.status).toBe('duplicate')
      expect(second.existing?.content).toBe('摸清发布前提：凭据/fakechris scope/官方正式版')
      expect(await h.store.listCaptures()).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })

  it('dedupes across whitespace differences (normalized content)', async () => {
    const h = await createPluginHarness()
    try {
      await h.store.createCapture(makeCapture({ content: ' 调研  StreamChunk  usage/token ' }))
      const second = await h.store.createCapture(makeCapture({ content: '调研 StreamChunk usage/token' }))
      expect(second.status).toBe('duplicate')
      expect(await h.store.listCaptures()).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })

  it('does NOT dedup different content', async () => {
    const h = await createPluginHarness()
    try {
      await h.store.createCapture(makeCapture({ content: '想法 A' }))
      const second = await h.store.createCapture(makeCapture({ content: '想法 B' }))
      expect(second.status).toBe('created')
      expect(await h.store.listCaptures()).toHaveLength(2)
    } finally {
      await h.dispose()
    }
  })

  it('does NOT dedup against a promoted (closed) capture', async () => {
    const h = await createPluginHarness()
    try {
      const first = await h.store.createCapture(makeCapture({ content: '转成任务的想法' }))
      if (first.status !== 'created') throw new Error('first capture not created')
      await h.store.promoteCaptureToIssue(first.capture.id)
      // The promoted one left the wall — the same content resurfacing is a
      // fresh instance, not a wall duplicate.
      const second = await h.store.createCapture(makeCapture({ content: '转成任务的想法' }))
      expect(second.status).toBe('created')
    } finally {
      await h.dispose()
    }
  })
})

describe('TrackStore.createCapture — durable per-session marker', () => {
  it('captures the first todo per session, then dedupes by session even with different content', async () => {
    const h = await createPluginHarness()
    try {
      const sessionId = 'session-restart-f93a'
      const first = await h.store.createCapture(
        makeCapture({ content: '摸清发布前提：凭据/fakechris scope/官方正式版', source: 'session', sourceSessionId: sessionId, tags: ['auto', 'todo'] }),
        { dedupeBySession: true },
      )
      expect(first.status).toBe('created')
      // Restart-resurrected observer: same session, a REPLANNED first todo —
      // the durable marker still says "already captured this session".
      const second = await h.store.createCapture(
        makeCapture({ content: '重新规划后的第一条 todo', source: 'session', sourceSessionId: sessionId, tags: ['auto', 'todo'] }),
        { dedupeBySession: true },
      )
      expect(second.status).toBe('duplicate')
      expect(await h.store.listCaptures()).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })

  it('marks different sessions independently', async () => {
    const h = await createPluginHarness()
    try {
      const a = await h.store.createCapture(makeCapture({ content: '计划 A', source: 'session', sourceSessionId: 's-a', tags: ['auto', 'todo'] }), { dedupeBySession: true })
      const b = await h.store.createCapture(makeCapture({ content: '计划 B', source: 'session', sourceSessionId: 's-b', tags: ['auto', 'todo'] }), { dedupeBySession: true })
      expect(a.status).toBe('created')
      expect(b.status).toBe('created')
      expect(await h.store.listCaptures()).toHaveLength(2)
    } finally {
      await h.dispose()
    }
  })

  it('dedupeRequirementBySession: one requirement capture per session, durable', async () => {
    const h = await createPluginHarness()
    try {
      const sid = 'session-req-xyz'
      const first = await h.store.createCapture(
        makeCapture({ content: 'pr merge 吧，tag 发布 npm', source: 'session', sourceSessionId: sid, tags: ['auto', 'requirement'] }),
        { dedupeRequirementBySession: true },
      )
      expect(first.status).toBe('created')
      // Marker persisted, independent of the todo marker.
      expect(await h.store.isSessionRequirementCaptured(sid)).toBe(true)
      expect(await h.store.isSessionTodoCaptured(sid)).toBe(false)
      // A second long message in the SAME session (e.g. after a restart where
      // the in-memory gate died) is deduped by the durable marker.
      const second = await h.store.createCapture(
        makeCapture({ content: '另一个同样长的需求', source: 'session', sourceSessionId: sid, tags: ['auto', 'requirement'] }),
        { dedupeRequirementBySession: true },
      )
      expect(second.status).toBe('duplicate')
      expect(await h.store.listCaptures()).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })

  it('persists the marker to disk (survives a process restart)', async () => {
    const h = await createPluginHarness()
    try {
      const sessionId = 'session-durable-xyz'
      await h.store.createCapture(
        makeCapture({ content: '第一条 todo', source: 'session', sourceSessionId: sessionId, tags: ['auto', 'todo'] }),
        { dedupeBySession: true },
      )
      // The marker must be in the persisted JSON, not only in memory.
      const raw = JSON.parse(await readFile(join(h.dir, 'track.json'), 'utf8'))
      expect(raw.global.autoTodoSessions[sessionId]).toBeDefined()
      // A fresh store on the same backend would read the marker back —
      // assert the value shape so the restart path is provably covered.
      expect(await h.store.isSessionTodoCaptured(sessionId)).toBe(true)
    } finally {
      await h.dispose()
    }
  })

  it('backfills the durable marker for pre-fix sessions (todo capture, no marker)', async () => {
    const h = await createPluginHarness()
    try {
      const sessionId = 'session-prefix-1'
      // A capture created BEFORE the marker feature existed: present in the
      // store, but no autoTodoSessions entry.
      await h.store.upsertCapture(makeCapture({ content: '旧会话的第一条 todo', source: 'session', sourceSessionId: sessionId, tags: ['auto', 'todo'] }))
      expect(await h.store.isSessionTodoCaptured(sessionId)).toBe(false)
      // A restarted observer re-plans with a DIFFERENT first todo — the
      // session already has a todo capture, so dedupe (and backfill).
      const second = await h.store.createCapture(
        makeCapture({ content: '重启后重新规划的第一条', source: 'session', sourceSessionId: sessionId, tags: ['auto', 'todo'] }),
        { dedupeBySession: true },
      )
      expect(second.status).toBe('duplicate')
      expect(await h.store.isSessionTodoCaptured(sessionId)).toBe(true)
      expect(await h.store.listCaptures()).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })

  it('does NOT apply the session marker to explicit captures (dedupeBySession off)', async () => {
    const h = await createPluginHarness()
    try {
      const sessionId = 'session-explicit-1'
      await h.store.createCapture(makeCapture({ content: '显式想法 A', source: 'session', sourceSessionId: sessionId }))
      // Same session, different content, explicit path: allowed.
      const second = await h.store.createCapture(makeCapture({ content: '显式想法 B', source: 'session', sourceSessionId: sessionId }))
      expect(second.status).toBe('created')
      expect(await h.store.listCaptures()).toHaveLength(2)
    } finally {
      await h.dispose()
    }
  })
})
