/**
 * Minimal Git plumbing for dsh-session-isolate.
 * Every command runs through `git -C <dir> ...` with an argv array — no shell,
 * no string interpolation — and never touches the shared checkout's index,
 * HEAD, refs, or working tree except for the explicit, user-approved merge in
 * `mergeSessionBack` (which runs on the MAIN checkout on purpose).
 * @module dsh-session-isolate/git
 */
/** Result of a successful git invocation. */
export interface GitOk {
    readonly ok: true;
    readonly stdout: string;
    readonly stderr: string;
}
/** Result of a git invocation that exited nonzero (e.g. "nothing to commit"). */
export interface GitFail {
    readonly ok: false;
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}
export type GitResult = GitOk | GitFail;
/**
 * Run one git command in `dir`.
 * @param dir - directory to run in (`git -C dir`).
 * @param args - argv array, never shell-interpolated.
 * @param timeoutMs - kill the child after this long (defaults to 30s).
 */
export declare function runGit(dir: string, args: readonly string[], timeoutMs?: number): Promise<GitResult>;
/** Require a successful git result or throw with stderr context. */
export declare function requireGit(dir: string, args: readonly string[], context: string): Promise<string>;
/** Locate the repository root containing `cwd`, or `undefined` when cwd is not inside a git worktree. */
export declare function findRepoRoot(cwd: string): Promise<string | undefined>;
/** The repository root a worktree path belongs to (git -C wt rev-parse --show-toplevel). */
export declare function repoRootOfWorktree(worktreePath: string): Promise<string>;
/** Convert a git-reported path to the platform's native separator form. */
export declare function nativePath(path: string): string;
/** Current HEAD short hash of the checkout at `dir`. */
export declare function headShort(dir: string): Promise<string>;
/** Current branch name of the checkout at `dir`, or short hash when detached. */
export declare function currentBranch(dir: string): Promise<string>;
/** Whether `worktreePath` is already registered as a linked worktree of `repoRoot`. */
export declare function isRegisteredWorktree(repoRoot: string, worktreePath: string): Promise<boolean>;
/** Normalize a path for comparison (case-insensitive on Windows). */
export declare function normalizePath(path: string): string;
/** The worktree path a branch is checked out in, or `undefined` when checked out nowhere. */
export declare function branchWorktree(repoRoot: string, branch: string): Promise<string | undefined>;
/** Whether `branch` exists locally in `repoRoot`. */
export declare function branchExists(repoRoot: string, branch: string): Promise<boolean>;
/**
 * Add a linked worktree for `branch` at `worktreePath`, creating the branch
 * from the main checkout's HEAD when it does not exist yet. Idempotent: a
 * worktree already registered at that path is left untouched.
 */
export declare function addWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void>;
/** Commit every change in the worktree to its current branch. Returns true when a commit was made. */
export declare function commitAll(worktreePath: string, message: string): Promise<boolean>;
/** Whether the worktree has uncommitted changes (porcelain status non-empty). */
export declare function hasUncommitted(worktreePath: string): Promise<boolean>;
/** One-line log of `branch` relative to `base` (commits in branch not in base). */
export declare function branchLog(repoRoot: string, base: string, branch: string): Promise<string>;
/** Diffstat between the branch and the main checkout's HEAD, rendered text. */
export declare function branchDiffStat(repoRoot: string, branch: string): Promise<string>;
/**
 * Merge `branch` into the MAIN checkout's current branch (the only operation
 * that mutates the shared checkout). Uses `--no-ff` so the session's commits
 * stay visible as one merge unit. Returns the merge result; on conflict the
 * caller decides whether to abort.
 */
export declare function mergeIntoMain(repoRoot: string, branch: string, message: string): Promise<GitResult>;
/** Abort an in-progress merge in the main checkout. */
export declare function abortMerge(repoRoot: string): Promise<void>;
/** Remove the linked worktree (branch is kept by default; --force clears uncommitted state). */
export declare function removeWorktree(repoRoot: string, worktreePath: string): Promise<void>;
/** Delete the local branch (fails when checked out anywhere). */
export declare function deleteBranch(repoRoot: string, branch: string): Promise<void>;
