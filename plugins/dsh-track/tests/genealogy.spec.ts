/**
 * M2 — genealogy semantic layer: semantic link pass (idempotence + kinds),
 * project induction (cwd grouping + git remote parse + issue assignment),
 * and the v2 candidate → issue citation wiring.
 * @module tests/genealogy.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { writeSemanticLinks } from '../src/graph/links.ts'
import { induceProjects, projectIdFor, repoUrlOf } from '../src/graph/projects.ts'
import { createPluginHarness } from './harness.ts'

const hdr: SessionHeader = {
  version: 0,
  id: 'g-sess-1',
  createdAt: 1000,
  cwd: '/ws/alpha',
  parentSession: 'g-sess-0',
  origin: 'subagent',
  delegationDepth: 1,
} as SessionHeader

const events = [
  { type: 'turn/start', seq: 1, time: 1010, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1020, data: { content: [{ type: 'text', text: '请实现 X' }], source: { kind: 'user' }, id: 'msg-x' } },
] as unknown as SessionEvent[]

describe('semantic links', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('writes fork lineage, executed-in, derives, raised-in links (idempotent)', async () => {
    const g = buildSessionGraph('g-sess-1', events, hdr, 5000)
    await store.upsertGraph(g)
    const issue = {
      id: 'track_issue_g1',
      identifier: 'INV-1',
      title: '实现 X',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['g-sess-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await store.upsertIssue(issue as never)
    await store.upsertCapture({
      id: 'track_capture_g1',
      content: '实现 X 的念头',
      source: 'session',
      status: 'promoted',
      promotedToIssueId: 'track_issue_g1',
      tags: [],
      createdAt: new Date().toISOString(),
    })
    await store.upsertDecision({
      id: 'track_decision_g1',
      sessionId: 'g-sess-1',
      question: '用 A 还是 B?',
      options: ['A', 'B'],
      aiPreference: 'A',
      aiRationale: 'x',
      impact: '',
      need: 'confirm',
      status: 'answered',
      answer: 'A',
      createdAt: new Date().toISOString(),
    })

    const first = await writeSemanticLinks(store)
    expect(first.links).toBe(4)
    expect(first.byKind['forked-from']).toBe(1)
    expect(first.byKind['executed-in']).toBe(1)
    expect(first.byKind['derives']).toBe(1)
    expect(first.byKind['raised-in']).toBe(1)
    const links = await store.listLinks()
    expect(links).toHaveLength(4)
    const second = await writeSemanticLinks(store)
    expect(second.links).toBe(4)
    expect(await store.listLinks()).toHaveLength(4)
    const byKind = (kind: string) => links.filter((l) => l.kind === kind)
    expect(byKind('forked-from')[0]).toMatchObject({ fromType: 'session', fromId: 'g-sess-1', toId: 'g-sess-0' })
    expect(byKind('executed-in')[0]).toMatchObject({ fromType: 'issue', fromId: 'track_issue_g1', toId: 'g-sess-1' })
    expect(byKind('derives')[0]).toMatchObject({ fromType: 'capture', fromId: 'track_capture_g1', toId: 'track_issue_g1' })
    expect(byKind('raised-in')[0]).toMatchObject({ fromType: 'decision', fromId: 'track_decision_g1', toId: 'g-sess-1' })
  })

  it('writes supersedes edges (decision + issue) with event time', async () => {
    await store.upsertDecision({
      id: 'track_decision_g2',
      sessionId: 'g-sess-1',
      question: '用 A 还是 B?',
      options: ['A', 'B'],
      aiPreference: 'A',
      aiRationale: 'x',
      impact: '',
      need: 'confirm',
      status: 'answered',
      answer: 'B',
      supersedesDecisionId: 'track_decision_g1',
      createdAt: new Date('2026-08-01T00:00:00Z').toISOString(),
      answeredAt: new Date('2026-08-02T00:00:00Z').toISOString(),
    })
    const issue2 = {
      id: 'track_issue_g2',
      identifier: 'INV-2',
      title: '实现 Y（新方案）',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['g-sess-1'],
      supersedesIssueId: 'track_issue_g1',
      createdAt: new Date('2026-08-03T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-08-03T00:00:00Z').toISOString(),
    }
    await store.upsertIssue(issue2 as never)
    const result = await writeSemanticLinks(store)
    expect(result.byKind['supersedes']).toBe(2)
    const supersedes = (await store.listLinks()).filter((l) => l.kind === 'supersedes')
    expect(supersedes.some((l) => l.fromId === 'track_decision_g2' && l.toId === 'track_decision_g1')).toBe(true)
    expect(supersedes.some((l) => l.fromId === 'track_issue_g2' && l.toId === 'track_issue_g1')).toBe(true)
    // eventTime = the superseding node's creation/answer time.
    const decSup = supersedes.find((l) => l.fromId === 'track_decision_g2')
    expect(decSup?.eventTime).toBe(Date.parse('2026-08-02T00:00:00Z'))
  })

  it('carries linkMethod on edges and persists extraction runs', async () => {
    const links = await store.listLinks()
    const executed = links.find((l) => l.kind === 'executed-in')!;
    expect(executed.linkMethod).toBe('session-link')
    const fork = links.find((l) => l.kind === 'forked-from')!;
    expect(fork.linkMethod).toBe('session-lineage')
    const run = {
      id: 'track_extract_t1',
      workspace: '/ws/alpha',
      engine: 'v2' as const,
      model: 'deepseek-v4-flash',
      scannedSessions: 1,
      spanCount: 1,
      candidates: [{ id: 'cand_x', sessionId: 'g-sess-1', seqStart: 1, seqEnd: 5, kind: 'implementation', authority: 'user_explicit', title: '实现 X', confidence: 0.8 }],
      createdAt: new Date().toISOString(),
    }
    await store.upsertExtraction(run)
    const back = await store.listExtractions(5)
    expect(back.some((x) => x.id === 'track_extract_t1')).toBe(true)
  })

  it('dry-run previews counts without writing', async () => {
    const before = (await store.listLinks()).length
    const preview = await writeSemanticLinks(store, true)
    // Preview reports every logical edge derivable from the current store.
    expect(preview.links).toBe(before)
    expect((await store.listLinks()).length).toBe(before)
  })
});

describe('project induction', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;
  let dir: string;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
    dir = await mkdtemp(join(tmpdir(), 'track-proj-'))
    await mkdir(join(dir, '.git'), { recursive: true })
    const cfg = ['[remote origin]', '\turl = git@github.com:dsh-external/dsh-track.git', '\tfetch = +refs/heads/*:refs/remotes/origin/*', ''].join('\n')
    await writeFile(join(dir, '.git', 'config'), cfg)
  })

  afterAll(async () => { await dispose(); await rm(dir, { recursive: true, force: true }) })

  it('parses the origin remote from .git/config without exec', () => {
    expect(repoUrlOf(dir)).toBe('git@github.com:dsh-external/dsh-track.git')
    expect(repoUrlOf('/nonexistent/path')).toBeUndefined()
  })

  it('groups sessions by cwd into projects and assigns issues', async () => {
    const hdrA: SessionHeader = { version: 0, id: 'p-sess-1', createdAt: 1000, cwd: dir } as SessionHeader
    const hdrB: SessionHeader = { version: 0, id: 'p-sess-2', createdAt: 2000, cwd: '/ws/beta' } as SessionHeader
    await store.upsertGraph(buildSessionGraph('p-sess-1', events, hdrA, 5000))
    await store.upsertGraph(buildSessionGraph('p-sess-2', events, hdrB, 5000))
    const issue = {
      id: 'track_issue_p1',
      identifier: 'INV-2',
      title: '属于 alpha 的需求',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['p-sess-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await store.upsertIssue(issue as never)

    const result = await induceProjects(store, false, 7000)
    expect(result.projects).toBe(2)
    expect(result.sessionsMapped).toBe(2)
    expect(result.issuesAssigned).toBe(1)
    const alpha = await store.getProject(projectIdFor(dir))
    expect(alpha?.name).toMatch(/^track-proj-/)
    expect(alpha?.repoUrl).toBe('git@github.com:dsh-external/dsh-track.git')
    expect(alpha?.sessionIds).toContain('p-sess-1')
    const updated = await store.getIssue('track_issue_p1')
    expect(updated?.projectId).toBe(projectIdFor(dir))
    expect(projectIdFor(dir)).toBe(projectIdFor(dir))
  })
});
