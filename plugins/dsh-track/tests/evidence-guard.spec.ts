/**
 * P6 — layered-discipline evidence guard (2026-08-18): only explicit
 * declarations (trailer / user) may claim declared/observed evidence; any
 * semantic or heuristic link method is coerced DOWN to candidate so weak
 * evidence is never presented as strong (Better Harness principle).
 * @module tests/evidence-guard.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { enforceEvidenceDiscipline } from '../src/store.ts'
import type { Link } from '../src/types.ts'
import { createPluginHarness } from './harness.ts'

function makeLink(partial: Partial<Link> = {}): Link {
  return {
    id: 'track_link_guard',
    fromType: 'issue',
    fromId: 'track_issue_g1',
    toType: 'commit',
    toId: 'track_commit_gc',
    kind: 'implements',
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

describe('enforceEvidenceDiscipline (pure)', () => {
  it('keeps declared evidence on explicit trailer links', () => {
    const link = enforceEvidenceDiscipline(makeLink({ linkMethod: 'trailer', evidenceKind: 'declared', confidence: 1 }))
    expect(link.evidenceKind).toBe('declared')
  })

  it('keeps observed evidence on explicit user links', () => {
    const link = enforceEvidenceDiscipline(makeLink({ linkMethod: 'user', evidenceKind: 'observed', confidence: 0.9 }))
    expect(link.evidenceKind).toBe('observed')
  })

  it('coerces declared → candidate on heuristic methods (commit-window / title-overlap)', () => {
    for (const method of ['commit-window', 'title-overlap']) {
      const link = enforceEvidenceDiscipline(makeLink({ linkMethod: method, evidenceKind: 'declared', confidence: 1 }))
      expect(link.evidenceKind).toBe('candidate')
      expect(link.confidence).toBe(1) // confidence preserved, only the kind is downgraded
    }
  })

  it('coerces observed → candidate on semantic methods (promotion / session-link / session-lineage / decision-record)', () => {
    for (const method of ['promotion', 'identity', 'session-link', 'session-lineage', 'parent', 'supersedes', 'decision-record']) {
      const link = enforceEvidenceDiscipline(makeLink({ linkMethod: method, evidenceKind: 'observed' }))
      expect(link.evidenceKind).toBe('candidate')
    }
  })

  it('coerces strong evidence on links with no method (legacy default)', () => {
    const link = enforceEvidenceDiscipline(makeLink({ evidenceKind: 'declared' }))
    expect(link.evidenceKind).toBe('candidate')
  })

  it('leaves candidate and legacy links untouched', () => {
    expect(enforceEvidenceDiscipline(makeLink({ linkMethod: 'promotion', evidenceKind: 'candidate' })).evidenceKind).toBe('candidate')
    expect(enforceEvidenceDiscipline(makeLink({ linkMethod: 'commit-window' })).evidenceKind).toBeUndefined()
  })
})

describe('upsertLink applies the guard at the store boundary', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store']
  let dispose: () => Promise<void>

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store
    dispose = h.dispose
  })

  afterAll(async () => { await dispose() })

  it('downgrades a semantic-method link claiming declared before persisting', async () => {
    await store.upsertLink(makeLink({ id: 'track_link_g1', linkMethod: 'promotion', evidenceKind: 'declared', confidence: 1 }))
    const links = await store.listLinks()
    const saved = links.find((l) => l.id === 'track_link_g1')
    expect(saved?.evidenceKind).toBe('candidate')
  })

  it('persists declared evidence on trailer links unchanged', async () => {
    await store.upsertLink(makeLink({ id: 'track_link_g2', linkMethod: 'trailer', evidenceKind: 'declared', confidence: 1 }))
    const saved = (await store.listLinks()).find((l) => l.id === 'track_link_g2')
    expect(saved?.evidenceKind).toBe('declared')
    expect(saved?.confidence).toBe(1)
  })
})
