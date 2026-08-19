/**
 * M5 — lineage view: from an issue, resolve evidence spans (user messages),
 * neighbors (session / commit / decision / superseding issue), and
 * implementing commits. Deterministic — reads the store only.
 * @module tests/lineage.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { buildLineage } from '../src/graph/lineage.ts'
import { writeSemanticLinks } from '../src/graph/links.ts'
import { createPluginHarness } from './harness.ts'

const hdr: SessionHeader = { version: 0, id: 'l-sess-1', createdAt: 1000, cwd: '/ws/l' } as SessionHeader
const events = [
  { type: 'turn/start', seq: 1, time: 1010, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1020, data: { content: [{ type: 'text', text: '原始需求：做一个谱系视图' }], source: { kind: 'user' }, id: 'msg-lineage' } },
] as unknown as SessionEvent[]

describe('buildLineage', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('resolves evidence, neighbors, commits and supersedes for an issue', async () => {
    const graph = buildSessionGraph('l-sess-1', events, hdr, 5000)
    await store.upsertGraph(graph)
    const issue = {
      id: 'track_issue_l1',
      identifier: 'INV-21',
      title: '谱系视图',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['l-sess-1'],
      promptMessageId: 'msg-lineage',
      citations: [{ sessionId: 'l-sess-1', seqStart: 1, seqEnd: 5, kind: 'span' as const }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never
    await store.upsertIssue(issue)
    const commit = {
      id: 'track_commit_lc',
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
      projectId: 'track_project_l',
      repo: '/ws/l',
      authorAt: 2000,
      subject: 'feat: 谱系视图',
      createdAt: new Date().toISOString(),
    } as never
    await store.upsertCommit(commit)
    await store.upsertLink({ id: 'track_link_lc', fromType: 'issue', fromId: 'track_issue_l1', toType: 'commit', toId: 'track_commit_lc', kind: 'implements', createdAt: new Date().toISOString(), linkMethod: 'title-overlap' } as never)
    await store.upsertLink({ id: 'track_link_ls', fromType: 'issue', fromId: 'track_issue_l1', toType: 'session', toId: 'l-sess-1', kind: 'executed-in', createdAt: new Date().toISOString(), linkMethod: 'session-link' } as never)
    // A superseding issue.
    await store.upsertIssue({ ...issue, id: 'track_issue_l2', identifier: 'INV-22', title: '谱系视图 v2', supersedesIssueId: 'track_issue_l1' } as never)
    await writeSemanticLinks(store)

    const view = await buildLineage(store, 'INV-21')
    expect(view).not.toBeNull()
    if (!view) return
    expect(view.target.kind).toBe('issue')
    expect(view.target.title).toBe('谱系视图')
    // Evidence: citation resolved to the user message in the graph.
    expect(view.evidence).toHaveLength(1)
    expect(view.evidence[0]?.sessionId).toBe('l-sess-1')
    expect(view.evidence[0]?.promptMessageId).toBe('msg-lineage')
    expect(view.evidence[0]?.userMessages[0]?.messageId).toBe('msg-lineage')
    // Neighbors: session + commit + superseding issue.
    expect(view.neighbors['l-sess-1']?.kind).toBe('session')
    expect(view.neighbors['track_commit_lc']?.kind).toBe('commit')
    expect(view.neighbors['track_issue_l2']?.kind).toBe('issue')
    // Commits implementing this issue.
    expect(view.commits).toHaveLength(1)
    expect(view.commits[0]?.sha).toBe('abcdef1234567890abcdef1234567890abcdef12')
    // Supersedes edge present.
    expect(view.edges.some((e) => e.kind === 'supersedes' && e.direction === 'in')).toBe(true)
  })

  it('returns null for unknown entities', async () => {
    expect(await buildLineage(store, 'track_issue_nope')).toBeNull()
  });
});
