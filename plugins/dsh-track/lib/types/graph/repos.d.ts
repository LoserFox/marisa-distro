/**
 * M2b — repo-touch project induction: a session's PROJECT is the git
 * repository its tool calls actually touched (file_path / workdir / `git -C`
 * targets), NOT the session's cwd directory name. A workspace cwd like
 * ~/source/dsh/explorer is not a project — the user works on dsh-track,
 * dsh-harness-ops, the dsh web harness etc. from inside it, and those are
 * the repos we resolve from the paths in the log.
 *
 * Resolution is fs-backed but pure w.r.t. the log: the same events yield the
 * same repo set for a given filesystem, so re-runs are stable. The graph
 * builder attaches `header.repos` at build time (service layer), and
 * induceProjects groups by repo URL instead of cwd.
 * @module @fakechris/dsh-track/graph/repos
 */
/** One repository a session's tool calls touched. */
export interface RepoRef {
    /** origin remote URL (canonical project identity), when readable. */
    url: string;
    /** Repo root (the dir containing .git). */
    root: string;
    /** Display name — basename of the root (dsh-track, dsh-harness-ops…). */
    name: string;
}
export declare function _clearRepoCache(): void;
/**
 * Nearest enclosing git repo root for a path, walking up (max 16 levels).
 * Handles worktrees (.git is a file pointing at a gitdir). Returns undefined
 * when no repo encloses the path.
 */
export declare function repoRootOf(path: string): string | undefined;
/** Origin remote URL of a repo root (pure fs read of .git/config). */
export declare function repoUrlOf(root: string): string | undefined;
/** Display name from a repo URL tail (dsh-track, dsh-harness-ops…). */
export declare function nameOfUrl(url: string): string;
/** Resolve one absolute path to a RepoRef (or undefined when outside any repo). */
export declare function repoRefOf(path: string): RepoRef | undefined;
/**
 * Absolute paths mentioned in one tool/call event's arguments. `arguments`
 * is a JSON string; we extract file paths / workdirs / `git -C` targets.
 */
export declare function pathsOfEvent(data: unknown): string[];
/**
 * Repos touched by tool calls in a seq window [start, end). Requirement-level
 * project attribution: an issue's span (sourceSpan.seqStart..seqEnd) resolves
 * to the repo the work in that window actually touched — not the session's
 * first repo. Falls back to all-session repos when the window is empty.
 */
export declare function reposOfEventsInRange(events: readonly {
    type?: unknown;
    seq?: unknown;
    data?: unknown;
}[], start: number, end: number): RepoRef[];
/**
 * Sorted tool-call seq -> repos-touched index for a session. Build once per
 * session; requirement spans binary-search into it instead of rescanning all
 * events per issue (the attribution hot path).
 */
export interface RepoTouchIndex {
    seq: number;
    repos: RepoRef[];
}
export declare function buildRepoTouchIndex(events: readonly {
    type?: unknown;
    seq?: unknown;
    data?: unknown;
}[]): RepoTouchIndex[];
/** First repos touched at or after `start` (binary search), up to `end`. */
export declare function reposInRange(idx: RepoTouchIndex[], start: number, end: number): RepoRef[];
/**
 * Repos touched by one session's events, in first-seen order (deduped).
 * Deterministic for a given log + filesystem.
 */
export declare function reposOfEvents(events: readonly {
    type?: unknown;
    data?: unknown;
}[]): RepoRef[];
