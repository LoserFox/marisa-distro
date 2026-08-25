/**
 * Pure URL policy for the built-in browser tab: normalize user input into
 * an http(s) URL, and refuse destinations that would be dangerous to embed
 * in the sidebar iframe. Kept dependency-free so it is unit-testable.
 *
 * The iframe sandbox (opaque origin, no allow-same-origin / top-navigation)
 * is the primary security boundary; this module is the address-bar gate on
 * top of it: only http/https may be navigated, and loopback addresses are
 * refused so a browsed page cannot probe local services by user action.
 * The GUI's OWN origin is explicitly ALLOWED — the user may open the GUI
 * itself in the sidebar (debugging, mirroring); the sandbox still renders
 * it in an opaque origin with no same-origin privileges, exactly like any
 * other site.
 */
/** Why a navigation attempt was refused. */
export type BrowserBlockReason = 'scheme' | 'loopback';
/** Result of normalizing one address-bar input. */
export type BrowserNavigateResult = {
    kind: 'ok';
    url: string;
} | {
    kind: 'blocked';
    reason: BrowserBlockReason;
} | {
    kind: 'invalid';
};
/** One browser.probe wire result (host fetch of the target's headers). */
export interface BrowserProbeResult {
    reachable: boolean;
    /** The final (post-redirect) URL; present when reachable. */
    url?: string;
    status?: number;
    xFrameOptions?: string;
    /** The CSP frame-ancestors source list; present when the directive exists. */
    frameAncestors?: string[];
}
/** Embeddability verdict of one probe. */
export type Embeddability = 'embeddable' | 'blocked' | 'unknown';
/**
 * Decide whether a site can render inside the sidebar iframe. The signals
 * are exactly the ones the BROWSER enforces when it refuses an iframe load:
 * X-Frame-Options DENY/SAMEORIGIN, or a frame-ancestors directive that does
 * not allow `*` ('self' here means the SITE's own origin — never ours, so
 * it also blocks the sidebar). A site we could not reach yields 'unknown'
 * and the plain iframe stays.
 */
export declare function embeddabilityOf(probe: BrowserProbeResult): Embeddability;
/** A loopback hostname (localhost, IPv6 ::1, 127.0.0.0/8, 0.0.0.0). */
export declare function isLoopbackHostname(hostname: string): boolean;
/** Parse the loopback allowlist into a matcher predicate over host:port. */
export declare function parseLoopbackAllowlist(allowlist: string): (host: string, port: string) => boolean;
/**
 * Whether a loopback URL is explicitly allowlisted by the side card prefs
 * (`browserAllowedLoopback`). Only allowlisted local addresses may run with
 * `allow-same-origin` in the sidebar iframe — needed for local dev servers
 * (Vite etc.) whose module/HMR/fetch pipeline requires a real origin, while
 * the page stays cross-origin to the GUI and to every other site.
 */
export declare function isAllowedLoopbackUrl(url: string, allowlist: string): boolean;
export declare function normalizeBrowserUrl(input: string, selfOrigin: string, allowedLoopback?: string): BrowserNavigateResult;
