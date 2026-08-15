/**
 * P2 — session-internal topic segmentation (v2-design §3.4).
 *
 * Splits a session's user-request sequence into EvidenceSpans so a
 * multi-topic session yields multiple issue candidates instead of one blob.
 * Hard boundaries are deterministic signals (interrupted turn, todo-list
 * reset, long idle, explicit topic markers); ambiguous boundaries are left for
 * an optional LLM judge. Rule-only output is the downgrade path when no LLM is
 * available.
 * @module @fakechris/dsh-track/sync/segment
 */

import type { RawEvent } from './raw-event.ts'

/** One evidence span: a contiguous run of the session that is one candidate task. */
export interface EvidenceSpan {
  id: string
  sessionId: string
  seqStart: number
  seqEnd: number
  /** First user-request text of the span (fallback title material). */
  leadRequest: string
  /** User requests inside the span, in order. */
  requests: string[]
  /** Deterministic boundary signals that opened this span. */
  openedBy: string[]
  /** Interrupted turns inside the span (topic-shift evidence). */
  interruptedCount: number
  /** todo/write resets inside the span. */
  todoResetCount: number
  /** Idle gap (ms) between the previous span end and this span start. */
  idleBeforeMs: number
}

/** Topic-shift phrases that mark a new task (deterministic heuristics). */
const TOPIC_MARKERS = [
  '另一个', '另外一个', '另外', '回到之前', '之前那个', '回到我们', '还有个', '顺便',
  '先不', '先别', '先不要', '下一个', '第二', '第三', '还有',
  '接下来', '下一步', '换个', '重新',
]

/** Idle threshold: a gap longer than this (ms) suggests a topic boundary. */
export const IDLE_BOUNDARY_MS = 15 * 60 * 1000

/** todo list "reset" heuristic: previous snapshot non-empty, next snapshot empty. */
export function isTodoReset(prevCount: number, nextCount: number): boolean {
  return prevCount > 0 && nextCount === 0
}

/** Hard boundary signals at a user request. */
export interface BoundarySignals {
  interrupted: boolean
  todoReset: boolean
  idle: boolean
  topicMarker: boolean
}

/**
 * Rule-based segmentation over raw events.
 *
 * Walks the raw event log, tracks the current span, and opens a new span at a
 * user request when a HARD signal fires: interrupted turn, long idle, or
 * explicit topic marker. todo-list resets are too noisy in real logs (agents
 * clear the list frequently) — they are recorded as an auxiliary `openedBy`
 * note but never trigger a split by themselves. Tool/assistant/lifecycle
 * events are attributed to the current span (extending seqEnd).
 */
export function segmentByRules(sessionId: string, events: readonly RawEvent[]): EvidenceSpan[] {
  const spans: EvidenceSpan[] = []
  let current: EvidenceSpan | undefined
  let interruptedBefore = false
  let todosBefore = 0
  let lastUserTime: number | undefined

  const openSpan = (seq: number, time: number, text: string, openedBy: string[], idleBeforeMs: number) => {
    current = {
      id: `span_${sessionId}_${seq}`,
      sessionId,
      seqStart: seq,
      seqEnd: seq,
      leadRequest: text,
      requests: [text],
      openedBy,
      interruptedCount: 0,
      todoResetCount: 0,
      idleBeforeMs,
    }
    spans.push(current)
  }

  for (const e of events) {
    if (e.eventType === 'user/message' && e.authority === 'user-request') {
      const reqText = e.userText ?? ''
      const idleBeforeMs = lastUserTime !== undefined ? e.occurredAt - lastUserTime : 0
      const interrupted = interruptedBefore
      const todoReset = isTodoReset(todosBefore, 0)
      const idle = idleBeforeMs > IDLE_BOUNDARY_MS
      const topicMarker = TOPIC_MARKERS.some((m) => reqText.includes(m))

      // Hard signals that trigger a split.
      const splitBy: string[] = []
      if (interrupted) splitBy.push('interrupted-turn')
      if (idle) splitBy.push('long-idle')
      if (topicMarker) splitBy.push('topic-marker')
      // Auxiliary notes (never split alone).
      if (todoReset) splitBy.push('todo-reset')

      if (current === undefined) {
        openSpan(e.seq, e.occurredAt, reqText, splitBy.length ? splitBy : ['session-start'], idleBeforeMs)
      } else if (splitBy.some((s) => s !== 'todo-reset') && current.requests.length > 0) {
        openSpan(e.seq, e.occurredAt, reqText, splitBy, idleBeforeMs)
      } else {
        current.requests.push(reqText)
        current.seqEnd = Math.max(current.seqEnd, e.seq)
        if (todoReset) current.todoResetCount += 1
      }
      if (current!.interruptedCount === 0 && interrupted) current!.interruptedCount += 1
      lastUserTime = e.occurredAt
      interruptedBefore = false
    } else if (e.eventType === 'turn/end' && e.turnEndReason === 'interrupted') {
      interruptedBefore = true
      if (current) current.interruptedCount += 1
    } else if (e.eventType === 'todo/write') {
      const count = e.todoCount ?? 0
      todosBefore = count
    } else {
      if (current) current.seqEnd = Math.max(current.seqEnd, e.seq)
    }
  }

  return spans
}

// ── Session-internal aggregation (fixes over-segmentation, 2026-08-11) ─────

/**
 * Aggregate adjacent spans that belong to the same work line.
 *
 * Over-segmentation root cause (verified on 6c5c0b49: 29 spans for one work
 * line): hard split signals (long-idle, interrupted-turn) fire on
 * *continuation steps* of the same task — e.g. "看一下发生了什么" after "接
 * 入 runSync" is a step, not a new task. This pass re-merges adjacent spans
 * whose content overlaps (deterministic) or whose titles are similar enough
 * (LLM-judged when available).
 *
 * Strategy: greedy left-to-right merge. For each adjacent pair, decide merge
 * by, in order:
 *   1. strong re-merge signal: later span's lead request is a continuation
 *      phrase ("继续", "下一步", "接着", bare "p2"...) AND its request count
 *      is small (a step, not a new thread);
 *   2. title/token overlap above threshold (deterministic);
 *   3. LLM judge (SAME_TASK / CONTINUATION_OF) — only when `judge` provided.
 *
 * Merging concatenates requests and extends the span range; the merged span
 * keeps the earlier leadRequest and seqStart.
 */
export interface SpanAggregateOptions {
  /** Minimum overlap ratio (token-level) to merge deterministically. */
  overlapThreshold?: number
  /** If provided, confirm ambiguous adjacent merges via this judge. */
  judge?: (a: EvidenceSpan, b: EvidenceSpan) => Promise<boolean> | boolean
}

/** Continuation phrases that mark a step within a work line, not a new task. */
const CONTINUATION_HINTS = ['继续', '下一步', '接着', '再', '然后', '完了', '好', '嗯', '对', 'p2', 'p3', '继续查', '还有呢', '怎么样了', '看看', '怎么了', '发生了什么', '然后呢', '之后呢', '结论', '结果']

/** CJK function words — no topic signal, inflate char-overlap. */
const CJK_STOP = new Set(
  '的了着一是在有我没你他她它它们这那这样那样也还有都就被把和与及或个们中上下里来去对好行请让先后已经再也又很太非常所作为从到向跟比如果但而是且并且却只才吧吗啊呢嗯哦呀哦'.split(''),
)

/**
 * Character-set overlap of two spans' LEAD requests (topic representatives).
 *
 * CJK has no word separators, so `\p{L}+` collapses a whole Chinese sentence
 * into one token (verified: "修复重启后无法自动拉回的问题" is ONE match).
 * Character-level sets work for both CJK (per-char) and Latin (per-word via
 * space-split fallback): we split on spaces AND take CJK chars individually.
 *
 * Two guards against false-positive merges (verified on 6c5c0b49: a merged
 * 22-request span swallowed "重启了，slot a，你看看" via inflated overlap):
 * 1. compare LEAD requests only — the whole-span char set grows with every
 *    merged request and eventually overlaps ANY short follow-up;
 * 2. drop CJK function words, which are shared by unrelated topics.
 */
export function spanOverlap(a: EvidenceSpan, b: EvidenceSpan): number {
  const chars = (s: string) => {
    const set = new Set<string>()
    // Latin words (space-delimited) keep whole-word identity.
    for (const w of s.match(/[A-Za-z0-9]+/g) ?? []) set.add(w.toLowerCase())
    // CJK chars individually, minus function words.
    for (const ch of s) if (/[\u4e00-\u9fff]/.test(ch) && !CJK_STOP.has(ch)) set.add(ch)
    return set
  }
  const ta = chars(a.leadRequest)
  const tb = chars(b.leadRequest)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return inter / Math.min(ta.size, tb.size)
}

/** Greedy left-to-right aggregation of adjacent spans. */
export async function aggregateSpans(
  spans: EvidenceSpan[],
  opts: SpanAggregateOptions = {},
): Promise<EvidenceSpan[]> {
  const threshold = opts.overlapThreshold ?? 0.35
  const judge = opts.judge
  const result: EvidenceSpan[] = []
  let i = 0
  while (i < spans.length) {
    const cur = spans[i]!
    let j = i + 1
    while (j < spans.length) {
      const next = spans[j]!
      const leadLower = next.leadRequest.trim().toLowerCase()
      const isStep = next.requests.length <= 2
        && (
          // Hint must OPEN the request — "再看看" mid-sentence is not a step.
          CONTINUATION_HINTS.some(h => leadLower.startsWith(h))
          || /[?？]$/.test(leadLower)                    // 疑问句 = 跟进询问
          || leadLower.length <= 6                        // 极短反馈 = 步骤
        )
      const overlap = spanOverlap(cur, next)
      let shouldMerge = false
      if (isStep) shouldMerge = true
      else if (overlap >= threshold) shouldMerge = true
      else if (judge) shouldMerge = await judge(cur, next)
      if (!shouldMerge) break
      // Merge next into cur.
      cur.requests.push(...next.requests)
      cur.seqEnd = Math.max(cur.seqEnd, next.seqEnd)
      cur.interruptedCount += next.interruptedCount
      cur.todoResetCount += next.todoResetCount
      cur.openedBy = [...new Set([...cur.openedBy, ...next.openedBy])]
      j += 1
    }
    result.push(cur)
    i = j
  }
  return result
}
