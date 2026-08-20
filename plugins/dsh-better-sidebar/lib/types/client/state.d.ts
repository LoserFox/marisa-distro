/**
 * Per-session sidebar state: the panel geometry, the split-pane workbench
 * tree, open tabs, and the explorer expansion set. One state instance per
 * conversation id, persisted to localStorage under `dsh-sidebar:v1:<id>` so
 * a reload restores the exact layout of the session it belongs to — switching
 * conversations swaps the whole state (memory + isolation).
 *
 * The split tree is a recursive structure: a leaf holds a tab group, a split
 * divides the space row- or column-wise with fractional sizes. All tree
 * operations are pure functions over the node, unit-tested in tests/state.spec.ts.
 */
import { type SidebarPrefs } from '../prefs-shared.ts';
/**
 * Tab type identifier. Builtins register their ids (editor / git / terminal
 * / subagent / browser / diff) through the sidebar service; external
 * plugins register their own (e.g. `'my-plugin:db'`). Kept as `string` so
 * the registry stays open.
 */
export type TabType = string;
/** What a diff tab shows: a worktree/index change of one path, or one commit's full patch. */
export type SidebarDiffRef = {
    kind: 'worktree';
    path: string;
    staged: boolean;
    untracked?: boolean;
} | {
    kind: 'commit';
    hash: string;
    hashFull: string;
    subject: string;
};
/** One open tab. `path` carries the file (editor) or is absent (git/terminal);
 *  `diff` carries the change a diff tab shows; `meta` (v0.12.0+) carries
 *  plugin-owned JSON-serializable state, preserved across reloads. */
export interface SidebarTab {
    id: string;
    type: TabType;
    title: string;
    path?: string;
    diff?: SidebarDiffRef;
    /** Plugin-owned state (v0.12.0+): MUST be JSON-serializable — it is
     *  persisted with the layout and restored verbatim on reload. */
    meta?: unknown;
}
/** A tab group. */
export interface SidebarLeaf {
    kind: 'leaf';
    id: string;
    tabs: SidebarTab[];
    active: string | null;
}
/** A recursive split between child panes (fractional sizes summing to 1). */
export interface SidebarSplit {
    kind: 'split';
    id: string;
    dir: 'row' | 'col';
    sizes: number[];
    children: SplitNode[];
}
export type SplitNode = SidebarLeaf | SidebarSplit;
/** The full per-session state. */
export interface SidebarState {
    panelOpen: boolean;
    width: number;
    /** The pane receiving newly opened tabs (last pane the user touched).
     *  Pane ids are globally unique across BOTH trees (shared uid counter), so
     *  one field resolves into either tree — see {@link treeOf}. */
    activePane: string | null;
    /** Monotonic terminal tab counter (ids survive reloads). */
    nextTerminal: number;
    /** Monotonic browser tab counter (ids survive reloads; mirrors nextTerminal). */
    nextBrowser: number;
    /** Explorer expansion set (absolute directory paths). */
    expanded: string[];
    /** The right sidebar's split tree (the original workbench). */
    splits: SplitNode;
    /** Whether the bottom panel (a second, independent workbench) is open. */
    bottomOpen: boolean;
    /** The bottom panel's height (clamped to the contract range). */
    bottomHeight: number;
    /**
     * Whether the bottom panel has been expanded at least once in this
     * session — the FIRST expansion tries to auto-open a terminal tab (gated
     * on the bottomPanelAutoTerminal pref); later expansions never do.
     */
    bottomOpenedOnce: boolean;
    /** The bottom panel's own split tree (panes/tabs live only in ONE tree;
     *  tabs never cross panels — the two panels only share panel-size drags). */
    bottomSplits: SplitNode;
}
export declare const PANEL_MIN = 280;
export declare const PANEL_MAX = 640;
export declare const PANEL_DEFAULT = 400;
export declare const TAB_MAX_WIDTH = 160;
/** Bottom panel geometry contract (mirrors the width contract; the upper
 * bound is the viewport, enforced by {@link setBottomHeight}). */
export declare const BOTTOM_MIN = 120;
export declare const BOTTOM_DEFAULT = 220;
/** Mint a fresh uid-based tab id. The `'editor:' + path` convention only
 *  covers openSidebarFile opens (per-path dedupe); opens that must not
 *  dedupe (the tree's "open to the side") mint through here. */
export declare function mintTabId(): string;
/** The default tab a fresh session seeds. */
export type DefaultSeed = 'editor-home' | 'none';
/** A fresh default state: one seeded tab in one pane, open per the caller's
 * preference. `width` is the caller's preferred panel width (default
 * PANEL_DEFAULT) and `panelOpen` whether the panel starts expanded (default
 * true); the store seeds new sessions from the user's side card prefs.
 * `seed` picks the seeded tab: 'editor-home' places the EMPTY files window
 * (an editor tab with no path whose tree panel starts open,
 * `meta.treeOpen: true`) — in BOTH editorExplorer modes that window is the
 * file explorer page — and 'none' starts with an empty pane (the store
 * passes it when the user disabled the editor tab type in settings). */
export declare function makeDefaultState(width?: number, panelOpen?: boolean, seed?: DefaultSeed): SidebarState;
/** Which tree owns a pane/split id: 'bottomSplits' when the id lives in the
 *  bottom panel's tree, else 'splits' (the right panel's tree). Ids are
 *  globally unique (the shared uid counter), so an id in neither tree falls
 *  back to the right tree, where tree operations no-op on a missing node —
 *  the pre-bottom-panel behavior. */
export declare function treeOf(state: SidebarState, id: string): 'splits' | 'bottomSplits';
/** Walk the tree and apply `visit` to the leaf with the given id. */
export declare function mapLeaf(node: SplitNode, paneId: string, visit: (leaf: SidebarLeaf) => void): SplitNode;
/** The first leaf of the tree (fallback pane when activePane is gone). */
export declare function firstLeaf(node: SplitNode): SidebarLeaf;
/**
 * Narrow-viewport migration: the bottom panel's tabs are thrown INTO the
 * right sidebar — the "merged display" on mobile is the right panel alone,
 * whose tab strips now carry the bottom tree's tabs (depth-first order,
 * appended to the right tree's FIRST leaf). The bottom tree is emptied (its
 * structure stays — the desktop bottom panel re-renders its welcome cards)
 * and the panel closes. The active pane moves to the right tree's first
 * leaf so every new tab lands in the visible panel.
 *
 * Idempotent: a bottom tree with no tabs and a closed panel returns the
 * same reference. Runs when the viewport enters narrow (see the Sidebar
 * shell); migrating is permanent for the session — the tabs now live in the
 * right tree, exactly like the user "threw them in".
 */
export declare function migrateBottomTabs(state: SidebarState): SidebarState;
/** Find the leaf containing a tab id, if any. */
export declare function leafWithTab(node: SplitNode, tabId: string): SidebarLeaf | undefined;
/** All leaves of the tree, depth-first. */
export declare function allLeaves(node: SplitNode): SidebarLeaf[];
/** Whether a tab exists anywhere in a state (either tree, any pane). */
export declare function tabOpenIn(state: SidebarState, tabId: string): boolean;
/** Replace a leaf with a split of it plus a fresh empty leaf. */
export declare function splitLeafAt(node: SplitNode, paneId: string, dir: 'row' | 'col'): SplitNode;
/**
 * Split a leaf by inserting a fresh leaf holding `tab` beside it — the
 * VSCode drag-to-edge gesture. `dir` is the split direction ('row' for
 * left/right, 'col' for up/down); `front` places the new leaf first (left/
 * up) or second (right/down).
 * @returns the new tree plus the fresh leaf's id (the drop's active pane).
 */
export declare function insertLeafAt(node: SplitNode, paneId: string, dir: 'row' | 'col', tab: SidebarTab, front: boolean): {
    node: SplitNode;
    leafId: string;
};
/** Where a tab drop lands on a pane: an edge creates a split, center merges. */
export type DropZone = 'left' | 'right' | 'up' | 'down' | 'center';
/**
 * The VSCode drag gesture: move a tab out of its pane and either merge it
 * into the target pane (center) or split the target pane with the tab in a
 * fresh leaf (edge). The source pane collapses when it empties.
 *
 * The panes may live in DIFFERENT trees (dragging a tab between the two
 * panels): the tab then leaves its own tree and lands in the other one.
 */
export declare function moveTabToEdge(state: SidebarState, fromPane: string, tabId: string, toPane: string, zone: DropZone): SidebarState;
/**
 * Remove a leaf from the tree. A split left with one child promotes that
 * child; removing the last leaf yields an empty leaf.
 */
export declare function removeLeafAt(node: SplitNode, paneId: string): SplitNode;
/** Close a tab; an emptied leaf is removed (unless it is the only pane). */
export declare function closeTab(state: SidebarState, paneId: string, tabId: string): SidebarState;
/** Activate a tab in its pane (the pane's own tree). */
export declare function activateTab(state: SidebarState, paneId: string, tabId: string): SidebarState;
/** Update the display fields of one open tab (title / path / meta) without
 *  re-opening it. The browser tab persists its current URL and hostname
 *  title through this reducer so a reload restores the visited page. A
 *  missing tab id is a no-op. The tab may live in either tree. */
export declare function patchTab(state: SidebarState, tabId: string, patch: {
    title?: string;
    path?: string;
    meta?: unknown;
}): SidebarState;
/**
 * Land a tab in the active pane (or focus its existing instance by id).
 * Dedup strategies (single-instance, per-path, per-change) are owned by the
 * tab descriptor through {@link BetterSidebarService.openTab} / `dedupeKey`;
 * this reducer only handles the id-based safety net (reconcile and
 * openDiffTab already check existence before calling) and the landing
 * itself — the service's dedupe path delegates here after its dedupeKey
 * check misses.
 *
 * The active pane may live in EITHER tree (pane ids are globally unique):
 * a stale id that survives in neither tree falls back to the right tree's
 * first pane instead of swallowing the open.
 */
export declare function openTabInActivePane(state: SidebarState, tab: SidebarTab): SidebarState;
/** Move a tab from one pane to another (insert at index; -1 appends).
 *  The panes may live in DIFFERENT trees — dragging a tab between the two
 *  panels removes it from its own tree and lands it in the other one. */
export declare function moveTab(state: SidebarState, fromPane: string, tabId: string, toPane: string, index?: number): SidebarState;
/** Split the active pane (or the pane containing the active tab). */
export declare function splitPane(state: SidebarState, dir: 'row' | 'col'): SidebarState;
/**
 * Open a diff tab the VSCode way: an existing instance of the same change is
 * focused wherever it lives; otherwise the tab joins the first pane that
 * already holds diff tabs (diff panes are sticky — repeated clicks stack
 * there); on the FIRST diff of a layout the source pane splits vertically so
 * the diff lands in a fresh pane below it ("默认在下半栏新增一个").
 *
 * This is split-tree placement surgery, not registry dispatch: the diff tab
 * descriptor's `dedupeKey` is `(tab) => tab.id`, and the existing-instance
 * check below is exactly that rule — the two agree by construction (asserted
 * in tests). Diff tabs minted by the Git view carry change-derived ids, so
 * the id check is the per-change dedupe.
 * @returns the new state, with the diff pane active.
 */
export declare function openDiffTab(state: SidebarState, sourcePaneId: string, tab: SidebarTab): SidebarState;
/** Toggle the panel open/closed (opening restores the previous layout). */
export declare function togglePanel(state: SidebarState): SidebarState;
/** Toggle the bottom panel open/closed (independent of the right panel). */
export declare function toggleBottomPanel(state: SidebarState): SidebarState;
/** Set the panel width (clamped to the contract range; the upper bound is
 * the viewport so the fullscreen expansion can fill the window). */
export declare function setWidth(state: SidebarState, width: number): SidebarState;
/** Set the bottom panel height (clamped to the contract range). The upper
 * bound leaves the center column (the agent output area) at least PANEL_MIN
 * tall — without the cap the bottom panel could swallow the whole viewport
 * and squeeze the conversation to zero height. */
export declare function setBottomHeight(state: SidebarState, height: number): SidebarState;
/** Toggle a directory in the explorer expansion set. */
export declare function toggleExpanded(state: SidebarState, path: string): SidebarState;
/** Adjust one split divider: `i` is the left/top child index, delta in fractions. */
export declare function resizeSplit(node: SplitNode, splitId: string, index: number, delta: number): SplitNode;
/** State-level {@link resizeSplit} route: the divider may live in either
 *  tree (split ids are globally unique). */
export declare function resizeSplitIn(state: SidebarState, splitId: string, index: number, delta: number): SidebarState;
/** Prefix marking a tab id as an agent-owned terminal (suffix is the uuid). */
export declare const AGENT_TAB_PREFIX = "agent:";
/** Whether a tab id refers to an agent-owned terminal. */
export declare function isAgentTabId(tabId: string): boolean;
/** Extract the agent terminal uuid from an `agent:<uuid>` tab id. */
export declare function agentUuidOf(tabId: string): string;
/** Build the sidebar tab id for one agent terminal uuid. */
export declare function agentTabId(uuid: string): string;
/**
 * Reconcile the sidebar's agent-terminal tabs with the host's live list.
 * The host pushes the current list of agent terminals (created by the model
 * through the `terminal_create` tool) over a dedicated WebSocket; this
 * reducer mirrors that list into tabs: new uuids get a tab, vanished uuids
 * lose theirs. The agent owns the lifetime — the user closing a tab sends a
 * WS close frame that kills the pty, which fires a change, which converges
 * the view. Idempotent: a no-op when the lists already match.
 * @param state - the current per-session sidebar state.
 * @param agentTerminals - the live agent terminal snapshots from the host.
 * @returns the next state (or the same reference if no change was needed).
 */
export declare function reconcileAgentTerminals(state: SidebarState, agentTerminals: ReadonlyArray<{
    uuid: string;
    title: string;
}>): SidebarState;
/** Immutable snapshot handed to React (replaced only on real changes). */
export interface SidebarSnapshot {
    sessionId: string | undefined;
    state: SidebarState | undefined;
    /**
     * The current side card prefs. Carried IN the snapshot (not a separate
     * subscription) so prefs changes re-render the consumers that gate on
     * them — the + menu hides a tab type the moment its switch flips.
     */
    prefs: SidebarPrefs;
}
/** Default panel width for one viewport: the prefs percent of the window,
 * clamped to the panel floor (a tiny percent must stay usable) and to the
 * viewport (a large one must never cover the whole window). */
export declare function defaultWidthFor(viewport: number, percent: number): number;
/**
 * Structural validation of one persisted state. A malformed or stale shape
 * (older layouts, hand-edited storage) must fall back to the default instead
 * of crashing the panel on every reload; the restored width is also clamped
 * to the current viewport so a stale fullscreen width can never crush the
 * app shell (margin-right larger than the window) or cover the whole screen.
 * @returns a clean state, or undefined to fall back to the default.
 */
export declare function sanitizeState(parsed: unknown): SidebarState | undefined;
/** The session-scoped store: one state per conversation, localStorage-backed. */
export declare class SidebarStore {
    private readonly bySession;
    private snapshot;
    private readonly listeners;
    /** Per-session persist debounce timers (v0.12.0+: one per session, so a
     *  targeted open never cancels another session's pending write). */
    private readonly persistTimers;
    /** User-facing side card prefs seeding brand-new session states (defaults until the settings RPC resolves). */
    private prefs;
    /**
     * External disable (the dsh-web-ui family's aionui-panel provider choice):
     * while true the sidebar must not mount at all. Not part of the snapshot —
     * nothing renders on it; the mount gate and the intercept predicates read
     * it directly.
     */
    private suspended;
    /**
     * Set the external-disable flag (from the settings route) and remember it
     * for the mount gate and the intercept predicates.
     */
    setSuspended(suspended: boolean): void;
    /** Whether the sidebar is externally disabled (aionui-panel chosen). */
    getSuspended(): boolean;
    /**
     * Replace the side card prefs (the settings RPC result / settings page
     * write). Notifies like any store change: the snapshot carries the prefs,
     * so consumers that gate on enable switches (the + menu, derived flows)
     * re-render with the new values immediately.
     */
    setPrefs(prefs: SidebarPrefs): void;
    /** The current side card prefs (seeds new sessions; persisted states win). */
    getPrefs(): SidebarPrefs;
    /** Select a session (or none); loads its persisted state. */
    setSession(sessionId: string | undefined): void;
    subscribe(listener: () => void): () => void;
    getSnapshot(): SidebarSnapshot;
    /** Mutate the current session's state (no-op without a session). */
    update(mutator: (draft: SidebarState) => void): void;
    /**
     * Whether a tab still exists in its session's state. Views use this on
     * unmount to tell "the tab was closed" (release the terminal now) from
     * "the tree re-rendered / the conversation switched" (the tab is still
     * open — keep the terminal alive through the host's reconnect grace).
     * Checks the session's own map entry (the current snapshot may already
     * point at another session when a conversation switch unmounts the old
     * one's tabs).
     */
    tabOpen(sessionId: string, tabId: string): boolean;
    /** Apply a pure reducer (returns the next state). */
    reduce(reducer: (state: SidebarState) => SidebarState): void;
    /**
     * Apply a pure reducer to a TARGET session's state (not the active one),
     * loading it on demand and persisting the result — WITHOUT switching the
     * active snapshot or notifying (the UI must not follow along). Used by the
     * service's targeted `openTab(seed, scope)`: the open lands in the target
     * session's layout and is visible whenever the user switches to it.
     */
    reduceFor(sessionId: string, reducer: (state: SidebarState) => SidebarState): void;
    private schedulePersist;
    private notify;
}
/**
 * Create one sidebar store instance. Production code calls this only from
 * the client plugin's `apply` (the instance is handed to components as a
 * prop); tests call it directly. No module-level singleton: the store's
 * lifetime belongs to the plugin activation, exactly like the official
 * `createXXXStore()` factory rule.
 */
export declare function createSidebarStore(): SidebarStore;
