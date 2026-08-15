import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readNodeDirectoryStructure } from '../src/directory-node.ts'
import { locate } from '../src/locator.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'directory-locator-'))
  roots.push(root)
  return root
}

async function directory(root: string, parent: string, content: string): Promise<string> {
  const path = join(root, parent, 'project')
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'entry.txt'), content)
  return path
}

async function metadata(root: string) {
  return locate({ phase: 'metadata', file: { kind: 'directory', name: 'project' }, workspacePaths: [root], currentWorkspacePath: root })
}

describe('directory locator', () => {
  it('returns a direct unique candidate without receiving directory structure', async () => {
    const root = await workspace()
    const path = join(root, 'project')
    await mkdir(path)
    await expect(metadata(root)).resolves.toEqual({ status: 'found', path })
  })

  it('returns the only recursive candidate without receiving directory structure', async () => {
    const root = await workspace()
    const path = await directory(root, 'a', 'hello')
    await expect(metadata(root)).resolves.toEqual({ status: 'found', path })
  })

  it('requests structure only for multiple candidates and filters by it', async () => {
    const root = await workspace()
    const first = await directory(root, 'a', 'hello')
    const second = await directory(root, 'b', 'different-size')
    const initial = await metadata(root)
    expect(initial).toEqual({ status: 'directory-structure-required', candidates: [first, second] })
    if (initial.status !== 'directory-structure-required') return
    await expect(locate({
      phase: 'directory-structure',
      file: { kind: 'directory', name: 'project', structure: await readNodeDirectoryStructure(first) },
      candidates: initial.candidates,
    })).resolves.toEqual({ status: 'found', path: first })
  })

  it('requests content samples for equal structures and chooses identical copies', async () => {
    const root = await workspace()
    const first = await directory(root, 'a', 'hello')
    const second = await directory(root, 'b', 'world')
    const initial = await metadata(root)
    if (initial.status !== 'directory-structure-required') throw new Error('expected multiple candidates')
    const file = { kind: 'directory' as const, name: 'project', structure: await readNodeDirectoryStructure(first) }
    const result = await locate({ phase: 'directory-structure', file, candidates: initial.candidates })
    expect(result.status).toBe('directory-content-required')
    if (result.status !== 'directory-content-required') return
    const { sampleFingerprint } = await import('../src/fingerprint.ts')
    const samples = await Promise.all(result.paths.map(async path => ({
      path, size: 5, digest: await sampleFingerprint(join(first, ...path.split('/')), 5),
    })))
    await expect(locate({ phase: 'directory-content', file, candidates: result.candidates, directorySamples: samples }))
      .resolves.toEqual({ status: 'found', path: first })
    await writeFile(join(second, 'entry.txt'), 'hello')
    await expect(locate({ phase: 'directory-content', file, candidates: result.candidates, directorySamples: samples }))
      .resolves.toEqual({ status: 'choose', candidates: [first, second] })
  })
})
