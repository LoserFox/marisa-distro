import { createHash } from 'node:crypto'

export const DIRECTORY_MAX_ENTRIES = 10_000
export const DIRECTORY_MAX_DEPTH = 32
export const DIRECTORY_SAMPLE_FILES = 24

export type DirectoryEntryKind = 'file' | 'directory'

export interface DirectoryEntryMeta {
  readonly path: string
  readonly kind: DirectoryEntryKind
  readonly size?: number
}

export interface DirectoryStructure {
  readonly entries: readonly DirectoryEntryMeta[]
  readonly truncated: boolean
}

export interface DirectoryContentSample {
  readonly path: string
  readonly size: number
  readonly digest: string
}

export function normalizedDirectoryPath(path: string): string {
  const normalized = path.normalize('NFC').replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (normalized.startsWith('/') || parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new TypeError('invalid directory-relative path')
  }
  return normalized
}

export function canonicalDirectoryEntries(entries: readonly DirectoryEntryMeta[]): DirectoryEntryMeta[] {
  return entries.map(entry => ({
    path: normalizedDirectoryPath(entry.path),
    kind: entry.kind,
    ...(entry.kind === 'file' ? { size: entry.size ?? 0 } : {}),
  })).sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind))
}

export function directoryStructureDigest(structure: DirectoryStructure): string {
  const hash = createHash('sha256')
  hash.update(structure.truncated ? 'truncated\n' : 'complete\n')
  for (const entry of canonicalDirectoryEntries(structure.entries)) {
    hash.update(`${entry.kind}\0${entry.path}\0${entry.size ?? ''}\n`)
  }
  return hash.digest('hex')
}

export function selectDirectorySamplePaths(entries: readonly DirectoryEntryMeta[]): string[] {
  return canonicalDirectoryEntries(entries)
    .filter((entry): entry is DirectoryEntryMeta & { kind: 'file'; size: number } => entry.kind === 'file')
    .map(entry => ({ path: entry.path, rank: createHash('sha256').update(entry.path).digest('hex') }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.path.localeCompare(b.path))
    .slice(0, DIRECTORY_SAMPLE_FILES)
    .map(entry => entry.path)
}

export function directoryContentDigest(samples: readonly DirectoryContentSample[]): string {
  const hash = createHash('sha256')
  for (const sample of [...samples].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(`${normalizedDirectoryPath(sample.path)}\0${sample.size}\0${sample.digest}\n`)
  }
  return hash.digest('hex')
}
