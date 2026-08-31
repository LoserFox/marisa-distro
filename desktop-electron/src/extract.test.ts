import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLinksManifest, recreateLinks, ensureBackend, embeddedBackendVersion } from '../src/extract.ts'

const BOM = '﻿'

describe('parseLinksManifest', () => {
  it('parses the array form', () => {
    const entries = parseLinksManifest(Buffer.from('[{"link":"a/b","target":"c"}]'))
    expect(entries).toEqual([{ link: 'a/b', target: 'c' }])
  })
  it('parses the legacy NDJSON form', () => {
    const entries = parseLinksManifest(Buffer.from('{"link":"a","target":"b"}\n{"link":"c","target":"d"}\n'))
    expect(entries).toEqual([{ link: 'a', target: 'b' }, { link: 'c', target: 'd' }])
  })
  it('strips a UTF-8 BOM (PowerShell Set-Content utf8)', () => {
    const entries = parseLinksManifest(Buffer.from(BOM + '[{"link":"a","target":"b"}]', 'utf8'))
    expect(entries).toEqual([{ link: 'a', target: 'b' }])
  })
  it('returns null on garbage', () => {
    expect(parseLinksManifest(Buffer.from('not json'))).toBeNull()
  })
})

describe('recreateLinks', () => {
  it('creates missing links and skips present ones (POSIX symlink path)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'marisa-links-'))
    try {
      mkdirSync(join(root, 'store', 'pkg'), { recursive: true })
      writeFileSync(join(root, 'store', 'pkg', 'f.txt'), 'x')
      writeFileSync(join(root, 'LINKS.json'), JSON.stringify([{ link: 'profiles/marisa/node_modules', target: 'store/pkg' }]))
      await recreateLinks(join(root, 'LINKS.json'), root, undefined, () => {})
      expect(existsSync(join(root, 'profiles', 'marisa', 'node_modules', 'f.txt'))).toBe(true)
      // Replay: no error, no duplicate.
      await recreateLinks(join(root, 'LINKS.json'), root, undefined, () => {})
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('fails loudly when a manifest link was shadowed by a real directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'marisa-links-'))
    try {
      mkdirSync(join(root, 'profiles', 'marisa', 'node_modules'), { recursive: true })
      writeFileSync(join(root, 'LINKS.json'), JSON.stringify([{ link: 'profiles/marisa/node_modules', target: 'elsewhere' }]))
      await expect(recreateLinks(join(root, 'LINKS.json'), root, undefined, () => {})).rejects.toThrow(/replaced by real directories/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('rejects links escaping the extraction root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'marisa-links-'))
    try {
      writeFileSync(join(root, 'LINKS.json'), JSON.stringify([{ link: '../outside', target: 't' }]))
      await expect(recreateLinks(join(root, 'LINKS.json'), root, undefined, () => {})).rejects.toThrow(/escapes extraction root/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

/** Build a minimal tar buffer with two files + VERSION + LINKS.json (ustar). */
function buildTestTar(entries: { name: string; data: string }[]): Buffer {
  const blocks: Buffer[] = []
  for (const e of entries) {
    const header = Buffer.alloc(512)
    const name = e.name.slice(0, 99)
    header.write(name, 0)
    header.write('0000644', 100)
    header.write('0000000', 108)
    header.write('0000000', 116)
    const size = Buffer.byteLength(e.data).toString(8).padStart(11, '0') + ' '
    header.write(size, 124)
    header.write(String(Math.floor(Date.now() / 1000)).toString(8).padStart(11, '0') + ' ', 136)
    header.write('0', 156) // regular file
    header.write('ustar\x00', 257)
    header.write('00', 263)
    // checksum
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(sum.toString(8).padStart(6, '0') + '\x00 ', 148)
    blocks.push(header, Buffer.from(e.data))
    const pad = (512 - (Buffer.byteLength(e.data) % 512)) % 512
    if (pad > 0) blocks.push(Buffer.alloc(pad))
  }
  blocks.push(Buffer.alloc(1024)) // end marker
  return Buffer.concat(blocks)
}

describe('ensureBackend', () => {
  it('up-to-date shortcut: same VERSION short-circuits with link replay', async () => {
    const base = mkdtempSync(join(tmpdir(), 'marisa-extract-'))
    const dest = join(base, 'backend')
    try {
      mkdirSync(dest, { recursive: true })
      writeFileSync(join(dest, 'VERSION'), 'v9.9.9-test')
      const { ensureBackendNoDecode } = await import('./extract-testkit.ts')
      const dir = await ensureBackendNoDecode(dest, 'v9.9.9-test', () => {})
      expect(dir).toBe(dest)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('full pipeline: tar extract + staging publish + link replay (decode seam)', async () => {
    const raw = buildTestTar([
      { name: 'VERSION', data: 'v1.2.3-test\n' },
      { name: 'LINKS.json', data: '[{"link":"link-dir","target":"real"}]' },
      { name: 'real/file.txt', data: 'hello marisa' },
      { name: 'docs/readme.md', data: '# readme' },
    ])
    const base = mkdtempSync(join(tmpdir(), 'marisa-extract2-'))
    const dest = join(base, 'backend')
    try {
      const { ensureBackendWithDecoder } = await import('./extract-testkit.ts')
      const dir = await ensureBackendWithDecoder({
        bundle: new Uint8Array(raw),
        dest,
        decode: async input => Buffer.from(input),
        log: () => {},
      })
      expect(dir).toBe(dest)
      expect(readFileSync(join(dest, 'VERSION'), 'utf8').trim()).toBe('v1.2.3-test')
      expect(readFileSync(join(dest, 'real', 'file.txt'), 'utf8')).toBe('hello marisa')
      expect(existsSync(join(dest, 'link-dir'))).toBe(true)
      expect(readFileSync(join(dest, 'docs', 'readme.md'), 'utf8')).toBe('# readme')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('embeddedBackendVersion reads the VERSION entry from the tar', async () => {
    const raw = buildTestTar([{ name: 'VERSION', data: 'vX\n' }])
    const { versionFromTar } = await import('./extract-testkit.ts')
    expect(await versionFromTar(raw)).toBe('vX')
  })
})
