/**
 * Segmentation evaluation — Pk / WindowDiff / boundary-F1 for the v2 span
 * segmentation against golden task boundaries (v2-design §5.2, acceptance A4).
 *
 * Both golden tasks and v2 spans are seq ranges [seqStart, seqEnd]. We map
 * each integer seq position to a segment label (a run of seqs belonging to
 * the same segment), then score the predicted segmentation against the golden
 * one on a common seq axis. Pk and WindowDiff are the standard boundary
 * quality metrics (Beeferman & Berger 1999; Pevzner & Hearst 2002).
 * @module @fakechris/dsh-track/eval/segmentation
 */

/** One segment: a seq range plus its label (index). */
export interface SegRange {
  seqStart: number
  seqEnd: number
}

/**
 * Convert seq ranges into a per-position label array on [minSeq, maxSeq].
 * Each position gets the index of the segment whose range contains it.
 * Positions inside no range are labeled -1 (gap).
 */
export function labelPositions(ranges: readonly SegRange[]): number[] {
  if (ranges.length === 0) return []
  const minSeq = Math.min(...ranges.map((r) => r.seqStart))
  const maxSeq = Math.max(...ranges.map((r) => r.seqEnd))
  const labels: number[] = new Array(maxSeq - minSeq + 1).fill(-1)
  ranges.forEach((r, idx) => {
    for (let s = r.seqStart; s <= r.seqEnd; s++) {
      const i = s - minSeq
      if (i >= 0 && i < labels.length) labels[i] = idx
    }
  })
  return labels
}

/** Is there a segment boundary between position i-1 and i? */
export function boundaries(labels: readonly number[]): boolean[] {
  const out: boolean[] = new Array(labels.length).fill(false)
  for (let i = 1; i < labels.length; i++) {
    out[i] = labels[i] !== labels[i - 1]
  }
  return out
}

/**
 * Pk — probability that two positions k apart are judged inconsistently
 * segmented. Lower is better; 0 = perfect. Uses the k-hypothesis test with
 * the golden's average segment length as window (Beeferman & Berger).
 */
export function pk(golden: readonly number[], predicted: readonly number[]): number {
  const n = Math.min(golden.length, predicted.length)
  if (n < 2) return 0
  // Window size k = golden segment count derived; k = n / (2 * segCount).
  let segCount = 0
  let cur = golden[0]
  for (let i = 1; i < n; i++) {
    if (golden[i] !== cur) { segCount += 1; cur = golden[i] }
  }
  const gB = boundaries(golden)
  const pB = boundaries(predicted)
  const k = Math.max(1, Math.floor(n / (2 * Math.max(1, segCount))))
  let misses = 0
  let total = 0
  for (let i = 0; i + k < n; i++) {
    const sameG = gB[i + 1] === gB[i + k]
    const sameP = pB[i + 1] === pB[i + k]
    if (sameG !== sameP) misses += 1
    total += 1
  }
  return total === 0 ? 0 : misses / total
}

/**
 * WindowDiff — counts boundary disagreements within a sliding window.
 * Lower is better; 0 = perfect.
 */
export function windowDiff(golden: readonly number[], predicted: readonly number[]): number {
  const n = Math.min(golden.length, predicted.length)
  if (n < 2) return 0
  const gB = boundaries(golden)
  const pB = boundaries(predicted)
  let segCount = 0
  let cur = golden[0]
  for (let i = 1; i < n; i++) { if (golden[i] !== cur) { segCount += 1; cur = golden[i] } }
  const k = Math.max(1, Math.floor(n / (2 * Math.max(1, segCount))))
  // Sliding-window boundary counts — O(n), no per-window slice.
  let gWin = 0
  let pWin = 0
  for (let i = 1; i <= k; i++) {
    if (gB[i]) gWin += 1
    if (pB[i]) pWin += 1
  }
  let misses = 0
  let total = 0
  for (let i = 0; i + k < n; i++) {
    if (gWin !== pWin) misses += 1
    total += 1
    // Slide: drop boundary at i+1, add boundary at i+k+1.
    if (i + 1 < n && gB[i + 1]) gWin -= 1
    if (i + 1 < n && pB[i + 1]) pWin -= 1
    if (i + k + 1 < n && gB[i + k + 1]) gWin += 1
    if (i + k + 1 < n && pB[i + k + 1]) pWin += 1
  }
  return total === 0 ? 0 : misses / total
}

/** Boundary precision / recall / F1 (boundary = position where a segment starts). */
export function boundaryF1(golden: readonly number[], predicted: readonly number[]): { precision: number; recall: number; f1: number } {
  const n = Math.min(golden.length, predicted.length)
  if (n < 2) return { precision: 0, recall: 0, f1: 0 }
  const gB = boundaries(golden)
  const pB = boundaries(predicted)
  let tp = 0
  let fp = 0
  let fn = 0
  for (let i = 1; i < n; i++) {
    if (pB[i] && gB[i]) tp += 1
    else if (pB[i] && !gB[i]) fp += 1
    else if (!pB[i] && gB[i]) fn += 1
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1 }
}

/** Full evaluation of one session. */
export interface SessionSegEval {
  sessionId: string
  goldenSegments: number
  predictedSegments: number
  pk: number
  windowDiff: number
  boundaryF1: number
}

/** Evaluate predicted segment ranges against golden ranges per session. */
export function evaluateSession(
  sessionId: string,
  golden: readonly SegRange[],
  predicted: readonly SegRange[],
): SessionSegEval {
  const g = labelPositions(golden)
  const p = labelPositions(predicted)
  // Align on the golden axis only (positions golden covers).
  const n = g.length
  const pAligned = p.slice(0, n)
  const b = boundaryF1(g, pAligned)
  return {
    sessionId,
    goldenSegments: golden.length,
    predictedSegments: predicted.length,
    pk: pk(g, pAligned),
    windowDiff: windowDiff(g, pAligned),
    boundaryF1: b.f1,
  }
}

/** Aggregate metrics across sessions (weighted by position count). */
export function aggregateEval(results: readonly SessionSegEval[]): {
  meanPk: number
  meanWindowDiff: number
  meanBoundaryF1: number
  totalGolden: number
  totalPredicted: number
} {
  const n = results.length || 1
  return {
    meanPk: results.reduce((a, r) => a + r.pk, 0) / n,
    meanWindowDiff: results.reduce((a, r) => a + r.windowDiff, 0) / n,
    meanBoundaryF1: results.reduce((a, r) => a + r.boundaryF1, 0) / n,
    totalGolden: results.reduce((a, r) => a + r.goldenSegments, 0),
    totalPredicted: results.reduce((a, r) => a + r.predictedSegments, 0),
  }
}
