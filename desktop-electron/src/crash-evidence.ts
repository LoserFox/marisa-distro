/**
 * Crash evidence — port of anywhere dsh-plugin-desktop src/crash-evidence.ts
 * run-marker half (MIT, simplified): persist one run record per launch; if a
 * record is already present at startup, the previous launch exited uncleanly.
 * The record is removed on controlled exits via markClean().
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export interface DesktopRunRecord {
  readonly startedAt: string
  readonly pid: number
  readonly version: string
}

export interface UnreadableDesktopRun {
  readonly unreadable: true
}

export interface DesktopRun {
  readonly previousRun: DesktopRunRecord | UnreadableDesktopRun | undefined
  markClean(): void
}

function readStoredRun(statePath: string): (DesktopRunRecord & { ownerId?: string }) | UnreadableDesktopRun | undefined {
  let raw: string
  try {
    raw = readFileSync(statePath, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return { unreadable: true }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DesktopRunRecord & { ownerId?: string }>
    if (
      typeof parsed.startedAt === 'string' &&
      typeof parsed.pid === 'number' &&
      typeof parsed.version === 'string'
    ) {
      return {
        startedAt: parsed.startedAt,
        pid: parsed.pid,
        version: parsed.version,
        ...(typeof parsed.ownerId === 'string' ? { ownerId: parsed.ownerId } : {}),
      }
    }
  } catch { /* corrupt */ }
  return { unreadable: true }
}

/**
 * Persist this launch and return the marker left behind by an unclean exit
 * (beginDesktopRun). The write is atomic (temp + rename) with a random
 * ownerId so a stale file is only removed by its own process.
 */
export function beginDesktopRun(statePath: string, currentRun: DesktopRunRecord): DesktopRun {
  const storedPreviousRun = readStoredRun(statePath)
  const previousRun =
    storedPreviousRun === undefined || 'unreadable' in storedPreviousRun
      ? storedPreviousRun
      : { startedAt: storedPreviousRun.startedAt, pid: storedPreviousRun.pid, version: storedPreviousRun.version }
  const ownerId = randomUUID()
  mkdirSync(dirname(statePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  const temporary = join(dirname(statePath), `.${statePath.split(/[\\/]/).pop()}.${process.pid}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify({ ...currentRun, ownerId })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: PRIVATE_FILE_MODE,
    })
    try { unlinkSync(statePath) } catch { /* absent */ }
    writeFileSync(statePath, `${JSON.stringify({ ...currentRun, ownerId })}\n`, {
      encoding: 'utf8',
      mode: PRIVATE_FILE_MODE,
    })
  } finally {
    try { unlinkSync(temporary) } catch { /* absent */ }
  }
  let clean = false
  return {
    previousRun,
    markClean() {
      if (clean) return
      const storedRun = readStoredRun(statePath)
      if (storedRun === undefined || 'unreadable' in storedRun || storedRun.ownerId !== ownerId) {
        clean = true
        return
      }
      try { unlinkSync(statePath) } catch { /* already gone */ }
      clean = true
    },
  }
}
