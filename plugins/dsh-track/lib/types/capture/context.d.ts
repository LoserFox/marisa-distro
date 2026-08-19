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
    type: string;
    data?: {
        id?: string;
        content?: Array<{
            type?: string;
            text?: string;
        }>;
        source?: {
            kind?: string;
        };
    };
}
/** Minimal sessionQuery surface for reading one session. */
export interface ContextSessionQuery {
    readSession(id: string): Promise<{
        events: ContextEvent[];
    }>;
}
/** A user prompt plus the message id that carries it (the deep-link target). */
export interface UserPromptRef {
    /** Request text, truncated to the motivation-context bound. */
    text: string;
    /** `user/message` `data.id` — stable message identity for the web panel. */
    id?: string;
}
/** Is this request a terse acknowledgement rather than a full instruction? */
export declare function isShortAck(text: string): boolean;
export declare function latestUserRequestFromEvents(events: readonly ContextEvent[]): UserPromptRef | undefined;
/**
 * Deterministic title-ification for auto-capture content — every capture path
 * (todo / goal / delegate / requirement) stores a CLEAN one-liner so the wall
 * reads consistently (2026-08-14: requirement captures stored the user's raw
 * multi-line message while todo/goal stored agent-phrased one-liners — the
 * user flagged the inconsistency). Rules: strip leading list markers ("1 ",
 * "- ", "1."), collapse whitespace/newlines, cap the length. The FULL raw
 * text is preserved in the capture's `context` (motivation), never lost.
 */
export declare function titleifyCapture(text: string, maxLen?: number): string;
/** Read the latest explicit user request for a session (best-effort). */
export declare function latestUserRequest(sessionQuery: ContextSessionQuery | undefined, sessionId: string): Promise<UserPromptRef | undefined>;
