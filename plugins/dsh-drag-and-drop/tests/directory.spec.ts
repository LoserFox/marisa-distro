import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { directoryContentDigest, directoryStructureDigest, selectDirectorySamplePaths } from '../src/directory.ts'
import { nodeDirectoryContentDigest, readNodeDirectoryStructure } from '../src/directory-node.ts'
import { sampleFingerprint } from '../src/fingerprint.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'directory-fingerprint-'))
  roots.push(root)
  await mkdir(join(root, 'src'))
  await mkdir(join(root, 'empty'))
  await writeFile(join(root, 'README.md'), 'hello')
  await writeFile(join(root, 'src', 'index.ts'), 'export {}')
  return root
}

describe('directory fingerprints', () => {
  it('records files, nested and empty directories deterministically', async () => {
    const root = await fixture()
    const structure = await readNodeDirectoryStructure(root)
    expect(structure).toEqual({ truncated: false, entries: [
      { path: 'empty', kind: 'directory' },
      { path: 'README.md', kind: 'file', size: 5 },
      { path: 'src', kind: 'directory' },
      { path: 'src/index.ts', kind: 'file', size: 9 },
    ] })
    expect(directoryStructureDigest({ ...structure, entries: [...structure.entries].reverse() })).toBe(directoryStructureDigest(structure))
  })

  it('rejects sample paths that escape the candidate directory', async () => {
    const root = await fixture()
    await expect(nodeDirectoryContentDigest(root, ['../outside.txt'])).rejects.toThrow('invalid directory-relative path')
  })

  it('produces the same aggregate content digest from selected samples', async () => {
    const root = await fixture()
    const structure = await readNodeDirectoryStructure(root)
    const paths = selectDirectorySamplePaths(structure.entries)
    const samples = await Promise.all(paths.map(async path => {
      const absolute = join(root, ...path.split('/'))
      const size = (await import('node:fs/promises')).stat(absolute).then(info => info.size)
      return { path, size: await size, digest: await sampleFingerprint(absolute, await size) }
    }))
    await expect(nodeDirectoryContentDigest(root, paths)).resolves.toBe(directoryContentDigest(samples))
  })
})
