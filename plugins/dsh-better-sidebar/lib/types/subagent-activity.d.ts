/**
 * Pure derivation of the compact LIVE line shown on a running subagent card:
 * the last text output and the last tool call of the child's session events.
 * The host batch route feeds raw session events into this parser; the client
 * only receives the already-folded `LastActivity` map. Renders nothing
 * itself — the SubagentView component turns this into the card's status
 * lines. Kept framework-free so the parser is unit-testable in the node
 * environment.
 */
import type { SidebarSessionEvent } from './context-types.ts';
/**
 * Extract the concatenated plain text of a content-block list (the durable
 * `ContentBlock[]` shape, structurally: blocks with `type: 'text'` carry
 * `text`; anything else — tool_use, image, … — contributes nothing).
 * @param content - the raw `content` field of a message event.
 * @returns the joined text, or undefined when the message carries no text.
 */
export declare function contentText(content: unknown): string | undefined;
/** The live status of one subagent card (both fields optional). */
export interface LastActivity {
    /** The latest assembled assistant text output in the tail. */
    text?: string;
    /** The latest tool call in the tail. */
    tool?: {
        name: string;
        args: string;
    };
}
/**
 * Fold a session event log into the last text output + last tool call (each
 * is the LAST occurrence in event order). Lifecycle events and raw
 * `assistant/chunk` rows are ignored — the card shows what the subagent is
 * doing right now, not its plumbing. The scan runs BACKWARD from the newest
 * event and stops once both fields are found, so a long history costs only
 * the recent tail in the common case.
 * @param events - the session's append-only event log (oldest → newest).
 * @param maxMessages - optional message-boundary window: only the tail's
 *   last `maxMessages` surface messages (`user/message`, `assistant/message`)
 *   and the events between them are considered, mirroring the old
 *   `subagents.history({ maxMessages })` window. Stale activity older than
 *   the window is never surfaced, and a long log is never scanned in full.
 * @returns the last text and/or tool call; an empty object when the log has neither.
 */
export declare function lastActivity(events: readonly SidebarSessionEvent[], maxMessages?: number): LastActivity;
