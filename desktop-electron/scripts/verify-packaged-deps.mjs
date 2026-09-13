#!/usr/bin/env node
/**
 * verify-packaged-deps.mjs — assert the packaged app can actually resolve the
 * bare module specifiers its own compiled output imports.
 *
 * Why this exists: `tar-stream` is a RUNTIME dependency of lib/extract.js (it
 * unpacks the embedded backend), but it was declared in devDependencies. npm
 * therefore installed it for tests, electron-builder found no production
 * dependencies to bundle ("no node modules returned while searching
 * directories"), and the shipped installer died on launch with
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tar-stream'
 *     imported from <app>/resources/app.asar/lib/extract.js
 *
 * Nothing in tsc/vitest/electron-builder flags that: the unit tests pass
 * because devDependencies are present, and the packager is happy to emit an
 * asar with zero node_modules. This gate closes that hole by checking the
 * artefact instead of the source tree.
 *
 * Usage: node scripts/verify-packaged-deps.mjs [path/to/app.asar]
 * Exit codes: 0 all specifiers resolve, 1 missing, 2 unusable input.
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

/**
 * Specifiers that legitimately have no node_modules entry inside the asar.
 *   electron          — supplied by the Electron runtime itself.
 *   @breezystate/zstd, zstd-napi — optional accelerators; lib/zstd-decoder.js
 *                     probes them inside try/catch and falls back to Node's
 *                     built-in zstd.
 */
const PROVIDED_BY_RUNTIME = new Set(['electron', '@breezystate/zstd', 'zstd-napi'])

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')

const require = createRequire(import.meta.url)
let asar
try {
  asar = require('@electron/asar')
} catch {
  console.error('verify-packaged-deps: @electron/asar is unavailable — run npm install first')
  process.exit(2)
}

const target = process.argv[2] ?? join(appDir, 'release', 'win-unpacked', 'resources', 'app.asar')
if (!existsSync(target)) {
  console.error(`verify-packaged-deps: no asar at ${target} — build the installer first`)
  process.exit(2)
}

/** Every path inside the asar, forward-slashed and root-relative. */
const entries = asar
  .listPackage(target)
  .map(p => p.replaceAll('\\', '/').replace(/^\/+/, ''))

const libFiles = entries.filter(p => /^lib\/.*\.js$/.test(p))
if (libFiles.length === 0) {
  console.error(`verify-packaged-deps: no lib/*.js inside ${target}`)
  process.exit(2)
}

/** Bare specifiers referenced by one compiled module. */
function bareSpecifiers(source) {
  const found = new Set()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1])
  }
  return found
}

/** '@scope/pkg/sub' -> '@scope/pkg'; 'pkg/sub' -> 'pkg'. */
function packageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const needed = new Map()
for (const file of libFiles) {
  const source = asar.extractFile(target, file).toString('utf8')
  for (const specifier of bareSpecifiers(source)) {
    if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('data:')) continue
    if (PROVIDED_BY_RUNTIME.has(packageName(specifier))) continue
    if (!needed.has(packageName(specifier))) needed.set(packageName(specifier), new Set())
    needed.get(packageName(specifier)).add(file)
  }
}

if (needed.size === 0) {
  console.log(`verify-packaged-deps: ${libFiles.length} modules import no bundled packages — nothing to check`)
  process.exit(0)
}

const missing = []
for (const [name, importers] of [...needed].sort()) {
  const present = entries.some(p => p === `node_modules/${name}/package.json`)
  const status = present ? 'ok  ' : 'MISS'
  console.log(`  ${status} ${name}  <- ${[...importers].sort().join(', ')}`)
  if (!present) missing.push(name)
}

if (missing.length > 0) {
  console.error(
    `\nverify-packaged-deps: ${missing.length} runtime package(s) absent from the asar: ${missing.join(', ')}\n` +
    'These are imported by shipped lib/*.js but were not bundled. Declare them under\n' +
    '"dependencies" (not "devDependencies") in desktop-electron/package.json and rebuild —\n' +
    'electron-builder only bundles production dependencies.',
  )
  process.exit(1)
}

console.log(`verify-packaged-deps: OK (${needed.size} runtime package(s) present in the asar)`)
