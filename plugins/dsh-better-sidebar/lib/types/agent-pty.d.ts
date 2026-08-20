import type { IPty } from 'node-pty';
import { type NodePtyModule } from './pty-deps.ts';
/** POSIX signals the registry forwards to a live pty. */
export declare const ALLOWED_SIGNALS: readonly ["SIGINT", "SIGTERM", "SIGKILL", "SIGHUP", "SIGTSTP"];
/** Signal name accepted by `signal()`. */
export type AgentTerminalSignal = (typeof ALLOWED_SIGNALS)[number];
/** Default read page size (lines) when the caller omits `count`. */
export declare const DEFAULT_READ_COUNT = 500;
/** Smallest pty dimension the registry accepts (mirrors the tool contract). */
export declare const TERMINAL_DIM_MIN = 2;
/** Largest pty dimension the registry accepts (mirrors the tool contract). */
export declare const TERMINAL_DIM_MAX = 1024;
/** Clamp one cols×rows pair into the supported pty range (flooring decimals). */
export declare function clampDims(cols: number, rows: number): {
    cols: number;
    rows: number;
};
/**
 * Serializable snapshot of one agent terminal — the shape the model sees
 * through `terminal_list` and the sidebar sees through the push endpoint.
 * Carries no pty reference and no transcript (those are reached through
 * dedicated read/attach paths), and no sessionId: ownership is registry
 * internals, scoped by the caller (list filters by session, the push
 * endpoint scopes by its query param), never part of the serialized view.
 */
export interface AgentTerminalSnapshot {
    /** Stable opaque handle the model passes back to other terminal_* tools. */
    uuid: string;
    /** Display title the model chose at create time. */
    title: string;
    /** The command the model asked to run at create time (verbatim). */
    command: string;
    /** Whether the top-level process has exited. */
    exited: boolean;
    /** Exit code if exited normally; absent until the process exits. */
    exitCode?: number | null;
    /** Exit signal name if the process was killed by a signal; null otherwise. */
    exitSignal?: string | null;
}
/** One live agent terminal. */
export interface AgentTerminalHandle {
    /** Stable opaque handle. */
    uuid: string;
    /** Owning conversation id. */
    sessionId: string;
    /** Display title. */
    title: string;
    /** The command written to stdin right after spawn. */
    command: string;
    /** The working directory the process was spawned with. */
    cwd: string;
    /** The live pty process. */
    pty: IPty;
    /** Output accumulated since spawn (bounded; head dropped when over the limit). */
    transcript: string;
    /** Whether the top-level process exited (transcript stays replayable). */
    exited: boolean;
    /** Exit code once known. */
    exitCode?: number | null;
    /** Exit signal number once known (POSIX only; undefined on Windows). */
    exitSignal?: number | null;
}
/** Read result shape (mirrors the official tool-pty terminal_read contract). */
export interface AgentTerminalReadResult {
    /** The slice of transcript text for the requested page. */
    text: string;
    /** Total lines in the retained transcript (the page may be a subset). */
    totalLines: number;
    /** 0-based index of the first line in `text` (inclusive). */
    lineBegin: number;
    /** 0-based index of the last line in `text` (exclusive). */
    lineEnd: number;
}
/** Outcome of {@link AgentPtyRegistry.waitFor}. */
export type AgentTerminalWaitResult = {
    /** The needle was found in the transcript. */
    kind: 'found';
    /** The matched substring. */
    needle: string;
    /** 0-based line index (in the retained transcript) where the needle first appeared. */
    line: number;
    /** 0-based column index within that line where the match starts. */
    column: number;
    /** Elapsed wall-clock milliseconds from the wait start to the match. */
    elapsedMs: number;
} | {
    /** The needle did not appear before the timeout. */
    kind: 'timeout';
    /** The needle that was awaited. */
    needle: string;
    /** The configured timeout in milliseconds. */
    timeoutMs: number;
    /** Total lines retained when the timeout fired (call terminal_read to inspect). */
    totalLines: number;
} | {
    /** The terminal exited before the needle appeared. */
    kind: 'exited';
    /** The needle that was awaited. */
    needle: string;
    /** The exit code, if known. */
    exitCode?: number | null;
    /** The exit signal name, if the process was killed by a signal. */
    exitSignal?: string | null;
};
/** Snapshot projection of a handle (drops the pty reference and transcript). */
export declare function snapshotOf(handle: AgentTerminalHandle): AgentTerminalSnapshot;
/**
 * The agent terminal registry. The constructor takes the resolved shell
 * binary (the same `defaultShell()` the UI-tab registry uses) and runs the
 * spawn-helper chmod fix once at construction so the first agent terminal
 * does not race a lazy fixer.
 */
export declare class AgentPtyRegistry {
    private readonly shell;
    private readonly shellArgs;
    /** The loaded node-pty module (injected so a broken install degrades instead of crashing the plugin). */
    private readonly nodePty;
    private readonly sessions;
    private readonly changeListeners;
    constructor(shell: string, shellArgs?: string[], 
    /** The loaded node-pty module (injected so a broken install degrades instead of crashing the plugin). */
    nodePty?: NodePtyModule);
    /**
     * Spawn one agent terminal: start the shell in `cwd`, then write
     * `command + '\n'` to stdin so the command runs in the fresh shell. The
     * terminal stays alive after the command exits — the model can send more
     * input through `terminal_send` until it calls `terminal_close` or the
     * user closes the sidebar tab. An empty `command` spawns a bare shell.
     * @returns the new handle's uuid (the model-facing opaque id).
     */
    create(sessionId: string, title: string, command: string, cwd: string, cols?: number, rows?: number, shell?: string, shellArgs?: string[]): string;
    /** All live agent terminals belonging to one conversation. */
    list(sessionId: string): AgentTerminalSnapshot[];
    /** Resolve a live handle by uuid, or throw `not-found`. */
    private expect;
    /**
     * Resolve a live handle that belongs to `sessionId`, or throw `not-found`.
     * The model-facing tools call this before every uuid-keyed operation: a
     * uuid from another session is indistinguishable from an unknown one, so a
     * model can never reach (or probe) a terminal it does not own.
     */
    assertOwned(uuid: string, sessionId: string): AgentTerminalHandle;
    /** Resolve a handle's snapshot, or undefined if it does not exist. */
    snapshot(uuid: string): AgentTerminalSnapshot | undefined;
    /** Write raw text to a terminal's stdin (tmux `send-keys` semantics). */
    send(uuid: string, text: string): void;
    /**
     * Read one bounded page of the retained transcript. `offset` is a 0-based
     * line index from the start of the retained transcript (default 0);
     * `count` caps the page size (default 500). A negative `offset` reads
     * from the end (e.g. -50 reads the last 50 lines). Returns `totalLines`
     * so the model can paginate.
     */
    read(uuid: string, offset?: number, count?: number): AgentTerminalReadResult;
    /**
     * Resize a terminal's pty, clamped to the 2..1024 sane range.
     * @returns the dimensions actually applied (the caller echoes these, so the
     * reported value always matches the pty).
     */
    resize(uuid: string, cols: number, rows: number): {
        cols: number;
        rows: number;
    };
    /**
     * Wait for `needle` to appear in a terminal's transcript, or for the
     * terminal to exit, or for the timeout to elapse — whichever happens
     * first. The wait polls the live transcript every ~50ms and short-circuits
     * on `signal` abort (re-thrown as the abort reason so the tool layer
     * surfaces cancellation).
     *
     * The match scans the FULL retained transcript on each poll, not just the
     * delta since the last poll — a needle that scrolled past the most recent
     * chunk but is still within the ~1 MiB bound is still a match. The
     * returned line/column locate the FIRST occurrence (oldest), which is what
     * a user watching the terminal would have seen first.
     *
     * The implementation uses polling (not pty onData subscription) because
     * node-pty's onData fires before the registry's own onData listener
     * updates the transcript (listener order is not guaranteed), and on
     * Windows ConPTY output can arrive in bursts with batching delays that
     * make event-driven wakeups unreliable. A 50ms poll is fast enough for
     * interactive use and simple enough to be obviously correct.
     * @param uuid - terminal to watch.
     * @param needle - substring to search for (case-sensitive, verbatim).
     * @param timeoutMs - max wait; default 10000 (10s). Clamped to ≥100ms.
     * @param signal - caller-owned cancellation; aborts the wait re-throwing.
     * @returns one of `found` / `timeout` / `exited`.
     */
    waitFor(uuid: string, needle: string, timeoutMs?: number, signal?: AbortSignal): Promise<AgentTerminalWaitResult>;
    /**
     * Send a POSIX signal to a terminal's foreground process.
     *
     * Two delivery paths, by signal kind:
     * - **Interactive control signals** (SIGINT, SIGTSTP) are delivered by
     *   writing the corresponding control character to the pty stdin. This is
     *   how a real terminal sends Ctrl+C / Ctrl+Z: the byte hits the kernel
     *   line discipline (POSIX ISIG mode) or the ConPTY input pipeline
     *   (Windows), which translates it into a SIGINT/SIGTSTP for the
     *   foreground process group. This works on every platform — calling
     *   `node-pty.kill('SIGINT')` throws on Windows and is fragile on POSIX,
     *   but writing `\x03` is universally correct.
     * - **Termination signals** (SIGKILL, SIGTERM, SIGHUP) use `pty.kill()`,
     *   which maps to the platform's process-termination path (POSIX
     *   `kill(2)`, Windows `TerminateProcess`). These cannot be faked with
     *   control characters.
     */
    signal(uuid: string, signal: AgentTerminalSignal): void;
    /**
     * Close a terminal and drop its state. Idempotent: a second close of the
     * same uuid is a no-op. Returns true iff a live handle was actually
     * dropped.
     */
    close(uuid: string): boolean;
    /** Resolve a live handle by uuid (for the WS attach path). */
    get(uuid: string): AgentTerminalHandle | undefined;
    /**
     * Subscribe to registry changes (create / close / exit). The sidebar push
     * endpoint uses this to forward snapshots to the connected view. Returns
     * the unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /** Close every agent terminal (plugin teardown). */
    disposeAll(): void;
    /** Fire every change listener (callers wrap in try/catch if needed). */
    private notify;
}
