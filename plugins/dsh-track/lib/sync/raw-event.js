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
/** Stable hash of a JSON value (FNV-1a over canonical JSON). */
export function hashCanonical(value) {
    const json = JSON.stringify(value ?? null);
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
        h ^= json.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
/**
 * Deterministic event id from the session log position + canonical payload.
 * Independent of storage layout and of wall-clock insertion order, so a replay
 * of the same log produces identical ids (idempotency, v2-design §4.1).
 */
export function eventIdFor(sessionId, seq, payloadHash) {
    return `evt_${hashCanonical([sessionId, seq, payloadHash])}`;
}
/** Classify an event's authority + actor from its type and payload. */
export function classifyEvent(event) {
    switch (event.type) {
        case 'user/message': {
            const kind = event.data.source?.kind;
            if (kind === 'user')
                return { authority: 'user-request', actor: 'user' };
            return { authority: 'plugin', actor: 'plugin' };
        }
        case 'assistant/message':
            return { authority: 'assistant', actor: 'agent' };
        case 'tool/call':
            return { authority: 'tool', actor: 'agent' };
        case 'tool/result':
            return { authority: 'tool', actor: 'agent' };
        case 'turn/start':
        case 'turn/end':
        case 'step/start':
        case 'step/end':
            return { authority: 'lifecycle', actor: 'system' };
        default:
            // Unknown/plugin-merged event types: treat as lifecycle unless they look
            // like tool/user events by shape.
            return { authority: 'lifecycle', actor: 'system' };
    }
}
/** Extract a tool name / call id when the event carries them. */
function toolFacts(event) {
    if (event.type === 'tool/call')
        return { toolName: event.data.name, callId: event.data.callId };
    if (event.type === 'tool/result') {
        const data = event.data;
        return { callId: data.callId, toolName: data.name };
    }
    return {};
}
/** turn/end reason kind, when present. */
function endReason(event) {
    if (event.type === 'turn/end')
        return event.data.reason.kind;
    return undefined;
}
/** Concatenated text blocks of an assistant message, truncated. */
function assistantText(event) {
    if (event.type !== 'assistant/message')
        return undefined;
    const text = event.data.message.content
        ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ')
        .trim();
    if (!text)
        return undefined;
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
/** Concatenated text blocks of a user message (any source kind), truncated. */
function userText(event) {
    if (event.type !== 'user/message')
        return undefined;
    const text = event.data.content
        ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ')
        .trim();
    if (!text)
        return undefined;
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
/** Best-effort error detection on a tool/result payload. */
function toolErrorOf(event) {
    if (event.type !== 'tool/result')
        return undefined;
    const data = event.data;
    if (data.error !== undefined && data.error !== null && data.error !== false)
        return true;
    const block = data.message?.content?.[0];
    if (block && block.isError === true)
        return true;
    return false;
}
/** Todo item count for todo/write full-snapshot events. */
function todoCountOf(event) {
    if (event.type !== 'todo/write')
        return undefined;
    const todos = event.data.todos;
    return Array.isArray(todos) ? todos.length : undefined;
}
/** Turn id from turn/start or step/start payloads. */
function turnOf(event) {
    if (event.type === 'turn/start' || event.type === 'turn/end')
        return event.data.turn;
    if (event.type === 'step/start' || event.type === 'step/end')
        return event.data.turn;
    return undefined;
}
/**
 * Normalize one raw log event into the canonical RawEvent view.
 * Deterministic: same (session, log) → same RawEvent sequence.
 */
export function normalizeEvent(sessionId, event, header) {
    const payloadHash = hashCanonical(event.data);
    const { authority, actor } = classifyEvent(event);
    const { toolName, callId } = toolFacts(event);
    const reason = endReason(event);
    const text = assistantText(event);
    const user = userText(event);
    const toolError = toolErrorOf(event);
    const todoCount = todoCountOf(event);
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
    };
}
/** Normalize a whole session log into ordered RawEvents (skipping the header line). */
export function normalizeLog(sessionId, events, header) {
    return events
        .filter((e) => typeof e.seq === 'number') // the first line is a header (no seq), not an event
        .map((e) => normalizeEvent(sessionId, e, header));
}
