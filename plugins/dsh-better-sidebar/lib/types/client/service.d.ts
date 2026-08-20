/**
 * The BetterSidebar client service: a registry that external plugins use
 * to contribute sidebar tab types and file previewers. The service is
 * published to the cordis context as `ctx.betterSidebar` (see
 * {@link ../context-types.ts}); consumers declare it in `inject` and call
 * `registerTab` / `registerFileViewer`, both returning a disposer that
 * cordis auto-invokes on fiber disposal (HMR-safe).
 *
 * Design notes:
 * - The registry is synchronous-snapshot (Map + listener set) so React
 *   can read it through `useSyncExternalStore` without tearing.
 * - `dedupeKey` unifies the three open-tab strategies the builtins used to
 *   hardcode: single-instance (`() => type`), per-path (`tab => tab.path`),
 *   and per-id (`tab => tab.id` for diff tabs whose id is change-derived).
 *   `single: true` is sugar for `dedupeKey: () => id`.
 * - `createTab` lets a descriptor own tab instantiation (the terminal
 *   builtin uses it to mint `terminal:<n>` ids and bump `nextTerminal`).
 * - `matchFileViewer` walks descriptors in priority order (desc, stable):
 *   per descriptor it tries `detect` first (when `head` bytes are given),
 *   then `exts`; `exts: []` is a catch-all that matches any path.
 */
import type { ReactNode } from 'react';
import type { Context } from '../context-types.ts';
import { type SidebarSnapshot, type SidebarState, type SidebarStore, type SidebarTab } from './state.ts';
import type { SessionScope } from './api.ts';
import type { SidebarPrefs } from '../prefs-shared.ts';
/**
 * Public state vocabulary re-exported for consumers (type-only; the values
 * stay internal). External plugins name these types in their descriptors —
 * e.g. `dedupeKey: (tab: SidebarTab) => tab.id`, `createTab: (state: SidebarState) => …`,
 * or `badge: (…, state: SidebarState) => …`.
 */
export type { SidebarTab, SidebarState, SidebarStore, SidebarSnapshot, SidebarDiffRef, TabType, } from './state.ts';
export type { SessionScope } from './api.ts';
export type { SidebarPrefs } from '../prefs-shared.ts';
/** The row control a declarative setting renders as in the settings popup. */
export type SidebarSettingToggleType = 'switch' | 'text' | 'number' | 'select';
/** One option of a `type: 'select'` setting row. */
export interface SidebarSettingSelectOption {
    /** The value written to the setting key when this option is picked
     *  (JSON-serializable: string / number / boolean). */
    value: string | number | boolean;
    /** Option title (i18n friendly: string or () => string). */
    title: string | (() => string);
    /** Option description (i18n friendly); rendered under the title in the
     *  icon dropdown. */
    desc?: string | (() => string);
    /** Option icon: when ANY option declares one, the dropdown renders
     *  big-icon option cards and the closed control shows the selected
     *  option's icon too; without icons both are a single line of text. */
    icon?: ReactNode | ((size: number) => ReactNode);
}
/** One declarative setting of a tab/viewer, rendered as a nested row in the
 *  Side card settings page (e.g. the Subagent page's "auto-open when a
 *  subagent appears" switch, or the terminal's custom font rows). `type`
 *  selects the control: 'switch' (default) renders the custom switch,
 *  'text' a free-form input committed on blur/Enter, 'number' a numeric
 *  input clamped to `min`/`max`, 'select' a dropdown over the declared
 *  `options` (single-pick writes the option's value; `multi: true` writes
 *  the array of picked values and defaults to false). */
export interface SidebarSettingToggle {
    /** The SidebarPrefs field this toggle reads and writes ('autoOpenSubagent'). */
    key: string;
    /** Row title (i18n friendly: string or () => string). */
    title: string | (() => string);
    /** Row description (i18n friendly). */
    desc?: string | (() => string);
    /** Row control type; defaults to 'switch' (backward compatible). */
    type?: SidebarSettingToggleType;
    /** Lower bound for `type: 'number'` rows (clamped on commit). */
    min?: number;
    /** Upper bound for `type: 'number'` rows (clamped on commit). */
    max?: number;
    /** Input placeholder for `type: 'text'` rows. */
    placeholder?: string;
    /** Unit suffix rendered after the input (e.g. 'px' for a size row). */
    unit?: string;
    /** Options of a `type: 'select'` row. */
    options?: readonly SidebarSettingSelectOption[];
    /** Whether a `type: 'select'` row allows picking several options (the
     *  stored value is then an array of option values); defaults to false. */
    multi?: boolean;
}
/** Props of a descriptor's custom settings panel (`settings.render`). */
export interface SidebarSettingsRenderProps {
    store: SidebarStore;
    service: BetterSidebarService;
    prefs: SidebarPrefs;
    /** This descriptor's own persisted settings blob (from `pluginSettings[id]`). */
    pluginSettings: Record<string, unknown>;
    /** Persist one plugin-owned setting of this descriptor. */
    updatePluginSetting(key: string, value: unknown): void;
    /** Close the settings popup. */
    close(): void;
}
/** Declarative settings of one registered tab or file viewer. */
export interface SidebarSettingsDeclaration {
    /**
     * Extra settings rows rendered under the feature's own row in the
     * settings page (only while the feature is enabled). Keys must be fields
     * of the host's PrefsSchema (built-ins: 'autoOpenSubagent',
     * 'agentTerminalTools', 'terminalFontFamily'); unknown keys are dropped
     * by the settings seam.
     */
    toggles?: readonly SidebarSettingToggle[];
    /**
     * Plugin-owned settings rows (v0.12.0+): same row controls as `toggles`
     * (switch/text/number), but the keys are plugin-local and persisted in
     * the sidebar's own prefs document under `pluginSettings[<descriptor id>]`
     * — no host PrefsSchema field needed. Values must be JSON-serializable
     * (the row controls produce strings / numbers / booleans).
     */
    pluginToggles?: readonly SidebarSettingToggle[];
    /**
     * Custom settings panel (v0.12.0+): when given, the gear popup renders
     * this instead of the row lists (`toggles` / `pluginToggles`). Receives
     * the shared store/service, the live prefs, the descriptor's own
     * `pluginSettings` blob, and a persistence helper.
     */
    render?: (props: SidebarSettingsRenderProps) => ReactNode;
}
/** Props every tab component receives (builtins and external alike). */
export interface TabComponentProps {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;
    tab: SidebarTab;
    /** Whether this tab is the active one AND the panel is open (live views pause otherwise). */
    visible: boolean;
    /** The explorer's expanded directory set (ExplorerView). */
    expanded?: string[];
    onToggleDir?: (path: string) => void;
    onReferenceFile?: (path: string) => void;
    onOpenFile?: (path: string) => void;
    onOpenDiff?: (tab: SidebarTab) => void;
    onSubagentJump?: (childSessionId: string) => void;
}
/** Describes one kind of sidebar tab (builtins register themselves too). */
export interface TabDescriptor {
    /** Unique id; also the `SidebarTab.type` value (`'explorer'`, `'my-plugin:db'`). */
    id: string;
    title: string | (() => string);
    icon?: ReactNode | ((size: number) => ReactNode);
    /** + menu sort order (ascending); default 100. */
    order?: number;
    /** Hide from the + menu (the editor tab is opened by file-open, not by the menu). */
    hidden?: boolean;
    /**
     * + menu disabled predicate (e.g. terminal at capacity). Receives the
     * session scope and the live sidebar state (counts, expansions).
     */
    available?: (ctx: Context, scope: SessionScope, state: SidebarState) => boolean;
    /**
     * Single-instance sugar: `true` is shorthand for `dedupeKey: () => id`
     * (opening the tab focuses an existing one of the same type instead of
     * creating a duplicate). An explicit `dedupeKey` always wins when both
     * are given. Builtins: explorer/git/subagent use `single: true`.
     */
    single?: boolean;
    /**
     * If provided, opening a tab whose `dedupeKey(tab)` matches an existing
     * tab's key focuses the existing one instead of creating a new one.
     * Returning `undefined` means "no dedup — always open a new tab".
     * Builtins: editor uses `tab => tab.path`; diff uses `tab => tab.id`
     * (openDiffTab mints change-derived ids).
     */
    dedupeKey?: (tab: SidebarTab) => string | undefined;
    /**
     * Custom tab creation (minting the `SidebarTab` and any state patches).
     * Return `null` to refuse creation. The terminal builtin uses this to
     * mint `terminal:<n>` ids and bump `nextTerminal`.
     * When omitted, a default `{ id, type, title }` tab is created.
     */
    createTab?: (state: SidebarState) => {
        tab: SidebarTab;
        patch?: Partial<SidebarState>;
    } | null;
    /**
     * External-link target claim (v0.13.0+): when a GUI external-link click
     * is taken over (the `browserInterceptLinks` master AND the URL's
     * protocol flag — `browserInterceptHttp` / `browserInterceptHttps` —
     * are on), the first registered tab whose `urlTarget(url)` returns true
     * is opened with `openTab({ type, url, title: hostname })` — the URL is
     * the whole payload (the tab reads it from `tab.path`). Registration
     * order wins (first claim first served); a disabled tab type is skipped;
     * a throwing predicate is swallowed (console.error, the type is skipped).
     * The built-in browser tab declares NO urlTarget — it stays the implicit
     * fallback target, so plugins can never be shadowed by it. To host more
     * than one URL at a time, mint per-URL ids through `createTab` (the
     * browser builtin's pattern); otherwise the id safety net focuses the
     * existing tab of the same type and the new URL is not applied.
     */
    urlTarget?: (url: URL) => boolean;
    /**
     * Declarative settings shown in the Side card settings page: every
     * registered tab gets an enable/disable switch (icon + title + id), and
     * `settings.toggles` adds nested switches tied to SidebarPrefs fields
     * (e.g. the subagent tab's 'autoOpenSubagent').
     */
    settings?: SidebarSettingsDeclaration;
    /**
     * Tab-strip badge (v0.12.0+): a small pill rendered on the tab next to
     * the icon — a number renders as a count (99+ capped), a string renders
     * as-is, null/undefined hides the badge. Called on every tab-bar render,
     * so keep it cheap; a throw is swallowed (no badge shown).
     */
    badge?: (ctx: Context, scope: SessionScope, state: SidebarState) => string | number | null | undefined;
    /**
     * Lifecycle callbacks (v0.12.0+). Fired by the SERVICE paths only:
     * `onOpen` when an open actually creates a tab (a dedupe/id-safety-net
     * focus is NOT an open — it fires `onActivate` instead), `onActivate`
     * when a tab is focused (dedupe focus, id-safety-net focus, or the
     * tab-bar activation), `onClose` when a tab is closed through
     * `closeTab`. Builtin-only flows that mutate state directly (the diff
     * split placement, agent-terminal reconcile) never touch external tabs
     * and fire no callbacks. A throwing callback is logged and never breaks
     * the open/close/activate flow.
     */
    onOpen?: (tab: SidebarTab, scope: SessionScope) => void;
    onActivate?: (tab: SidebarTab, scope: SessionScope) => void;
    onClose?: (tab: SidebarTab, scope: SessionScope) => void;
    component: (props: TabComponentProps) => ReactNode;
}
/** How the host loads a file's bytes for one viewer. */
export type FileFetchStrategy = 'none' | 'fsRead' | 'mediaUrl' | 'custom' | 'binary-download';
/** Props every file viewer component receives. */
export interface FileViewerProps {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;
    path: string;
    title: string;
    /** The matching descriptor's id (`'code'`, `'my-plugin:csv'`). */
    viewerId: string;
    /** fsRead text content (fetchStrategy='fsRead'). */
    content?: string;
    truncated?: boolean;
    /** mediaUrl for the path (fetchStrategy='mediaUrl'). */
    mediaUrl?: string;
    /** custom load() return value (fetchStrategy='custom'). */
    customData?: unknown;
    /** Internal (built-in text editor): 'host' asks the viewer to skip its own
     *  toolbar row — the editor host's merged-mode header renders it instead,
     *  fed through the two callbacks below. Viewers that ignore these fields
     *  render exactly as before. */
    toolbar?: 'self' | 'host';
    /** Internal: the viewer reports its toolbar state (mode/dirty/save). */
    onToolbarState?: (state: EditorToolbarState) => void;
    /** Internal: the viewer registers its toolbar commands on mount (null on
     *  unmount). */
    onToolbarControls?: (controls: EditorToolbarControls | null) => void;
}
/** The toolbar state a text editor reports to the host's merged-mode header. */
export interface EditorToolbarState {
    /** Whether the preview/edit mode toggle applies (markdown/html). */
    modes: boolean;
    mode: 'preview' | 'edit';
    dirty: boolean;
    /** Whether saving applies (text content loaded). */
    editable: boolean;
    saveState: 'idle' | 'saving' | 'saved' | 'failed';
}
/** The commands the host's merged-mode header sends back to the viewer. */
export interface EditorToolbarControls {
    setMode(mode: 'preview' | 'edit'): void;
    save(): void;
}
/** Describes one file previewer (builtins register themselves too). */
export interface FileViewerDescriptor {
    /** Unique id (`'image'`, `'pdf'`, `'my-plugin:csv'`). */
    id: string;
    /** Display name for the settings inventory (falls back to `id` when absent). */
    title?: string | (() => string);
    /** Icon shown in the settings inventory. */
    icon?: ReactNode | ((size: number) => ReactNode);
    /** Lowercase extensions without leading dot (`['png','jpg']`). `[]` = match any (catch-all). */
    exts: readonly string[];
    /** Higher wins; default 0. Builtins use 0; the catch-all `code` viewer uses -100. */
    priority?: number;
    fetchStrategy: FileFetchStrategy;
    /**
     * Content sniff: when `head` bytes are available the descriptor's `detect`
     * is consulted before its `exts` (per-descriptor, in priority order).
     */
    detect?: (path: string, head: Uint8Array) => boolean;
    /** fetchStrategy='custom' loader. `signal` (v0.12.0+) aborts on viewer
     *  teardown / re-match; loaders that ignore it keep working. */
    load?: (path: string, scope: SessionScope, signal?: AbortSignal) => Promise<unknown>;
    /**
     * Declarative settings shown in the Side card settings page: every
     * registered viewer gets an enable/disable switch (icon + title + exts).
     */
    settings?: SidebarSettingsDeclaration;
    component: (props: FileViewerProps) => ReactNode;
}
/** One `openTab` request. */
export interface OpenTabSeed {
    type: string;
    /** Overrides the descriptor's title when given (the editor tab shows the file name). */
    title?: string;
    /** A file path (the editor tab's content seed). */
    path?: string;
    /** A diff reference (the diff tab's content seed). */
    diff?: SidebarTab['diff'];
    /** Explicit tab id (defaults to the type). */
    id?: string;
    /** A URL the tab navigates to on mount (the browser tab's seed). */
    url?: string;
    /** JSON-serializable custom state carried on the minted tab (persisted across reloads; v0.12.0+). */
    meta?: unknown;
}
/**
 * The registry service published as `ctx.betterSidebar`.
 */
export interface BetterSidebarService {
    registerTab(descriptor: TabDescriptor): () => void;
    registerFileViewer(descriptor: FileViewerDescriptor): () => void;
    getTabs(): readonly TabDescriptor[];
    getFileViewers(): readonly FileViewerDescriptor[];
    /** Find a tab descriptor by id (undefined if not registered). */
    getTab(id: string): TabDescriptor | undefined;
    /**
     * Whether a tab type is enabled in the side card prefs. An absent
     * `tabsEnabled[id]` entry means enabled — only an explicit `false`
     * disables the type (hidden from the + menu, `openTab` refuses, and
     * derived flows gate on it).
     */
    isTabEnabled(id: string): boolean;
    /** Whether a file viewer is enabled (absent `viewersEnabled[id]` = enabled). */
    isViewerEnabled(id: string): boolean;
    /**
     * Find a file viewer for a path (priority desc; detect first, then exts).
     * Disabled viewers are skipped, so files fall through to the next match.
     */
    matchFileViewer(path: string, head?: Uint8Array): FileViewerDescriptor | undefined;
    /**
     * Open a tab (used by external tabs and the + menu). `title` overrides
     * the descriptor's title when given (the editor tab shows the file name);
     * when the descriptor provides `createTab` it mints the tab itself and
     * `title`/`path`/`id` are ignored. `url` lands the tab with its `path`
     * pre-set to the URL (the browser tab's navigation seed; the caller
     * usually pairs it with a hostname `title`). A disabled tab type is a
     * no-op.
     *
     * `scope` (v0.12.0+) targets a specific session: when given, the open
     * lands in THAT session's sidebar state (loading it if it has none yet)
     * without switching the UI's active session; when absent the open lands
     * in the currently active session (the pre-0.12 behavior).
     *
     * A CONTENT open (a `path` or `url` seed) must land in sight: when the
     * panel hosting the landing pane is collapsed, it is expanded
     * automatically (the right panel by default, the bottom panel when the
     * active pane lives there; on narrow viewports the merged drawer opens).
     * Type-only opens (the + menu, agent-terminal auto-tabs) never expand —
     * the panel behavior is their caller's business.
     *
     * Note: `available` gates the + menu's disabled state only — it does NOT
     * refuse `openTab` (only the settings disable switch does).
     */
    openTab(seed: OpenTabSeed, scope?: SessionScope): void;
    /**
     * Close a tab by id (fires descriptor.onClose). An unknown tab id is a
     * strict no-op (no state churn, no callbacks). `scope` (v0.12.0+) rides
     * to the callback (its optional cwd included); absent, the callback gets
     * `{ sessionId }` of the active session.
     */
    closeTab(tabId: string, scope?: SessionScope): void;
    /** Subscribe to registry changes (register/dispose). */
    subscribe(listener: () => void): () => void;
    /** The plugin version this service instance was built from ('0.12.0'). */
    readonly version: string;
    /**
     * Monotonic capability list (v0.12.0+): 'badge' | 'tabLifecycle' |
     * 'updateTab' | 'openFile' | 'targetedOpen' | 'stateSubscription' |
     * 'tabMeta' | 'pluginSettings'. Features are never removed — consumers
     * gate new API usage on membership.
     */
    readonly features: readonly string[];
    /**
     * The current sidebar snapshot: the active session id, its state (panel
     * geometry, open tabs, expansions), and the side card prefs (v0.12.0+).
     * `state`/`sessionId` are undefined until a session becomes active.
     */
    getSnapshot(): SidebarSnapshot;
    /** Subscribe to snapshot changes (session switch, state changes, prefs changes). Returns the disposer. */
    subscribeState(listener: () => void): () => void;
    /** Update an open tab's display fields (title / path / meta); a missing tab id is a no-op. */
    updateTab(tabId: string, patch: {
        title?: string;
        path?: string;
        meta?: unknown;
    }): void;
    /**
     * Activate an open tab (the tab-bar activation path; fires
     * descriptor.onActivate). An unknown tab id is a strict no-op. `scope`
     * (v0.12.0+) rides to the callback like `closeTab`'s.
     */
    activateTab(tabId: string, scope?: SessionScope): void;
    /** Open a file in the sidebar editor of `scope`'s session (title defaults to the file name). */
    openFile(scope: SessionScope, path: string, title?: string): void;
}
/**
 * Find the tab type that claims an intercepted external-link URL (v0.13.0+).
 * Walks the descriptors in REGISTRATION order and returns the first one
 * that declares `urlTarget` and matches `url`; a throwing predicate is
 * swallowed (console.error, type skipped) so one broken plugin can never
 * break the whole link pipeline. The caller passes the ENABLED tab
 * descriptors (enablement is the caller's prefs domain — filter
 * `service.getTabs()` through `tabsEnabled` before matching) and falls
 * back to the built-in browser tab when nothing claims the URL (the
 * browser never declares `urlTarget` itself, so it can never shadow a
 * plugin claim).
 */
export declare function matchUrlTarget(tabs: readonly TabDescriptor[], url: URL): TabDescriptor | undefined;
/**
 * The plugin version this service instance reports. Keep in lockstep with
 * `package.json`'s version — `tests/service.spec.ts` asserts the pair.
 */
export declare const SIDEBAR_SERVICE_VERSION = "0.14.0";
/**
 * Monotonic capability list consumers use to gate new API usage (features
 * are never removed). Each string names a v0.12.0+ capability:
 * - 'badge': TabDescriptor.badge
 * - 'tabLifecycle': TabDescriptor.onOpen/onActivate/onClose
 * - 'updateTab': BetterSidebarService.updateTab
 * - 'openFile': BetterSidebarService.openFile
 * - 'targetedOpen': BetterSidebarService.openTab(seed, scope?)
 * - 'stateSubscription': getSnapshot/subscribeState
 * - 'tabMeta': SidebarTab.meta (seeds, createTab, updateTab, persistence)
 * - 'pluginSettings': SidebarSettingsDeclaration.pluginToggles/render
 * - 'urlTarget' (v0.13.0): TabDescriptor.urlTarget (external-link claims)
 * - 'settingSelect': SidebarSettingToggle type 'select' (options/multi)
 */
export declare const SIDEBAR_FEATURES: readonly ["badge", "tabLifecycle", "updateTab", "openFile", "targetedOpen", "stateSubscription", "tabMeta", "pluginSettings", "urlTarget", "settingSelect"];
/**
 * Create one BetterSidebar service bound to a store. The service owns the
 * tab/viewer registries (Map + listener set) and proxies openTab/closeTab
 * to the store's reducer. One instance per client plugin activation.
 */
export declare function createBetterSidebarService(store: SidebarStore): BetterSidebarService;
