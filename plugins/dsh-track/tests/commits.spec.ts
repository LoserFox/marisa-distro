/**
 * M3 — git artifact scan: parse commit lines (author/committer time, body
 * trailers), session/issue alignment with evidence grading (P1: declared vs
 * candidate), explicit trailer channel (P2), P0 commit-observed signals,
 * idempotence, dry-run, and the git-runner error path (no real git exec).
 * @module tests/commits.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { parseCommitLines, parseTrailers, scanProjectCommits, commitIdFor, type GitRunner } from '../src/graph/commits.ts'
import { createPluginHarness } from './harness.ts'

const CWD = '/ws/repo-a'
const SHA = 'abc123def456abc123def456abc123def456abc1'
const AUTHOR_ISO = new Date(1500).toISOString()
const COMMIT_ISO = new Date(1600).toISOString()

const hdr: SessionHeader = { version: 0, id: 'c-sess-1', createdAt: 1000, cwd: CWD } as SessionHeader
const events = [
  { type: 'turn/start', seq: 1, time: 1010, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1500, data: { content: [{ type: 'text', text: '实现 X' }], source: { kind: 'user' }, id: 'msg-x' } },
] as unknown as SessionEvent[]

/** 5-field record + `-z` terminator: sha \0 author \0 committer \0 subject \0 body \0 */
const fakeGit: GitRunner = () => SHA + '\0' + AUTHOR_ISO + '\0' + COMMIT_ISO + '\0feat: 实现 X 功能\0\0'

/** Injectable clock: 1h after the latest fixture commit (P0 freshness window). */
const SCAN_NOW = 2600 + 3600_000

describe('parseTrailers', () => {
  it('extracts typed trailers from a commit body', () => {
    expect(parseTrailers('Track-Issue: INV-9\nHarness-Session: c-sess-1\n\nSome detail')).toEqual([
      { key: 'Track-Issue', value: 'INV-9' },
      { key: 'Harness-Session', value: 'c-sess-1' },
    ])
    expect(parseTrailers('plain body without trailers')).toEqual([])
    expect(parseTrailers('')).toEqual([])
  })
})

describe('parseCommitLines', () => {
  it('parses NUL-separated records (author + committer + multi-line body) and drops malformed ones', () => {
    const raw = SHA + '\0' + AUTHOR_ISO + '\0' + COMMIT_ISO + '\0feat: 实现 X\0Track-Issue: INV-9\nHarness-Session: c-sess-1\n\0'
    const commits = parseCommitLines(raw, CWD)
    expect(commits).toHaveLength(1)
    expect(commits[0]?.sha).toBe(SHA)
    expect(commits[0]?.authorAt).toBe(1500)
    expect(commits[0]?.committedAt).toBe(1600) // committer time is the correlation anchor
    expect(commits[0]?.subject).toBe('feat: 实现 X')
    expect(commits[0]?.trailers).toEqual([
      { key: 'Track-Issue', value: 'INV-9' },
      { key: 'Harness-Session', value: 'c-sess-1' },
    ])
    expect(commits[0]?.id).toBe(commitIdFor(SHA))
    expect(parseCommitLines('badline\n', CWD)).toHaveLength(0)
  })

  it('parses multiple records separated by the -z terminator', () => {
    const SHA2 = '9999988888777776666655555444443333332222'
    const raw = SHA + '\0' + AUTHOR_ISO + '\0' + COMMIT_ISO + '\0one\0\0'
      + SHA2 + '\0' + AUTHOR_ISO + '\0' + COMMIT_ISO + '\0two\0\0'
    const commits = parseCommitLines(raw, CWD)
    expect(commits.map((c) => c.subject)).toEqual(['one', 'two'])
  })

  it('falls back to author time when committer time is missing', () => {
    const raw = SHA + '\0' + AUTHOR_ISO + '\0\0feat: 实现 X\n\0'
    const commits = parseCommitLines(raw, CWD)
    expect(commits[0]?.committedAt).toBe(1500)
  })
});

describe('scanProjectCommits', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('links commits to sessions by time window and to issues by title overlap, graded candidate', async () => {
    await store.upsertGraph(buildSessionGraph('c-sess-1', events, hdr, 5000))
    await store.upsertIssue({
      id: 'track_issue_c1',
      identifier: 'INV-9',
      title: '实现 X',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['c-sess-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)

    const result = await scanProjectCommits(store, CWD, { runGit: fakeGit, now: SCAN_NOW })
    expect(result.error).toBeUndefined()
    expect(result.commits).toBe(1)
    expect(result.sessionsLinked).toBe(1)
    expect(result.issuesLinked).toBe(1)
    const links = await store.listLinks()
    expect(links.some((l) => l.kind === 'landed-in' && l.fromType === 'session' && l.fromId === 'c-sess-1' && l.toType === 'commit')).toBe(true)
    // bi-temporal: landed-in carries the COMMITTER date as eventTime (P2).
    const landed = links.find((l) => l.kind === 'landed-in' && l.fromId === 'c-sess-1')!;
    expect(landed.eventTime).toBe(1600)
    expect(landed.linkMethod).toBe('commit-window')
    // P1: time-window heuristics are graded candidate with a fixed limitation.
    expect(landed.evidenceKind).toBe('candidate')
    expect(landed.confidence).toBe(0.4)
    expect(landed.limitations?.length).toBeGreaterThan(0)
    const impl = links.find((l) => l.kind === 'implements' && l.fromId === 'track_issue_c1')!;
    // The commit falls inside the issue's session window → commit-window method.
    expect(impl.linkMethod).toBe('commit-window')
    expect(impl.evidenceKind).toBe('candidate')
    expect(impl.confidence).toBe(0.55)
    expect(links.some((l) => l.kind === 'implements' && l.fromType === 'issue' && l.fromId === 'track_issue_c1' && l.toType === 'commit')).toBe(true)
    expect((await store.listCommits()).some((c) => c.sha === SHA)).toBe(true)
  })

  it('P0: records commit-observed lifecycle evidence for fresh implements links', async () => {
    expect((await store.listLinks()).some((l) => l.kind === 'implements' && l.fromId === 'track_issue_c1')).toBe(true)
    const issue = await store.getIssue('track_issue_c1')
    const hasSignal = (issue?.inferred?.evidence ?? []).some((e) => e.signal === 'commit-observed' && e.pointer === SHA.slice(0, 8))
    expect(hasSignal).toBe(true)
  })

  it('P2: explicit trailers produce declared links and win over heuristics', async () => {
    const CWD2 = '/ws/repo-b'
    const SHA2 = '9999988888777776666655555444443333332222'
    const hdr2: SessionHeader = { version: 0, id: 'c-sess-2', createdAt: 2000, cwd: CWD2 } as SessionHeader
    const events2 = [
      { type: 'turn/start', seq: 1, time: 2010, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: 2500, data: { content: [{ type: 'text', text: '其他' }], source: { kind: 'user' }, id: 'msg-y' } },
    ] as unknown as SessionEvent[]
    await store.upsertGraph(buildSessionGraph('c-sess-2', events2, hdr2, 9000))
    await store.upsertIssue({
      id: 'track_issue_c2',
      identifier: 'INV-11',
      title: '其他',
      description: '',
      priority: 2,
      state: 'todo' as const,
      teamId: 'INV',
      labels: [],
      linkedSessionIds: ['c-sess-2'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)
    const trailerGit: GitRunner = () =>
      SHA2 + '\0' + new Date(2500).toISOString() + '\0' + new Date(2600).toISOString() + '\0feat: 其他\0Track-Issue: INV-11\nHarness-Session: c-sess-2\n\0'

    const result = await scanProjectCommits(store, CWD2, { runGit: trailerGit, now: SCAN_NOW })
    expect(result.error).toBeUndefined()
    const links = await store.listLinks()
    const landed = links.filter((l) => l.kind === 'landed-in' && l.fromId === 'c-sess-2' && l.toId === commitIdFor(SHA2))
    const impl = links.filter((l) => l.kind === 'implements' && l.fromId === 'track_issue_c2' && l.toId === commitIdFor(SHA2))
    // Explicit wins: exactly one link per pair, declared, conf 1, method trailer.
    expect(landed).toHaveLength(1)
    expect(landed[0]?.evidenceKind).toBe('declared')
    expect(landed[0]?.confidence).toBe(1)
    expect(landed[0]?.linkMethod).toBe('trailer')
    expect(impl).toHaveLength(1)
    expect(impl[0]?.evidenceKind).toBe('declared')
    expect(impl[0]?.linkMethod).toBe('trailer')
  })

  it('is idempotent — re-scan writes the same logical links without rewriting them', async () => {
    const before = (await store.listLinks()).length
    const landedBefore = (await store.listLinks()).find((l) => l.kind === 'landed-in' && l.fromId === 'c-sess-1')
    const implBefore = (await store.listLinks()).find((l) => l.kind === 'implements' && l.fromId === 'track_issue_c1')
    const again = await scanProjectCommits(store, CWD, { runGit: fakeGit, now: SCAN_NOW })
    expect(again.sessionsLinked).toBe(1)
    expect(again.issuesLinked).toBe(1)
    expect(again.commitSignals).toBe(0) // commit-observed already recorded
    expect((await store.listLinks()).length).toBe(before)
    expect((await store.listCommits()).some((c) => c.sha === SHA)).toBe(true)
    // Compare-and-skip: unchanged links are NOT re-published (createdAt would
    // change on a rewrite — the KV backend republishes the whole file per put).
    const landedAfter = (await store.listLinks()).find((l) => l.kind === 'landed-in' && l.fromId === 'c-sess-1')
    const implAfter = (await store.listLinks()).find((l) => l.kind === 'implements' && l.fromId === 'track_issue_c1')
    expect(landedAfter?.createdAt).toBe(landedBefore?.createdAt)
    expect(implAfter?.createdAt).toBe(implBefore?.createdAt)
  })

  it('dry-run previews without writing', async () => {
    const commitsBefore = (await store.listCommits()).length
    const preview = await scanProjectCommits(store, CWD, { dryRun: true, runGit: fakeGit, now: SCAN_NOW })
    expect(preview.commits).toBe(1)
    expect(preview.commitSignals).toBe(0)
    expect((await store.listCommits()).length).toBe(commitsBefore)
  })

  it('surfaces git errors instead of throwing', async () => {
    const failing: GitRunner = () => { throw new Error('not a git repo') }
    const result = await scanProjectCommits(store, '/no/git', { runGit: failing })
    expect(result.error).toContain('not a git repo')
    expect(result.commits).toBe(0)
  })
});
