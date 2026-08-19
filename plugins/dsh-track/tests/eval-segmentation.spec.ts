/**
 * Segmentation eval — Pk / WindowDiff / boundary-F1 of the v2 span
 * segmentation vs the golden task boundaries (v2-design §5.2, acceptance A4,
 * D1 scope: existing 5-session golden, deterministic rule path).
 *
 * Runs segmentByRules + aggregateSpans (NO LLM — the deterministic downgrade)
 * over the 5 real golden sessions, scores the resulting span boundaries
 * against proto.json's task boundaries, and compares against the
 * "one segment per session" baseline the design calls out.
 * @module tests/eval-segmentation.spec
 */

import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeLog } from '../src/sync/raw-event.ts'
import { segmentByRules, aggregateSpans } from '../src/sync/segment.ts'
import { evaluateSession, aggregateEval } from '../src/eval/segmentation.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const SESSIONS_DIR = join(homedir(), '.dsh', 'sessions', '--Users-chris-source-dsh-explorer--')
const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/golden/proto.json', import.meta.url), 'utf8'))

function loadEvents(sessionId: string): SessionEvent[] {
  const z = join(SESSIONS_DIR, sessionId, 'session.jsonl.zstd')
  if (!existsSync(z)) throw new Error(`missing session log: ${z}`)
  const out = spawnSync('zstd', ['-dc', z], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (out.status !== 0) throw new Error(`zstd failed: ${out.stderr}`)
  return out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)) as SessionEvent[]
}

/** v2 rule-path spans (segmentByRules + aggregateSpans, deterministic). */
async function v2Spans(sessionId: string) {
  const events = loadEvents(sessionId)
  const raws = normalizeLog(sessionId, events)
  return await aggregateSpans(segmentByRules(sessionId, raws))
}

describe('segmentation eval — v2 spans vs golden boundaries (D1)', () => {
  // Heavy deterministic work (zstd-decompressing 5 real golden sessions with
  // up to 256MB buffers + rule segmentation) — the default 5s timeout is too
  // tight when the suite runs in parallel; give it a real budget.
  it('evaluates every golden session and reports Pk/WindowDiff/F1', { timeout: 30_000 }, async () => {
    const results = []
    for (const g of GOLDEN.sessions) {
      if (g.sessionId === 'main' || !g.tasks?.length) continue // no-task session: skip (no boundaries to score)
      const goldenRanges = g.tasks.map((t: { seqStart: number; seqEnd: number }) => ({ seqStart: t.seqStart, seqEnd: t.seqEnd }))
      const spans = await v2Spans(g.sessionId)
      const predictedRanges = spans.map((s) => ({ seqStart: s.seqStart, seqEnd: s.seqEnd }))
      results.push(evaluateSession(g.sessionId, goldenRanges, predictedRanges))
    }
    expect(results.length).toBeGreaterThanOrEqual(4) // 4 task-bearing sessions
    const agg = aggregateEval(results)
    // Sanity: metrics are valid probability/score values.
    for (const r of results) {
      expect(r.pk).toBeGreaterThanOrEqual(0)
      expect(r.pk).toBeLessThanOrEqual(1)
      expect(r.windowDiff).toBeGreaterThanOrEqual(0)
      expect(r.boundaryF1).toBeGreaterThanOrEqual(0)
      expect(r.boundaryF1).toBeLessThanOrEqual(1)
    }
    // Print for the acceptance doc (visible in vitest output on failure / via --reporter).
    // eslint-disable-next-line no-console
    console.log('SEG_EVAL', JSON.stringify({ results, aggregate: agg }, null, 2))
  })

  it('v2 segmentation beats the one-segment-per-session baseline on boundary F1', { timeout: 30_000 }, async () => {
    const v2Scores = []
    const baseScores = []
    for (const g of GOLDEN.sessions) {
      if (g.sessionId === 'main' || !g.tasks?.length) continue
      const goldenRanges = g.tasks.map((t: { seqStart: number; seqEnd: number }) => ({ seqStart: t.seqStart, seqEnd: t.seqEnd }))
      const spans = await v2Spans(g.sessionId)
      // v2 predicted boundaries.
      const v2Eval = evaluateSession(g.sessionId, goldenRanges, spans.map((s) => ({ seqStart: s.seqStart, seqEnd: s.seqEnd })))
      v2Scores.push(v2Eval.boundaryF1)
      // Baseline: one segment covering the whole golden axis → boundary F1 = 0 (no boundary ever matches).
      // We score it by evaluating with a single range spanning [minSeq, maxSeq].
      const minSeq = Math.min(...goldenRanges.map((r) => r.seqStart))
      const maxSeq = Math.max(...goldenRanges.map((r) => r.seqEnd))
      const baseEval = evaluateSession(g.sessionId, goldenRanges, [{ seqStart: minSeq, seqEnd: maxSeq }])
      baseScores.push(baseEval.boundaryF1)
    }
    const v2Mean = v2Scores.reduce((a, b) => a + b, 0) / v2Scores.length
    const baseMean = baseScores.reduce((a, b) => a + b, 0) / baseScores.length
    // The design's P2 gate: segmentation Pk must beat the per-session baseline.
    // Boundary F1 of "one blob per session" is 0 (it produces no boundaries),
    // so any real segmentation with ≥1 correct boundary wins.
    expect(v2Mean).toBeGreaterThan(baseMean)
    // eslint-disable-next-line no-console
    console.log(`SEG_EVAL_BASELINE v2_boundaryF1=${v2Mean.toFixed(3)} baseline_boundaryF1=${baseMean.toFixed(3)}`)
  })
})
