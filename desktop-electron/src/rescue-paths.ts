/**
 * Rescue-path shape — port of the build-tag split in the Go shell:
 * rescue_dev.go (no backend dir) / embedded.go (LOCALAPPDATA tree) /
 * installed.go (MSI layout beside the exe).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { appDataDir, appLogDir, backupsRootDir, backendRootDir, APP_LOG_NAME } from './paths.ts'

export { appLogDir, APP_LOG_NAME }

/** Installed/MSI-style backend dir: MARISA_BACKEND_DIR or <exeDir>/backend. */
export function installedBackendDirLike(exeDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MARISA_BACKEND_DIR ?? ''
  if (override !== '') return override
  return join(exeDir, 'backend')
}

/**
 * The active backend directory for rescue operations, or null in the dev form
 * (rescue_dev.go: "dev 构建使用系统 dsh，无独立 backend 目录").
 */
export function rescueBackendDirLike(exeDir: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const forced = env.MARISA_BACKEND_DIR ?? ''
  if (forced !== '') return forced
  if (env.EMBEDDED_BUNDLE === '1') return backendRootDir(env)
  const besideExe = join(exeDir, 'backend')
  if (existsSync(join(besideExe, 'launcher.cmd'))) return besideExe
  return null
}

/** Data-dir aliases used by the rescue server (Go: appDataDir/backupsRootDir). */
export function appDataDirLike(env: NodeJS.ProcessEnv = process.env): string {
  return appDataDir(env)
}

export function backupsRootDirLike(env: NodeJS.ProcessEnv = process.env): string {
  return backupsRootDir(env)
}

export { backendRootDir }
