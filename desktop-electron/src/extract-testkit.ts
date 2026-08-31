/**
 * Testkit for extract.ts: the module's zstdDecode is module state, so the
 * testkit re-implements the thin ensureBackend wrapper with an injectable
 * decoder (identical logic, decoder swapped). Kept in a separate file so the
 * production module stays seam-free.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { extract as parseTar } from 'tar-stream'
import { recreateLinks, LINKS_MANIFEST_NAME, BACKEND_VERSION_NAME } from '../src/extract.ts'

/** Extract a decompressed tar buffer (shared with extract.test.ts helpers). */
export function extractTarBuffer(
  tar: Buffer,
  dest: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ fileCount: number; links: { link: string; target: string }[] }> {
  return new Promise((resolve, reject) => {
    const links: { link: string; target: string }[] = []
    let fileCount = 0
    const extractor = parseTar()
    extractor.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = []
      stream.on('data', c => chunks.push(c as Buffer))
      stream.on('end', () => {
        const data = Buffer.concat(chunks)
        try {
          if (header.name === BACKEND_VERSION_NAME) return next() // skipped; caller writes last
          if (header.name === LINKS_MANIFEST_NAME) {
            const parsed = JSON.parse(data.toString('utf8')) as { link: string; target: string }[]
            links.push(...parsed)
          }
          if (header.type === 'directory') {
            mkdirSync(join(dest, header.name), { recursive: true })
          } else if (header.type === 'file') {
            mkdirSync(join(dest, header.name, '..'), { recursive: true })
            writeFileSync(join(dest, header.name), data)
            fileCount++
          }
          onProgress?.(fileCount, fileCount)
        } catch (err) {
          return reject(err instanceof Error ? err : new Error(String(err)))
        }
        next()
      })
      stream.resume()
    })
    extractor.on('finish', () => resolve({ fileCount, links }))
    extractor.on('error', reject)
    extractor.end(tar)
  })
}

/** Read the VERSION entry from a decompressed tar. */
export function versionFromTar(tar: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const extractor = parseTar()
    extractor.on('entry', (header, stream, next) => {
      if (header.name === 'VERSION') {
        const chunks: Buffer[] = []
        stream.on('data', c => chunks.push(c as Buffer))
        stream.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8').trim())
          next()
        })
        stream.resume()
      } else {
        stream.resume()
        next()
      }
    })
    extractor.on('finish', () => reject(new Error('no VERSION')))
    extractor.on('error', reject)
    extractor.end(tar)
  })
}

/** ensureBackend with a pre-resolved version (skips the zstd decode). */
export async function ensureBackendNoDecode(
  dest: string,
  version: string,
  log: (m: string) => void,
): Promise<string> {
  const cur = existsSync(join(dest, 'VERSION')) ? readFileSync(join(dest, 'VERSION'), 'utf8').trim() : null
  if (cur === version) {
    log(`backend up to date at ${dest} (version ${version})`)
    await recreateLinks(join(dest, LINKS_MANIFEST_NAME), dest, undefined, log)
    return dest
  }
  throw new Error('testkit: no-decode path only handles the up-to-date branch')
}

/** ensureBackend with an injectable decoder (identity or zstd CLI). */
export async function ensureBackendWithDecoder(opts: {
  bundle: Uint8Array
  dest: string
  decode: (input: Uint8Array) => Promise<Buffer>
  log: (m: string) => void
}): Promise<string> {
  const { bundle, dest, decode, log } = opts
  const staging = dest + '.extracting'
  const tar = await decode(bundle)
  const want = await versionFromTar(tar)
  const versionFile = join(dest, BACKEND_VERSION_NAME)
  if (existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === want) {
    log(`backend up to date at ${dest} (version ${want})`)
    await recreateLinks(join(dest, LINKS_MANIFEST_NAME), dest, undefined, log)
    return dest
  }
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  let published = false
  try {
    await extractTarBuffer(tar, staging)
    rmSync(dest, { recursive: true, force: true })
    renameSync(staging, dest)
    published = true
    await recreateLinks(join(dest, LINKS_MANIFEST_NAME), dest, undefined, log)
    writeFileSync(versionFile, want, 'utf8')
    log(`backend extraction complete (version ${want})`)
    return dest
  } finally {
    if (!published) rmSync(staging, { recursive: true, force: true })
  }
}
