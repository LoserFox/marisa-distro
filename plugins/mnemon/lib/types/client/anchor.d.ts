/**
 * Lightweight anchor channel between conversation-scoped Mnemon surfaces
 * (turnTail bar and assistant actions) and the Mnemon workspace view.
 *
 * A dispatch asks the Mnemon view to open a page (optionally with a seed) in
 * the session the dispatch came from. The view may not be mounted when the
 * user clicks — the dispatch is then held per session and consumed the next
 * time that session's Mnemon view mounts, so switching to the Memory System
 * tab afterwards still lands on the requested page.
 */
/** Pages of the Mnemon workspace, mirroring MnemonView's internal Page union. */
export type MnemonAnchorPage = 'overview' | 'runtime' | 'documents' | 'explore' | 'entities' | 'remember' | 'list' | 'status';
export interface MnemonAnchor {
    /** Target workspace page. */
    page: MnemonAnchorPage;
    /** Optional context seed (recall query for explore, candidate text for remember). */
    seed?: string;
    /** Session the dispatch belongs to; omitted dispatches address every session. */
    sessionId?: string;
}
export declare const MNEMON_ANCHOR_EVENT = "mnemon:anchor";
/** Ask the Mnemon view to open a page; held until a matching view consumes it. */
export declare function dispatchMnemonAnchor(anchor: MnemonAnchor): void;
/** Take the anchor held for this session (usually at mount time), or null. */
export declare function consumeMnemonAnchor(sessionId?: string): MnemonAnchor | null;
/** Subscribe to anchors addressed to this session; returns an unsubscribe. */
export declare function subscribeMnemonAnchor(sessionId: string | undefined, onAnchor: (anchor: MnemonAnchor) => void): () => void;
