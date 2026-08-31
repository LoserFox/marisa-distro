/**
 * Boot-stage state machine constants and persisted state — port of
 * desktop/rescue_state.go.
 *
 * normal → minimal → rescue; the state file lives in the log dir (outside the
 * backend tree) so recovery/re-extract never clears it. A cold boot that reads
 * stage=rescue goes straight to the rescue page.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appLogDir } from './paths.ts'

/** minimal boot profile: harness built-in web template (base + web-app, no marisa plugins). */
export const MINIMAL_BOOT_PROFILE = 'web'
/** Env var read by launcher.cmd / the Electron launcher to pick the profile. */
export const BOOT_PROFILE_ENV = 'MARISA_BOOT_PROFILE'

export type BootStage = 'normal' | 'minimal' | 'rescue'

export interface RescueState {
  stage: BootStage
  lastError?: string
  updatedAt: string
}

/** Parse --minimal / --rescue CLI overrides (parseBootFlags). */
export function parseBootFlags(argv: string[] = process.argv.slice(2)): BootStage | '' {
  for (const a of argv) {
    if (a === '--minimal') return 'minimal'
    if (a === '--rescue') return 'rescue'
  }
  return ''
}

function statePath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return join(appLogDir(env, home), 'rescue-state.json')
}

/** Read persisted state; missing/corrupt → normal (never permanently locked out). */
export function loadRescueState(env: NodeJS.ProcessEnv = process.env, home?: string): RescueState {
  try {
    const data = readFileSync(statePath(env, home), 'utf8')
    const parsed = JSON.parse(data) as Partial<RescueState>
    if (parsed.stage === 'rescue' || parsed.stage === 'minimal' || parsed.stage === 'normal') {
      return { stage: parsed.stage, lastError: parsed.lastError, updatedAt: parsed.updatedAt ?? '' }
    }
  } catch { /* absent or corrupt */ }
  return { stage: 'normal', updatedAt: '' }
}

/** Persist stage + last boot failure (saveRescueState). */
export function saveRescueState(stage: BootStage, lastError: string | null, env: NodeJS.ProcessEnv = process.env, home?: string): void {
  const path = statePath(env, home)
  const state: RescueState = { stage, updatedAt: new Date().toISOString() }
  if (lastError !== null) state.lastError = lastError
  try {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8')
  } catch (err) {
    console.error(`save rescue state: ${String(err)}`)
  }
}

/** Clear any persisted state file (used when returning to normal). */
export function clearRescueState(env: NodeJS.ProcessEnv = process.env, home?: string): void {
  try {
    if (existsSync(statePath(env, home))) {
      // Overwrite with normal rather than unlink: matches saveRescueState(normal).
      saveRescueState('normal', null, env, home)
    }
  } catch { /* best effort */ }
}

/** Set/clear the boot-profile env injection for the backend spawn. */
export function applyBootProfile(stage: BootStage, env: NodeJS.ProcessEnv = process.env): void {
  if (stage === 'minimal') env[BOOT_PROFILE_ENV] = MINIMAL_BOOT_PROFILE
  else delete env[BOOT_PROFILE_ENV]
}
