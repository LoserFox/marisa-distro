import { droppedDirectories, type DroppedDirectory } from './directory.ts'

export interface DroppedItems {
  readonly directories: readonly DroppedDirectory[]
  readonly files: readonly File[]
}

export function droppedItems(dataTransfer: Pick<DataTransfer, 'items'>): DroppedItems {
  const directories = droppedDirectories(dataTransfer)
  const directoryItemIndexes = new Set(directories.map(directory => directory.itemIndex))
  const files = [...dataTransfer.items].flatMap((item, index) => {
    if (directoryItemIndexes.has(index) || item.kind !== 'file') return []
    const file = item.getAsFile()
    return file === null ? [] : [file]
  })
  return { directories, files }
}
