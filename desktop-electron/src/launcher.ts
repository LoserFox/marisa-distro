/**
 * Backend spawn supervision primitives — pure Node port of the spawn half of
 * desktop/main.go (startServer) plus server_windows.go / server_unix.go.
 * No Electron imports: unit-testable headless; the Electron glue lives in
 * main.ts.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { parseCommandLine, webCommandLine } from './command.ts'
import { scanBackendStdout, exitFailureClass } from './backend-stdout.ts'
export { parseCommandLine, webCommandLine }
export { exitFailureClass }

export interface SpawnedBackend {
  child: ChildProcess
  scan: ReturnType<typeof scanBackendStdout>
}

export interface SpawnOptions {
  port: string
  env?: NodeJS.ProcessEnv
  /** Working directory for the backend (defaults to the shell cwd). */
  cwd?: string
  /** Receives every stdout/stderr line (desktop log tee). */
  tee: (line: string) => void
  log: (message: string) => void
}

/**
 * Start one `dsh web` backend (startServer's cmd construction). POSIX: the
 * backend runs in its own detached process group so tree kills signal the
 * whole group; the user's shell rc is sourced first so the backend inherits
 * terminal env (API keys), matching server_unix.go. Windows: env inherits
 * directly; no shell wrapper; CREATE_NO_WINDOW when the parent has no console.
 */
export function spawnBackend(options: SpawnOptions): SpawnedBackend {
  const env = options.env ?? process.env
  const line = webCommandLine(options.port, env)
  const win = process.platform === 'win32'
  let command: string
  let args: string[]
  if (!win) {
    const shell = env.SHELL ?? ''
    const base = shell.replace(/.*[\\/]/, '')
    const rc = base === 'bash' ? '~/.bashrc' : base === 'zsh' ? '~/.zshrc' : ''
    if (shell !== '' && rc !== '') {
      command = shell
      args = ['-c', `source ${rc} >/dev/null 2>&1; exec ${line}`]
    } else {
      const argv = parseCommandLine(line)
      command = argv[0] ?? 'dsh'
      args = argv.slice(1)
    }
  } else {
    const argv = parseCommandLine(line)
    command = argv[0] ?? 'dsh'
    args = argv.slice(1)
  }
  options.log(`starting dsh web backend: ${line}`)
  const child = nodeSpawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    cwd: options.cwd,
    // POSIX: own process group (server_unix.go Setpgid). Detached on Windows
    // gives the child its own console-less group; CREATE_NO_WINDOW suppresses
    // the .cmd-launcher console flash for GUI builds.
    detached: !win ? true : undefined,
    windowsHide: true,
    ...(win ? { shell: needsShell(command) } : {}),
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => options.tee(chunk))
  const scan = scanBackendStdout(child.stdout as AsyncIterable<string>, options.tee, options.log)
  return { child, scan }
}

/** cmd/cmd.exe/bat need a shell wrapper on Windows (Go os/exec does this implicitly). */
function needsShell(command: string): boolean {
  const base = command.toLowerCase()
  return base.endsWith('.cmd') || base.endsWith('.bat') || base === 'cmd' || base === 'cmd.exe'
}

/** Whether the child has reached a terminal state (exitCode/signalCode set). */
export function childExited(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

export interface StopOptions {
  graceful?: (pid: number) => Promise<void>
  force?: (pid: number) => Promise<void>
  graceMs?: number
}

/**
 * stopServer: graceful tree kill → wait → forced tree kill → wait. Injectors
 * keep it testable; main.ts wires these to killProcessTree.
 */
export async function stopBackend(
  child: ChildProcess,
  exited: () => boolean,
  options: StopOptions = {},
): Promise<void> {
  const graceMs = options.graceMs ?? 5_000
  const pid = child.pid ?? 0
  if (pid <= 0) return
  await (options.graceful ?? (async () => {}))(pid)
  const deadline = Date.now() + graceMs
  while (!exited() && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15))
  }
  if (exited()) return
  await (options.force ?? (async () => {}))(pid)
  const deadline2 = Date.now() + graceMs
  while (!exited() && Date.now() < deadline2) {
    await new Promise(r => setTimeout(r, 15))
  }
}
