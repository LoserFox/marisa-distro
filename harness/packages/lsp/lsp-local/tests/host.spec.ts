import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { canonicalizeWorkspace, readHostSource } from '@deepseek-ai/dsh-lsp-local'

const execFileAsync = promisify(execFile)

let root: string
let ws: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lsp-host-')))
  ws = join(root, 'ws')
  await mkdir(ws)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const BIG = 1_000_000

describe('canonicalizeWorkspace', () => {
  it('returns the realpath of a directory', async () => {
    expect(await canonicalizeWorkspace(ws)).toBe(ws)
  })

  it('resolves a symlinked workspace to its target so aliases share identity', async () => {
    const link = join(root, 'ws-link')
    await symlink(ws, link)
    expect(await canonicalizeWorkspace(link)).toBe(ws)
  })

  it('rejects a missing workspace', async () => {
    await expect(canonicalizeWorkspace(join(root, 'nope'))).rejects.toThrow(/cannot be resolved/)
  })

  it('rejects a non-directory workspace', async () => {
    const file = join(root, 'file.txt')
    await writeFile(file, 'x')
    await expect(canonicalizeWorkspace(file)).rejects.toThrow(/not a directory/)
  })
})

describe('readHostSource', () => {
  it('reads a relative path against the workspace', async () => {
    await writeFile(join(ws, 'a.ts'), 'const x = 1\n')
    const source = await readHostSource('a.ts', ws, BIG)
    expect(source.canonicalPath).toBe(join(ws, 'a.ts'))
    expect(source.text).toBe('const x = 1\n')
  })

  it('reads an absolute path inside the workspace', async () => {
    const abs = join(ws, 'b.ts')
    await writeFile(abs, 'b')
    const source = await readHostSource(abs, ws, BIG)
    expect(source.canonicalPath).toBe(abs)
  })

  it('accepts a source reached through a symlink that stays inside the workspace', async () => {
    await mkdir(join(ws, 'real'))
    await writeFile(join(ws, 'real', 'c.ts'), 'c')
    await symlink(join(ws, 'real'), join(ws, 'linked'))
    const source = await readHostSource('linked/c.ts', ws, BIG)
    expect(source.canonicalPath).toBe(join(ws, 'real', 'c.ts'))
  })

  it('rejects a source whose canonical path escapes the workspace via symlink', async () => {
    const outside = join(root, 'outside.ts')
    await writeFile(outside, 'secret')
    await symlink(outside, join(ws, 'escape.ts'))
    await expect(readHostSource('escape.ts', ws, BIG)).rejects.toThrow(/outside the workspace/)
  })

  it('rejects an absolute source outside the workspace', async () => {
    const outside = join(root, 'out.ts')
    await writeFile(outside, 'x')
    await expect(readHostSource(outside, ws, BIG)).rejects.toThrow(/outside the workspace/)
  })

  it('rejects a missing source', async () => {
    await expect(readHostSource('nope.ts', ws, BIG)).rejects.toThrow(/cannot be resolved/)
  })

  it('rejects a non-regular source (directory)', async () => {
    await mkdir(join(ws, 'dir'))
    await expect(readHostSource('dir', ws, BIG)).rejects.toThrow(/not a regular file/)
  })

  // Windows has no filesystem FIFO; the directory case above pins non-regular rejection there.
  it.skipIf(process.platform === 'win32')('rejects a FIFO with no writer without blocking in open', async () => {
    const fifo = join(ws, 'pipe.ts')
    await execFileAsync('mkfifo', [fifo])
    using d = deadline(undefined, 1000, 'FIFO_READ_TIMEOUT')
    await expect(readHostSource('pipe.ts', ws, BIG, d.signal)).rejects.toThrow(/not a regular file/)
  })

  it('honors a pre-aborted source read before filesystem work', async () => {
    const controller = new AbortController()
    controller.abort(new Error('source read cancelled'))
    await expect(readHostSource('missing.ts', ws, BIG, controller.signal)).rejects.toThrow(/source read cancelled/)
  })

  it('treats the workspace root itself as inside, then rejects it as non-regular', async () => {
    // filePath '.' canonicalizes to the workspace dir: isInside's identity branch is taken, and the
    // directory then fails the regular-file check.
    await expect(readHostSource('.', ws, BIG)).rejects.toThrow(/not a regular file/)
  })

  it('rejects an oversized source', async () => {
    await writeFile(join(ws, 'big.ts'), 'x'.repeat(100))
    await expect(readHostSource('big.ts', ws, 10)).rejects.toThrow(/over the 10-byte limit/)
  })

  it('rejects a non-UTF-8 source', async () => {
    await writeFile(join(ws, 'bin.ts'), Buffer.from([0xff, 0xfe, 0x00]))
    await expect(readHostSource('bin.ts', ws, BIG)).rejects.toThrow(/not valid UTF-8/)
  })

  it('keeps a valid U+FFFD replacement character in otherwise-valid UTF-8', async () => {
    // The literal replacement char is valid UTF-8; a fatal decoder must accept it (only malformed
    // byte sequences are rejected).
    await writeFile(join(ws, 'repl.ts'), 'const s = "�"\n')
    const source = await readHostSource('repl.ts', ws, BIG)
    expect(source.text).toBe('const s = "�"\n')
  })
})
