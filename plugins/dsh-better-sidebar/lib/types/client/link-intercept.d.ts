/**
 * Chat/GUI external-link interception: clicking an http(s) link that points
 * OUTSIDE the GUI (chat messages, tool rows, prose mentions) opens the
 * sidebar browser instead of a new browser tab. Gated by BOTH the
 * `browserInterceptLinks` pref and the browser tab's enable switch; a
 * Ctrl/Cmd/Shift/Alt-modified click always bypasses the takeover so the
 * user can still force a real browser tab.
 *
 * Only the GUI's OWN document is watched — links inside the browser tab's
 * sandboxed iframe live in another document and never bubble here (and
 * their clicks must keep working inside the sidebar).
 */
/** The pure decision: the URL to open in the sidebar, or null to let the
 *  click fall through. Extracted so the policy is unit-testable without a
 *  DOM. `anchorHref` must be the ABSOLUTE href (`<a>.href` already is). */
export declare function shouldInterceptLink(anchorHref: string, selfOrigin: string): string | null;
/** Whether a left-click may be taken over (unmodified left click only). */
export declare function isPlainLeftClick(event: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}): boolean;
/**
 * Register the document-level click capture that funnels external links
 * into the sidebar browser. Returns the disposer (HMR-safe).
 */
export declare function registerLinkInterception(opts: {
    takeoverEnabled: () => boolean;
    /** Open the sidebar browser tab at `url` (the caller resolves the session). */
    openInSidebar: (url: string) => void;
    /** The GUI's own origin (window.location.origin at registration). */
    selfOrigin: string;
}): () => void;
