/**
 * Desktop logging — port of desktop/logging.go.
 *
 * One log file per launch (marisa-desktop-YYYYMMDD-HHMMSS.log), the stable
 * entry name marisa-desktop.log pointing at the most recent one, size-based
 * in-write rotation to .1, retention pruning of old launch logs, backend
 * stderr tee, and the rescue-page log tail reader. Paths mirror the Wails
 * shell so log consumers work unchanged.
 */

import { spawn } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { APP_LOG_NAME, appLogDir } from './paths.ts'

/** Retained number of launch log groups (logging.go retainLaunchLogFiles). */
const RETAIN_LAUNCH_LOG_FILES = 20
/** Single launch log size cap; exceeding rotates to `.1` on the write path. */
const MAX_APP_LOG_SIZE = 5 << 20

/** `logDebug` gate: MARISA_LOG_LEVEL=debug enables high-frequency events. */
export let logDebugEnabled = false

export function parseLogLevel(env: NodeJS.ProcessEnv = process.env): void {
  logDebugEnabled = (env.MARISA_LOG_LEVEL ?? '') === 'debug'
}

export function logDebugf(message: string, ...args: unknown[]): void {
  if (logDebugEnabled) console.log('[debug]', message, ...args)
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

/** YYYYMMDD-HHMMSS launch stamp (Go layout 20060102-150405). */
export function launchStamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

export interface DesktopLog {
  log: (message: string, ...args: unknown[]) => void
  /** Receives backend stderr/stdout chunks (tee'd into the launch log). */
  backendLog: (chunk: string) => void
  /** Stable entry log path (rescue page / support tooling). */
  path: string
  dir: string
  close: () => void
}

/**
 * Synchronous append writer with in-write rotation (logging.go
 * persistentLogWriter; sync writes keep backend tee ordering deterministic
 * and make the single-flight mutex unnecessary).
 */
class RotatingWriter {
  private fd: number | null = null
  private bytes = 0

  constructor(
    readonly filePath: string,
    private readonly mirror: (chunk: string) => void,
  ) {}

  open(): void {
    this.fd = openSync(this.filePath, 'a')
    this.bytes = existsSync(this.filePath) ? statSync(this.filePath).size : 0
  }

  write(data: string): void {
    try {
      if (this.bytes + Buffer.byteLength(data) > MAX_APP_LOG_SIZE) this.rotate()
    } catch { /* rotation failure keeps the current file */ }
    if (this.fd === null) {
      try { this.open() } catch { return } // self-heal once, else drop the line
    }
    try {
      this.bytes += writeSync(this.fd!, data)
      this.mirror(data)
    } catch { /* never let log I/O kill the shell */ }
  }

  /** Rotate to `.1` (old `.1` removed first), then reopen a fresh file. */
  rotate(): void {
    if (this.fd !== null) {
      closeSync(this.fd)
      this.fd = null
    }
    try { rmSync(this.filePath + '.1', { force: true }) } catch { /* keep old .1 */ }
    try { renameSync(this.filePath, this.filePath + '.1') } catch { /* reopen below */ }
    this.open()
  }

  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd)
      this.fd = null
    }
  }
}

export interface SetupLogOptions {
  logDir?: string
  now?: () => Date
}

/** Open the launch log, rebuild the stable entry link, prune old logs. */
export function setupLogging(options: SetupLogOptions = {}): DesktopLog {
  const dir = options.logDir ?? appLogDir()
  mkdirSync(dir, { recursive: true })
  const path = join(dir, APP_LOG_NAME)
  const writer = new RotatingWriter(
    join(dir, `marisa-desktop-${launchStamp(options.now?.() ?? new Date())}.log`),
    chunk => { try { process.stderr.write(chunk) } catch { /* GUI launch, no console */ } },
  )
  writer.open()
  relinkEntryLog(dir, path, writer)
  try { pruneLaunchLogs(dir) } catch { /* retention is best-effort */ }

  const log = (message: string, ...args: unknown[]): void => {
    const ts = new Date().toISOString()
    const rest = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    writer.write(`${ts} ${[message, ...rest].join(' ')}\n`)
  }
  log(`persistent log: ${path}`)
  return {
    log,
    backendLog: chunk => writer.write(chunk),
    path,
    dir,
    close: () => writer.close(),
  }
}

/**
 * Point the stable entry name at the newest launch log: NTFS hard link first
 * (link(2) semantics — remove the previous entry first), falling back to a
 * one-line text pointer where hard links are unsupported (exFAT etc.).
 */
function relinkEntryLog(dir: string, entryPath: string, writer: RotatingWriter): void {
  try { unlinkSync(entryPath) } catch { /* absent */ }
  try {
    linkSync(writer.filePath, entryPath)
    return
  } catch { /* fall through to text pointer */ }
  try { appendFileSync(entryPath, `→ ${writer.filePath}\n`, 'utf8') } catch { /* best effort */ }
}

/** Remove launch log groups beyond the retention window. */
export function pruneLaunchLogs(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  const launchRe = /^marisa-desktop-\d{8}-\d{6}(-\d+)?\.log(\.1)?$/
  const groups = new Map<string, string[]>()
  for (const name of names) {
    if (!launchRe.test(name)) continue
    const base = name.replace(/\.1$/, '')
    const list = groups.get(base) ?? []
    list.push(name)
    groups.set(base, list)
  }
  const sorted = [...groups.keys()].sort()
  const excess = sorted.length - RETAIN_LAUNCH_LOG_FILES
  if (excess <= 0) return
  for (const base of sorted.slice(0, excess)) {
    for (const file of groups.get(base) ?? []) {
      try { unlinkSync(join(dir, file)) } catch { /* already gone */ }
    }
  }
}

/** Read the tail of a file, UTF-8 boundary-truncated (logging.go readLogTail). */
export function readLogTail(path: string, maxBytes: number): string {
  let data: Buffer
  try {
    data = readFileSync(path)
  } catch {
    return ''
  }
  if (data.length > maxBytes) {
    data = data.subarray(data.length - maxBytes)
    // Do not start the tail mid-codepoint: drop leading continuation bytes.
    let cut = 0
    while (cut < data.length && (data[cut]! & 0xc0) === 0x80) cut++
    data = data.subarray(cut)
  }
  return data.toString('utf8')
}

/** Ensure a directory exists and open it in the OS file manager. */
export function ensureAndOpenFolder(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const platform = process.platform
  if (platform === 'win32') spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref()
  else if (platform === 'darwin') spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref()
}
