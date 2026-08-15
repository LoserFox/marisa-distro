import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fullFingerprint as browserFull, sampleFingerprint as browserSample } from '../src/client/fingerprint.ts'
import { fullFingerprint as nodeFull, sampleFingerprint as nodeSample, sampleRanges } from '../src/fingerprint.ts'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(bytes: Uint8Array): Promise<{ file: File; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'file-drop-fingerprint-'))
  directories.push(directory)
  const path = join(directory, 'fixture.bin')
  await writeFile(path, bytes)
  return { file: new File([bytes], 'fixture.bin'), path }
}

describe('sampleRanges', () => {
  it('reads a small file once and a large file at three fixed regions', () => {
    expect(sampleRanges(10)).toEqual([{ start: 0, length: 10 }])
    expect(sampleRanges(1024 * 1024)).toHaveLength(3)
  })
})

describe('cross-runtime fingerprints', () => {
  it('produces identical sample and full digests in browser and node implementations', async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 }, (_, index) => index % 251)
    const { file, path } = await fixture(bytes)
    await expect(browserSample(file)).resolves.toBe(await nodeSample(path, bytes.length))
    await expect(browserFull(file)).resolves.toBe(await nodeFull(path))
  })
})
