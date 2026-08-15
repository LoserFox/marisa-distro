/**
 * P1 — event normalization: canonical RawEvent view over the raw session log.
 *
 * Every source event gets a deterministic content-hash `event_id` (stable
 * across replays, independent of storage layout), a canonical payload hash,
 * and an authority classification. Only `user/message` with
 * `source.kind === 'user'` is a user-request; everything else is assigned its
 * correct authority role so downstream stages never re-derive it ad hoc.
 *
 * Pure functions over `SessionEvent[]` — testable without a live service.
 * @module @fakechris/dsh-track/sync/raw-event
 */

import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'

/** Event actor kinds — who produced this event. */
export type EventActor = 'user' | 'agent' | 'plugin' | 'system'

/** Canonical authority of one event (v2-design §3.2 authority gate). */
export type EventAuthority =
  /** A genuine user-initiated request (`user/message` + source.kind === 'user'). */
  | 'user-request'
  /** Assistant message: may state plans/completions but has no user authority. */
  | 'assistant'
  /** Tool invocation: attempted, not proof of success. */
  | 'tool'
  /** Plugin/system context injection (system-prompt snapshots, skill content, …). */
  | 'plugin'
  /** Turn lifecycle / harness control events. */
  | 'lifecycle'

/** Canonical normalized event (v2-design §3.2). */
export interface RawEvent {
  /** Deterministic content-hash id: stable across replays and storage layouts. */
  eventId: string
  sessionId: string
  /** Monotonic seq within the session log. */
  seq: number
  /** Turn this event belongs to, when derivable. */
  turnId?: number
  /** Event occurred at (source timestamp, epoch ms). */
  occurredAt: number
  /** System recorded at (epoch ms; here equals occurredAt for raw logs). */
  recordedAt: number
  eventType: string
  authority: EventAuthority
  actor: EventActor
  /** Tool name for tool/call events. */
  toolName?: string
  /** Tool call id for tool/call + tool/result pairing. */
  callId?: string
  /** turn/end reason kind, when this is a turn/end event. */
  turnEndReason?: string
  /** Assistant message text (for assistant/message events), truncated. */
  assistantText?: string
  /** User message text (for user/message events), truncated. */
  userText?: string
  /** True when a tool/result carries an error-ish payload. */
  toolError?: boolean
  /** Todo item count for todo/write events (full-snapshot length). */
  todoCount?: number
  cwd?: string
  branch?: string
/** Hash of the canonical JSON payload — content-addressing for dedup. */
  payloadHash: string
  /**
   * Session-independent content key: seq + payload hash (no session id), used
   * by cross-session identity resolution to detect fork copies whose events
   * are byte-identical but live under different session ids.
   */
  contentKey: string
}

/** Stable hash of a JSON value (FNV-1a over canonical JSON). */
export function hashCanonical(value: unknown): string {
  const json = JSON.stringify(value ?? null)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Deterministic event id from the session log position + canonical payload.
 * Independent of storage layout and of wall-clock insertion order, so a replay
 * of the same log produces identical ids (idempotency, v2-design §4.1).
 */
export function eventIdFor(sessionId: string, seq: number, payloadHash: string): string {
  return `evt_${hashCanonical([sessionId, seq, payloadHash])}`
}

/** Classify an event's authority + actor from its type and payload. */
export function classifyEvent(event: SessionEvent): { authority: EventAuthority; actor: EventActor } {
  switch (event.type) {
    case 'user/message': {
      const kind = event.data.source?.kind
      if (kind === 'user') return { authority: 'user-request', actor: 'user' }
      return { authority: 'plugin', actor: 'plugin' }
    }
    case 'assistant/message':
      return { authority: 'assistant', actor: 'agent' }
    case 'tool/call':
      return { authority: 'tool', actor: 'agent' }
    case 'tool/result':
      return { authority: 'tool', actor: 'agent' }
    case 'turn/start':
    case 'turn/end':
    case 'step/start':
    case 'step/end':
      return { authority: 'lifecycle', actor: 'system' }
    default:
      // Unknown/plugin-merged event types: treat as lifecycle unless they look
      // like tool/user events by shape.
      return { authority: 'lifecycle', actor: 'system' }
  }
}

/** Extract a tool name / call id when the event carries them. */
function toolFacts(event: SessionEvent): { toolName?: string; callId?: string } {
  if (event.type === 'tool/call') return { toolName: event.data.name, callId: event.data.callId }
  if (event.type === 'tool/result') {
    const data = event.data as unknown as { callId?: string; name?: string }
    return { callId: data.callId, toolName: data.name }
  }
  return {}
}

/** turn/end reason kind, when present. */
function endReason(event: SessionEvent): string | undefined {
  if (event.type === 'turn/end') return event.data.reason.kind
  return undefined
}

/** Concatenated text blocks of an assistant message, truncated. */
function assistantText(event: SessionEvent): string | undefined {
  if (event.type !== 'assistant/message') return undefined
  const text = event.data.message.content
    ?.filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join(' ')
    .trim()
  if (!text) return undefined
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

/** Concatenated text blocks of a user message (any source kind), truncated. */
function userText(event: SessionEvent): string | undefined {
  if (event.type !== 'user/message') return undefined
  const text = event.data.content
    ?.filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join(' ')
    .trim()
  if (!text) return undefined
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

/** Best-effort error detection on a tool/result payload. */
function toolErrorOf(event: SessionEvent): boolean | undefined {
  if (event.type !== 'tool/result') return undefined
  const data = event.data as unknown as {
    error?: unknown
    message?: { content?: Array<{ type?: string; isError?: boolean }> }
  }
  if (data.error !== undefined && data.error !== null && data.error !== false) return true
  const block = data.message?.content?.[0]
  if (block && block.isError === true) return true
  return false
}

/** Todo item count for todo/write full-snapshot events. */
function todoCountOf(event: SessionEvent): number | undefined {
  if (event.type !== 'todo/write') return undefined
  const todos = (event.data as unknown as { todos?: unknown[] }).todos
  return Array.isArray(todos) ? todos.length : undefined
}

/** Turn id from turn/start or step/start payloads. */
function turnOf(event: SessionEvent): number | undefined {
  if (event.type === 'turn/start' || event.type === 'turn/end') return event.data.turn
  if (event.type === 'step/start' || event.type === 'step/end') return event.data.turn
  return undefined
}

/**
 * Normalize one raw log event into the canonical RawEvent view.
 * Deterministic: same (session, log) → same RawEvent sequence.
 */
export function normalizeEvent(sessionId: string, event: SessionEvent, header?: SessionHeader): RawEvent {
  const payloadHash = hashCanonical(event.data)
  const { authority, actor } = classifyEvent(event)
  const { toolName, callId } = toolFacts(event)
  const reason = endReason(event)
  const text = assistantText(event)
  const user = userText(event)
  const toolError = toolErrorOf(event)
  const todoCount = todoCountOf(event)
  return {
    eventId: eventIdFor(sessionId, event.seq, payloadHash),
    sessionId,
    seq: event.seq,
    turnId: turnOf(event),
    occurredAt: event.time,
    recordedAt: event.time,
    eventType: event.type,
    authority,
    actor,
    toolName,
    callId,
    turnEndReason: reason,
    assistantText: text,
    userText: user,
    toolError,
    todoCount,
    cwd: header?.cwd,
    branch: undefined,
    payloadHash,
    contentKey: `${event.seq}:${payloadHash}`,
  }
}

/** Normalize a whole session log into ordered RawEvents (skipping the header line). */
export function normalizeLog(sessionId: string, events: readonly SessionEvent[], header?: SessionHeader): RawEvent[] {
  return events
    .filter((e) => typeof e.seq === 'number') // the first line is a header (no seq), not an event
    .map((e) => normalizeEvent(sessionId, e, header))
}
