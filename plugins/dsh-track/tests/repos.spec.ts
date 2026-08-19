/**
 * M2b — repo-touch project induction: sessions are grouped by the git repos
 * their tool calls touched (header.repos), not the cwd directory name.
 * @module tests/repos.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { reposOfEvents, repoRootOf, pathsOfEvent, _clearRepoCache } from '../src/graph/repos.ts'
import { induceProjects, repoProjectIdFor, projectIdFor, nameOfUrl } from '../src/graph/projects.ts'
import { createPluginHarness } from './harness.ts'

describe('repo-touch resolution', () => {
  it('extracts absolute paths from tool/call JSON-string arguments', () => {
    const paths = pathsOfEvent({ arguments: JSON.stringify({ file_path: '/ws/repo-a/src/x.ts', workdir: '/ws/repo-b' }) })
    expect(paths).toContain('/ws/repo-a/src/x.ts')
    expect(paths).toContain('/ws/repo-b')
  })

  it('extracts git -C targets from bash command strings', () => {
    const paths = pathsOfEvent({ arguments: JSON.stringify({ command: 'git -C /ws/repo-c status && cat /ws/repo-c/README.md' }) })
    expect(paths.some((p) => p.includes('/ws/repo-c'))).toBe(true)
  })

  it('walks up to the nearest repo root and resolves origin URLs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-touch-'))
    await mkdir(join(dir, 'src'), { recursive: true })
    await mkdir(join(dir, '.git'), { recursive: true })
    await writeFile(join(dir, '.git', 'config'), '[remote origin]\n\turl = git@github.com:dsh-external/dsh-harness-ops.git\n')
    try {
      expect(repoRootOf(join(dir, 'src', 'deep', 'file.ts'))).toBe(dir)
      expect(repoRootOf('/nonexistent/path')).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('resolves repos from events in first-seen order, deduped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-touch2-'))
    await mkdir(join(dir, '.git'), { recursive: true })
    await writeFile(join(dir, '.git', 'config'), '[remote origin]\n\turl = https://github.com/dsh-external/dsh-track.git\n')
    try {
      const events = [
        { type: 'tool/call', seq: 1, time: 1, data: { name: 'read', arguments: JSON.stringify({ file_path: dir + '/a.ts' }) } },
        { type: 'tool/call', seq: 2, time: 2, data: { name: 'read', arguments: JSON.stringify({ file_path: dir + '/b.ts' }) } },
        { type: 'tool/call', seq: 3, time: 3, data: { name: 'bash', arguments: JSON.stringify({ command: 'ls /tmp' }) } },
      ] as unknown as SessionEvent[]
      const repos = reposOfEvents(events)
      expect(repos).toHaveLength(1)
      expect(repos[0]?.url).toBe('https://github.com/dsh-external/dsh-track.git')
      expect(repos[0]?.name).toBe('dsh-track')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
});

describe('nameOfUrl', () => {
  it('derives display names from repo URLs', () => {
    expect(nameOfUrl('https://github.com/dsh-external/dsh-track.git')).toBe('dsh-track')
    expect(nameOfUrl('git@github.com:dsh-external/dsh-harness-ops.git')).toBe('dsh-harness-ops')
    expect(nameOfUrl('https://github.com/dsh2026/test-fakechris.git')).toBe('test-fakechris')
  })
});

describe('induceProjects — repo-touch', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;
  let dir: string;
  let dir2: string;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
    dir = await mkdtemp(join(tmpdir(), 'repo-ind-'))
    await mkdir(join(dir, '.git'), { recursive: true })
    await writeFile(join(dir, '.git', 'config'), '[remote origin]\n\turl = git@github.com:dsh-external/dsh-track.git\n')
    dir2 = await mkdtemp(join(tmpdir(), 'repo-ops-'))
    await mkdir(join(dir2, '.git'), { recursive: true })
    await writeFile(join(dir2, '.git', 'config'), '[remote origin]\n\turl = git@github.com:dsh-external/dsh-harness-ops.git\n')
  })

  afterAll(async () => { await dispose(); await rm(dir, { recursive: true, force: true }); await rm(dir2, { recursive: true, force: true }); _clearRepoCache() })

  it('groups sessions by the repos they touched, not the workspace cwd', async () => {
    // Two sessions in the SAME workspace dir, touching DIFFERENT repos.
    const wd = '/ws/workspace-a'
    const evTrack: SessionEvent[] = [
      { type: 'turn/start', seq: 1, time: 1010, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: 1020, data: { content: [{ type: 'text', text: '改 track' }], source: { kind: 'user' }, id: 'm1' } },
      { type: 'tool/call', seq: 3, time: 1030, data: { name: 'read', arguments: JSON.stringify({ file_path: dir + '/src/index.ts' }) } },
    ] as unknown as SessionEvent[]
    let evOps: SessionEvent[] = [
      { type: 'turn/start', seq: 1, time: 2010, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: 2020, data: { content: [{ type: 'text', text: '改 ops' }], source: { kind: 'user' }, id: 'm2' } },
      { type: 'tool/call', seq: 3, time: 2030, data: { name: 'bash', arguments: JSON.stringify({ command: 'git -C /ws/harness-ops status' }) } },
    ] as unknown as SessionEvent[]
    // g2 touches the harness-ops repo via git -C on a real path.
    evOps = evOps.map((e) => e.type === 'tool/call'
      ? { ...e, data: { ...(e.data as object), arguments: JSON.stringify({ command: 'git -C ' + dir2 + ' status' }) } } as unknown as SessionEvent
      : e)
    const g1 = buildSessionGraph('r-sess-1', evTrack, { version: 0, id: 'r-sess-1', createdAt: 1000, cwd: wd } as SessionHeader, 5000)
    const g2 = buildSessionGraph('r-sess-2', evOps, { version: 0, id: 'r-sess-2', createdAt: 2000, cwd: wd } as SessionHeader, 6000)
    // Attach repos (as the service layer does at build time).
    g1.header.repos = reposOfEvents(evTrack)
    g2.header.repos = reposOfEvents(evOps)
    await store.upsertGraph(g1)
    await store.upsertGraph(g2)
    await store.upsertIssue({
      id: 'track_issue_r1', identifier: 'INV-R1', title: '改 track', description: '', priority: 2, state: 'todo' as const,
      teamId: 'INV', labels: [], linkedSessionIds: ['r-sess-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as never)

    const result = await induceProjects(store, false, 7000)
    // The workspace cwd must NOT become a project; the two repos do.
    expect(await store.getProject(projectIdFor(wd))).toBeUndefined()
    const track = await store.getProject(repoProjectIdFor('git@github.com:dsh-external/dsh-track.git'))
    expect(track?.name).toBe('dsh-track')
    expect(track?.sessionIds).toContain('r-sess-1')
    expect(track?.repoUrl).toBe('git@github.com:dsh-external/dsh-track.git')
    const ops = await store.getProject(repoProjectIdFor('git@github.com:dsh-external/dsh-harness-ops.git'))
    expect(ops?.name).toBe('dsh-harness-ops')
    expect(ops?.sessionIds).toContain('r-sess-2')
    const updated = await store.getIssue('track_issue_r1')
    expect(updated?.projectId).toBe(repoProjectIdFor('git@github.com:dsh-external/dsh-track.git'))
    expect(result.sessionsMapped).toBe(2)
  })

  it('no-repo sessions (repos=[]) map to NO project; undefined repos fall back to cwd', async () => {
    // Real graph: repos=[] (session touched no repo) -> must NOT create a cwd project.
    const ev: SessionEvent[] = [
      { type: 'turn/start', seq: 1, time: 3010, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: 3020, data: { content: [{ type: 'text', text: '纯聊天' }], source: { kind: 'user' }, id: 'm3' } },
    ] as unknown as SessionEvent[]
    const g = buildSessionGraph('r-sess-3', ev, { version: 0, id: 'r-sess-3', createdAt: 3000, cwd: '/ws/chat' } as SessionHeader, 7000)
    g.header.repos = reposOfEvents(ev) // [] — real graph shape
    await store.upsertGraph(g)
    await induceProjects(store, false, 8000)
    expect(await store.getProject(projectIdFor('/ws/chat'))).toBeUndefined()
    // Legacy/synthetic graph: header.repos undefined (tests build directly) -> cwd fallback.
    const g2 = buildSessionGraph('r-sess-4', ev, { version: 0, id: 'r-sess-4', createdAt: 4000, cwd: '/ws/chat2' } as SessionHeader, 9000)
    await store.upsertGraph(g2)
    const result = await induceProjects(store, false, 9500)
    expect(await store.getProject(projectIdFor('/ws/chat2'))).toBeDefined()
    expect(result.sessionsMapped).toBe(3)
  })
});
