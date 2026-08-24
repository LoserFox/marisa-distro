/**
 * Minimal Git plumbing for dsh-session-isolate.
 * Every command runs through `git -C <dir> ...` with an argv array — no shell,
 * no string interpolation — and never touches the shared checkout's index,
 * HEAD, refs, or working tree except for the explicit, user-approved merge in
 * `mergeSessionBack` (which runs on the MAIN checkout on purpose).
 * @module dsh-session-isolate/git
 */

import { execFile } from 'node:child_process'

/** Result of a successful git invocation. */
export interface GitOk {
  readonly ok: true
  readonly stdout: string
  readonly stderr: string
}

/** Result of a git invocation that exited nonzero (e.g. "nothing to commit"). */
export interface GitFail {
  readonly ok: false
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type GitResult = GitOk | GitFail

const GIT_ENV = {
  ...process.env,
  // Never let user hooks decide the outcome of an automatic turn commit.
  GIT_EDITOR: 'true',
  GIT_TERMINAL_PROMPT: '0',
}

/**
 * Run one git command in `dir`.
 * @param dir - directory to run in (`git -C dir`).
 * @param args - argv array, never shell-interpolated.
 * @param timeoutMs - kill the child after this long (defaults to 30s).
 */
export function runGit(dir: string, args: readonly string[], timeoutMs = 30_000): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', dir, ...args],
      { encoding: 'utf8', env: GIT_ENV, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout, stderr })
          return
        }
        const code = typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : 1
        resolve({ ok: false, code, stdout, stderr })
      },
    )
  })
}

/** Require a successful git result or throw with stderr context. */
export async function requireGit(dir: string, args: readonly string[], context: string): Promise<string> {
  const result = await runGit(dir, args)
  if (!result.ok) {
    throw new Error(`${context}: git ${args.join(' ')} failed (exit ${result.code}): ${trimmed(result.stderr) || trimmed(result.stdout)}`)
  }
  return result.stdout
}

/** Locate the repository root containing `cwd`, or `undefined` when cwd is not inside a git worktree. */
export async function findRepoRoot(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (!result.ok) return undefined
  const root = result.stdout.trim()
  return root === '' ? undefined : nativePath(root)
}

/** The repository root a worktree path belongs to (git -C wt rev-parse --show-toplevel). */
export async function repoRootOfWorktree(worktreePath: string): Promise<string> {
  return nativePath(await requireGit(worktreePath, ['rev-parse', '--show-toplevel'], 'resolve worktree root'))
}

/** Convert a git-reported path to the platform's native separator form. */
export function nativePath(path: string): string {
  if (process.platform !== 'win32') return path
  return path.replace(/\//g, '\\')
}

/** Current HEAD short hash of the checkout at `dir`. */
export async function headShort(dir: string): Promise<string> {
  return (await requireGit(dir, ['rev-parse', '--short', 'HEAD'], 'resolve HEAD')).trim()
}

/** Current branch name of the checkout at `dir`, or short hash when detached. */
export async function currentBranch(dir: string): Promise<string> {
  const result = await runGit(dir, ['branch', '--show-current'])
  if (result.ok && result.stdout.trim() !== '') return result.stdout.trim()
  return `detached@${await headShort(dir)}`
}

/** Whether `worktreePath` is already registered as a linked worktree of `repoRoot`. */
export async function isRegisteredWorktree(repoRoot: string, worktreePath: string): Promise<boolean> {
  const result = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
  if (!result.ok) return false
  return result.stdout.split(/\r?\n/).some(line => line.startsWith('worktree ') && normalizePath(line.slice('worktree '.length).trim()) === normalizePath(worktreePath))
}

/** Normalize a path for comparison (case-insensitive on Windows). */
export function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** The worktree path a branch is checked out in, or `undefined` when checked out nowhere. */
export async function branchWorktree(repoRoot: string, branch: string): Promise<string | undefined> {
  const result = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
  if (!result.ok) return undefined
  let current: string | undefined
  let branchName: string | undefined
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) current = line.slice('worktree '.length).trim()
    else if (line.startsWith('branch ')) branchName = line.slice('branch '.length).trim()
    else if (line === '') {
      if (branchName === `refs/heads/${branch}`) return current
      current = undefined
      branchName = undefined
    }
  }
  return undefined
}

/** Whether `branch` exists locally in `repoRoot`. */
export async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  const result = await runGit(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  return result.ok
}

/**
 * Add a linked worktree for `branch` at `worktreePath`, creating the branch
 * from the main checkout's HEAD when it does not exist yet. Idempotent: a
 * worktree already registered at that path is left untouched.
 */
export async function addWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void> {
  if (await isRegisteredWorktree(repoRoot, worktreePath)) return
  const exists = await branchExists(repoRoot, branch)
  const args = exists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath]
  const result = await runGit(repoRoot, args, 120_000)
  if (!result.ok) {
    throw new Error(`create worktree failed: git ${args.join(' ')} (exit ${result.code}): ${trimmed(result.stderr) || trimmed(result.stdout)}`)
  }
}

/** Commit every change in the worktree to its current branch. Returns true when a commit was made. */
export async function commitAll(worktreePath: string, message: string): Promise<boolean> {
  const add = await runGit(worktreePath, ['add', '-A'])
  if (!add.ok) {
    throw new Error(`worktree add -A failed (exit ${add.code}): ${trimmed(add.stderr) || trimmed(add.stdout)}`)
  }
  const status = await runGit(worktreePath, ['status', '--porcelain'])
  if (!status.ok) {
    throw new Error(`worktree status failed (exit ${status.code}): ${trimmed(status.stderr)}`)
  }
  if (status.stdout.trim() === '') return false
  const commit = await runGit(worktreePath, ['commit', '-m', message])
  if (!commit.ok) {
    throw new Error(`worktree commit failed (exit ${commit.code}): ${trimmed(commit.stderr) || trimmed(commit.stdout)}`)
  }
  return true
}

/** Whether the worktree has uncommitted changes (porcelain status non-empty). */
export async function hasUncommitted(worktreePath: string): Promise<boolean> {
  const result = await runGit(worktreePath, ['status', '--porcelain'])
  return result.ok && result.stdout.trim() !== ''
}

/** One-line log of `branch` relative to `base` (commits in branch not in base). */
export async function branchLog(repoRoot: string, base: string, branch: string): Promise<string> {
  const result = await runGit(repoRoot, ['log', '--oneline', `${base}..${branch}`])
  if (!result.ok) return ''
  return result.stdout.trim()
}

/** Diffstat between the branch and the main checkout's HEAD, rendered text. */
export async function branchDiffStat(repoRoot: string, branch: string): Promise<string> {
  const result = await runGit(repoRoot, ['diff', '--stat', 'HEAD', branch])
  return result.ok ? result.stdout.trim() : ''
}

/**
 * Merge `branch` into the MAIN checkout's current branch (the only operation
 * that mutates the shared checkout). Uses `--no-ff` so the session's commits
 * stay visible as one merge unit. Returns the merge result; on conflict the
 * caller decides whether to abort.
 */
export async function mergeIntoMain(repoRoot: string, branch: string, message: string): Promise<GitResult> {
  return runGit(repoRoot, ['merge', '--no-ff', '--no-edit', '-m', message, branch], 120_000)
}

/** Abort an in-progress merge in the main checkout. */
export async function abortMerge(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ['merge', '--abort'])
}

/** Remove the linked worktree (branch is kept by default; --force clears uncommitted state). */
export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const result = await runGit(repoRoot, ['worktree', 'remove', '--force', worktreePath], 120_000)
  if (!result.ok) {
    throw new Error(`remove worktree failed (exit ${result.code}): ${trimmed(result.stderr) || trimmed(result.stdout)}`)
  }
}

/** Delete the local branch (fails when checked out anywhere). */
export async function deleteBranch(repoRoot: string, branch: string): Promise<void> {
  const result = await runGit(repoRoot, ['branch', '-D', branch])
  if (!result.ok) {
    throw new Error(`delete branch failed (exit ${result.code}): ${trimmed(result.stderr) || trimmed(result.stdout)}`)
  }
}

function trimmed(text: string): string {
  return text.trim()
}
