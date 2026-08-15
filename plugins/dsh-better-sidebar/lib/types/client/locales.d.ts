/**
 * Minimal zh/en copy for the sidebar. The copy follows the DSH i18n system:
 * the client apply attaches the locale service (`ctx.locale`, provided by
 * `@deepseek-ai/dsh-client-locale`) through {@link attachLocale}, and
 * `t()`/`isZh()` resolve the active locale from it — the Host-backed
 * `locale.preference` wins over the raw browser language and switches live.
 * Without an attached service (standalone/test compositions) the browser
 * language is used, matching the previous behavior. The dictionaries are
 * also registered into the DSH locale registry under {@link LOCALE_NS}.
 */
/** The zh dictionary (also registered into the DSH locale registry under {@link LOCALE_NS}). */
export declare const zh: {
    explorer: string;
    git: string;
    terminal: string;
    editor: string;
    newTab: string;
    openExplorer: string;
    openGit: string;
    newTerminal: string;
    terminalLimit: string;
    close: string;
    collapse: string;
    expand: string;
    collapseBottomPanel: string;
    expandBottomPanel: string;
    terminalError: string;
    terminalConnectFailed: string;
    terminalRetry: string;
    preview: string;
    edit: string;
    refresh: string;
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
    settingsNav: string;
    settingsOpenTitle: string;
    settingsOpenDesc: string;
    settingsWidthTitle: string;
    settingsWidthDesc: string;
    settingsWidthSuffix: string;
    settingsOpenPathTitle: string;
    settingsOpenPathDesc: string;
    settingsSaveFailed: string;
    settingsConflict: string;
    binaryNoPreview: string;
    downloadToView: string;
    officeTooLarge: string;
    officeCorrupt: string;
    officeEncrypted: string;
    officeLoadFailed: string;
    previousSlide: string;
    nextSlide: string;
    zoom: string;
    zoomHint: string;
    settingsSubagentTitle: string;
    settingsSubagentDesc: string;
    settingsJobsTitle: string;
    settingsJobsDesc: string;
    settingsToolsTitle: string;
    settingsToolsDesc: string;
    settingsBottomTerminalTitle: string;
    settingsBottomTerminalDesc: string;
    settingsTabsTitle: string;
    settingsViewersTitle: string;
    settingsGeneralTitle: string;
    settingsPopup: string;
    settingsViewerCatchAll: string;
    viewerImage: string;
    viewerPdf: string;
    viewerDocx: string;
    viewerXlsx: string;
    viewerPptx: string;
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
};
/** The en dictionary (key-set-equal to zh, enforced by the type annotation). */
export declare const en: Record<keyof typeof zh, string>;
/**
 * The dictionary namespace this plugin owns in the DSH locale registry
 * (`'sidebar'` is taken by DSH's own ui-sidebar, hence this distinct name).
 */
export declare const LOCALE_NS = "betterSidebar";
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
/** Translate a copy key in the active locale (zh → zh, else en). */
export type CopyKey = keyof typeof zh;
/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
export declare function t(key: CopyKey, params?: Record<string, string | number>): string;
/** Whether the active locale is Chinese (used for selectors). */
export declare function isZh(): boolean;
/** Format an ISO 8601 author date relative to now (刚刚 / N 分钟前 / N 小时前 / 昨天 / date). */
export declare function relativeTime(iso: string): string;
