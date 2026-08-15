import { describe, expect, it } from 'vitest'
import { droppedItems } from '../src/client/drop-items.ts'

function item(name: string, directory: boolean, file: File | null): DataTransferItem {
  return {
    kind: 'file', type: '', getAsFile: () => file,
    webkitGetAsEntry: () => ({ name, isDirectory: directory, isFile: !directory }),
  } as unknown as DataTransferItem
}

describe('droppedItems', () => {
  it('does not treat directory placeholders as files or deduplicate by name', () => {
    const zeroByteFile = new File([], 'project')
    const ordinaryFile = new File(['x'], 'note.txt')
    const items = [item('project', true, new File([], 'project')), item('project', false, zeroByteFile), item('note.txt', false, ordinaryFile)]
    const result = droppedItems({ items: items as unknown as DataTransferItemList })
    expect(result.directories.map(directory => directory.name)).toEqual(['project'])
    expect(result.files).toEqual([zeroByteFile, ordinaryFile])
  })
})
