/**
 * Pure-JS zstd stream decoder selection. The embedded backend is a single
 * zstd stream (desktop/bundle/tarszst). Node has no built-in zstd; prefer the
 * optional system binding, fall back to `zstd -d` via stdin/stdout when the
 * CLI exists (the Wails build already requires zstd in the bundle toolchain).
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

export interface ZstdDecode {
  (input: Uint8Array): Promise<Buffer>
  /** Which implementation resolved; diagnostics only. */
  impl: 'binding' | 'cli'
}

/** Try to load an optional zstd binding without breaking when absent. */
function tryBinding(): ((data: Uint8Array) => Promise<Buffer>) | null {
  try {
    // Optional peer: not declared in package.json — resolved only if present.
    const require = createRequire(import.meta.url)
    const mod = require('@breezystate/zstd') as { decompress?: (d: Uint8Array) => Promise<Buffer> }
    if (typeof mod?.decompress === 'function') return mod.decompress
  } catch { /* not installed */ }
  try {
    const require = createRequire(import.meta.url)
    const mod = require('zstd-napi') as { decompress?: (d: Uint8Array) => Promise<Buffer> }
    if (typeof mod?.decompress === 'function') return mod.decompress
  } catch { /* not installed */ }
  return null
}

/** `zstd -d` CLI availability (probed once). */
let cliAvailable: boolean | null = null

function probeCli(): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn('zstd', ['--version'], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/** Decode a whole zstd stream (the embedded tar.zst, ~300MB compressed). */
export const zstdDecode = (async (input: Uint8Array): Promise<Buffer> => {
  const binding = tryBinding()
  if (binding !== null) {
    zstdDecode.impl = 'binding'
    return binding(input)
  }
  if (cliAvailable === null) cliAvailable = await probeCli()
  if (!cliAvailable) {
    throw new Error(
      'no zstd decoder available: install the optional zstd binding or the zstd CLI ' +
      '(the Windows shell embeds decode via the binding; see docs/desktop-electron.md)',
    )
  }
  zstdDecode.impl = 'cli'
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('zstd', ['-d', '-c'], { windowsHide: true })
    const chunks: Buffer[] = []
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      child.kill()
      reject(err)
    }
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stdout.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    child.stderr.on('data', () => { /* progress noise */ })
    child.on('error', fail)
    child.on('close', code => {
      if (!settled && code !== 0) fail(new Error(`zstd -d exited ${code}`))
    })
    child.stdin.end(Buffer.from(input))
  })
}) as ZstdDecode

zstdDecode.impl = 'binding'
