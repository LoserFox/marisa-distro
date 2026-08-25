/**
 * Reactive Window Controls Overlay geometry — the STANDARD web mechanism
 * for frameless Chromium shells that draw the native caption buttons
 * (minimize / maximize / close) OVER the web content (Electron
 * `titleBarOverlay` on Windows; issue #257). Feature-detected: absent in
 * plain browsers, macOS, Tauri etc., where the snapshot stays `NONE` and
 * the sidebar adapts nothing — this is the conservative "auto" signal.
 *
 * The API reports the real titlebar rect (CSS px), which differs between
 * shells and Electron versions (32 / 36 …), and fires `geometrychange`
 * when the window maximizes / restores / moves — so the strip must be
 * reactive, not memoized like the URL stamps.
 *
 * Module-level store so the Sidebar shell can subscribe via
 * `useSyncExternalStore`; `setWcoSourceForTests` swaps the source for unit
 * tests (no real API exists in jsdom/headless).
 */
export interface WcoSource {
    readonly visible: boolean;
    getTitlebarAreaRect(): {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    addEventListener(type: 'geometrychange', listener: () => void): void;
    removeEventListener(type: 'geometrychange', listener: () => void): void;
}
/** The current overlay geometry (present=false = API unavailable). */
export interface WcoSnapshot {
    readonly present: boolean;
    readonly height: number;
}
/** Snapshot when the API is unavailable (plain browser / non-overlay shell). */
export declare const WCO_NONE: WcoSnapshot;
type Listener = () => void;
/** Read the current snapshot (returns the frozen NONE when unavailable). */
export declare function getWcoSnapshot(): WcoSnapshot;
/**
 * Subscribe to overlay geometry changes. Attaches to the real
 * `navigator.windowControlsOverlay` on first subscribe; the disposer
 * detaches the native listener when the last subscriber leaves.
 */
export declare function subscribeWco(onChange: Listener): () => void;
/** Test hook: swap the geometry source (undefined = API unavailable). */
export declare function setWcoSourceForTests(next: WcoSource | undefined): void;
export {};
