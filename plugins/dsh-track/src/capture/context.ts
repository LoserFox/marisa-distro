/**
 * Capture context helpers — extracting motivation context (the most recent
 * explicit user request) from a persisted session log.
 *
 * Shared by:
 *  - observe.ts seed (fresh process after restart: backfill per-session)
 *  - backfill (one-shot migration: fill context on legacy open captures)
 *  - index.ts seedContext wiring
 * @module @fakechris/dsh-track/capture/context
 */

/** Minimal event shape we read from a session snapshot. */
export interface ContextEvent {
  type: string
  data?: {
    id?: string
    content?: Array<{ type?: string; text?: string }>
    source?: { kind?: string }
  }
}

/** Minimal sessionQuery surface for reading one session. */
export interface ContextSessionQuery {
  readSession(id: string): Promise<{ events: ContextEvent[] }>
}

/** A user prompt plus the message id that carries it (the deep-link target). */
export interface UserPromptRef {
  /** Request text, truncated to the motivation-context bound. */
  text: string
  /** `user/message` `data.id` — stable message identity for the web panel. */
  id?: string
}

/**
 * Most recent explicit user request (source.kind === 'user') in a session log,
 * or undefined when the session has none. Scans from the tail — the latest
 * request is the current motivation.
 *
 * Short-confirmation skip: very short requests ("可以", "pr merge", "CA先做",
 * "restart") are execution-level acknowledgements, not motivation. We skip
 * them and keep scanning back to the nearest full instruction — the request
 * that actually states the goal. A request counts as a full instruction when
 * it is long enough (≥ SHORT_ACK_MAX chars) OR ends with sentence punctuation
 * (。？！?!) that signals a real question/statement rather than a terse ack.
 */
const SHORT_ACK_MAX = 12

/** Is this request a terse acknowledgement rather than a full instruction? */
export function isShortAck(text: string): boolean {
  if (text.length >= SHORT_ACK_MAX) return false
  return !/[。？！?!]$/.test(text)
}

export function latestUserRequestFromEvents(events: readonly ContextEvent[]): UserPromptRef | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'user/message') continue
    const source = event.data?.source
    if (source?.kind !== 'user') continue
    const text = (event.data?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
      .trim()
    if (!text) continue
    // Terse acks are not motivation — keep scanning for the full instruction.
    if (isShortAck(text)) continue
    return { text: text.slice(0, 200), id: event.data?.id }
  }
  return undefined
}

/**
 * Deterministic title-ification for auto-capture content — every capture path
 * (todo / goal / delegate / requirement) stores a CLEAN one-liner so the wall
 * reads consistently (2026-08-14: requirement captures stored the user's raw
 * multi-line message while todo/goal stored agent-phrased one-liners — the
 * user flagged the inconsistency). Rules: strip leading list markers ("1 ",
 * "- ", "1."), collapse whitespace/newlines, cap the length. The FULL raw
 * text is preserved in the capture's `context` (motivation), never lost.
 */
export function titleifyCapture(text: string, maxLen = 80): string {
  const cleaned = text
    // Leading list marker: "1. ", "1 ", "3）", "- " — 1-2 digit numbers (a
    // 4-digit year like "2026 年" must NOT be treated as a list index).
    .replace(/^\s*(?:\d{1,3}[.)、]\s*|\d{1,2}\s+|[-*•]\s*)/u, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned
}

/** Read the latest explicit user request for a session (best-effort). */
export async function latestUserRequest(
  sessionQuery: ContextSessionQuery | undefined,
  sessionId: string,
): Promise<UserPromptRef | undefined> {
  if (!sessionQuery) return undefined
  try {
    const snapshot = await sessionQuery.readSession(sessionId)
    return latestUserRequestFromEvents(snapshot.events)
  } catch {
    return undefined
  }
}
