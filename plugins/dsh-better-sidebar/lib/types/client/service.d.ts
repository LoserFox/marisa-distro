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
import { type SidebarState, type SidebarStore, type SidebarTab } from './state.ts';
import type { SessionScope } from './api.ts';
/** One declarative boolean setting of a tab/viewer, rendered as a nested
 *  switch row in the Side card settings page (e.g. the Subagent page's
 *  "auto-open when a subagent appears"). */
export interface SidebarSettingToggle {
    /** The SidebarPrefs field this toggle reads and writes ('autoOpenSubagent'). */
    key: string;
    /** Row title (i18n friendly: string or () => string). */
    title: string | (() => string);
    /** Row description (i18n friendly). */
    desc?: string | (() => string);
}
/** Declarative settings of one registered tab or file viewer. */
export interface SidebarSettingsDeclaration {
    /**
     * Extra boolean toggles rendered under the feature's own row in the
     * settings page (only while the feature is enabled). Keys must be fields
     * of the host's PrefsSchema (built-ins: 'autoOpenSubagent',
     * 'agentTerminalTools'); unknown keys are dropped by the settings seam.
     */
    toggles?: readonly SidebarSettingToggle[];
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
     * Declarative settings shown in the Side card settings page: every
     * registered tab gets an enable/disable switch (icon + title + id), and
     * `settings.toggles` adds nested switches tied to SidebarPrefs fields
     * (e.g. the subagent tab's 'autoOpenSubagent').
     */
    settings?: SidebarSettingsDeclaration;
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
    /** fetchStrategy='custom' loader. */
    load?: (path: string, scope: SessionScope) => Promise<unknown>;
    /**
     * Declarative settings shown in the Side card settings page: every
     * registered viewer gets an enable/disable switch (icon + title + exts).
     */
    settings?: SidebarSettingsDeclaration;
    component: (props: FileViewerProps) => ReactNode;
}
/** The registry service published as `ctx.betterSidebar`. */
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
     * A CONTENT open (a `path` or `url` seed) must land in sight: when the
     * panel hosting the landing pane is collapsed, it is expanded
     * automatically (the right panel by default, the bottom panel when the
     * active pane lives there; on narrow viewports the merged drawer opens).
     * Type-only opens (the + menu, agent-terminal auto-tabs) never expand —
     * the panel behavior is their caller's business.
     */
    openTab(seed: {
        type: string;
        title?: string;
        path?: string;
        diff?: SidebarTab['diff'];
        id?: string;
        url?: string;
    }): void;
    /** Close a tab by id. */
    closeTab(tabId: string): void;
    /** Subscribe to registry changes (register/dispose). */
    subscribe(listener: () => void): () => void;
}
/**
 * Create one BetterSidebar service bound to a store. The service owns the
 * tab/viewer registries (Map + listener set) and proxies openTab/closeTab
 * to the store's reducer. One instance per client plugin activation.
 */
export declare function createBetterSidebarService(store: SidebarStore): BetterSidebarService;
