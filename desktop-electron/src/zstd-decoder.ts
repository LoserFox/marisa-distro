/**
 * zstd stream decoder selection for the embedded backend (a single
 * zstd stream, desktop/bundle/backend.tar.zst).
 *
 * Resolution order:
 *   1. Node's built-in zstd (node:zlib, Node >= 22.15 / 23.8) — always present
 *      under Electron 43, which embeds Node 24.19. No native binding, no
 *      external tool.
 *   2. An optional native binding, if one happens to be installed.
 *   3. The `zstd` CLI (the Wails build already requires it in the bundle
 *      toolchain), unless it is missing.
 *
 * The CLI path is last on purpose: on Windows it truncates the ~153MB payload
 * (zstd exits 70, "Write error: No space left on device") when its stdout is
 * consumed through a pipe, so it must never be the preferred decoder.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

export interface ZstdDecode {
  (input: Uint8Array): Promise<Buffer>
  /** Which implementation resolved; diagnostics only. */
  impl: 'builtin' | 'binding' | 'cli'
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

/** Decode a whole zstd stream (the embedded tar.zst, ~153MB compressed). */
export const zstdDecode = (async (input: Uint8Array): Promise<Buffer> => {
  // Preferred path: Node's own zstd decoder. Available in Electron 43 (Node
  // 24.19), so the shipped shell needs no native module and no zstd CLI.
  try {
    const zlib = (await import('node:zlib')) as { zstdDecompressSync?: (d: Uint8Array) => Buffer }
    if (typeof zlib.zstdDecompressSync === 'function') {
      zstdDecode.impl = 'builtin'
      return zlib.zstdDecompressSync(input)
    }
  } catch { /* fall through to binding/CLI */ }
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

/** Default label before the first call resolves a real implementation. */
zstdDecode.impl = 'builtin'
