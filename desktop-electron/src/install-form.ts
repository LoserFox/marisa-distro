/**
 * Install-form detection — the runtime equivalent of the Go shell's build-tag
 * split (embedded_dev.go / embedded.go / installed.go).
 *
 * The Go shell decides at compile time which backend it owns; the Electron
 * shell ships one binary and must decide at runtime, because electron-builder
 * cannot bake an environment variable into the app. Everything that cares
 * about the form (boot-time materialization, the rescue page, the recovery
 * window) has to agree on the answer, so it is resolved exactly once here and
 * published as the EMBEDDED_BUNDLE marker the rest of the shell already reads.
 *
 *   dev        no payload — the shell runs the user's own `dsh` from PATH.
 *   embedded   the shell ships `bundle/backend.tar.zst` beside `lib/` and
 *              materializes it into %LOCALAPPDATA%\marisa-distro\backend.
 *   installed  a pre-extracted backend already sits at `<exeDir>/backend`
 *              (the MSI-like form). The Electron build does not produce one
 *              yet, but it is recognised so the shell does not try to
 *              re-extract over a backend it does not own.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type InstallForm = 'dev' | 'embedded' | 'installed'

/** Payload file name inside the shipped `bundle/` directory. */
export const EMBEDDED_BUNDLE_FILE_NAME = 'backend.tar.zst'
/** Directory (beside `lib/`) holding the shipped payload. */
export const BUNDLE_DIR_NAME = 'bundle'

/** Launcher file the backend tree exposes, per platform. */
export function launcherFileName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'launcher.cmd' : 'launcher.sh'
}

export interface InstallFormProbe {
  /** Directory holding the compiled shell (`lib/`). */
  libDir: string
  /** Directory holding the executable (`dirname(process.execPath)`). */
  exeDir: string
  env: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  /** Injected for tests; defaults to fs.existsSync. */
  exists?: (path: string) => boolean
}

export interface InstallFormResult {
  form: InstallForm
  /** Payload location for the embedded form, else null. */
  bundlePath: string | null
  /** Value to publish into process.env.EMBEDDED_BUNDLE, or null to leave unset. */
  marker: '1' | null
}

/** Absolute path of the shipped payload for a given `lib/` directory. */
export function embeddedBundlePath(libDir: string): string {
  return join(libDir, '..', BUNDLE_DIR_NAME, EMBEDDED_BUNDLE_FILE_NAME)
}

/**
 * Resolve which form this launch is running from. `EMBEDDED_BUNDLE=1` is
 * honoured first so packaging/tests can force the embedded semantics even when
 * the payload is not on disk yet (it is written by the build right before
 * packaging).
 */
export function resolveInstallForm(probe: InstallFormProbe): InstallFormResult {
  const exists = probe.exists ?? existsSync
  const bundlePath = embeddedBundlePath(probe.libDir)
  if (probe.env.EMBEDDED_BUNDLE === '1' || exists(bundlePath)) {
    return { form: 'embedded', bundlePath, marker: '1' }
  }
  const besideExe = join(probe.exeDir, 'backend', launcherFileName(probe.platform ?? process.platform))
  if (exists(besideExe)) return { form: 'installed', bundlePath: null, marker: null }
  return { form: 'dev', bundlePath: null, marker: null }
}
