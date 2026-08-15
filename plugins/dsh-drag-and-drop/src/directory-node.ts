import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { DIRECTORY_MAX_DEPTH, DIRECTORY_MAX_ENTRIES, directoryContentDigest, directoryStructureDigest, normalizedDirectoryPath, selectDirectorySamplePaths, type DirectoryContentSample, type DirectoryEntryMeta, type DirectoryStructure } from './directory.ts'
import { sampleFingerprint } from './fingerprint.ts'

export async function readNodeDirectoryStructure(root: string): Promise<DirectoryStructure> {
  const entries: DirectoryEntryMeta[] = []
  let truncated = false
  const visit = async (directory: string, prefix: string, depth: number): Promise<void> => {
    if (depth >= DIRECTORY_MAX_DEPTH) { truncated = true; return }
    let children
    try { children = await readdir(directory, { withFileTypes: true }) } catch { truncated = true; return }
    children.sort((a, b) => a.name.normalize('NFC').localeCompare(b.name.normalize('NFC')))
    for (const child of children) {
      if (entries.length >= DIRECTORY_MAX_ENTRIES) { truncated = true; return }
      const relativePath = prefix === '' ? child.name : `${prefix}/${child.name}`
      const absolutePath = join(directory, child.name)
      if (child.isSymbolicLink()) continue
      if (child.isDirectory()) {
        entries.push({ path: relativePath, kind: 'directory' })
        await visit(absolutePath, relativePath, depth + 1)
      } else if (child.isFile()) {
        try { entries.push({ path: relativePath, kind: 'file', size: (await stat(absolutePath)).size }) } catch { truncated = true }
      }
    }
  }
  await visit(root, '', 0)
  return { entries, truncated }
}

export async function nodeDirectoryStructureDigest(path: string): Promise<{ digest: string; paths: string[] }> {
  const structure = await readNodeDirectoryStructure(path)
  return { digest: directoryStructureDigest(structure), paths: selectDirectorySamplePaths(structure.entries) }
}

export async function nodeDirectoryContentDigest(root: string, paths: readonly string[]): Promise<string> {
  const samples: DirectoryContentSample[] = []
  for (const path of paths) {
    const safePath = normalizedDirectoryPath(path)
    const absolutePath = join(root, ...safePath.split('/'))
    const info = await stat(absolutePath)
    if (!info.isFile()) continue
    samples.push({ path, size: info.size, digest: await sampleFingerprint(absolutePath, info.size) })
  }
  return directoryContentDigest(samples)
}
