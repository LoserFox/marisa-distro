/** GitHub Releases 元数据获取与资产选择（只读；不带凭据、不发遥测）。 */

import type { ReleaseAssets } from './protocol.ts'

export interface ReleaseAsset {
  readonly name: string
  readonly browserDownloadUrl: string
}

export interface ReleaseInfo {
  readonly tagName: string
  readonly draft: boolean
  readonly prerelease: boolean
  readonly body: string
  readonly htmlUrl: string
  readonly assets: readonly ReleaseAsset[]
}

/** 发行脚本（scripts/build-release-windows.ps1）产出的资产名。 */
export const MSI_ASSET_NAME = 'Marisa-DSH-windows-x64.msi'
export const STANDALONE_ASSET_NAME = 'Marisa-DSH-windows-x64-standalone.exe'

/** changelog 上界：state 路由每次请求都携带 body，避免无界负载。 */
export const MAX_BODY_CHARS = 4096

/** 列表端点取前 5 条即可覆盖最新发布（/releases/latest 会跳过 prerelease，Marisa v0.x 全为预发布）。 */
const RELEASES_PER_PAGE = 5
const FETCH_TIMEOUT_MS = 15_000

/** 取第一个非 draft 的 Release（prerelease 保留——Marisa v0.x 全标预发布）。 */
export function firstNonDraft(releases: readonly ReleaseInfo[]): ReleaseInfo | undefined {
  return releases.find(release => !release.draft)
}

/** 三个候选链接（缺资产为 null）。 */
export function assetUrlsOf(release: ReleaseInfo | undefined): ReleaseAssets {
  if (release === undefined) return { msi: null, standalone: null, releasePage: null, download: null }
  return {
    msi: release.assets.find(asset => asset.name === MSI_ASSET_NAME)?.browserDownloadUrl ?? null,
    standalone: release.assets.find(asset => asset.name === STANDALONE_ASSET_NAME)?.browserDownloadUrl ?? null,
    releasePage: release.htmlUrl,
    download: null,
  }
}

/** 按安装形态选主下载链接：msi→MSI 资产、standalone→EXE 资产、dev/未知→Release 页；找不到对应资产时回退 Release 页。 */
export function selectDownload(assets: Omit<ReleaseAssets, 'download'>, installForm: string): string | null {
  if (installForm === 'msi') return assets.msi ?? assets.releasePage
  if (installForm === 'standalone') return assets.standalone ?? assets.releasePage
  return assets.releasePage
}

/** 宽容解析 GitHub /releases 列表响应：跳过垃圾条目，字段缺失取默认值。 */
export function parseReleases(payload: unknown): ReleaseInfo[] {
  if (!Array.isArray(payload)) return []
  const releases: ReleaseInfo[] = []
  for (const item of payload) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (typeof record.tag_name !== 'string') continue
    releases.push({
      tagName: record.tag_name,
      draft: record.draft === true,
      prerelease: record.prerelease === true,
      body: typeof record.body === 'string' ? record.body.slice(0, MAX_BODY_CHARS) : '',
      htmlUrl: typeof record.html_url === 'string' ? record.html_url : '',
      assets: Array.isArray(record.assets) ? record.assets.flatMap((asset): ReleaseAsset[] => {
        if (typeof asset !== 'object' || asset === null) return []
        const a = asset as Record<string, unknown>
        return typeof a.name === 'string' && typeof a.browser_download_url === 'string'
          ? [{ name: a.name, browserDownloadUrl: a.browser_download_url }]
          : []
      }) : [],
    })
  }
  return releases
}

export interface FetchReleasesOptions {
  readonly apiBase: string
  readonly repo: string
  /** undici dispatcher（代理时由调用方传入 EnvHttpProxyAgent）。 */
  readonly dispatcher?: unknown
  /** 测试注入点；缺省用全局 fetch（Node ≥22 内置 undici）。 */
  readonly fetchImpl?: typeof fetch
}

/** GET {apiBase}/repos/{repo}/releases?per_page=5，非 2xx 抛错。 */
export async function fetchReleases(options: FetchReleasesOptions): Promise<ReleaseInfo[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const url = `${options.apiBase}/repos/${options.repo}/releases?per_page=${RELEASES_PER_PAGE}`
  const init: RequestInit & { dispatcher?: unknown } = {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'marisa-update-check/0.1',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }
  if (options.dispatcher !== undefined) init.dispatcher = options.dispatcher
  const response = await fetchImpl(url, init)
  if (!response.ok) throw new Error(`GitHub releases API responded ${response.status} for ${options.repo}`)
  return parseReleases(await response.json())
}
