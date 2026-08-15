import { homedir } from 'node:os'
import { basename, join, normalize, resolve, sep } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { directoryContentDigest, directoryStructureDigest, selectDirectorySamplePaths } from './directory.ts'
import { nodeDirectoryContentDigest, nodeDirectoryStructureDigest } from './directory-node.ts'
import { fullFingerprint, sampleFingerprint } from './fingerprint.ts'
import { broadSearchRoots, indexedSearch } from './platform-search.ts'
import type { DroppedEntryMeta, DroppedFileMeta, LocateRequest, LocateResponse } from './protocol.ts'
import { SMALL_FILE_BYTES } from './protocol.ts'

const MAX_CANDIDATES = 100
const MAX_WALK_ENTRIES = 20_000
const WALK_DEPTH = 12

interface Candidate {
  readonly path: string
  readonly mtimeMs: number
}

async function directCandidate(root: string, name: string, kind: DroppedEntryMeta['kind']): Promise<string | undefined> {
  const path = join(root, name)
  try {
    const info = await stat(path)
    return (kind === 'file' ? info.isFile() : info.isDirectory()) ? path : undefined
  } catch { return undefined }
}

async function walkByName(root: string, name: string, kind: DroppedEntryMeta['kind'], depth = WALK_DEPTH): Promise<string[]> {
  const found: string[] = []
  let visited = 0
  const visit = async (directory: string, remaining: number): Promise<void> => {
    if (remaining < 0 || found.length >= MAX_CANDIDATES || visited >= MAX_WALK_ENTRIES) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (++visited >= MAX_WALK_ENTRIES || found.length >= MAX_CANDIDATES) break
      const path = join(directory, entry.name)
      if (entry.name === name && (kind === 'file' ? entry.isFile() : entry.isDirectory())) found.push(path)
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path, remaining - 1)
    }
  }
  await visit(root, depth)
  return found
}

async function validateCandidates(item: DroppedEntryMeta, paths: readonly string[]): Promise<Candidate[]> {
  const candidates: Candidate[] = []
  for (const path of [...new Set(paths)].slice(0, MAX_CANDIDATES)) {
    try {
      const info = await stat(path)
      const kindMatches = item.kind === 'file' ? info.isFile() && info.size === item.size : info.isDirectory()
      if (kindMatches && basename(path) === item.name) candidates.push({ path: normalize(path), mtimeMs: info.mtimeMs })
    } catch { /* Candidate disappeared between lookup and validation. */ }
  }
  return candidates.sort((a, b) => item.kind === 'file'
    ? Math.abs(a.mtimeMs - item.lastModified) - Math.abs(b.mtimeMs - item.lastModified) || a.path.localeCompare(b.path)
    : a.path.localeCompare(b.path))
}

async function directCandidates(item: DroppedEntryMeta, roots: readonly string[]): Promise<Candidate[]> {
  const paths = await Promise.all(roots.map(root => directCandidate(root, item.name, item.kind)))
  return validateCandidates(item, paths.filter(path => path !== undefined))
}

async function recursiveCandidates(item: DroppedEntryMeta, roots: readonly string[]): Promise<Candidate[]> {
  const paths: string[] = []
  for (const root of roots) paths.push(...await walkByName(root, item.name, item.kind))
  return validateCandidates(item, paths)
}

function pathsInside(paths: readonly string[], roots: readonly string[]): string[] {
  const canonicalRoots = roots.map(root => resolve(root))
  return paths.filter(path => {
    const candidate = resolve(path)
    return canonicalRoots.some(root => candidate === root || candidate.startsWith(`${root}${sep}`))
  })
}

async function metadataCandidates(item: DroppedEntryMeta, request: LocateRequest): Promise<Candidate[]> {
  const current = request.currentWorkspacePath
  const workspaceRoots = [...new Set(request.workspacePaths ?? [])].filter(root => typeof root === 'string' && root !== '')
  const otherWorkspaces = workspaceRoots.filter(root => root !== current)
  const commonRoots = [join(homedir(), 'Desktop'), join(homedir(), 'Documents'), join(homedir(), 'Downloads')]

  const rootGroups = [current === undefined ? [] : [current], otherWorkspaces, commonRoots]
  const indexedPaths = await indexedSearch(item.name)
  for (const roots of rootGroups) {
    const direct = await directCandidates(item, roots)
    if (direct.length > 0) return direct
    const indexed = await validateCandidates(item, pathsInside(indexedPaths, roots))
    if (indexed.length > 0) return indexed
    const recursive = await recursiveCandidates(item, roots)
    if (recursive.length > 0) return recursive
  }
  const globalIndexed = await validateCandidates(item, indexedPaths)
  if (globalIndexed.length > 0) return globalIndexed
  return recursiveCandidates(item, await broadSearchRoots())
}

async function matchingFileDigest(candidates: readonly string[], digest: string, phase: 'sample' | 'full', file: DroppedFileMeta): Promise<string[]> {
  const matched: string[] = []
  for (const path of candidates.slice(0, MAX_CANDIDATES)) {
    try {
      const actual = phase === 'sample' ? await sampleFingerprint(path, file.size) : await fullFingerprint(path)
      if (actual === digest) matched.push(path)
    } catch { /* Unreadable candidates are not matches. */ }
  }
  return matched
}

async function locateDirectoryStructure(request: LocateRequest): Promise<LocateResponse> {
  if (request.file.kind !== 'directory' || request.file.structure === undefined || request.candidates === undefined) {
    return { status: 'error', message: 'directory structure phase requires candidates and structure' }
  }
  const candidates = request.candidates
  const expected = directoryStructureDigest(request.file.structure)
  const matched: string[] = []
  let samplePaths = selectDirectorySamplePaths(request.file.structure.entries)
  for (const path of candidates) {
    try {
      const actual = await nodeDirectoryStructureDigest(path)
      if (actual.digest === expected) { matched.push(path); samplePaths = actual.paths }
    } catch { /* Ignore unreadable directories. */ }
  }
  if (matched.length === 0) return { status: 'not-found' }
  if (matched.length === 1) return { status: 'found', path: matched[0] }
  if (samplePaths.length === 0) return { status: 'choose', candidates: matched }
  return { status: 'directory-content-required', candidates: matched, paths: samplePaths }
}

export async function locate(request: LocateRequest): Promise<LocateResponse> {
  if (request.file.name === '') return { status: 'error', message: 'invalid dropped entry metadata' }
  if ((request.file as { kind?: string }).kind === undefined) {
    request = { ...request, file: { ...request.file, kind: 'file' } as DroppedFileMeta }
  }

  if (request.file.kind === 'directory') {
    if (request.phase === 'metadata') {
      const candidates = await metadataCandidates(request.file, request)
      if (candidates.length === 0) return { status: 'not-found' }
      if (candidates.length === 1) return { status: 'found', path: candidates[0].path }
      return { status: 'directory-structure-required', candidates: candidates.map(candidate => candidate.path) }
    }
    if (request.phase === 'directory-structure') return locateDirectoryStructure(request)
    if (request.phase !== 'directory-content' || request.candidates === undefined || request.directorySamples === undefined) {
      return { status: 'error', message: 'invalid directory phase' }
    }
    const expected = directoryContentDigest(request.directorySamples)
    const paths = request.directorySamples.map(sample => sample.path)
    const matched: string[] = []
    for (const path of request.candidates.slice(0, MAX_CANDIDATES)) {
      try { if (await nodeDirectoryContentDigest(path, paths) === expected) matched.push(path) } catch { /* Ignore unreadable directories. */ }
    }
    if (matched.length === 0) return { status: 'not-found' }
    if (matched.length === 1) return { status: 'found', path: matched[0] }
    return { status: 'choose', candidates: matched }
  }

  if (!Number.isSafeInteger(request.file.size) || request.file.size < 0) return { status: 'error', message: 'invalid dropped-file metadata' }
  if (request.phase === 'metadata') {
    const candidates = await metadataCandidates(request.file, request)
    if (candidates.length === 0) return { status: 'not-found' }
    if (candidates.length === 1) return { status: 'found', path: candidates[0].path }
    return { status: 'sample-required', candidates: candidates.map(candidate => candidate.path) }
  }
  if ((request.phase !== 'sample' && request.phase !== 'full') || request.digest === undefined || request.candidates === undefined) {
    return { status: 'error', message: 'digest phase requires candidates and digest' }
  }
  const matched = await matchingFileDigest(request.candidates, request.digest, request.phase, request.file)
  if (matched.length === 0) return { status: 'not-found' }
  if (matched.length === 1) return { status: 'found', path: matched[0] }
  if (request.phase === 'sample' && request.file.size <= SMALL_FILE_BYTES) return { status: 'choose', candidates: matched }
  if (request.phase === 'sample') return { status: 'full-required', candidates: matched }
  return { status: 'choose', candidates: matched }
}
