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
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
/** Event actor kinds — who produced this event. */
export type EventActor = 'user' | 'agent' | 'plugin' | 'system';
/** Canonical authority of one event (v2-design §3.2 authority gate). */
export type EventAuthority = 
/** A genuine user-initiated request (`user/message` + source.kind === 'user'). */
'user-request'
/** Assistant message: may state plans/completions but has no user authority. */
 | 'assistant'
/** Tool invocation: attempted, not proof of success. */
 | 'tool'
/** Plugin/system context injection (system-prompt snapshots, skill content, …). */
 | 'plugin'
/** Turn lifecycle / harness control events. */
 | 'lifecycle';
/** Canonical normalized event (v2-design §3.2). */
export interface RawEvent {
    /** Deterministic content-hash id: stable across replays and storage layouts. */
    eventId: string;
    sessionId: string;
    /** Monotonic seq within the session log. */
    seq: number;
    /** Turn this event belongs to, when derivable. */
    turnId?: number;
    /** Event occurred at (source timestamp, epoch ms). */
    occurredAt: number;
    /** System recorded at (epoch ms; here equals occurredAt for raw logs). */
    recordedAt: number;
    eventType: string;
    authority: EventAuthority;
    actor: EventActor;
    /** Tool name for tool/call events. */
    toolName?: string;
    /** Tool call id for tool/call + tool/result pairing. */
    callId?: string;
    /** turn/end reason kind, when this is a turn/end event. */
    turnEndReason?: string;
    /** Assistant message text (for assistant/message events), truncated. */
    assistantText?: string;
    /** User message text (for user/message events), truncated. */
    userText?: string;
    /** True when a tool/result carries an error-ish payload. */
    toolError?: boolean;
    /** Todo item count for todo/write events (full-snapshot length). */
    todoCount?: number;
    cwd?: string;
    branch?: string;
    /** Hash of the canonical JSON payload — content-addressing for dedup. */
    payloadHash: string;
    /**
     * Session-independent content key: seq + payload hash (no session id), used
     * by cross-session identity resolution to detect fork copies whose events
     * are byte-identical but live under different session ids.
     */
    contentKey: string;
}
/** Stable hash of a JSON value (FNV-1a over canonical JSON). */
export declare function hashCanonical(value: unknown): string;
/**
 * Deterministic event id from the session log position + canonical payload.
 * Independent of storage layout and of wall-clock insertion order, so a replay
 * of the same log produces identical ids (idempotency, v2-design §4.1).
 */
export declare function eventIdFor(sessionId: string, seq: number, payloadHash: string): string;
/** Classify an event's authority + actor from its type and payload. */
export declare function classifyEvent(event: SessionEvent): {
    authority: EventAuthority;
    actor: EventActor;
};
/**
 * Normalize one raw log event into the canonical RawEvent view.
 * Deterministic: same (session, log) → same RawEvent sequence.
 */
export declare function normalizeEvent(sessionId: string, event: SessionEvent, header?: SessionHeader): RawEvent;
/** Normalize a whole session log into ordered RawEvents (skipping the header line). */
export declare function normalizeLog(sessionId: string, events: readonly SessionEvent[], header?: SessionHeader): RawEvent[];
