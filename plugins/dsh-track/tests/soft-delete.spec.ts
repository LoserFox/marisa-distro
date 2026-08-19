/**
 * Soft delete (2026-08-18) — deletion marks, it never removes: a deleted
 * issue keeps its full record (tombstone fields, user-delete evidence in the
 * ledger, audit entry), default listings hide it, includeDeleted shows it,
 * and the identifier stays durable. purge* is the hard path (tests/cleanup).
 * @module tests/soft-delete.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createPluginHarness } from './harness.ts'
import type { Capture, Issue } from '../src/types.ts'

function makeIssue(partial: Partial<Issue> = {}): Issue {
  return {
    id: 'track_issue_sd',
    identifier: 'INV-90',
    title: 'soft delete',
    description: 'keep me',
    priority: 2,
    state: 'todo',
    teamId: 'INV',
    labels: [],
    linkedSessionIds: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...partial,
  }
}

describe('soft delete — issues', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store']
  let dispose: () => Promise<void>

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store
    dispose = h.dispose
  })

  afterAll(async () => { await dispose() })

  it('deleteIssue tombstones instead of removing — full record stays queryable', async () => {
    await store.upsertIssue(makeIssue())
    const deleted = await store.deleteIssue('INV-90', { by: 'user', reason: '随手删的，其实不该删' })
    expect(deleted?.deletedAt).toBeDefined()
    expect(deleted?.deletedBy).toBe('user')
    expect(deleted?.deletedReason).toBe('随手删的，其实不该删')
    expect(deleted?.title).toBe('soft delete') // record intact

    // Default listing hides it…
    expect(await store.listIssues()).toHaveLength(0)
    // …but the record is complete and queryable.
    const visible = await store.listIssues(undefined, undefined, { includeDeleted: true })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.deletedAt).toBeDefined()
    // Identifier stays durable — history/evidence lookups still resolve.
    const byInput = await store.getIssueByInput('INV-90')
    expect(byInput?.deletedAt).toBeDefined()
  })

  it('records the strong user-delete negation in the ledger and appends an audit entry', async () => {
    const issue = await store.getIssueByInput('INV-90')
    const hasDelete = (issue?.inferred?.evidence ?? []).some((e) => e.signal === 'user-delete' && e.weight === -1 && e.pointer === '随手删的，其实不该删')
    expect(hasDelete).toBe(true)
    const audit = await store.listAudit()
    expect(audit.some((a) => a.tool === 'track_delete_issue' && a.detail?.includes('INV-90'))).toBe(true)
  })

  it('delete of an unknown id returns undefined', async () => {
    expect(await store.deleteIssue('track_issue_nope')).toBeUndefined()
  })

  it('purgeIssue hard-removes the record (tests/cleanup only)', async () => {
    await store.upsertIssue(makeIssue({ id: 'track_issue_sd2', identifier: 'INV-91' }))
    await store.purgeIssue('track_issue_sd2')
    expect(await store.getIssueByInput('INV-91')).toBeUndefined()
  })
})

describe('soft delete — captures', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store']
  let dispose: () => Promise<void>

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store
    dispose = h.dispose
  })

  afterAll(async () => { await dispose() })

  it('deleteCapture tombstones and audits', async () => {
    const cap: Capture = {
      id: 'track_capture_sd',
      content: '一个想法',
      source: 'user',
      status: 'open',
      tags: [],
      createdAt: new Date().toISOString(),
    }
    await store.upsertCapture(cap)
    const deleted = await store.deleteCapture('track_capture_sd', { by: 'user', reason: '不要了' })
    expect(deleted?.deletedAt).toBeDefined()
    expect(await store.listCaptures()).toHaveLength(0)
    expect(await store.listCaptures(undefined, { includeDeleted: true })).toHaveLength(1)
    const audit = await store.listAudit()
    expect(audit.some((a) => a.tool === 'track_delete_capture')).toBe(true)
  })
})
