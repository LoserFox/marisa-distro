/**
 * Orphan reaper for the marisa backend child. No OS delivers a parent-death
 * notification, so a hard-killed Electron main (Task Manager, `taskkill /F`
 * on the shell, a crash) would leave `dsh web` and its tree running forever.
 * This script polls the main process's PID and, when it is gone, tree-kills
 * the backend child and exits. Runs under Electron-as-Node
 * (`ELECTRON_RUN_AS_NODE=1`); its only inputs are the two PIDs on argv.
 *
 * Ported from dsh-desktop-electron src/reaper.ts (BSD-3-Clause); the tree
 * kill is delegated to the shared process-tree primitive.
 *
 * Usage: electron reaper.js <mainPid> <backendPid>
 */

import { killProcessTree } from './process-tree.ts'

const mainPid = Number(process.argv[2])
const backendPid = Number(process.argv[3])
if (!Number.isInteger(mainPid) || !Number.isInteger(backendPid) || mainPid <= 0 || backendPid <= 0) {
  throw new Error(`marisa-desktop reaper: expected <mainPid> <backendPid>, got ${process.argv.slice(2).join(' ')}`)
}

const POLL_INTERVAL_MS = 1_000

// The interval must keep this process alive — that is its whole job.
const timer = setInterval(() => {
  try {
    // Signal 0 probes liveness without sending anything; it throws once the
    // main process is gone (or becomes unowned).
    process.kill(mainPid, 0)
  } catch {
    // The main is gone or unowned — the backend must not outlive it.
    clearInterval(timer)
    void killBackendTree()
  }
}, POLL_INTERVAL_MS)

function killBackendTree(): Promise<void> {
  return killProcessTree(backendPid, {
    logger: (message) => { console.error(`[marisa-desktop] reaper ${message}`) },
  })
}
