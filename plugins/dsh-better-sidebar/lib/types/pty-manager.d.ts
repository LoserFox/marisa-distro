import type { IPty } from 'node-pty';
import { type NodePtyModule } from './pty-deps.ts';
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
    pty: IPty;
    /** Output accumulated since spawn (bounded; head dropped when over the limit). */
    transcript: string;
    /** Whether the top-level process exited (transcript stays replayable). */
    exited: boolean;
    exitCode?: number | null;
}
/**
 * The terminal registry. `maxPerSession` bounds concurrent processes per
 * conversation (the client caps tabs at the same number).
 *
 * Lifecycle of a UI-tab pty when its WebSocket drops:
 * - **Close frame** (`{type:'close'}`): the user closed the tab → schedule a
 *   0-ms close (quota released immediately).
 * - **Park frame** (`{type:'park'}`): the user switched to another
 *   conversation; the tab is still open in its session's persisted state but
 *   its view unmounted → mark the pty as parked (no auto-close countdown).
 *   The pty stays alive until the user switches back (a reconnecting view
 *   calls `open()` which clears the parked state) or the tab is later closed
 *   (a `{type:'close'}` frame from a fresh connection). Without `park`, a
 *   bare socket drop would start the reconnect-grace countdown and kill the
 *   shell after `reconnectGraceMs` — wrong for a session switch, where the
 *   user is still actively using the app, just in another conversation.
 * - **Bare socket drop** (no frame): page refresh, crash, plugin teardown →
 *   schedule a close after `reconnectGraceMs` so a quick reconnect reattaches
 *   the same shell.
 */
export declare class PtyManager {
    private readonly shell;
    private readonly maxPerSession;
    private readonly shellArgs;
    /** The loaded node-pty module (injected so a broken install degrades instead of crashing the plugin). */
    private readonly nodePty;
    private readonly sessions;
    private readonly pendingCloses;
    /** Tabs whose view unmounted because the user switched conversations — the
     *  tab is still open in its session's state, so the pty must NOT enter the
     *  reconnect-grace countdown. Cleared by `cancelClose` (a reconnecting
     *  view's `open()` cancels it) or by `scheduleClose` (an explicit close
     *  frame still kills a parked pty). */
    private readonly parked;
    constructor(shell: string, maxPerSession: number, shellArgs?: string[], 
    /** The loaded node-pty module (injected so a broken install degrades instead of crashing the plugin). */
    nodePty?: NodePtyModule);
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
    open(sessionId: string, tabId: string, cwd: string, cols: number, rows: number, shell?: string, shellArgs?: string[]): SidebarPty;
    /**
     * Schedule the terminal's destruction after `delayMs`. A tab close sends
     * delay 0 (release the quota immediately); a bare socket drop (refresh,
     * crash) uses the grace period so a quick reconnect keeps the process.
     * `open()` cancels any pending close. Clears the parked state — an explicit
     * close frame on a parked pty (the user switched back and closed the tab)
     * still kills it.
     */
    scheduleClose(key: string, delayMs: number): void;
    /**
     * Park a terminal: the owning tab's view unmounted because the user
     * switched to another conversation, but the tab is still open in its
     * session's persisted state. Cancels any pending grace close and marks
     * the pty so the host's `ws.on('close')` handler does NOT start the
     * reconnect-grace countdown — the pty stays alive until the user switches
     * back (a reconnecting view's `open()` clears this) or explicitly closes
     * the tab (a `{type:'close'}` frame's `scheduleClose` clears this).
     */
    park(key: string): void;
    /** Whether this pty was parked (its view unmounted for a session switch). */
    isParked(key: string): boolean;
    /** Cancel a pending scheduled close (the terminal is being reopened).
     *  Also clears the parked state — a reconnecting view reattaches a parked
     *  pty and resumes normal lifecycle. */
    cancelClose(key: string): void;
    /** Resolve a live handle by key, or undefined. */
    get(key: string): SidebarPty | undefined;
    /** Close a terminal and drop its state (the owning tab was closed). */
    close(key: string): void;
    /** Close every terminal (plugin teardown). */
    disposeAll(): void;
}
/**
 * Inputs for {@link defaultShell} resolution. Every field is optional and
 * defaults to the live process, which keeps the no-argument call sites
 * working while tests (and exotic embedders) can pin the platform, the
 * environment, and the existence probe independently — the Windows chain
 * never executes on the ubuntu CI runners, so it is only testable through
 * these injection points.
 */
export interface ShellResolutionOptions {
    /** Platform override (defaults to `process.platform`). */
    platform?: NodeJS.Platform;
    /** Environment override; the resolver only reads SHELL, DSH_SIDEBAR_SHELL, PATH, ProgramW6432, ProgramFiles, LOCALAPPDATA. */
    env?: NodeJS.ProcessEnv;
    /** Explicitly configured shell (the `shell` config field); wins over every automatic source. Empty means unset. */
    explicit?: string;
    /** File-existence probe override (defaults to `existsSync`). */
    exists?: (path: string) => boolean;
}
/**
 * The interactive shell for this platform, resolved like a terminal
 * emulator: an explicitly configured shell (the `shell` config field) wins,
 * then `$SHELL` on POSIX (deployment override), then the account's login
 * shell from passwd, then `/bin/bash`. The passwd step matters because
 * service managers and container inits often start dsh without `SHELL`, and
 * the tab should still open the user's login shell (e.g. zsh) instead of
 * silently degrading to bash.
 *
 * Windows previously short-circuited to `powershell.exe` (the inbox 5.1)
 * before any resolution, so PowerShell 7 users always got a legacy shell
 * without `??`/`?.`/ternary and with poor ANSI/UTF-8 defaults. The Windows
 * chain is now: explicit shell → `DSH_SIDEBAR_SHELL` env override → first
 * `pwsh.exe` found on PATH or in a known install directory → the 5.1
 * fallback (machines without PowerShell 7 keep working).
 */
export declare function defaultShell(options?: ShellResolutionOptions): string;
/**
 * A short display name for a shell executable, used as the terminal tab
 * title. `/bin/zsh` → `zsh`, `C:\...\powershell.exe` → `powershell`.
 * Falls back to the raw value when no basename can be derived.
 */
export declare function shellDisplayName(shell: string): string;
/**
 * Spawn arguments that make the shell behave like a terminal-emulator tab:
 * POSIX shells start as login shells (`-l`) so they read the profile files
 * (`~/.profile`, `~/.zprofile`); Windows PowerShell takes no login flag.
 *
 * When explicit `configured` args are supplied they REPLACE the platform
 * defaults entirely, giving deployments full control over shell startup.
 */
export declare function shellSpawnArgs(configured?: string[]): string[];
