/**
 * Path resolution — port of desktop/paths.go + the directory halves of
 * desktop/logging.go. Layout is IDENTICAL to the Wails shell so both shells
 * can coexist and read the same backend/data:
 *
 *   %LOCALAPPDATA%\marisa-distro\backend(.extracting)   — extracted backend
 *   %LOCALAPPDATA%\marisa-distro\backups                — rescue backups
 *   os.cacheDir()/marisa-distro/logs                    — desktop + backend logs
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Subdirectory of the app data root holding the materialized backend. */
export const BACKEND_DIR_NAME = 'backend'
/** Staging directory used while extracting; renamed over `backend` on success. */
export const BACKEND_STAGING_SUFFIX = '.extracting'
/** Rescue backup root, outside the backend tree so re-extracts keep it. */
export const BACKUPS_DIR_NAME = 'backups'

/** The app data root (%LOCALAPPDATA%\marisa-distro). */
export function appDataDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const local = env.LOCALAPPDATA ?? ''
  if (local !== '') return join(local, 'marisa-distro')
  return join(home, 'AppData', 'Local', 'marisa-distro')
}

/** Where the embedded backend is materialized. */
export function backendRootDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(appDataDir(env, home), BACKEND_DIR_NAME)
}

/** Rescue backups root. */
export function backupsRootDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(appDataDir(env, home), BACKUPS_DIR_NAME)
}

/**
 * Desktop log directory (marisa-desktop.log, rescue-state.json live here).
 * MARISA_LOG_DIR overrides; matches desktop/logging.go appLogDir().
 */
export function appLogDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const override = env.MARISA_LOG_DIR ?? ''
  if (override !== '') return override
  // Node has no os.UserCacheDir(); mirror Go: $XDG_CACHE_HOME or ~/Library/Caches
  // on darwin, %LOCALAPPDATA% on win32, ~/.cache elsewhere.
  if (process.platform === 'darwin') return join(home, 'Library', 'Caches', 'marisa-distro', 'logs')
  const cache = env.XDG_CACHE_HOME ?? (process.platform === 'win32' ? join(home, 'AppData', 'Local') : join(home, '.cache'))
  return join(cache, 'marisa-distro', 'logs')
}

/** The stable entry log file name inside appLogDir(). */
export const APP_LOG_NAME = 'marisa-desktop.log'
