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
import type { Context } from '@deepseek-ai/cordis';
import type { TrackStore } from '../store.ts';
import type { EvidenceRef } from '../types.ts';
/** Map one session event to an EvidenceRef, or undefined when not a signal. */
export declare function signalForEvent(event: {
    type: string;
    data?: unknown;
}, now?: number): EvidenceRef | undefined;
/**
 * Wire the lifecycle observer onto session/event. Returns a handle with
 * `dispose` plus `attach`/`detach`, which track_attach_issue calls to keep the
 * in-memory attachment map current. The map is loaded once from the store
 * (issue.attachSessionId), so continued (spliced) sessions keep attachments.
 */
export declare function createLifecycleObserver(ctx: Context, deps: {
    store: TrackStore;
}): {
    dispose: () => void;
    attach: (sessionId: string, issueId: string) => void;
    detach: (sessionId: string) => void;
};
