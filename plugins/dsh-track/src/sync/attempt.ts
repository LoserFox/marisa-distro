/**
 * P1 — Attempt construction: one concrete execution pass over a task.
 *
 * v2-design §3.3: an Attempt is "initiating evidence + assistant plan + tool
 * calls/results + produced artifacts + turn end + outcome observations".
 * Attempts are keyed by (turn, step) and carry outcome observations so a
 * failed or interrupted attempt never masquerades as the issue's final state.
 * @module @fakechris/dsh-track/sync/attempt
 */

import { createHash } from 'node:crypto'
import type { RawEvent } from './raw-event.ts'

/** Outcome observations folded from a turn's events (v2-design §3.9). */
export interface AttemptOutcome {
  /** Did the turn end normally? */
  turnEnded: boolean
  /** turn/end reason kind: completed | aborted | error | blocked | interrupted | max-tokens | unknown. */
  turnEndReason?: string
  /** Count of tool/call events in this attempt. */
  toolCalls: number
  /** Tool names invoked, in order (deduped). */
  tools: string[]
  /** Did any tool/result carry an explicit error? (best-effort shape check) */
  sawToolError: boolean
  /** Assistant completion statements in this attempt (self-report — weakest signal). */
  assistantCompletions: string[]
}

/** One execution attempt (v2-design §3.3). */
export interface Attempt {
  /** Stable id: content-hash of (sessionId, turnId, stepId). */
  id: string
  sessionId: string
  turnId: number
  stepId: number
  /** Seq span of the events that make up this attempt. */
  seqStart: number
  seqEnd: number
  /** Ordered RawEvents of the attempt (initiating evidence first). */
  events: RawEvent[]
  outcome: AttemptOutcome
  /** Optional linkage to a work item, assigned by later stages (P3 identity resolution). */
  workItemId?: string
}

/** Deterministic attempt id. */
export function attemptIdFor(sessionId: string, turnId: number, stepId: number): string {
  const digest = createHash('sha1').update(`${sessionId}:${turnId}:${stepId}`).digest('hex')
  return `att_${digest.slice(0, 12)}`
}

/** Fold outcome observations from one attempt's raw events. */
export function foldOutcome(events: readonly RawEvent[]): AttemptOutcome {
  const tools: string[] = []
  let toolCalls = 0
  let sawToolError = false
  let turnEnded = false
  let turnEndReason: string | undefined
  const assistantCompletions: string[] = []

  for (const e of events) {
    if (e.eventType === 'tool/call') {
      toolCalls += 1
      if (e.toolName && !tools.includes(e.toolName)) tools.push(e.toolName)
    } else if (e.eventType === 'tool/result') {
      if (e.toolError) sawToolError = true
    } else if (e.eventType === 'turn/end') {
      turnEnded = true
      turnEndReason = e.turnEndReason
    } else if (e.eventType === 'assistant/message') {
      // Completion statements are weak signals (v2-design §3.9) — recorded, never trusted alone.
      const text = e.assistantText
      if (text && /(完成|done|搞定|finished|fixed|已)/i.test(text)) {
        assistantCompletions.push(text.slice(0, 200))
      }
    }
  }

  return { turnEnded, turnEndReason, toolCalls, tools, sawToolError, assistantCompletions }
}

/**
 * Group raw events into attempts by (turn, step).
 *
 * Bucketing: `turn/start` opens a turn, `step/start` opens a step within it.
 * Events before any marker land in bucket `0:0`. Each bucket is one Attempt.
 */
export function buildAttempts(sessionId: string, events: readonly RawEvent[]): Attempt[] {
  const buckets = new Map<string, RawEvent[]>()
  const bucketOrder: string[] = []
  let turnCursor = 0
  let stepCursor = 0

  for (const e of events) {
    if (e.eventType === 'turn/start') {
      turnCursor = e.turnId ?? turnCursor
      stepCursor = 0
    } else if (e.eventType === 'step/start') {
      turnCursor = e.turnId ?? turnCursor
      stepCursor = 1
    }
    const key = `${turnCursor}:${stepCursor}`
    if (!buckets.has(key)) {
      buckets.set(key, [])
      bucketOrder.push(key)
    }
    buckets.get(key)!.push(e)
  }

  return bucketOrder.map((key) => {
    const bucket = buckets.get(key)!
    const [turnStr, stepStr] = key.split(':')
    const turnId = Number(turnStr)
    const stepId = Number(stepStr)
    return {
      id: attemptIdFor(sessionId, turnId, stepId),
      sessionId,
      turnId,
      stepId,
      seqStart: bucket[0]!.seq,
      seqEnd: bucket.at(-1)!.seq,
      events: bucket,
      outcome: foldOutcome(bucket),
    } satisfies Attempt
  })
}
