import type { TabComponentProps } from './service.ts';
/**
 * The browser iframe sandbox tokens. NO allow-same-origin (opaque origin —
 * no GUI storage/API access), NO allow-top-navigation (a browsed page must
 * not hijack the GUI). allow-forms/allow-popups/allow-downloads/allow-modals
 * keep login flows working; allow-popups-to-escape-sandbox lets OAuth
 * popups open as normal tabs (they are cross-origin to the GUI either way).
 */
export declare const BROWSER_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox";
/**
 * The sandbox tokens for one URL: allowlisted loopback addresses (local dev
 * servers the user explicitly trusts) additionally get `allow-same-origin`
 * so Vite/module/HMR pipelines that need a real origin work; every other
 * site keeps the opaque-origin sandbox. `allow-same-origin` does NOT give
 * the page access to the GUI — it stays cross-origin to it and to every
 * other site — but it does give it its OWN origin privileges (localStorage,
 * fetch without CORS), so it is only granted for the explicit allowlist.
 *
 * The GUI itself is the one hard exception: even when its own host is
 * allowlisted (a bare-host entry covers every port, so the GUI origin
 * matches), a page at the GUI's exact origin must never get
 * `allow-same-origin` — that would make it same-origin with its parent and
 * hand it the GUI's storage/API (and the ability to shed the sandbox). The
 * GUI keeps the opaque-origin sandbox no matter what the allowlist says.
 */
export declare function iframeSandboxFor(url: string | undefined, allowedLoopback: string, selfOrigin?: string): string | undefined;
export declare function BrowserView(props: TabComponentProps): import("react").JSX.Element;
/**
 * The embed-refusal panel: shown when the probed site forbids being
 * displayed inside other pages (X-Frame-Options / frame-ancestors) — the
 * iframe would only show the browser's "refused to connect" blank. Explains
 * the reason and offers the real-browser open plus a load-anyway escape.
 * Exported so the copy and the actions are testable without a DOM.
 */
export declare function BrowserEmbedBlocked(props: {
    url: string;
    onOpenInBrowser: () => void;
    onLoadAnyway: () => void;
}): import("react").JSX.Element;
