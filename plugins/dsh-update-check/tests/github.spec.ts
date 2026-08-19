/** GitHub 响应解析：非 draft 过滤（prerelease 保留）、资产名匹配、按形态选下载链接。 */
import { describe, expect, it } from 'vitest'
import {
  MSI_ASSET_NAME, STANDALONE_ASSET_NAME, assetUrlsOf, firstNonDraft, parseReleases, selectDownload,
  type ReleaseInfo,
} from '../src/github.ts'

const RELEASE: ReleaseInfo = {
  tagName: 'v0.1.7',
  draft: false,
  prerelease: true,
  body: 'release notes',
  htmlUrl: 'https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.7',
  assets: [
    { name: MSI_ASSET_NAME, browserDownloadUrl: 'https://example.test/marisa.msi' },
    { name: STANDALONE_ASSET_NAME, browserDownloadUrl: 'https://example.test/marisa.exe' },
  ],
}

describe('firstNonDraft', () => {
  it('skips drafts and keeps prereleases (Marisa v0.x ships prerelease-only)', () => {
    const draft = { ...RELEASE, tagName: 'v0.1.8', draft: true }
    expect(firstNonDraft([draft, RELEASE])).toEqual(RELEASE)
    expect(firstNonDraft([RELEASE])).toEqual(RELEASE)
  })

  it('returns undefined when every release is a draft or the list is empty', () => {
    expect(firstNonDraft([{ ...RELEASE, draft: true }])).toBeUndefined()
    expect(firstNonDraft([])).toBeUndefined()
  })
})

describe('parseReleases', () => {
  it('maps GitHub list payload fields', () => {
    const parsed = parseReleases([{
      tag_name: 'v0.1.7',
      draft: false,
      prerelease: true,
      body: 'notes',
      html_url: 'https://example.test/r',
      assets: [{ name: MSI_ASSET_NAME, browser_download_url: 'https://example.test/m.msi' }],
    }])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      tagName: 'v0.1.7',
      draft: false,
      prerelease: true,
      body: 'notes',
      htmlUrl: 'https://example.test/r',
      assets: [{ name: MSI_ASSET_NAME, browserDownloadUrl: 'https://example.test/m.msi' }],
    })
  })

  it('tolerates junk entries and missing fields', () => {
    expect(parseReleases('not-an-array')).toEqual([])
    expect(parseReleases([null, 42, { tag_name: 7 }, { tag_name: 'ok' }])).toEqual([
      expect.objectContaining({ tagName: 'ok' }),
    ])
  })

  it('caps the changelog at the fixed bound', () => {
    const parsed = parseReleases([{ tag_name: 'v1', body: 'x'.repeat(10_000) }])
    expect(parsed[0]?.body.length).toBe(4096)
  })
})

describe('assetUrlsOf / selectDownload', () => {
  it('picks the MSI asset for the msi install form', () => {
    const assets = assetUrlsOf(RELEASE)
    expect(selectDownload(assets, 'msi')).toBe('https://example.test/marisa.msi')
  })

  it('picks the standalone asset for the standalone install form', () => {
    const assets = assetUrlsOf(RELEASE)
    expect(selectDownload(assets, 'standalone')).toBe('https://example.test/marisa.exe')
  })

  it('falls back to the release page for dev or unknown forms', () => {
    const assets = assetUrlsOf(RELEASE)
    expect(selectDownload(assets, 'dev')).toBe(assets.releasePage)
    expect(selectDownload(assets, '')).toBe(assets.releasePage)
    expect(selectDownload(assets, 'bogus')).toBe(assets.releasePage)
  })

  it('falls back to the release page when the chosen asset is missing', () => {
    const noMsi: ReleaseInfo = { ...RELEASE, assets: [{ name: STANDALONE_ASSET_NAME, browserDownloadUrl: 'https://example.test/marisa.exe' }] }
    const assets = assetUrlsOf(noMsi)
    expect(selectDownload(assets, 'msi')).toBe(assets.releasePage)
    expect(assets.msi).toBeNull()
    expect(selectDownload(assets, 'standalone')).toBe('https://example.test/marisa.exe')
  })

  it('returns all-null links without a release', () => {
    const assets = assetUrlsOf(undefined)
    expect(assets).toEqual({ msi: null, standalone: null, releasePage: null, download: null })
    expect(selectDownload(assets, 'msi')).toBeNull()
  })
})
