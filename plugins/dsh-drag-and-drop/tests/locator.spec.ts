import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fullFingerprint, sampleFingerprint } from '../src/fingerprint.ts'
import { locate } from '../src/locator.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'file-drop-locator-'))
  roots.push(path)
  return path
}

async function metadata(path: string) {
  const info = await stat(path)
  return { kind: 'file' as const, name: path.split('/').at(-1)!, size: info.size, lastModified: info.mtimeMs }
}

describe('locate', () => {
  it('returns the single matching workspace file without requesting a digest', async () => {
    const workspace = await root()
    await mkdir(join(workspace, 'src'))
    const path = join(workspace, 'src', 'unique.txt')
    await writeFile(path, 'unique content')
    await expect(locate({ phase: 'metadata', file: await metadata(path), workspacePaths: [workspace], currentWorkspacePath: workspace }))
      .resolves.toEqual({ status: 'found', path })
  })

  it('requests a sample for duplicate name-and-size candidates and resolves by digest', async () => {
    const workspace = await root()
    await mkdir(join(workspace, 'a'))
    await mkdir(join(workspace, 'b'))
    const first = join(workspace, 'a', 'same.txt')
    const second = join(workspace, 'b', 'same.txt')
    await writeFile(first, 'first-content')
    await writeFile(second, 'other-content')
    const file = await metadata(first)
    const metadataResult = await locate({ phase: 'metadata', file, workspacePaths: [workspace], currentWorkspacePath: workspace })
    expect(metadataResult.status).toBe('sample-required')
    if (metadataResult.status !== 'sample-required') return
    await expect(locate({
      phase: 'sample', file, candidates: metadataResult.candidates,
      digest: await sampleFingerprint(first, file.size),
    })).resolves.toEqual({ status: 'found', path: first })
  })

  it('asks the user to choose when complete hashes still identify duplicate copies', async () => {
    const workspace = await root()
    await mkdir(join(workspace, 'a'))
    await mkdir(join(workspace, 'b'))
    const first = join(workspace, 'a', 'copy.txt')
    const second = join(workspace, 'b', 'copy.txt')
    await writeFile(first, 'same-content')
    await writeFile(second, 'same-content')
    const file = await metadata(first)
    await expect(locate({
      phase: 'full', file, candidates: [first, second], digest: await fullFingerprint(first),
    })).resolves.toEqual({ status: 'choose', candidates: [first, second] })
  })
})
