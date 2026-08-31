/**
 * Embedded backend materialization — port of desktop/extract_tar.go +
 * desktop/embedded.go.
 *
 * The embedded bundle (backend.tar.zst) is extracted under a staging dir,
 * published by rename, LINKS.json junctions replayed (mklink /J needs no
 * admin), and the VERSION marker written LAST so a crash at any earlier
 * point leaves no matching marker — the next launch retries.
 */

import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, lstatSync } from 'node:fs'
import { basename, dirname, join, resolve as pathResolve, sep } from 'node:path'
import { extract as parseTar } from 'tar-stream'
import { zstdDecode } from './zstd-decoder.ts'

export const BACKEND_VERSION_NAME = 'VERSION'
export const LINKS_MANIFEST_NAME = 'LINKS.json'
/** The VERSION marker is skipped during extraction and written last. */
const SKIP_VERSION_MARKER = true

export interface ExtractProgress {
  (consumed: number, total: number): void
}

export interface ExtractResult {
  fileCount: number
  version: string
}

/** Read the VERSION string from the first entry of a compressed tar.zst. */
export async function embeddedBackendVersion(data: Uint8Array): Promise<string> {
  const tar = await zstdDecode(data)
  return new Promise<string>((resolvePromise, reject) => {
    const extractor = parseTar()
    extractor.on('entry', (header, stream, next) => {
      if (basename(header.name) === BACKEND_VERSION_NAME && header.type === 'file') {
        const chunks: Buffer[] = []
        stream.on('data', c => chunks.push(c as Buffer))
        stream.on('end', () => {
          resolvePromise(Buffer.concat(chunks).toString('utf8').trim())
          next()
        })
        stream.resume()
      } else {
        stream.resume()
        next()
      }
    })
    extractor.on('finish', () => reject(new Error('bundle has no VERSION entry')))
    extractor.on('error', reject)
    extractor.end(tar)
  })
}

/** Reject path traversal / absolute names inside the tar (extractBackend guard). */
function safeJoin(dest: string, name: string): string | null {
  const normalized = name.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null
  const target = pathResolve(dest, normalized)
  const root = pathResolve(dest)
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

interface LinkEntry { link: string; target: string }

/**
 * Materialize the embedded backend: version-gated extract with staging +
 * atomic publish (ensureBackend). Returns the backend dir.
 */
export async function ensureBackend(opts: {
  bundle: Uint8Array
  dest: string
  stagingSuffix?: string
  linksManifest?: string
  onProgress?: ExtractProgress
  log: (message: string) => void
  /** Windows junction creation via `cmd /c mklink /J` (injected for tests). */
  createJunction?: (link: string, target: string) => Promise<void>
}): Promise<string> {
  const { bundle, dest, log } = opts
  const staging = dest + (opts.stagingSuffix ?? '.extracting')
  const want = await embeddedBackendVersion(bundle)
  const versionFile = join(dest, BACKEND_VERSION_NAME)
  if (existsSync(versionFile)) {
    const cur = readFileSync(versionFile, 'utf8').trim()
    if (cur === want) {
      log(`backend up to date at ${dest} (version ${want})`)
      await recreateLinks(join(dest, opts.linksManifest ?? LINKS_MANIFEST_NAME), dest, opts.createJunction, log)
      return dest
    }
  }
  log(`extracting embedded backend (version ${want}, ${bundle.length} bytes) to ${staging}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  let published = false
  try {
    const tar = await zstdDecode(bundle)
    const result = await extractTarAsync(tar, staging, opts.onProgress, bundle.length, want)
    // Junctions only AFTER publishing: targets are absolute (embedded.go).
    rmSync(dest, { recursive: true, force: true })
    const { renameSync } = await import('node:fs')
    renameSync(staging, dest)
    published = true
    await recreateLinks(join(dest, opts.linksManifest ?? LINKS_MANIFEST_NAME), dest, opts.createJunction, log)
    writeFileSync(versionFile, want, 'utf8')
    log(`backend extraction complete: ${result.fileCount} entries`)
    return dest
  } finally {
    if (!published) rmSync(staging, { recursive: true, force: true })
  }
}

/** Async tar extraction with entry writes, link collection, VERSION skip. */
function extractTarAsync(
  tar: Buffer,
  dest: string,
  onProgress: ExtractProgress | undefined,
  totalBytes: number,
  wantVersion: string,
): Promise<{ fileCount: number; links: LinkEntry[] }> {
  return new Promise((resolvePromise, reject) => {
    const links: LinkEntry[] = []
    let fileCount = 0
    const extractor = parseTar()
    extractor.on('entry', (header, stream, next) => {
      const name = header.name
      const chunks: Buffer[] = []
      stream.on('data', c => chunks.push(c as Buffer))
      stream.on('end', () => {
        const data = Buffer.concat(chunks)
        try {
          if (name === BACKEND_VERSION_NAME && SKIP_VERSION_MARKER) {
            onProgress?.(totalBytes, totalBytes)
            return next()
          }
          if (name === LINKS_MANIFEST_NAME) {
            const parsed = parseLinksManifest(data)
            if (parsed !== null) links.push(...parsed)
          }
          const target = safeJoin(dest, name)
          if (target === null) return next()
          if (header.type === 'directory') {
            mkdirSync(target, { recursive: true })
          } else if (header.type === 'file') {
            mkdirSync(dirname(target), { recursive: true })
            writeFileSync(target, data)
            fileCount++
          } else if (header.type === 'link') {
            links.push({ link: name, target: header.linkname ?? '' })
          }
          onProgress?.(Math.min(totalBytes, fileCount * 4096), totalBytes)
        } catch (err) {
          return reject(err instanceof Error ? err : new Error(String(err)))
        }
        next()
      })
      stream.resume()
    })
    extractor.on('finish', () => {
      void wantVersion
      resolvePromise({ fileCount, links })
    })
    extractor.on('error', reject)
    extractor.end(tar)
  })
}

/** Parse LINKS.json: array form first, then legacy NDJSON (BOM tolerated). */
export function parseLinksManifest(data: Buffer): LinkEntry[] | null {
  let text = data.toString('utf8')
  if (text.startsWith('﻿')) text = text.slice(1)
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed
        .filter(e => typeof e?.link === 'string' && typeof e?.target === 'string')
        .map(e => ({ link: e.link, target: e.target }))
    }
  } catch { /* fall through to NDJSON */ }
  const entries: LinkEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const e = JSON.parse(trimmed)
      if (typeof e?.link === 'string' && typeof e?.target === 'string') entries.push({ link: e.link, target: e.target })
    } catch {
      return null
    }
  }
  return entries
}

function pathWithin(root: string, p: string): boolean {
  const abs = pathResolve(root, p)
  return abs === pathResolve(root) || abs.startsWith(pathResolve(root) + sep)
}

/** Whether path is a junction/symlink (isLinkInfo). */
function isLink(p: string): boolean {
  try {
    const st = lstatSync(p)
    return st.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Replay LINKS.json (recreateLinks): mkdir parents, skip present links, fail
 * on shadowing real directories (a failed pnpm op must surface loudly).
 */
export async function recreateLinks(
  manifestPath: string,
  root: string,
  createJunction: ((link: string, target: string) => Promise<void>) | undefined,
  log: (message: string) => void,
): Promise<void> {
  if (!existsSync(manifestPath)) {
    log('no LINKS.json in bundle; skipping link recreation')
    return
  }
  const entries = parseLinksManifest(readFileSync(manifestPath))
  if (entries === null) throw new Error(`parse ${LINKS_MANIFEST_NAME}: invalid JSON`)
  const mkJunction =
    createJunction ??
    (async (link: string, target: string) => {
      if (process.platform === 'win32') {
        const { execFile } = await import('node:child_process')
        await new Promise<void>((res, rej) => {
          execFile('cmd', ['/c', 'mklink', '/J', link, target], err => (err ? rej(err) : res()))
        })
      } else {
        symlinkSync(target, link, 'dir')
      }
    })
  let created = 0
  const shadowed: string[] = []
  for (const e of entries) {
    const link = pathResolve(root, e.link)
    const target = pathResolve(root, e.target)
    if (!pathWithin(root, e.link) || !pathWithin(root, e.target)) {
      throw new Error(`link escapes extraction root: ${e.link} -> ${e.target}`)
    }
    mkdirSync(dirname(link), { recursive: true })
    if (existsSync(link)) {
      if (!isLink(link)) shadowed.push(e.link)
      continue
    }
    await mkJunction(link, target)
    created++
  }
  if (shadowed.length > 0) {
    throw new Error(
      `${shadowed.length} manifest link(s) replaced by real directories (first: ${shadowed[0]}) — ` +
      'a failed pnpm/npm operation likely overwrote a workspace junction; reinstall the backend (rescue page) to restore',
    )
  }
  log(`recreated ${created} workspace links as junctions`)
}
