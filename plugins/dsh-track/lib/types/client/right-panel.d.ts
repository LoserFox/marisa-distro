/**
 * Track right-side panel mounting — the lazyfish/side-panel pattern:
 * locate the conversation container, take over its grid as
 * `grid-template-columns: minmax(0,2fr) minmax(0,1fr)` (conversation 2/3 +
 * panel 1/3, draggable), and mount the Track panel at grid-column 2.
 * A floating toggle button (FAB) shows when the panel is closed.
 *
 * This is the right-side sidebar the user asked for — not a full-screen
 * overlay (which the previous implementation wrongly did).
 * @module @fakechris/dsh-track/client/right-panel
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Stable ids for the injected panel and toggle. */
export declare const PANEL_ID = "dsh-track-panel";
export declare const FAB_ID = "dsh-track-fab";
/**
 * Open `sessionId` in the left conversation and scroll to `messageId`'s user
 * prompt row. Falls back to the first user message in the loaded window,
 * then to the bottom, when the message cannot be located.
 */
export declare function jumpToConversation(opts: {
    sessionId?: string;
    messageId?: string;
}): Promise<void>;
/** Programmatic entry for the composer-dock strip: ensure the host is
 *  mounted (fresh pages may not have attached yet) and open the panel. */
export declare function openTrackPanel(): void;
/** Build the panel DOM, FAB, and wire events. Returns a disposer.
 *  @param ctx - client root context (needed for the jump-back links:
 *  `ctx.sessions.open` / `binding` resolve the source conversation). */
export declare function mountRightPanel(ctx: ClientContext): () => void;
