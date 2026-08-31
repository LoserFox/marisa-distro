/**
 * Zero-dependency process-tree termination primitive, ported from
 * dsh-desktop-electron src/process-tree.ts (BSD-3-Clause) with semantics
 * aligned to the Wails shell's server_windows.go / server_unix.go:
 *
 * - Windows: `taskkill /T` (graceful, no /F) then `taskkill /T /F` after the
 *   grace period — the exact escalation ladder of the Wails shell's
 *   stopServer(); taskkill's recursive walk reaches the node → plugin tree,
 *   which a bare child.kill() (TerminateProcess on the direct child) cannot.
 * - POSIX: the backend is spawned detached as a process-group leader
 *   (detached: true); a negated pid signals the whole group. SIGTERM first,
 *   SIGKILL after the grace period, then a liveness wait confirms the group
 *   is gone.
 *
 * Failure semantics mirror the Wails shell: ESRCH (group already gone) is the
 * desired outcome and stays silent; every other error is reported through
 * `logger` and never thrown.
 */

import { spawn } from 'node:child_process'

/** Grace period before escalating to a forced kill (Wails shell: serverStopGrace = 5s). */
export const SERVER_STOP_GRACE_MS = 5_000

/** Poll cadence while waiting for a POSIX process group to disappear. */
const TREE_EXIT_POLL_MS = 15

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface KillProcessTreeOptions {
  /** Platform to dispatch on; defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform
  /** Windows tree-kill implementation; injectable for tests. */
  readonly taskkill?: (pid: number, force: boolean) => Promise<void>
  /** POSIX signal implementation; receives the NEGATED group-leader pid. */
  readonly signal?: (pid: number, sig: NodeJS.Signals) => void
  /** SIGTERM → SIGKILL escalation delay in milliseconds; defaults to 5000. */
  readonly graceMs?: number
  /** POSIX group-liveness probe; receives the positive group-leader pid. */
  readonly treeAlive?: (pid: number) => boolean
  /** Liveness-poll cadence in milliseconds. */
  readonly pollMs?: number
  /** Non-ESRCH failure reporter; defaults to `console.error`. */
  readonly logger?: (message: string) => void
}

function isEsrch(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ESRCH'
}

function defaultLogger(message: string): void {
  console.error(message)
}

/** Whether the detached POSIX process group still exists. */
function posixTreeAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (isEsrch(error)) return false
    // EPERM still proves that the group exists; the caller may not signal it.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
    throw error
  }
}

async function waitForTreeExit(
  pid: number,
  treeAlive: (pid: number) => boolean,
  pollMs: number,
  timeoutMs?: number,
): Promise<boolean> {
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs
  while (treeAlive(pid)) {
    if (deadline !== undefined && Date.now() >= deadline) return false
    const remaining = deadline === undefined ? pollMs : Math.min(pollMs, Math.max(1, deadline - Date.now()))
    await sleep(remaining)
  }
  return true
}

/** Windows: taskkill /T (graceful) or taskkill /T /F (forced), settles on exit. */
function taskkillTree(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = force ? ['/T', '/F', '/PID', String(pid)] : ['/T', '/PID', String(pid)]
    spawn('taskkill', args, { stdio: 'ignore', windowsHide: true })
      .on('error', reject)
      .on('close', () => { resolve() })
  })
}

/**
 * Terminate a process and its descendants. Windows resolves after the
 * graceful taskkill exits (the caller escalates with force=true after the
 * grace period — see stopBackendProcess); POSIX SIGTERMs the process group,
 * escalates to SIGKILL after `graceMs`, and resolves only after the group is
 * observed absent. Delivery and probe failures are logged and resolve
 * best-effort; a non-positive pid is a no-op.
 */
export async function killProcessTree(pid: number, options: KillProcessTreeOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform
  if (pid <= 0) return
  const logger = options.logger ?? defaultLogger
  if (platform === 'win32') {
    try {
      await (options.taskkill ?? taskkillTree)(pid, true)
    } catch (error) {
      logger(`taskkill failed for pid ${pid}: ${String(error)}`)
    }
    return
  }
  const signal = options.signal ?? ((p, sig) => process.kill(p, sig))
  try {
    // The backend is spawned detached, so a negated PID signals the whole
    // process group in one call.
    signal(-pid, 'SIGTERM')
  } catch (error) {
    if (!isEsrch(error)) logger(`SIGTERM failed for pid ${pid}: ${String(error)}`)
    return
  }
  const treeAlive = options.treeAlive ?? posixTreeAlive
  const pollMs = options.pollMs ?? TREE_EXIT_POLL_MS
  try {
    if (await waitForTreeExit(pid, treeAlive, pollMs, options.graceMs ?? SERVER_STOP_GRACE_MS)) return
  } catch (error) {
    logger(`liveness probe failed for pid ${pid}: ${String(error)}`)
    return
  }
  try {
    signal(-pid, 'SIGKILL')
  } catch (error) {
    if (!isEsrch(error)) logger(`SIGKILL failed for pid ${pid}: ${String(error)}`)
    return
  }
  try {
    await waitForTreeExit(pid, treeAlive, pollMs)
  } catch (error) {
    logger(`liveness probe failed for pid ${pid}: ${String(error)}`)
  }
}

/**
 * The Wails shell's two-phase stopServer(): a graceful tree kill, wait for
 * the child to exit within the grace period, then a forced tree kill, then
 * wait for the exit event. `exited` reports the ChildProcess terminal state
 * (exitCode/signalCode non-null).
 */
export async function stopBackendProcess(
  pid: number,
  exited: () => boolean,
  options: KillProcessTreeOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform
  if (pid <= 0) return
  if (platform === 'win32') {
    // Windows has no signal semantics: taskkill without /F politely requests
    // exit (WM_CLOSE to windowed processes; console apps get hard-killed by
    // the console host) — the graceful phase of the Wails shell's ladder.
    await killProcessTree(pid, { ...options, platform })
    if (exited()) return
    await sleep(SERVER_STOP_GRACE_MS)
    await killProcessTree(pid, { ...options, platform })
    return
  }
  await killProcessTree(pid, { ...options, platform })
  const deadline = Date.now() + (options.graceMs ?? SERVER_STOP_GRACE_MS)
  while (!exited()) {
    if (Date.now() >= deadline) break
    await sleep(TREE_EXIT_POLL_MS)
  }
  if (exited()) return
  // Force phase: killProcessTree escalates to SIGKILL on its own after the
  // grace period; the extra signal() call here is the shell's explicit /F
  // fallback when the graceful SIGTERM never landed.
  try {
    ;(options.signal ?? ((p, sig) => process.kill(p, sig)))(-pid, 'SIGKILL')
  } catch {
    // ESRCH: the group already died on SIGTERM.
  }
  const deadline2 = Date.now() + (options.graceMs ?? SERVER_STOP_GRACE_MS)
  while (!exited()) {
    if (Date.now() >= deadline2) return
    await sleep(TREE_EXIT_POLL_MS)
  }
}
