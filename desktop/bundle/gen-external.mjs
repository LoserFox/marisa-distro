#!/usr/bin/env node
/**
 * gen-external.mjs — scan a node_modules tree and emit the EXTERNAL list for
 * the esbuild bundle: packages that must stay as real files because they
 * cannot be bundled (native modules, install-time scripts, runtime path
 * probing, WASM).
 *
 * Usage: node gen-external.mjs <nodeModulesRoot> [out.json]
 *
 * A package is external when any of:
 *   1. it ships a *.node native binary
 *   2. its package.json has install / postinstall lifecycle scripts
 *   3. its JS sources reference __dirname / __filename / node-gyp-build /
 *      node-pre-gyp / bindings( / process.dlopen
 *   4. it ships *.wasm
 *
 * CI re-runs this and diffs against the committed list: any drift fails the
 * build so the external set is always a reviewed decision, never an accident.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const [, , rootArg, outArg] = process.argv
if (!rootArg) {
  console.error('usage: node gen-external.mjs <nodeModulesRoot> [out.json]')
  process.exit(2)
}
const root = rootArg.replace(/[\\/]+$/, '')
const out = outArg

function* walk(dir, depth = 0) {
  if (!existsSync(dir)) return
  for (const name of readdirSorted(dir)) {
    const p = join(dir, name)
    let st
    try { st = lstatSync(p) } catch { continue }
    if (st.isSymbolicLink()) {
      // links are followed by the bundler/resolver; treat as file for scans
      try { st = statSync(p) } catch { continue }
    }
    if (st.isDirectory()) {
      if (depth === 0 && name.startsWith('.') && name !== '.bin') continue
      // package boundary: node_modules/<scope>/<pkg> or node_modules/<pkg>
      yield* walk(p, depth + 1)
    } else {
      yield { path: p, rel: relative(root, p).split(sep).join('/') }
    }
  }
}

import { readdirSync, lstatSync, statSync } from 'node:fs'

function readdirSorted(dir) {
  try { return readdirSync(dir).sort() } catch { return [] }
}

function pkgNameOf(rel) {
  const parts = rel.split('/')
  // node_modules/<pkg>/... or node_modules/<scope>/<pkg>/...
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'node_modules') {
      const next = parts[i + 1]
      if (next.startsWith('@') && i + 2 < parts.length) {
        return next + '/' + parts[i + 2]
      }
      return next
    }
  }
  return null
}

const hits = new Map() // pkg -> reasons[]
const pkgCache = new Map() // pkgDir -> parsed package.json

function pkgJson(pkgDir) {
  if (pkgCache.has(pkgDir)) return pkgCache.get(pkgDir)
  const f = join(pkgDir, 'package.json')
  let pj = null
  try { pj = JSON.parse(readFileSync(f, 'utf8')) } catch {}
  pkgCache.set(pkgDir, pj)
  return pj
}

let scanned = 0
for (const { path, rel } of walk(root)) {
  if (rel.startsWith('.pnpm/')) continue // virtual store internals
  if (!rel.includes('node_modules')) continue
  const pkg = pkgNameOf(rel)
  if (!pkg) continue
  // package dir = path up to node_modules/<pkg>
  const nmIdx = rel.indexOf('node_modules/')
  const pkgRel = rel.slice(nmIdx + 'node_modules/'.length)
  const pkgDir = join(root, 'node_modules', pkgRel.split('/').slice(0, pkg.startsWith('@') ? 2 : 1).join('/'))
  const reasons = hits.get(pkg) || []
  scanned++

  const base = rel.slice(rel.lastIndexOf('/') + 1).toLowerCase()
  if (base.endsWith('.node')) {
    if (!reasons.includes('native')) reasons.push('native')
  } else if (base.endsWith('.wasm')) {
    if (!reasons.includes('wasm')) reasons.push('wasm')
  } else if (base.endsWith('.js') || base.endsWith('.cjs') || base.endsWith('.mjs')) {
    const src = readFileSync(path, 'utf8').slice(0, 1 << 20)
    if (/__dirname|__filename|node-gyp-build|node-pre-gyp|bindings\(|process\.dlopen/.test(src)) {
      if (!reasons.includes('path-probe')) reasons.push('path-probe')
    }
  }
  const pj = pkgJson(pkgDir)
  if (pj && (pj.scripts?.install || pj.scripts?.postinstall)) {
    if (!reasons.includes('lifecycle')) reasons.push('lifecycle')
  }
  if (reasons.length) hits.set(pkg, reasons)
}

const externals = Object.fromEntries([...hits.entries()].sort())
console.log(`scanned ${scanned} files, external packages: ${Object.keys(externals).length}`)
for (const [pkg, reasons] of Object.entries(externals)) {
  console.log(`  ${pkg}: ${reasons.join(', ')}`)
}
if (out) {
  writeFileSync(out, JSON.stringify(externals, null, 2) + '\n')
  console.log(`wrote ${out}`)
}
