/**
 * Minimal zh/en/ja copy for the sidebar. The copy follows the DSH i18n system:
 * the client apply attaches the locale service (`ctx.locale`, provided by
 * `@deepseek-ai/dsh-client-locale`) through {@link attachLocale}, and
 * `t()`/`isZh()` resolve the active locale from it — the Host-backed
 * `locale.preference` wins over the raw browser language and switches live.
 * Without an attached service (standalone/test compositions) the browser
 * language is used, matching the previous behavior. The dictionaries are
 * also registered into the DSH locale registry under {@link LOCALE_NS}.
 *
 * ja (Japanese) is opt-in through `@huanlin/dsh-plugin-better-locale`: when
 * that plugin is installed, the client apply also calls
 * {@link attachBetterLocale} with the override store. `t()` then consults
 * the store's active override id first; if it is `'ja'` (or any id whose
 * dict has the requested key) the ja text wins, otherwise the existing
 * zh/en chain runs unchanged. better-locale itself patches
 * `LocaleRuntime.prototype.lookup` so DSH's own translate chain also
 * returns ja where the `betterSidebar` namespace has a ja entry — that
 * path covers external callers of `ctx.locale.bind('betterSidebar')`,
 * while the override-aware `t()` here covers better-sidebar's own
 * components (which bypass `ctx.locale` and call `t()` directly).
 */
/** The zh dictionary (also registered into the DSH locale registry under {@link LOCALE_NS}). */
export declare const zh: {
    files: string;
    explorer: string;
    git: string;
    terminal: string;
    editor: string;
    editorExplorer: string;
    editorExplorerDesc: string;
    editorExplorerMerged: string;
    editorExplorerMergedDesc: string;
    editorExplorerSplit: string;
    editorExplorerSplitDesc: string;
    editorTreeToggle: string;
    editorPathPlaceholder: string;
    editorSearchPlaceholder: string;
    editorSearchNoResults: string;
    editorSearchTruncated: string;
    editorEmptyHint: string;
    openFileNewTab: string;
    openFileSide: string;
    openWithMenu: string;
    openWithSshSuffix: string;
    pinOpenWith: string;
    unpinOpenWith: string;
    openWithExplorer: string;
    openWithVscode: string;
    openWithCursor: string;
    openWithZed: string;
    openWithSettingsSshTitle: string;
    openWithSettingsSshDesc: string;
    openWithSettingsSshPlaceholder: string;
    openWithSettingsCustomTitle: string;
    openWithSettingsCustomDesc: string;
    openWithSettingsAdd: string;
    openWithSettingsName: string;
    openWithSettingsTemplate: string;
    openWithSettingsFamily: string;
    openWithSettingsFamilyDesc: string;
    openWithSettingsRemove: string;
    openWithSettingsInvalidHint: string;
    newTab: string;
    openExplorer: string;
    brokenSymlink: string;
    openGit: string;
    newTerminal: string;
    terminalLimit: string;
    close: string;
    closeOtherTabs: string;
    closeLeftTabs: string;
    closeRightTabs: string;
    moveToFreeWindow: string;
    floatDropHint: string;
    dockToSidebar: string;
    collapse: string;
    expand: string;
    collapseBottomPanel: string;
    expandBottomPanel: string;
    terminalError: string;
    terminalConnectFailed: string;
    terminalRetry: string;
    terminalDepsFailed: string;
    terminalDepsHint: string;
    terminalDepsProfile: string;
    preview: string;
    toc: string;
    edit: string;
    mermaidError: string;
    mermaidZoomIn: string;
    mermaidZoomOut: string;
    mermaidZoomReset: string;
    mermaidZoomHint: string;
    refresh: string;
    refreshUnsavedConfirm: string;
    save: string;
    saved: string;
    unsaved: string;
    saveFailed: string;
    truncation: string;
    binary: string;
    loading: string;
    error: string;
    retry: string;
    splitLeft: string;
    splitRight: string;
    splitUp: string;
    splitDown: string;
    notRepo: string;
    noChanges: string;
    stage: string;
    unstage: string;
    stageAll: string;
    unstageAll: string;
    commitPlaceholder: string;
    commit: string;
    commitError: string;
    branch: string;
    worktree: string;
    checkoutError: string;
    history: string;
    changes: string;
    staged: string;
    unstaged: string;
    cancel: string;
    diffEmpty: string;
    diffLoadError: string;
    diffBinary: string;
    diffAdded: string;
    diffDeleted: string;
    diffRenamed: string;
    diffExpand: string;
    diffCollapse: string;
    discard: string;
    discardTitle: string;
    discardDesc: string;
    viewCommitDiff: string;
    copyShortHash: string;
    copyFullHash: string;
    copySubject: string;
    revertCommit: string;
    revertTitle: string;
    revertDesc: string;
    cherryPickCommit: string;
    cherryPickTitle: string;
    cherryPickDesc: string;
    timeJustNow: string;
    timeMinutesAgo: string;
    timeHoursAgo: string;
    timeYesterday: string;
    loadMore: string;
    historyLoadError: string;
    produced: string;
    producedOpen: string;
    showInFolder: string;
    disconnected: string;
    exited: string;
    noSession: string;
    pluginNotLoaded: string;
    hiddenFiles: string;
    parent: string;
    copied: string;
    copy: string;
    newFile: string;
    openEditor: string;
    gitDetail: string;
    referenceFile: string;
    addToConversation: string;
    copyRelative: string;
    copyAbsolute: string;
    download: string;
    uploadFiles: string;
    uploadFolder: string;
    uploadHere: string;
    uploadDropHint: string;
    uploadDropChat: string;
    uploadTo: string;
    uploadingTo: string;
    uploadProgress: string;
    uploadDone: string;
    uploadFailed: string;
    uploadFailedUnknown: string;
    uploadTooLarge: string;
    uploadCancelled: string;
    settingsNav: string;
    settingsIntro: string;
    settingsPopupDesc: string;
    settingsDone: string;
    settingsOpenTitle: string;
    settingsOpenDesc: string;
    settingsWidthTitle: string;
    settingsWidthDesc: string;
    settingsWidthSuffix: string;
    settingsOpenPathTitle: string;
    settingsOpenPathDesc: string;
    settingsOpenToolsTitle: string;
    settingsOpenToolsDesc: string;
    settingsTitleBarTitle: string;
    settingsTitleBarDesc: string;
    settingsTitleBarStripTitle: string;
    settingsTitleBarStripDesc: string;
    settingsSchemeAutoTitle: string;
    settingsSchemeAutoDesc: string;
    settingsSchemeWebTitle: string;
    settingsSchemeWebDesc: string;
    settingsSchemeCustomTitle: string;
    settingsSchemeCustomDesc: string;
    settingsSchemeDetectedSuffix: string;
    settingsCustomCssTitle: string;
    settingsCustomCssDesc: string;
    settingsCustomCssPlaceholder: string;
    settingsSaveFailed: string;
    settingsConflict: string;
    binaryNoPreview: string;
    downloadToView: string;
    settingsSubagentTitle: string;
    settingsSubagentDesc: string;
    settingsJobsTitle: string;
    settingsJobsDesc: string;
    settingsToolsTitle: string;
    settingsToolsDesc: string;
    settingsBottomTerminalTitle: string;
    settingsBottomTerminalDesc: string;
    settingsFontFamilyTitle: string;
    settingsFontFamilyDesc: string;
    settingsFontFamilyPlaceholder: string;
    settingsFontSizeTitle: string;
    settingsFontSizeDesc: string;
    settingsFontSizeSuffix: string;
    settingsShellTitle: string;
    settingsShellDesc: string;
    settingsShellPlaceholder: string;
    settingsShellArgsTitle: string;
    settingsShellArgsDesc: string;
    settingsShellArgsPlaceholder: string;
    settingsTabsTitle: string;
    settingsViewersTitle: string;
    settingsGeneralTitle: string;
    settingsPopup: string;
    settingsViewerCatchAll: string;
    viewerImage: string;
    viewerPdf: string;
    viewerMarkdown: string;
    viewerCode: string;
    viewerBinary: string;
    viewerHtml: string;
    browser: string;
    browserPlaceholder: string;
    browserGo: string;
    browserBack: string;
    browserForward: string;
    browserStart: string;
    browserBlockedScheme: string;
    browserBlockedLoopback: string;
    browserInvalid: string;
    browserNoSandboxWarning: string;
    htmlNoSandboxWarning: string;
    sandboxStatusOn: string;
    sandboxUnlock: string;
    sandboxRestore: string;
    settingsHtmlDefaultUnsafeTitle: string;
    settingsHtmlDefaultUnsafeDesc: string;
    settingsHtmlSandboxTitle: string;
    settingsHtmlSandboxDesc: string;
    settingsBrowserSandboxTitle: string;
    settingsBrowserSandboxDesc: string;
    settingsBrowserLinksTitle: string;
    settingsBrowserLinksDesc: string;
    settingsBrowserHttpTitle: string;
    settingsBrowserHttpDesc: string;
    settingsBrowserHttpsTitle: string;
    settingsBrowserHttpsDesc: string;
    settingsBrowserLoopbackTitle: string;
    settingsBrowserLoopbackDesc: string;
    settingsBrowserLoopbackPlaceholder: string;
    browserOpenExternal: string;
    browserEmbedBlocked: string;
    browserEmbedBlockedDesc: string;
    browserEmbedAnyway: string;
    subagent: string;
    openSubagent: string;
    subagentMainAgent: string;
    subagentEmpty: string;
    subagentEmptyDesc: string;
    subagentRunning: string;
    subagentInactive: string;
    subagentModeOneShot: string;
    subagentModeContinuable: string;
    subagentCount: string;
    subagentCountRunning: string;
    subagentDiagCorrupt: string;
    subagentDiagUnsupported: string;
    subagentDiagUnavailable: string;
    subagentThinking: string;
    sideChat: string;
    sideChatNew: string;
    sideChatUntitled: string;
    sideChatEmpty: string;
    sideChatEmptyDesc: string;
    sideChatCreating: string;
    sideChatRetry: string;
    sideChatThreads: string;
    sideChatSave: string;
    sideChatSaveTitle: string;
    sideChatSaved: string;
    sideChatNoTurn: string;
    sideChatPendingDrop: string;
    sideChatFirstPlaceholder: string;
    sideChatComposerPlaceholder: string;
    sideChatThinking: string;
    sideChatThink: string;
    sideChatInjection: string;
    sideChatSend: string;
    sideChatCancel: string;
    sideChatCancelTitle: string;
    sideChatClose: string;
    sideChatCloseTitle: string;
    sideChatError: string;
    jobs: string;
    jobsCount: string;
    jobsCountRunning: string;
    jobStatusRunning: string;
    jobStatusStopping: string;
    jobStatusCompleted: string;
    jobStatusKilled: string;
    jobStatusFailed: string;
    jobDurationSeconds: string;
    jobDurationMinutes: string;
    jobDurationHours: string;
    jobViewOutput: string;
    jobHideOutput: string;
    jobNoOutput: string;
    jobNotReadYet: string;
    jobOutputTruncated: string;
    jobOutputError: string;
    jobKill: string;
    jobKillConfirm: string;
    jobKillError: string;
    addPluginsTabCard: string;
    addPluginsTabCardDesc: string;
    addPluginsViewerCard: string;
    addPluginsViewerCardDesc: string;
    addPluginsTabDesc: string;
    addPluginsViewerDesc: string;
    addPluginsBrowseMore: string;
    addPluginsSearch: string;
    addPluginsNoMatch: string;
    addPluginsRecommended: string;
    addPluginsEmpty: string;
    openPlugin: string;
    copyInstall: string;
    pluginOfficeDesc: string;
    pluginFlowglassDesc: string;
    pluginGitForgeDesc: string;
    pluginGitRemotesDesc: string;
    pluginSentinelDesc: string;
    pluginSidebarQaDesc: string;
    pluginSshTunnelDesc: string;
    pluginTurnReviewDesc: string;
    pluginVideoPreviewDesc: string;
    pluginDocsPanelDesc: string;
    pluginEgoBrowserDesc: string;
};
/** The en dictionary (key-set-equal to zh, enforced by the type annotation). */
export declare const en: Record<keyof typeof zh, string>;
/**
 * The dictionary namespace this plugin owns in the DSH locale registry
 * (`'sidebar'` is taken by DSH's own ui-sidebar, hence this distinct name).
 */
export declare const LOCALE_NS = "betterSidebar";
/** The ja dictionary (key-set-equal to zh, enforced by the type annotation). */
export declare const ja: Record<keyof typeof zh, string>;
export declare const de: Record<keyof typeof zh, string>;
export declare const fr: Record<keyof typeof zh, string>;
export declare const pt: Record<keyof typeof zh, string>;
export declare const ko: Record<keyof typeof zh, string>;
export declare const ar: Record<keyof typeof zh, string>;
export declare const hi: Record<keyof typeof zh, string>;
export declare const id: Record<keyof typeof zh, string>;
export declare const tr: Record<keyof typeof zh, string>;
export declare const vi: Record<keyof typeof zh, string>;
export declare const th: Record<keyof typeof zh, string>;
export declare const ru: Record<keyof typeof zh, string>;
export declare const it: Record<keyof typeof zh, string>;
export declare const nl: Record<keyof typeof zh, string>;
export declare const sv: Record<keyof typeof zh, string>;
export declare const pl: Record<keyof typeof zh, string>;
export declare const zhHK: Record<keyof typeof zh, string>;
export declare const zhTW: Record<keyof typeof zh, string>;
export declare const zhMO: Record<keyof typeof zh, string>;
/**
 * The better-locale override store attached by the client apply
 * (absent → no override; the zh/en chain runs). The store's `active`
 * field holds the user's chosen override id (e.g. `'ja'`); `undefined`
 * means "no override, use DSH native zh/en".
 *
 * The override only takes effect when DSH's active locale is `'en'`
 * (it borrows DSH's English slot to render a third language). While
 * DSH is on `'zh'` the override is inert — `getOverride` returns
 * `undefined` and `isOverrideActive` returns `false` — so `t()` and
 * `isZh()` fall through to the native zh/en chain unchanged.
 */
declare let betterLocaleStore: {
    readonly active: string | undefined;
    getOverride(dshActive: string, ns: string, key: string): string | undefined;
    isOverrideActive(dshActive: string): boolean;
} | undefined;
/**
 * Attach (or detach, with undefined) the DSH locale service. The sidebar
 * mounts its own React root outside the slot system's locale seat, so the
 * service rides this module-level holder: components keep calling the plain
 * `t()` function, and the Sidebar root's locale subscription re-renders the
 * whole tree on switches.
 */
export declare function attachLocale(service: {
    getSnapshot(): {
        active: string;
    };
} | undefined): void;
/**
 * Attach (or detach, with undefined) the better-locale override store.
 * When attached with an active override, `t()` consults the store's
 * `getOverride(active, LOCALE_NS, key)` first; if it returns a string,
 * that text wins over the zh/en chain. Detaching (or the store's active
 * being `undefined`) restores the zh/en chain unchanged.
 *
 * The Sidebar root subscribes to the store separately (see Sidebar.tsx)
 * so an override change re-renders the whole tree — the locale service's
 * own revision bump (which better-locale triggers via `publish(active, true)`)
 * does NOT fire the existing `localeRevision` uSES because that snapshot
 * reads `getSnapshot().active` (unchanged) rather than `revision`.
 */
export declare function attachBetterLocale(store: typeof betterLocaleStore): void;
/** Translate a copy key in the active locale (zh → zh, else en). */
export type CopyKey = keyof typeof zh;
/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
export declare function t(key: CopyKey, params?: Record<string, string | number>): string;
/** Whether the active locale is Chinese (used for selectors). */
export declare function isZh(): boolean;
/** Format an ISO 8601 author date relative to now (刚刚 / N 分钟前 / N 小时前 / 昨天 / date). */
export declare function relativeTime(iso: string): string;
export {};
