/**
 * M6 UI — project-level graph view: sessions/issues/commits/decisions nodes
 * with executed-in/landed-in/implements/forked-from edges (the visual tab's
 * data). @module tests/graph-view.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { projectGraphView } from '../src/graph/service.ts'
import { projectIdFor } from '../src/graph/projects.ts'
import { createPluginHarness } from './harness.ts'

const CWD = '/ws/gv'

describe('projectGraphView', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('assembles a project graph with typed nodes and edges', async () => {
    const hdrA: SessionHeader = { version: 0, id: 'gv-s1', createdAt: 1000, cwd: CWD } as SessionHeader
    const hdrB: SessionHeader = { version: 0, id: 'gv-s2', createdAt: 2000, cwd: CWD, parentSession: 'gv-s1' } as SessionHeader
    const ev = [{ type: 'user/message', seq: 2, time: 1500, data: { content: [{ type: 'text', text: '做图谱' }], source: { kind: 'user' }, id: 'gv-msg' } }] as unknown as SessionEvent[]
    await store.upsertGraph(buildSessionGraph('gv-s1', ev, hdrA, 5000))
    await store.upsertGraph(buildSessionGraph('gv-s2', ev, hdrB, 5000))
    const projId = projectIdFor(CWD)
    await store.upsertProject({ id: projId, name: 'gv', path: CWD, sessionIds: ['gv-s1', 'gv-s2'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const issue = { id: 'track_issue_gv', identifier: 'INV-7', title: '图谱需求', description: '', priority: 2, state: 'todo' as const, teamId: 'INV', labels: [], linkedSessionIds: ['gv-s2'], promptMessageId: 'gv-msg', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never
    await store.upsertIssue(issue)
    const commit = { id: 'track_commit_gvc', sha: 'bb'.repeat(20), projectId: projId, repo: CWD, authorAt: 3000, subject: 'feat: 图谱', createdAt: new Date().toISOString() } as never
    await store.upsertCommit(commit)
    await store.upsertLink({ id: 'track_link_1', fromType: 'issue', fromId: 'track_issue_gv', toType: 'session', toId: 'gv-s2', kind: 'executed-in', createdAt: new Date().toISOString(), linkMethod: 'session-link' } as never)
    await store.upsertLink({ id: 'track_link_2', fromType: 'session', fromId: 'gv-s2', toType: 'commit', toId: 'track_commit_gvc', kind: 'landed-in', createdAt: new Date().toISOString(), linkMethod: 'commit-window' } as never)
    await store.upsertLink({ id: 'track_link_3', fromType: 'issue', fromId: 'track_issue_gv', toType: 'commit', toId: 'track_commit_gvc', kind: 'implements', createdAt: new Date().toISOString(), linkMethod: 'title-overlap' } as never)
    await store.upsertDecision({ id: 'track_decision_gvd', sessionId: 'gv-s1', question: '可视化用 SVG 还是 canvas?', options: ['svg', 'canvas'], aiPreference: 'svg', aiRationale: 'r', impact: '', need: 'confirm', status: 'pending', createdAt: new Date().toISOString() } as never)

    const view = await projectGraphView(store, projId)
    const kinds = view.nodes.map((n) => n.kind)
    expect(kinds).toContain('session')
    expect(kinds).toContain('issue')
    expect(kinds).toContain('commit')
    expect(kinds).toContain('decision')
    const edgeKinds = view.edges.map((e) => e.kind)
    expect(edgeKinds).toContain('forked-from')
    expect(edgeKinds).toContain('executed-in')
    expect(edgeKinds).toContain('landed-in')
    expect(edgeKinds).toContain('implements')
    // Issue node carries the prompt message id for jump-back.
    const issueNode = view.nodes.find((n) => n.kind === 'issue')!;
    expect(issueNode.messageId).toBe('gv-msg')
    expect(issueNode.sessionId).toBe('gv-s2')
  })
});
