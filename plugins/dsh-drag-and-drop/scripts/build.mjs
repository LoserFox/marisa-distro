#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function resolveCheckout() {
  if (process.env.DSH_CHECKOUT !== undefined && process.env.DSH_CHECKOUT !== '') {
    return resolve(process.env.DSH_CHECKOUT)
  }
  const which = spawnSync('command', ['-v', 'dsh'], { shell: true, encoding: 'utf8' })
  const launcher = which.stdout.trim()
  if (launcher === '') throw new Error('Cannot find DSH; set DSH_CHECKOUT=/path/to/dsh')
  let directory = dirname(realpathSync(launcher))
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(directory, 'packages', 'client', 'tsdown.client.ts'))) return directory
    directory = dirname(directory)
  }
  throw new Error(`No DSH checkout found above ${launcher}; set DSH_CHECKOUT`)
}

function findWorkspacePackage(checkout, name) {
  const packages = join(checkout, 'packages')
  for (const group of readdirSync(packages, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const groupDirectory = join(packages, group.name)
    for (const entry of readdirSync(groupDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const packageFile = join(groupDirectory, entry.name, 'package.json')
      if (!existsSync(packageFile)) continue
      try {
        if (JSON.parse(readFileSync(packageFile, 'utf8')).name === name) return join(groupDirectory, entry.name)
      } catch {
        // Ignore directories without valid package metadata.
      }
    }
  }
  return undefined
}

const checkout = resolveCheckout()
const nodeModules = join(root, 'node_modules')
rmSync(nodeModules, { recursive: true, force: true })
symlinkSync(join(checkout, 'node_modules'), nodeModules, 'dir')

try {
  const scope = join(nodeModules, '@deepseek-ai')
  mkdirSync(scope, { recursive: true })
  // The framework peer is rescoped into @deepseek-ai (cordis -> @deepseek-ai/cordis):
  // link the vendored source under the scoped name so tsc/tsdown resolve it.
  const cordisTarget = join(scope, 'cordis')
  if (!existsSync(cordisTarget)) symlinkSync(join(checkout, 'vendor', 'cordis'), cordisTarget, 'dir')
  for (const name of [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-host-webserver',
  ]) {
    const target = join(scope, name.slice(name.lastIndexOf('/') + 1))
    if (existsSync(target)) continue
    const source = findWorkspacePackage(checkout, name)
    if (source === undefined) throw new Error(`DSH workspace package not found: ${name}`)
    symlinkSync(source, target, 'dir')
  }

  const bin = join(checkout, 'node_modules', '.bin')
  const run = (name, args) => {
    const result = spawnSync(join(bin, name), args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DSH_CHECKOUT: checkout },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  run('tsc', ['-p', 'tsconfig.json'])
  run('tsdown', ['-c', 'tsdown.config.mjs'])
} finally {
  rmSync(nodeModules, { recursive: true, force: true })
}
