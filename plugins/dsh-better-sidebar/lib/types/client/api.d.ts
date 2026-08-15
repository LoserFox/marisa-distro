import type { BrowserProbeResult } from './browser.ts';
/** One wire failure. */
export declare class SidebarApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Explorer row (host fs-tree shape). */
export interface FsEntry {
    name: string;
    path: string;
    isDir: boolean;
    hidden: boolean;
}
/** Git status entry (host git shape). */
export interface GitStatusEntry {
    path: string;
    xy: string;
}
/** Git status snapshot. */
export interface GitStatusResult {
    isRepo: boolean;
    branch?: string;
    entries: GitStatusEntry[];
}
/** One git log row. */
export interface GitLogEntry {
    /** Short hash (7+ chars, display). */
    hash: string;
    /** Full 40-char hash (advanced operations). */
    hashFull: string;
    subject: string;
    author: string;
    /** ISO 8601 author date (`%ai`). */
    date: string;
    /** Ref decorations (--decorate=short), e.g. `HEAD -> main, origin/main`; '' when none. */
    refs: string;
}
/** Text read result. */
export interface FsTextResult {
    kind: 'text';
    content: string;
    truncated: boolean;
}
/** Binary read result (no content; images load through the media route).
 *  `head` carries the first bytes (base64) for viewer detect sniffing. */
export interface FsBinaryResult {
    kind: 'binary';
    size: number;
    truncated: boolean;
    head: string;
}
/**
 * One jobs.output response: the output the MODEL has read so far for the
 * job (replayed from the owner session's event log — the model's
 * job_output cursor is never touched, so the pane can never steal the
 * agent's bytes). `read` is false until the model actually called
 * job_output for the job.
 */
export interface JobOutputResult {
    text: string;
    /** True when the host capped the text at its output limit. */
    truncated: boolean;
    /** Whether the model has read the job at least once. */
    read: boolean;
}
/** One request's session scope: the conversation id plus its cwd when known. */
export interface SessionScope {
    sessionId: string;
    /** The session's working directory from the client list summary (optional). */
    cwd?: string;
}
/** The sidebar API surface (session scope threaded through every call). */
export declare const api: {
    sessionCwd: (scope: SessionScope, signal?: AbortSignal) => Promise<{
        sessionId: string;
        cwd: string;
        root: string;
        parent: string | null;
    }>;
    fsTree: (scope: SessionScope, path: string, signal?: AbortSignal) => Promise<{
        path: string;
        entries: FsEntry[];
        truncated: boolean;
    }>;
    fsRead: (scope: SessionScope, path: string, signal?: AbortSignal) => Promise<FsTextResult | FsBinaryResult>;
    fsWrite: (scope: SessionScope, path: string, content: string) => Promise<{
        ok: true;
    }>;
    gitStatus: (scope: SessionScope, signal?: AbortSignal) => Promise<GitStatusResult>;
    gitDiff: (scope: SessionScope, path: string | undefined, staged: boolean, signal?: AbortSignal) => Promise<{
        diff: string;
    }>;
    gitStage: (scope: SessionScope, path?: string) => Promise<{
        ok: true;
    }>;
    gitUnstage: (scope: SessionScope, path?: string) => Promise<{
        ok: true;
    }>;
    gitCommit: (scope: SessionScope, message: string) => Promise<{
        ok: true;
    }>;
    gitBranch: (scope: SessionScope, signal?: AbortSignal) => Promise<{
        current: string;
        names: string[];
    }>;
    gitCheckout: (scope: SessionScope, branch: string) => Promise<{
        ok: true;
    }>;
    /** Recent commit history, lazily pageable (skip/count; defaults 0/30). */
    gitLog: (scope: SessionScope, count?: number, skip?: number, signal?: AbortSignal) => Promise<GitLogEntry[]>;
    /** Full patch text of one commit (diff display for the history rows). */
    gitCommitDiff: (scope: SessionScope, hash: string, signal?: AbortSignal) => Promise<{
        diff: string;
    }>;
    /** Discard the worktree changes of one file (the index is untouched). */
    gitDiscard: (scope: SessionScope, path: string) => Promise<{
        ok: true;
    }>;
    /** Revert one commit onto the current branch. */
    gitRevert: (scope: SessionScope, hash: string) => Promise<{
        ok: true;
    }>;
    /** Cherry-pick one commit onto the current branch. */
    gitCherryPick: (scope: SessionScope, hash: string) => Promise<{
        ok: true;
    }>;
    /** Release a terminal's process immediately (tab closed; the WS close frame
     *  may be unreachable while the socket is down, so the host also accepts
     *  this explicit route). */
    ptyClose: (scope: SessionScope, tab: string) => Promise<{
        ok: true;
    }>;
    /** Release an agent terminal by uuid (tab closed while WS was down). */
    agentPtyClose: (uuid: string) => Promise<{
        ok: true;
    }>;
    /**
     * The output the model has read so far for one background job (replayed
     * from the owner session's event log — never the model's job_output
     * cursor). The scope MUST be the job's OWNER session.
     */
    jobOutput: (scope: SessionScope, id: string, signal?: AbortSignal) => Promise<JobOutputResult>;
    /** Request cancellation of one background job (live jobs flip to stopping). */
    jobKill: (scope: SessionScope, id: string, reason?: string) => Promise<{
        ok: true;
        outcome: "requested" | "already-finished";
    }>;
    /** Read the side card preferences (plugin-global, no session scope). */
    settingsGet: () => Promise<{
        value?: unknown;
        revision?: number;
    }>;
    /** Merge a patch into the side card preferences (revision-guarded). */
    settingsUpdate: (patch: Record<string, unknown>, expectedRevision?: number) => Promise<{
        value?: unknown;
        revision?: number;
    }>;
    /** Probe a URL's response headers (the sidebar browser's embeddability
     *  check; see the host's browser.probe route). */
    browserProbe: (url: string, signal?: AbortSignal) => Promise<BrowserProbeResult>;
};
/** Absolute URL of the media route for one path (images only). */
export declare function mediaUrl(scope: SessionScope, path: string): string;
/** Absolute URL of the download route: serves raw bytes (binary-safe) with
 *  `Content-Disposition: attachment`, so the browser saves the file. */
export declare function downloadUrl(scope: SessionScope, path: string): string;
/** Absolute URL of the HTML preview route (see html-route.ts): the path is
 *  fully encoded so the previewed page's relative assets resolve back into
 *  the same route with the session scope intact. */
export declare function htmlUrl(scope: SessionScope, path: string): string;
