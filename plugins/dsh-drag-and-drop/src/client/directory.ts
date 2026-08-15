import { DIRECTORY_MAX_DEPTH, DIRECTORY_MAX_ENTRIES, type DirectoryContentSample, type DirectoryEntryMeta, type DirectoryStructure } from '../directory.ts'
import { sampleFingerprint } from './fingerprint.ts'

interface FileSystemEntryLike {
  readonly name: string
  readonly isFile: boolean
  readonly isDirectory: boolean
  file(success: (file: File) => void, error?: (error: DOMException) => void): void
  createReader(): { readEntries(success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void): void }
}

export interface DroppedDirectory {
  readonly itemIndex: number
  readonly name: string
  readonly entry: FileSystemEntryLike
}

function readFile(entry: FileSystemEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readChildren(entry: FileSystemEntryLike): Promise<FileSystemEntryLike[]> {
  const reader = entry.createReader()
  const entries: FileSystemEntryLike[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) return entries
    entries.push(...batch)
  }
}

export function droppedDirectories(dataTransfer: Pick<DataTransfer, 'items'>): DroppedDirectory[] {
  const directories: DroppedDirectory[] = []
  for (const [itemIndex, item] of [...dataTransfer.items].entries()) {
    const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null | undefined
    if (entry?.isDirectory === true) directories.push({ itemIndex, name: entry.name, entry })
  }
  return directories
}

export async function readDirectoryStructure(root: FileSystemEntryLike): Promise<DirectoryStructure> {
  const entries: DirectoryEntryMeta[] = []
  let truncated = false
  const visit = async (directory: FileSystemEntryLike, prefix: string, depth: number): Promise<void> => {
    if (depth >= DIRECTORY_MAX_DEPTH) { truncated = true; return }
    const children = await readChildren(directory)
    children.sort((a, b) => a.name.normalize('NFC').localeCompare(b.name.normalize('NFC')))
    for (const child of children) {
      if (entries.length >= DIRECTORY_MAX_ENTRIES) { truncated = true; return }
      const path = prefix === '' ? child.name : `${prefix}/${child.name}`
      if (child.isDirectory) {
        entries.push({ path, kind: 'directory' })
        await visit(child, path, depth + 1)
      } else if (child.isFile) {
        const file = await readFile(child)
        entries.push({ path, kind: 'file', size: file.size })
      }
    }
  }
  await visit(root, '', 0)
  return { entries, truncated }
}

async function findEntry(root: FileSystemEntryLike, relativePath: string): Promise<FileSystemEntryLike | undefined> {
  let current = root
  for (const part of relativePath.split('/')) {
    if (!current.isDirectory) return undefined
    current = (await readChildren(current)).find(entry => entry.name.normalize('NFC') === part.normalize('NFC'))!
    if (current === undefined) return undefined
  }
  return current
}

export async function readDirectoryContentSamples(root: FileSystemEntryLike, paths: readonly string[]): Promise<DirectoryContentSample[]> {
  const samples: DirectoryContentSample[] = []
  for (const path of paths) {
    const entry = await findEntry(root, path)
    if (entry?.isFile !== true) continue
    const file = await readFile(entry)
    samples.push({ path, size: file.size, digest: await sampleFingerprint(file) })
  }
  return samples
}
