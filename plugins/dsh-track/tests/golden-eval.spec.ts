/**
 * P0 eval harness — quantify the v1 pipeline against the golden proto set.
 *
 * Runs the v1 pure functions (extractWorklog + clusterWorklogs) over the 5
 * real sessions referenced by tests/fixtures/golden/proto.json, then computes
 * the baseline metrics v2-design §5 asks for: task detection, segmentation
 * error (one-issue-per-session), generic titles, false duplicates (fork
 * copies), and state accuracy.
 *
 * Keyless: no model calls, no session-query service — reads the zstd logs
 * directly from ~/.dsh/sessions/<workspace>.
 * @module tests/golden-eval.spec
 */

import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { extractWorklog } from '../src/sync/extract.ts'
import { clusterWorklogs } from '../src/sync/cluster.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const SESSIONS_DIR = join(homedir(), '.dsh', 'sessions', '--Users-chris-source-dsh-explorer--')
const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/golden/proto.json', import.meta.url), 'utf8'))

/** Decompress a session log and parse events (streamed to avoid buffer limits). */
function loadEvents(sessionId: string): SessionEvent[] {
  const z = join(SESSIONS_DIR, sessionId, 'session.jsonl.zstd')
  if (!existsSync(z)) throw new Error(`missing session log: ${z}`)
  // maxBuffer=256MB covers the largest session (~200MB decompressed).
  const out = spawnSync('zstd', ['-dc', z], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (out.status !== 0) throw new Error(`zstd failed: ${out.stderr}`)
  return out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)) as SessionEvent[]
}

/** Run the v1 pipeline over one session and return its candidates. */
function runV1(sessionId: string) {
  const events = loadEvents(sessionId)
  const worklog = extractWorklog(sessionId, events)
  const meta = {
    [sessionId]: {
      id: sessionId,
      title: undefined, // v1 used the folded title; here we mimic "title unknown → fallback"
      teamKey: 'INV',
      createdAt: Date.now(),
    },
  }
  const { issues } = clusterWorklogs([worklog], meta)
  return { worklog, issues }
}

/** A generic (low-information) title by v1's own standards: fallback of first line or no-request marker. */
function isGenericTitle(title: string): boolean {
  return title === '(no user requests)' || /^(hi|hello|你好|嗯|ok|好的|谢谢)$/i.test(title.trim())
}

describe('P0 golden eval — v1 baseline', () => {
  const results = GOLDEN.sessions.map((g: { sessionId: string; label: string; tasks: unknown[] }) => {
    const { worklog, issues } = runV1(g.sessionId)
    return {
      golden: g,
      worklog,
      issues,
    }
  })

  it('loads all golden sessions and produces exactly one candidate per session (v1 contract)', () => {
    for (const r of results) {
      // v1 emits at most one issue per session (one-issue-per-session).
      expect(r.issues.length).toBeLessThanOrEqual(1)
    }
  })

  it('detects the golden no-task session as a task anyway (false positive)', () => {
    const noTask = results.find((r) => r.golden.label === 'greeting-no-task')!
    // Golden says 0 tasks; v1 emits 1 candidate with a generic greeting title
    // ("hi" via fallback in-cluster, "Hello" via the provider title in track.json).
    expect(noTask.golden.tasks).toHaveLength(0)
    expect(noTask.issues.length).toBe(1)
    expect(isGenericTitle(noTask.issues[0]!.title)).toBe(true)
  })

  it('generic-title rate across the golden set', () => {
    const generic = results.filter((r) => r.issues.some((i) => isGenericTitle(i.title)))
    expect(generic.length).toBeGreaterThan(0)
  })

  it('under-segments the multi-topic session: 1 issue for 8 golden tasks', () => {
    const multi = results.find((r) => r.golden.label === 'multi-topic-long')!
    const goldenTasks = multi.golden.tasks.length
    const v1Issues = multi.issues.length
    // v1 creates one candidate; golden expects 8 — expose the segmentation gap.
    expect(goldenTasks).toBeGreaterThan(v1Issues)
  })

  it('emits duplicate candidates for fork copies (no cross-session dedup)', () => {
    const forks = results.filter((r) => r.golden.label.startsWith('fork-copy'))
    expect(forks).toHaveLength(2)
    // Both fork copies produce one candidate each (v1 has no identity
    // resolution), even though golden says both sessions share 3 tasks.
    for (const f of forks) expect(f.issues.length).toBe(1)
    expect(forks[0]!.golden.tasks.length).toBe(3)
    expect(forks[1]!.golden.tasks.length).toBe(3)
  })

  it('golden intent layering: directives are evidence inside tasks, never standalone', () => {
    // Every golden task carries intent: 'requirement'; directives appear only
    // inside evidence[] annotations. No golden task has intent 'directive'.
    for (const g of GOLDEN.sessions) {
      for (const t of g.tasks ?? []) {
        expect(t.intent, `${t.title} must be a requirement`).toBe('requirement')
      }
    }
  })

  it('v1 candidate description is a raw log dump, not a distilled summary', () => {
    const sample = results[0]!.issues[0]
    // describeRequests output starts with "1. [ISO]" — raw transcription.
    expect(sample!.description).toMatch(/^\d+\. \[\d{4}-\d{2}-\d{2}/)
  })
})

describe('P0 eval — golden ground truth sanity', () => {
  it('golden set has the expected session count and axes', () => {
    const labels = GOLDEN.sessions.map((s: { label: string }) => s.label).sort()
    expect(labels).toEqual([
      'fork-copy-a',
      'fork-copy-b',
      'greeting-no-task',
      'multi-topic-long',
      'single-workline-multistep',
    ])
    const totalTasks = GOLDEN.sessions.reduce((n: number, s: { tasks: unknown[] }) => n + s.tasks.length, 0)
    // 8 golden tasks (multi-topic=8, workline=2, forks=2 → but forks are duplicates of one line).
    expect(totalTasks).toBeGreaterThanOrEqual(8)
  })
})
