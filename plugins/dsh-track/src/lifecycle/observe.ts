/**
 * Lifecycle evidence observer — watches the structured session/event stream
 * and converts execution signals into EvidenceRef records for the ATTACHED
 * issue of the current session (track_attach_issue declares the attachment).
 *
 * Part B of the lifecycle design (2026-08-12). Deterministic rules, zero LLM,
 * zero model cost, fire-and-forget: a failed write only logs, never breaks the
 * stream. Attachment lives in the store (issue.attachSessionId), so continued
 * (spliced) sessions keep their attachment after a restart.
 * @module @fakechris/dsh-track/lifecycle/observe
 */

import type { Context } from '@deepseek-ai/cordis'
import type { TrackStore } from '../store.ts'
import { evidenceWeight, nextInferred, isAutoCommit } from './state-machine.ts'
import type { EvidenceRef, Issue } from '../types.ts'

/** Short ack-ish messages that read like a completion confirmation. */
const CONFIRM_PHRASES = ['可以了', '验收通过', '没问题', '搞定了', '完成了', '做完了', '关了吧', '收工', '结束了', '行了']
const CONFIRM_MAX_LEN = 60

/** Tool names that count as real progress (activity heartbeat). */
const ACTIVITY_TOOLS = new Set(['write', 'edit', 'terminal_send', 'bash'])

interface EventData {
  name?: string
  arguments?: string
  reason?: { kind?: string }
  error?: unknown
  message?: { content?: Array<{ type?: string; isError?: boolean }> }
  todos?: unknown[]
  content?: Array<{ type?: string; text?: string }>
}

/** Map one session event to an EvidenceRef, or undefined when not a signal. */
export function signalForEvent(event: { type: string; data?: unknown }, now = Date.now()): EvidenceRef | undefined {
  const data = (event.data ?? {}) as EventData
  switch (event.type) {
    case 'user/message': {
      const text = (data.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join(' ')
        .trim()
      if (text && text.length <= CONFIRM_MAX_LEN && CONFIRM_PHRASES.some((p) => text.includes(p))) {
        return { signal: 'user-confirm', at: now, weight: evidenceWeight('user-confirm'), pointer: text }
      }
      return undefined
    }
    case 'todo/write': {
      const todos = (data.todos ?? []) as Array<{ status?: string }>
      const total = todos.length
      const completed = todos.filter((t) => t.status === 'completed').length
      if (total > 0 && completed === total) {
        return { signal: 'todo-all-done', at: now, weight: evidenceWeight('todo-all-done'), pointer: `${completed}/${total}` }
      }
      if (total > 0) {
        return { signal: 'activity', at: now, weight: evidenceWeight('activity'), pointer: `${completed}/${total} done` }
      }
      return undefined
    }
    case 'turn/end': {
      switch (data.reason?.kind) {
        case 'completed':
          return { signal: 'turn-completed', at: now, weight: evidenceWeight('turn-completed'), pointer: 'completed' }
        case 'blocked':
          return { signal: 'turn-blocked', at: now, weight: evidenceWeight('turn-blocked'), pointer: 'blocked' }
        case 'error':
        case 'max-tokens':
          return { signal: 'turn-error', at: now, weight: evidenceWeight('turn-error'), pointer: data.reason.kind }
        default:
          return undefined // interrupted / aborted: no state signal in v1
      }
    }
    case 'tool/result': {
      const err = data.error !== undefined && data.error !== null && data.error !== false
        || data.message?.content?.[0]?.isError === true
      if (err) return { signal: 'tool-error', at: now, weight: evidenceWeight('tool-error'), pointer: data.name }
      return undefined
    }
    case 'tool/call': {
      if (data.name && ACTIVITY_TOOLS.has(data.name)) {
        return { signal: 'activity', at: now, weight: evidenceWeight('activity'), pointer: data.name }
      }
      return undefined
    }
    default:
      return undefined
  }
}

/**
 * Wire the lifecycle observer onto session/event. Returns a handle with
 * `dispose` plus `attach`/`detach`, which track_attach_issue calls to keep the
 * in-memory attachment map current. The map is loaded once from the store
 * (issue.attachSessionId), so continued (spliced) sessions keep attachments.
 */
export function createLifecycleObserver(ctx: Context, deps: { store: TrackStore }): {
  dispose: () => void
  attach: (sessionId: string, issueId: string) => void
  detach: (sessionId: string) => void
} {
  /** sessionId → attached issueId (in-memory mirror of issue.attachSessionId). */
  const attached = new Map<string, string>()

  void deps.store.listIssues().then((issues) => {
    for (const i of issues) if (i.attachSessionId) attached.set(i.attachSessionId, i.id)
  }).catch(() => { /* best-effort: attachments re-sync on next attach */ })

  const onEvent = (session: unknown, event: { type: string; data?: unknown }): void => {
    const sessionId = (session as { id?: string } | undefined)?.id
    if (!sessionId) return
    const issueId = attached.get(sessionId)
    if (!issueId) return
    const signal = signalForEvent(event)
    if (!signal) return
    void deps.store.recordIssueEvidence(issueId, signal, sessionId)
      .catch(() => { /* fire-and-forget: evidence must never break the stream */ })
  }

  const attach = (sessionId: string, issueId: string): void => { attached.set(sessionId, issueId) }
  const detach = (sessionId: string): void => { attached.delete(sessionId) }

  const dispose = ctx.on('session/event', onEvent)
  return {
    dispose: () => {
      dispose()
      attached.clear()
    },
    attach,
    detach,
  }
}
