/**
 * Durable per-session isolation state: one record per session that owns a
 * linked worktree. Stored at `~/.dsh/session-isolate/state.json` (atomic
 * replace; whole-value discipline like the DSH projection checkpoints).
 * @module dsh-session-isolate/state
 */
/** One session's isolation record. */
export interface IsolationRecord {
    /** Repository root (the shared checkout that owns the worktree). */
    readonly repo: string;
    /** Absolute path of this session's linked worktree. */
    readonly worktree: string;
    /** Branch the worktree is checked out on (`iso/<shortId>`). */
    readonly branch: string;
    /** ISO timestamp of creation. */
    readonly createdAt: string;
    /** Last turn number committed automatically (or undefined before the first). */
    readonly lastTurn?: number;
    /** Directories junction-linked from the main checkout (node_modules etc.). */
    readonly linked?: readonly string[];
}
/** Root directory of the isolation ledger (overridable for tests). */
export declare function stateRoot(): string;
/** Directory that hosts linked worktrees (per-user, outside any checkout). */
export declare function worktreesRoot(): string;
/** All isolation records, keyed by session id. */
export declare function allRecords(): Promise<Record<string, IsolationRecord>>;
/** One session's record, or undefined when the session is not isolated. */
export declare function recordOf(sessionId: string): Promise<IsolationRecord | undefined>;
/** Upsert one session's record. */
export declare function putRecord(sessionId: string, record: IsolationRecord): Promise<void>;
/** Update only the mutable fields of one session's record. */
export declare function updateRecord(sessionId: string, patch: Partial<IsolationRecord>): Promise<void>;
/** Drop one session's record (keeps the worktree and branch on disk). */
export declare function forgetRecord(sessionId: string): Promise<void>;
/** Directory that will host the worktree for one session (derived, not yet created). */
export declare function worktreePathFor(repoRoot: string, sessionId: string): string;
/** Branch name for one session. */
export declare function branchFor(sessionId: string): string;
/** Resolve a junction target only when it exists (guard against stale links). */
export declare function existingDir(path: string): Promise<string | undefined>;
/** Parent directory of a path, for mkdir calls. */
export declare function parentOf(path: string): string;
