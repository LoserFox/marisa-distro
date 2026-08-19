/**
 * M7 — evolution brief: deterministic aggregation + gap detection.
 * @module tests/brief.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { buildEvolutionBrief, STALE_MS } from '../src/graph/brief.ts'
import { projectIdFor } from '../src/graph/projects.ts'
import { createPluginHarness } from './harness.ts'

const NOW = Date.now()

describe('buildEvolutionBrief', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('aggregates issue stats and detects proposed gaps', async () => {
    const projId = projectIdFor('/ws/brief')
    await store.upsertProject({ id: projId, name: 'brief', path: '/ws/brief', sessionIds: ['s1'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const mkIssue = (id: string, ident: string, title: string, state: 'todo' | 'in_progress' | 'done', projectId?: string, lastProgressAt?: number) =>
      ({ id, identifier: ident, title, description: '', priority: 2, state, teamId: 'INV', labels: [], linkedSessionIds: [], projectId, lastProgressAt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never)
    // done without commit → done-without-commit gap.
    await store.upsertIssue(mkIssue('track_issue_b1', 'INV-1', '完成无落地', 'done', projId))
    // in_progress stale → in-progress-stale gap.
    await store.upsertIssue(mkIssue('track_issue_b2', 'INV-2', '停滞任务', 'in_progress', projId, NOW - STALE_MS - 1000))
    // todo with commit → fine.
    const fine = mkIssue('track_issue_b3', 'INV-3', '正常任务', 'todo', projId)
    await store.upsertIssue(fine)
    await store.upsertCommit({ id: 'track_commit_bc', sha: 'aa'.repeat(20), projectId: projId, repo: '/ws/brief', authorAt: NOW - 1000, subject: 'feat: 正常任务', createdAt: new Date().toISOString() } as never)
    await store.upsertLink({ id: 'track_link_bi', fromType: 'issue', fromId: 'track_issue_b3', toType: 'commit', toId: 'track_commit_bc', kind: 'implements', createdAt: new Date().toISOString(), linkMethod: 'title-overlap' } as never)
    // pending decision → unresolved-question gap.
    await store.upsertDecision({ id: 'track_decision_bd', sessionId: 's1', question: '要不要引入 X?', options: ['A', 'B'], aiPreference: 'A', aiRationale: 'r', impact: '', need: 'confirm', status: 'pending', createdAt: new Date().toISOString() } as never)

    const brief = await buildEvolutionBrief(store, projId, NOW)
    expect(brief.project?.name).toBe('brief')
    expect(brief.issues.total).toBe(3)
    expect(brief.issues.byState['done']).toBe(1)
    expect(brief.issues.byState['in_progress']).toBe(1)
    expect(brief.issues.byState['todo']).toBe(1)
    const types = brief.gaps.map((g) => g.type).sort()
    expect(types).toContain('done-without-commit')
    expect(types).toContain('in-progress-stale')
    expect(types).toContain('unresolved-question')
    // INV-3 has a commit, so no no-artifact gap for it; INV-1 done w/o commit reported once.
    expect(brief.gaps.filter((g) => g.type === 'done-without-commit').length).toBe(1)
    expect(brief.recentCommits.some((c) => c.subject.includes('正常任务'))).toBe(true)
    expect(brief.openDecisions.length).toBe(1)
  })
});
