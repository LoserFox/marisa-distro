/**
 * Electron-side spawn adapter: turns the supervisor's spawn/stop hooks into
 * real child processes, and owns the orphan-reaper handshake (the supervisor
 * reports each backend pid here so the reaper can be re-armed per spawn).
 */

import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { parseCommandLine, webCommandLine } from './command.ts'
import { scanBackendStdout } from './backend-stdout.ts'
import { stopBackend } from './launcher.ts'
import { killProcessTree } from './process-tree.ts'
import type { ActiveBackend } from './supervisor.ts'

export interface BackendAdapterHooks {
  tee: (chunk: string) => void
  log: (message: string) => void
}

export interface ActiveHandle extends ActiveBackend {
  child: ChildProcess
}

/**
 * Start one backend for the requested boot stage. MARISA_BOOT_PROFILE is
 * already set/cleared in process.env by the supervisor (applyBootProfile).
 */
export function spawnBackendForStage(_stage: 'normal' | 'minimal', hooks: BackendAdapterHooks): ActiveHandle {
  const port = process.env.DSH_APP_PORT ?? '0'
  const line = webCommandLine(port, process.env)
  const argv = parseCommandLine(line)
  const command = argv[0] ?? 'dsh'
  const args = argv.slice(1)
  const win32 = process.platform === 'win32'
  hooks.log(`starting dsh web backend: ${line}`)
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    // POSIX: own process group so tree kills hit the whole group.
    detached: !win32,
    windowsHide: true,
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => hooks.tee(chunk))
  child.stdout?.setEncoding('utf8')

  let resolveExit: (v: { abnormal: boolean; message: string }) => void = () => {}
  const exit = new Promise<{ abnormal: boolean; message: string }>(r => { resolveExit = r })
  child.on('exit', (code, signal) => {
    resolveExit({
      abnormal: code !== 0,
      message: signal !== null ? `killed by ${signal}` : `exit ${String(code)}`,
    })
  })
  child.on('error', err => {
    resolveExit({ abnormal: true, message: err.message })
  })

  const scan = scanBackendStdout(child.stdout as AsyncIterable<string>, l => hooks.tee(l + '\n'), hooks.log)
  const pid = child.pid ?? 0
  return {
    child,
    pid,
    ready: scan.ready,
    exit,
    stop: async () => {
      await stopBackend(child, () => child.exitCode !== null || child.signalCode !== null, {
        graceful: async () => { await killProcessTree(pid) },
        force: async () => { await killProcessTree(pid) },
      })
    },
  }
}
