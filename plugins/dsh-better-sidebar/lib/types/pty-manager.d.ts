import * as nodePty from 'node-pty';
/**
 * Restore the executable bit pnpm strips from node-pty's prebuilt
 * spawn-helper (the macOS helper that forks and sets up the pty). Without it
 * every spawn fails with `posix_spawnp failed`. Idempotent; mirrors
 * @deepseek-ai/dsh-terminal-bash's ensure-spawn-helper postinstall, run at
 * plugin activation so link-installed deployments get the fix too.
 */
export declare function ensureSpawnHelper(): void;
/** One live terminal. */
export interface SidebarPty {
    /** `${sessionId}:${tabId}` registry key. */
    key: string;
    sessionId: string;
    tabId: string;
    /** The working directory the process was SPAWNED with (a reconnect that
     *  resolves a different authoritative cwd respawns instead of reusing —
     *  the page-load hydrate race can attach the real cwd after the first
     *  connect, and a shell in the wrong directory must not linger). */
    cwd: string;
    pty: nodePty.IPty;
    /** Output accumulated since spawn (bounded; head dropped when over the limit). */
    transcript: string;
    /** Whether the top-level process exited (transcript stays replayable). */
    exited: boolean;
    exitCode?: number | null;
}
/**
 * The terminal registry. `maxPerSession` bounds concurrent processes per
 * conversation (the client caps tabs at the same number).
 */
export declare class PtyManager {
    private readonly shell;
    private readonly maxPerSession;
    private readonly sessions;
    private readonly pendingCloses;
    constructor(shell: string, maxPerSession: number);
    /** All live terminal keys of one session. */
    keysOf(sessionId: string): string[];
    /**
     * Open (or reuse) the terminal for a session/tab key. A handle whose
     * process already exited is replaced with a fresh spawn (reconnecting a
     * dead terminal must yield a live shell, not an input sink), and so is a
     * live handle whose spawn cwd differs from the now-authoritative one (the
     * first connect of a page load can arrive before the session hydrates, so
     * it fell back to the process cwd — reconnecting with the real cwd must
     * restart the shell in the right directory). Reopening also cancels any
     * pending scheduled close (a reconnect within the grace window keeps the
     * process alive).
     * @param sessionId - conversation id.
     * @param tabId - client tab id.
     * @param cwd - initial working directory (the session's cwd).
     * @param cols - initial terminal width.
     * @param rows - initial terminal height.
     * @returns the live handle.
     * @throws {SidebarError} pty-error when the per-session cap is reached.
     */
    open(sessionId: string, tabId: string, cwd: string, cols: number, rows: number): SidebarPty;
    /**
     * Schedule the terminal's destruction after `delayMs`. A tab close sends
     * delay 0 (release the quota immediately); a bare socket drop (refresh,
     * crash) uses the grace period so a quick reconnect keeps the process.
     * `open()` cancels any pending close.
     */
    scheduleClose(key: string, delayMs: number): void;
    /** Cancel a pending scheduled close (the terminal is being reopened). */
    cancelClose(key: string): void;
    /** Resolve a live handle by key, or undefined. */
    get(key: string): SidebarPty | undefined;
    /** Close a terminal and drop its state (the owning tab was closed). */
    close(key: string): void;
    /** Close every terminal (plugin teardown). */
    disposeAll(): void;
}
/** The interactive shell for this platform (empty SHELL falls back). */
export declare function defaultShell(): string;
