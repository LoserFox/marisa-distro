/**
 * Session log extraction — turn a raw session event log into a worklog:
 * the sequence of user-initiated requests plus completion signals.
 *
 * Pure functions over `SessionEvent[]` so they are trivially testable without
 * a live session-query service. The sync pipeline (sync/run.ts) feeds these
 * with `ctx.sessionQuery.readSession` output.
 * @module @fakechris/dsh-track/sync/extract
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** One user-initiated request: a `user/message` event with `source.kind === 'user'`. */
export interface UserRequest {
  /** Event seq within the session log (monotonic). */
  seq: number
  /** Event timestamp in Unix epoch milliseconds. */
  time: number
  /** Concatenated text of the message's text blocks. */
  text: string
  /** Event seq of the assistant message that answered this request, when present. */
  answeredBySeq?: number
  /** Concatenated text of the answering assistant message, when present. */
  answerText?: string
}

/** Completion/activity signals folded from the whole log. */
export interface WorkSignals {
  /** Count of `tool/call` events (real work happened). */
  toolCalls: number
  /** Count of `turn/end` events with `reason.kind === 'completed'`. */
  completedTurns: number
  /** Count of `turn/end` events with any non-completed reason. */
  failedTurns: number
  /** Timestamp of the last event in the log. */
  lastActivityAt: number
}

/** Extracted view of one session log. */
export interface SessionWorklog {
  /** Session id (from the header, injected by the caller). */
  sessionId: string
  /** Complete user-initiated requests in ascending seq order. */
  requests: UserRequest[]
  /** Activity/completion signals across the whole log. */
  signals: WorkSignals
}

/** Narrow a `user/message` event's text content to a single string. */
function messageText(content: readonly { type: string; text?: unknown }[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/**
 * Extract the worklog from one session log.
 *
 * Only `user/message` events whose `source.kind === 'user'` count as requests —
 * plugin-injected context (system-prompt snapshots, skill content, goal
 * continuations) carries a different `source.kind` and is excluded. Assistant
 * answers are attached to the preceding un-answered request (or the most
 * recent one when batched) by seq ordering.
 */
export function extractWorklog(sessionId: string, events: readonly SessionEvent[]): SessionWorklog {
  const requests: UserRequest[] = []
  let toolCalls = 0
  let completedTurns = 0
  let failedTurns = 0
  let lastActivityAt = 0
  let pending: UserRequest | undefined

  for (const event of events) {
    if (event.time > lastActivityAt) lastActivityAt = event.time
    switch (event.type) {
      case 'user/message': {
        const source = event.data.source
        if (source?.kind === 'user') {
          const text = messageText(event.data.content)
          if (text) {
            pending = { seq: event.seq, time: event.time, text }
            requests.push(pending)
          }
        }
        break
      }
      case 'assistant/message': {
        if (pending) {
          const answer = messageText(event.data.message.content)
          if (answer) {
            pending.answeredBySeq = event.seq
            pending.answerText = answer
          }
        }
        break
      }
      case 'tool/call':
        toolCalls += 1
        break
      case 'turn/end':
        if (event.data.reason.kind === 'completed') completedTurns += 1
        else failedTurns += 1
        break
      default:
        break
    }
  }

  return {
    sessionId,
    requests,
    signals: { toolCalls, completedTurns, failedTurns, lastActivityAt },
  }
}
