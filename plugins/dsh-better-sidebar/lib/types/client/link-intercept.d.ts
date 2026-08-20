/**
 * Chat/GUI external-link interception: clicking an http(s) link that points
 * OUTSIDE the GUI (chat messages, tool rows, prose mentions) opens the
 * sidebar instead of a new browser tab. Gated by the caller through
 * `takeoverEnabled(url)` — the `browserInterceptLinks` master, the URL's
 * protocol flag (`browserInterceptHttp` / `browserInterceptHttps`) and the
 * target tab's enable switch — and a Ctrl/Cmd/Shift/Alt-modified click
 * always bypasses the takeover so the user can still force a real browser
 * tab.
 *
 * Only the GUI's OWN document is watched — links inside the browser tab's
 * sandboxed iframe live in another document and never bubble here (and
 * their clicks must keep working inside the sidebar).
 */
/** The pure decision: the URL to open in the sidebar, or null to let the
 *  click fall through. Extracted so the policy is unit-testable without a
 *  DOM. `anchorHref` must be the ABSOLUTE href (`<a>.href` already is).
 *  The protocol/same-origin policy lives HERE; the prefs gates (master +
 *  protocol flags + target enablement) live in the caller's
 *  `takeoverEnabled(url)` callback. */
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
 * into the sidebar. Returns the disposer (HMR-safe).
 */
export declare function registerLinkInterception(opts: {
    /** Whether the takeover may happen for THIS url (the caller's prefs
     *  gates: master switch, protocol flag, target enablement). */
    takeoverEnabled: (url: URL) => boolean;
    /** Open the sidebar tab at `url` (the caller resolves the target type). */
    openInSidebar: (url: string) => void;
    /** The GUI's own origin (window.location.origin at registration). */
    selfOrigin: string;
}): () => void;
