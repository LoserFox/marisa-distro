/**
 * Unit tests for the sidechain panel's file-mention resolver.
 */

import { describe, expect, it, vi } from 'vitest'
import { fileMentionsFor } from '../src/client/sidechain-file-mentions'

describe('fileMentionsFor', () => {
  it('resolves a token that equals a produced path exactly', () => {
    const openPath = vi.fn()
    const mentions = fileMentionsFor(['src/a.ts', 'README.md'], '/work/dsh-sidechain', openPath)
    const mention = mentions.resolve('src/a.ts')
    expect(mention).not.toBeUndefined()
    expect(mention!.label).toBe('a.ts')
    expect(mention!.title).toBe('/work/dsh-sidechain/src/a.ts')
    mention!.open()
    expect(openPath).toHaveBeenCalledWith('/work/dsh-sidechain/src/a.ts')
  })

  it('resolves a token equal to the produced path relative to the cwd', () => {
    const openPath = vi.fn()
    const mentions = fileMentionsFor(
      ['/work/dsh-sidechain/src/a.ts'],
      '/work/dsh-sidechain',
      openPath,
    )
    const mention = mentions.resolve('src/a.ts')
    expect(mention).not.toBeUndefined()
    expect(mention!.title).toBe('/work/dsh-sidechain/src/a.ts')
    mention!.open()
    expect(openPath).toHaveBeenCalledWith('/work/dsh-sidechain/src/a.ts')
  })

  it('resolves a unique basename (produced paths are absolute)', () => {
    const mentions = fileMentionsFor(['/w/src/a.ts', '/w/src/b.ts'], undefined, () => {})
    const mention = mentions.resolve('a.ts')
    expect(mention).not.toBeUndefined()
    expect(mention!.title).toBe('/w/src/a.ts')
  })

  it('keeps ambiguous basenames and unknown tokens inert', () => {
    const mentions = fileMentionsFor(['/w/src/a.ts', '/w/tests/a.ts'], '/w', () => {})
    expect(mentions.resolve('a.ts')).toBeUndefined()
    expect(mentions.resolve('nope.ts')).toBeUndefined()
  })

  it('stays inert when the resolved target would be relative (cwd not ready)', () => {
    const mentions = fileMentionsFor(['src/a.ts'], undefined, () => {})
    expect(mentions.resolve('src/a.ts')).toBeUndefined()
  })

  it('opens absolute paths verbatim without a cwd', () => {
    const openPath = vi.fn()
    const mentions = fileMentionsFor(['/abs/path/file.md'], undefined, openPath)
    mentions.resolve('file.md')!.open()
    expect(openPath).toHaveBeenCalledWith('/abs/path/file.md')
  })

  it('keeps windows-style absolute paths absolute', () => {
    const openPath = vi.fn()
    const mentions = fileMentionsFor(['C:\\repo\\file.ts'], undefined, openPath)
    mentions.resolve('file.ts')!.open()
    expect(openPath).toHaveBeenCalledWith('C:\\repo\\file.ts')
  })
})
