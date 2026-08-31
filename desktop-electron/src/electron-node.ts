/**
 * Electron-as-Node runtime shim layer — 1:1 port of anywhere
 * dsh-plugin-desktop/src/desktop-runtime-environment.ts (the RunAsNode half)
 * adapted to the marisa layout. Instead of bundling node.exe in
 * backend.tar.zst, the Electron executable itself (process.execPath) runs
 * backend Node programs with ELECTRON_RUN_AS_NODE=1, the exact mechanism
 * anywhere uses for its pnpm/node/DSH shims.
 *
 * Why the --import clear-env.mjs prelude exists (anywhere
 * desktop-runtime-environment.ts:203): a RunAsNode child that spawns further
 * node programs would inherit ELECTRON_RUN_AS_NODE=1 and silently run THEM
 * as Electron-as-Node too; the preloaded module deletes the variable from
 * the child's own environment before the requested entry point runs.
 *
 * Pure Node module — no Electron imports — so it stays headless-testable.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

/** Env var that turns an Electron executable into a plain Node runtime. */
export const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'

/** pnpm flag allowing older/edge releases (anywhere pnpm-policy.ts:7). */
export const PNPM_IGNORE_MINIMUM_RELEASE_AGE = '--config.minimumReleaseAge=0'

/** Headers disturl so native modules rebuild against Electron's ABI. */
export const ELECTRON_HEADERS_URL = 'https://electronjs.org/headers'

/** A directory under our exclusive control; contents are verified per-file. */
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const EXECUTABLE_FILE_MODE = 0o755

export interface NodeRuntimeOptions {
  /** The Electron executable (process.execPath) — becomes the Node binary. */
  appExecutable: string
  /** JS pnpm entry inside the backend tree (hoisted node_modules/pnpm). */
  pnpmBinPath: string
  /** Electron version (process.versions.electron) for native rebuilds. */
  electronVersion: string
  /** Directory that hosts the generated shims (backend runtime state dir). */
  stateDir: string
  platform: NodeJS.Platform
  /** Parent environment the PATH install mutates (defaults to process.env). */
  environment?: NodeJS.ProcessEnv
}

export interface NodeRuntimeInstallation {
  /** Directory prepended to PATH (holds pnpm.cmd|pnpm and node via bin dir). */
  pathDir: string
  pnpmShimPath: string
  /** Directory holding the private `node` shim (for lifecycle scripts). */
  nodeBinDir: string
  nodeShimPath: string
  clearEnvironmentPath: string
  /** Restores the previous PATH; idempotent. */
  dispose: () => void
}

// --- quoting (1:1 from anywhere desktop-runtime-environment.ts:85-108) ------

/** Quote one arbitrary value as a POSIX shell word. */
function quoteSh(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`
}

/** Quote one Windows batch argv word without permitting quote injection. */
function quoteBatchWord(value: string): string {
  if (/["\r\n]/u.test(value)) {
    throw new Error('marisa-electron: runtime Windows arguments must not contain quotes or newlines')
  }
  return `"${value.replaceAll('%', '%%')}"`
}

/** Escape a value inside the quoted RHS of a batch `set` command. */
function escapeBatchSetValue(value: string): string {
  if (/["\r\n]/u.test(value)) {
    throw new Error('marisa-electron: runtime Windows environment values must not contain quotes or newlines')
  }
  return value.replaceAll('%', '%%')
}

// --- shim contents (anywhere desktop-runtime-environment.ts:203-292) --------

/** Module preloaded into RunAsNode children before their requested entry. */
export function clearEnvironmentModule(): string {
  return [
    // RunAsNode children still report ELECTRON_RUN_AS_NODE in their own env
    // copy; delete it so grandchildren spawn as plain processes.
    `for (const name of Object.keys(process.env)) {`,
    `  if (name.toUpperCase() === '${RUN_AS_NODE}') delete process.env[name]`,
    `}`,
    ``,
  ].join('\n')
}

/** Private POSIX node command used only by pnpm lifecycle scripts. */
function posixNodeShim(appExecutable: string, clearEnvironmentUrl: string): string {
  return [
    '#!/bin/sh',
    `${RUN_AS_NODE}=1 exec ${quoteSh(appExecutable)} --import ${quoteSh(clearEnvironmentUrl)} "$@"`,
    ``,
  ].join('\n')
}

/** Public POSIX pnpm command. */
function posixPnpmShim(
  options: Pick<NodeRuntimeOptions, 'appExecutable' | 'pnpmBinPath' | 'electronVersion'>,
  nodeBinDir: string,
  nodeShimPath: string,
  clearEnvironmentUrl: string,
): string {
  return [
    '#!/bin/sh',
    [
      `PATH=${quoteSh(nodeBinDir)}:"\${PATH:-}"`,
      `NODE=${quoteSh(nodeShimPath)}`,
      `${RUN_AS_NODE}=1`,
      `npm_config_runtime=electron`,
      `npm_config_target=${quoteSh(options.electronVersion)}`,
      `npm_config_disturl=${quoteSh(ELECTRON_HEADERS_URL)}`,
      `exec ${quoteSh(options.appExecutable)} --import ${quoteSh(clearEnvironmentUrl)} ${quoteSh(options.pnpmBinPath)} ${PNPM_IGNORE_MINIMUM_RELEASE_AGE} "$@"`,
    ].join(' '),
    ``,
  ].join('\n')
}

/** Private Windows node command used only by pnpm lifecycle scripts. */
function windowsNodeShim(appExecutable: string, clearEnvironmentUrl: string): string {
  return [
    `@echo off`,
    `setlocal DisableDelayedExpansion`,
    `set "${RUN_AS_NODE}=1"`,
    `${quoteBatchWord(appExecutable)} --import ${quoteBatchWord(clearEnvironmentUrl)} %*`,
    `exit /b %errorlevel%`,
    ``,
  ].join('\r\n')
}

/** Public Windows pnpm command (marisa layout: hoisted JS pnpm). */
function windowsPnpmShim(
  options: Pick<NodeRuntimeOptions, 'appExecutable' | 'pnpmBinPath' | 'electronVersion'>,
  nodeBinDir: string,
  nodeShimPath: string,
  clearEnvironmentUrl: string,
): string {
  return [
    `@echo off`,
    `setlocal DisableDelayedExpansion`,
    `set "PATH=${escapeBatchSetValue(nodeBinDir)};%PATH%"`,
    `set "NODE=${escapeBatchSetValue(nodeShimPath)}"`,
    `set "${RUN_AS_NODE}=1"`,
    `set "npm_config_runtime=electron"`,
    `set "npm_config_target=${escapeBatchSetValue(options.electronVersion)}"`,
    `set "npm_config_disturl=${ELECTRON_HEADERS_URL}"`,
    `${quoteBatchWord(options.appExecutable)} --import ${quoteBatchWord(clearEnvironmentUrl)} ${quoteBatchWord(options.pnpmBinPath)} ${PNPM_IGNORE_MINIMUM_RELEASE_AGE} %*`,
    `exit /b %errorlevel%`,
    ``,
  ].join('\r\n')
}

// --- private file helpers (anywhere desktop-runtime-environment.ts:160-205) -

function preparePrivateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  const stat = statSync(directory)
  if (!stat.isDirectory()) {
    throw new Error(`marisa-electron: runtime state path is not a directory: ${directory}`)
  }
}

/** Lstat result or undefined when absent (anywhere lstatOptional). */
function lstatOptional(filename: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function unlinkTemporaryFile(temporary: string): void {
  try {
    unlinkSync(temporary)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function assertRegularFile(filename: string): void {
  if (!lstatOptional(filename)?.isFile()) {
    throw new Error(`marisa-electron: runtime file is not a regular file: ${filename}`)
  }
}

/** Atomic replace honoring the private mode; never leaves partial files. */
function replacePrivateFile(filename: string, contents: string, mode: number): void {
  const parent = lstatOptional(dirname(filename))
  if (parent === undefined || !parent.isDirectory()) {
    throw new Error(`marisa-electron: runtime state path is not a directory: ${dirname(filename)}`)
  }
  const existing = lstatOptional(filename)
  if (existing !== undefined && !existing.isFile()) {
    throw new Error(`marisa-electron: runtime state path is not a regular file: ${filename}`)
  }
  const temporary = join(dirname(filename), `.${basename(filename)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', mode })
    chmodSync(temporary, mode)
    renameSync(temporary, filename)
  } finally {
    unlinkTemporaryFile(temporary)
  }
}

/** Remove leftover .tmp files from crashed prior runs of this pid family. */
function removeStaleTemporaryFiles(directory: string, filename: string): void {
  const prefix = `.${filename}.`
  let entries: string[]
  try {
    entries = require('node:fs').readdirSync(directory) as string[]
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.tmp')) continue
    if (!entry.includes(`.${process.pid}.`)) continue
    unlinkTemporaryFile(join(directory, entry))
  }
}

// --- PATH install (anywhere installPathDirectory, 1:1 semantics) ------------

interface PathEntry {
  key: string
  value: string | undefined
}

function pathEntries(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform): PathEntry[] {
  return Object.entries(environment)
    .filter(([key]) => platform === 'win32' ? key.toUpperCase() === 'PATH' : key === 'PATH')
    .map(([key, value]) => ({ key, value }))
}

function normalizedPathComponent(component: string, platform: NodeJS.Platform): string {
  const unquoted = platform === 'win32' && component.startsWith('"') && component.endsWith('"')
    ? component.slice(1, -1)
    : component
  return platform === 'win32' ? unquoted.toLowerCase() : unquoted
}

function withoutPathDirectory(value: string, directory: string, platform: NodeJS.Platform): string {
  const delimiter = platform === 'win32' ? ';' : ':'
  const target = normalizedPathComponent(directory, platform)
  return value
    .split(delimiter)
    .filter(component => normalizedPathComponent(component, platform) !== target)
    .join(delimiter)
}

/** Prepend one directory to PATH and return an idempotent, non-clobbering disposer. */
function installPathDirectory(
  environment: NodeJS.ProcessEnv,
  directory: string,
  platform: NodeJS.Platform,
): () => void {
  const original = pathEntries(environment, platform)
  const current = original.find(entry => entry.value !== undefined)
  const currentValue = current?.value ?? ''
  if (withoutPathDirectory(currentValue, directory, platform) !== currentValue) return () => {}

  const key = current?.key ?? 'PATH'
  const delimiter = platform === 'win32' ? ';' : ':'
  const installedValue = currentValue.length === 0 ? directory : `${directory}${delimiter}${currentValue}`
  for (const entry of original) delete environment[entry.key]
  environment[key] = installedValue

  let active = true
  return () => {
    if (!active) return
    active = false
    const latest = pathEntries(environment, platform)
    if (latest.length === 1 && latest[0]?.key === key && latest[0].value === installedValue) {
      delete environment[key]
      for (const entry of original) environment[entry.key] = entry.value
      return
    }
    for (const entry of latest) {
      if (entry.value === undefined) continue
      environment[entry.key] = withoutPathDirectory(entry.value, directory, platform)
    }
  }
}

// --- public entry -----------------------------------------------------------

/**
 * Install the Electron-as-Node runtime: generate clear-env.mjs + node shim +
 * pnpm shim under stateDir, and prepend the shim dir to the parent PATH so
 * `pnpm` (mygo `pnpm add`, `dsh plugin`) resolves to the Electron-backed
 * implementation. Idempotent; dispose() restores the previous PATH.
 */
export function installElectronNodeRuntime(options: NodeRuntimeOptions): NodeRuntimeInstallation {
  for (const [label, value] of [
    ['application executable', options.appExecutable],
    ['pnpm entry', options.pnpmBinPath],
    ['Electron version', options.electronVersion],
    ['state directory', options.stateDir],
  ] as const) {
    if (value === undefined || value === '') {
      throw new Error(`marisa-electron: runtime ${label} must be a non-empty value`)
    }
  }

  const windows = options.platform === 'win32'
  const environment = options.environment ?? process.env
  const pathDir = join(options.stateDir, 'bin')
  const privateDir = join(options.stateDir, 'private')
  const nodeBinDir = join(privateDir, 'node-bin')
  preparePrivateDirectory(options.stateDir)
  preparePrivateDirectory(pathDir)
  preparePrivateDirectory(privateDir)
  preparePrivateDirectory(nodeBinDir)

  const pnpmShimName = windows ? 'pnpm.cmd' : 'pnpm'
  const nodeShimName = windows ? 'node.cmd' : 'node'
  removeStaleTemporaryFiles(pathDir, pnpmShimName)
  removeStaleTemporaryFiles(nodeBinDir, nodeShimName)
  removeStaleTemporaryFiles(privateDir, 'clear-env.mjs')
  const pnpmShimPath = join(pathDir, pnpmShimName)
  const nodeShimPath = join(nodeBinDir, nodeShimName)
  const clearEnvironmentPath = join(privateDir, 'clear-env.mjs')
  replacePrivateFile(clearEnvironmentPath, clearEnvironmentModule(), PRIVATE_FILE_MODE)
  const clearEnvironmentUrl = pathToFileURL(clearEnvironmentPath).href
  replacePrivateFile(
    nodeShimPath,
    windows
      ? windowsNodeShim(options.appExecutable, clearEnvironmentUrl)
      : posixNodeShim(options.appExecutable, clearEnvironmentUrl),
    windows ? PRIVATE_FILE_MODE : EXECUTABLE_FILE_MODE,
  )
  replacePrivateFile(
    pnpmShimPath,
    windows
      ? windowsPnpmShim(options, nodeBinDir, nodeShimPath, clearEnvironmentUrl)
      : posixPnpmShim(options, nodeBinDir, nodeShimPath, clearEnvironmentUrl),
    windows ? PRIVATE_FILE_MODE : EXECUTABLE_FILE_MODE,
  )

  return {
    pathDir,
    pnpmShimPath,
    nodeBinDir,
    nodeShimPath,
    clearEnvironmentPath,
    dispose: installPathDirectory(environment, pathDir, options.platform),
  }
}

/**
 * Spawn argv that runs `entryJs` on Electron-as-Node with the clear-env
 * prelude (launcher.cmd / launcher.sh replacement when no node.exe exists).
 * argv[0] is the Electron executable; caller passes it to spawn directly —
 * no shell involved, quoting stays intact.
 */
export function runAsNodeArgv(appExecutable: string, clearEnvironmentPath: string, entryJs: string): {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
} {
  return {
    command: appExecutable,
    args: ['--import', pathToFileURL(clearEnvironmentPath).href, entryJs],
    env: { ...process.env, [RUN_AS_NODE]: '1' },
  }
}

/** Read back a generated shim (diagnostics/log assertions in tests). */
export function readShim(path: string): string {
  return readFileSync(path, 'utf8')
}
