import { describe, expect, it } from 'vitest'
import { PUBLIC_STICKERS, STICKERS, isStickerVariant, publicStickerById, stickerAssetUrl, stickerById, stickerVariantFile } from '../src/shared/catalog.ts'

describe('sticker catalog', () => {
  it('offers users fourteen public reactions, including workflow stickers', () => {
    expect(PUBLIC_STICKERS).toHaveLength(14)
    expect(PUBLIC_STICKERS.map(sticker => sticker.id)).toEqual(expect.arrayContaining([
      'daily-chat', 'tests-passed', 'root-cause', 'running-tests', 'fixed-review',
    ]))
  })

  it('keeps ten easter eggs agent-only', () => {
    expect(STICKERS).toHaveLength(24)
    expect(STICKERS.filter(sticker => sticker.visibility === 'agent')).toHaveLength(10)
    expect(stickerById('restart-myself')?.visibility).toBe('agent')
    expect(publicStickerById('restart-myself')).toBeUndefined()
  })

  it('allows public stickers through both user and agent lookup paths', () => {
    expect(publicStickerById('tests-passed')?.text).toBe('测试通过！')
    expect(stickerById('tests-passed')?.visibility).toBe('public')
  })

  it('versions sticker asset URLs so fixed images replace browser-cached copies', () => {
    expect(stickerAssetUrl('05-enough.png')).toBe('/api/dsh-stickers/05-enough.png?v=2')
  })

  it('resolves the black whale variant to the black/ asset directory', () => {
    expect(stickerVariantFile('05-enough.png')).toBe('05-enough.png')
    expect(stickerVariantFile('05-enough.png', 'black')).toBe('black/05-enough.png')
    expect(stickerAssetUrl('05-enough.png', 'black')).toBe('/api/dsh-stickers/black/05-enough.png?v=2')
  })

  it('accepts only known character variants', () => {
    expect(isStickerVariant('blue')).toBe(true)
    expect(isStickerVariant('black')).toBe(true)
    expect(isStickerVariant('red')).toBe(false)
  })
})
