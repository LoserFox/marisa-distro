import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  installElectronNodeRuntime,
  clearEnvironmentModule,
  runAsNodeArgv,
  readShim,
  RUN_AS_NODE,
  PNPM_IGNORE_MINIMUM_RELEASE_AGE,
  ELECTRON_HEADERS_URL,
} from './electron-node.ts'

const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'marisa-electron-node-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const APP = '/opt/marisa/marisa-dsh'
function fakePnpm(root: string): string {
  const p = join(root, 'marisa-distro', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, 'export {}\n')
  return p
}

describe('clear-env prelude', () => {
  it('deletes ELECTRON_RUN_AS_NODE case-insensitively before the entry runs', () => {
    const mod = clearEnvironmentModule()
    expect(mod).toContain(`toUpperCase() === '${RUN_AS_NODE}'`)
    expect(mod).toContain('delete process.env[name]')
  })
})

describe('installElectronNodeRuntime (posix)', () => {
  const posix = process.platform !== 'win32'
  const state = scratch()
  const PNPM = fakePnpm(state)
  let install: ReturnType<typeof installElectronNodeRuntime> | undefined
  it('generates shims with RunAsNode + clear-env import + hoisted pnpm', () => {
    if (!posix) return
    install = installElectronNodeRuntime({
      appExecutable: APP,
      pnpmBinPath: PNPM,
      electronVersion: '43.5.0',
      stateDir: state,
      platform: process.platform,
    })
    const nodeShim = readShim(install.nodeShimPath)
    expect(nodeShim.startsWith('#!/bin/sh')).toBe(true)
    expect(nodeShim).toContain(`${RUN_AS_NODE}=1 exec '${APP}'`)
    expect(nodeShim).toContain('--import ')
    const pnpmShim = readShim(install.pnpmShimPath)
    expect(pnpmShim).toContain(`exec '${APP}'`)
    expect(pnpmShim).toContain(`'${PNPM}'`)
    expect(pnpmShim).toContain(PNPM_IGNORE_MINIMUM_RELEASE_AGE)
    expect(pnpmShim).toContain(`npm_config_target='43.5.0'`)
    expect(pnpmShim).toContain(`npm_config_disturl='${ELECTRON_HEADERS_URL}'`)
    expect(existsSync(install.clearEnvironmentPath)).toBe(true)
  })
  it('prepends the bin dir to PATH and dispose restores it', () => {
    if (!posix || install === undefined) return
    const env: NodeJS.ProcessEnv = {}
    const second = installElectronNodeRuntime({
      appExecutable: APP,
      pnpmBinPath: PNPM,
      electronVersion: '43.5.0',
      stateDir: state,
      platform: 'linux',
      environment: env,
    })
    expect(env.PATH?.startsWith(second.pathDir)).toBe(true)
    second.dispose()
    expect(env.PATH).toBeUndefined()
  })
  it('PATH install is idempotent (second call is a no-op, dispose shared)', () => {
    if (!posix) return
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin' }
    const a = installElectronNodeRuntime({
      appExecutable: APP, pnpmBinPath: PNPM, electronVersion: '43.5.0',
      stateDir: state, platform: 'linux', environment: env,
    })
    const before = env.PATH
    const b = installElectronNodeRuntime({
      appExecutable: APP, pnpmBinPath: PNPM, electronVersion: '43.5.0',
      stateDir: state, platform: 'linux', environment: env,
    })
    expect(b.dispose()).toBeUndefined()
    expect(env.PATH).toBe(before)
    a.dispose()
    expect(env.PATH).toBe('/usr/bin')
  })
})

describe('installElectronNodeRuntime (win32 contents)', () => {
  it('emits CRLF cmd shims with quoted batch words and %% escaping', () => {
    const state = scratch()
    const PNPM = fakePnpm(state)
    const win = installElectronNodeRuntime({
      appExecutable: 'C:\\Program Files\\Marisa\\marisa-dsh.exe',
      pnpmBinPath: 'C:\\backend\\marisa-distro\\node_modules\\pnpm\\bin\\pnpm.mjs',
      electronVersion: '43.5.0',
      stateDir: state,
      platform: 'win32',
    })
    const nodeShim = readFileSync(win.nodeShimPath, 'utf8')
    expect(nodeShim.startsWith('@echo off\r\n')).toBe(true)
    expect(nodeShim).toContain(`set "${RUN_AS_NODE}=1"`)
    expect(nodeShim).toContain(`"C:\\Program Files\\Marisa\\marisa-dsh.exe"`)
    const pnpmShim = readFileSync(win.pnpmShimPath, 'utf8')
    expect(pnpmShim).toContain('set "npm_config_runtime=electron"')
    expect(pnpmShim).toContain('npm_config_disturl=https://electronjs.org/headers')
    expect(pnpmShim.endsWith('\r\n')).toBe(true)
  })
  it('rejects quote/newline injection in Windows values', () => {
    expect(() => installElectronNodeRuntime({
      appExecutable: 'C:\\bad"path.exe',
      pnpmBinPath: 'C:\\x\\pnpm.mjs', electronVersion: '43.5.0',
      stateDir: scratch(), platform: 'win32',
    })).toThrow(/must not contain quotes/)
  })
})

describe('runAsNodeArgv', () => {
  it('builds a shell-free spawn argv with the RunAsNode env', () => {
    const clearEnv = '/state/private/clear-env.mjs'
    const argv = runAsNodeArgv(APP, clearEnv, '/backend/marisa-distro/harness/apps/cli/lib/bin.js')
    expect(argv.command).toBe(APP)
    expect(argv.args[0]).toBe('--import')
    expect(argv.args[1]).toMatch(/^file:\/\//)
    expect(argv.args[2]).toBe('/backend/marisa-distro/harness/apps/cli/lib/bin.js')
    expect(argv.env[RUN_AS_NODE]).toBe('1')
  })
})
