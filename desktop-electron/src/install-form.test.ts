import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  EMBEDDED_BUNDLE_FILE_NAME,
  embeddedBundlePath,
  launcherFileName,
  resolveInstallForm,
  type InstallFormProbe,
} from '../src/install-form.ts'

const WIN_LIB = 'C:\\app\\resources\\app.asar\\lib'
const WIN_EXE = 'C:\\app'
const WIN_BUNDLE = `C:\\app\\resources\\app.asar\\bundle\\${EMBEDDED_BUNDLE_FILE_NAME}`

/** Probe over an explicit set of "existing" paths (case-insensitive, as on Windows). */
function probe(paths: string[], env: NodeJS.ProcessEnv = {}): InstallFormProbe {
  const set = new Set(paths.map(p => p.toLowerCase()))
  return {
    libDir: WIN_LIB,
    exeDir: WIN_EXE,
    env,
    platform: 'win32',
    exists: p => set.has(p.toLowerCase()),
  }
}

describe('resolveInstallForm (Go build-tag split, resolved at runtime)', () => {
  it('payload beside lib/ → embedded, publishes the marker', () => {
    const result = resolveInstallForm(probe([WIN_BUNDLE]))
    expect(result.form).toBe('embedded')
    expect(result.marker).toBe('1')
    expect(result.bundlePath).toBe(WIN_BUNDLE)
  })

  it('EMBEDDED_BUNDLE=1 forces embedded even with no payload on disk', () => {
    const result = resolveInstallForm(probe([], { EMBEDDED_BUNDLE: '1' }))
    expect(result.form).toBe('embedded')
    expect(result.marker).toBe('1')
  })

  it('no payload and no backend beside the exe → dev', () => {
    const result = resolveInstallForm(probe([]))
    expect(result.form).toBe('dev')
    expect(result.marker).toBeNull()
    expect(result.bundlePath).toBeNull()
  })

  it('pre-extracted backend beside the exe → installed, no marker, no payload', () => {
    const result = resolveInstallForm(probe([`${WIN_EXE}\\backend\\launcher.cmd`]))
    expect(result.form).toBe('installed')
    expect(result.marker).toBeNull()
    expect(result.bundlePath).toBeNull()
  })

  it('a shipped payload wins over a stale backend beside the exe', () => {
    const result = resolveInstallForm(probe([WIN_BUNDLE, `${WIN_EXE}\\backend\\launcher.cmd`]))
    expect(result.form).toBe('embedded')
  })
})

describe('path helpers', () => {
  it('embeddedBundlePath sits beside lib/, not inside it', () => {
    expect(embeddedBundlePath(WIN_LIB)).toBe(WIN_BUNDLE)
  })

  it('launcherFileName follows the platform', () => {
    expect(launcherFileName('win32')).toBe('launcher.cmd')
    expect(launcherFileName('linux')).toBe('launcher.sh')
    expect(launcherFileName('darwin')).toBe('launcher.sh')
  })

  it('the installed form is recognised through the POSIX launcher name', () => {
    // node:path.join is host-separator aware, so build the probe path the same
    // way the module does rather than hardcoding a separator.
    const besideExe = join('/opt/app', 'backend', 'launcher.sh')
    const paths = new Set([besideExe])
    const result = resolveInstallForm({
      libDir: join('/opt/app', 'lib'),
      exeDir: '/opt/app',
      env: {},
      platform: 'linux',
      exists: p => paths.has(p),
    })
    expect(result.form).toBe('installed')
  })
})
