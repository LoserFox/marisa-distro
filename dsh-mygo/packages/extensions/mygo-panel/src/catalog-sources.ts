/**
 * mygo 目录源层（P0 续）：hub registry / 本地 checkout / GitHub 账号三源，
 * 按 local > hub > github 合并，逐源报告。这是 mygo 自己的 catalog 源语义：
 * hub registry 是策展源（fetch/验签/降级交给 mygo-loader-hub），local 是
 * 开发 checkout 覆盖源，github 是账号枚举兜底源；安装 spec 只由宿主解析，
 * 浏览器请求只携带条目 id。
 * @module @r05en1cu/dsh-mygo-ext-panel/catalog-sources
 */

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import {
  HUB_REGISTRY_ORIGINS,
  loadHubRegistry,
  pickHubRelease,
  translateHubInstall,
  type HubEntry,
  type HubRegistry,
  type HubRegistrySource,
} from '@r05en1cu/dsh-mygo-loader-hub'
import { hubEntryRow, type HubCatalogDocument, type HubCatalogRow, type HubInstalledFact } from './hub-catalog.js'

export type CatalogSourceKind = 'local' | 'market' | 'hub' | 'github'

/** 面板目录源配置（$DSH_HOME/mygo-panel/catalog-sources.json）。 */
export interface CatalogSourceConfig {
  readonly localSources: readonly string[]
  readonly hubOrigins: readonly string[]
  readonly marketUrl: string
  readonly marketMaxPages: number
  readonly githubUpstream: string
  readonly maxRepos: number
  readonly timeoutMs: number
  readonly cacheTtlMs: number
}

/** 默认插件市场 API（dshfind 公开目录；REST snake_case）。 */
export const DEFAULT_MARKET_URL = 'https://api.dshfind.com/v1/plugins'

export const DEFAULT_CATALOG_SOURCE_CONFIG: CatalogSourceConfig = {
  localSources: [],
  hubOrigins: HUB_REGISTRY_ORIGINS,
  marketUrl: DEFAULT_MARKET_URL,
  marketMaxPages: 10,
  githubUpstream: '',
  maxRepos: 30,
  timeoutMs: 10_000,
  cacheTtlMs: 300_000,
}

/** 一条来源解析后的贡献。 */
interface ResolvedSource {
  readonly kind: CatalogSourceKind
  readonly origin: string
  readonly entries: readonly HubEntry[]
  readonly error?: string
}

/** 面板目录文档（在 hub-catalog 文档上增加逐源报告与 spec 解析面）。 */
export interface CatalogDocument extends HubCatalogDocument {
  readonly available: boolean
  readonly reports: readonly CatalogSourceReport[]
}

export interface CatalogSourceReport {
  readonly kind: CatalogSourceKind
  readonly origin: string
  readonly ok: boolean
  readonly count: number
  readonly error?: string
}

/** 安装解析结果。 */
export type CatalogInstallTarget =
  | {
    readonly ok: true
    readonly id: string
    readonly spec: string
    readonly experimental: boolean
    readonly advisories: readonly string[]
  }
  | {
    readonly ok: false
    readonly id: string
    readonly error: string
    readonly advisories: readonly string[]
  }

function sourceConfigPath(home: string): string {
  return join(home, 'mygo-panel', 'catalog-sources.json')
}

/** 读取目录源配置；文件缺失或非法时回落默认值。 */
export function readCatalogSourceConfig(home: string): CatalogSourceConfig {
  const path = sourceConfigPath(home)
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CatalogSourceConfig>
    const local = Array.isArray(raw.localSources) ? raw.localSources.filter((entry): entry is string => typeof entry === 'string') : []
    const origins = Array.isArray(raw.hubOrigins) && raw.hubOrigins.length > 0
      ? raw.hubOrigins.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('https://'))
      : [...DEFAULT_CATALOG_SOURCE_CONFIG.hubOrigins]
    return {
      localSources: local,
      hubOrigins: origins,
      marketUrl: typeof raw.marketUrl === 'string' && raw.marketUrl.trim() !== ''
        ? raw.marketUrl.trim()
        : DEFAULT_CATALOG_SOURCE_CONFIG.marketUrl,
      marketMaxPages: typeof raw.marketMaxPages === 'number' && raw.marketMaxPages >= 1 && raw.marketMaxPages <= 100
        ? Math.floor(raw.marketMaxPages)
        : DEFAULT_CATALOG_SOURCE_CONFIG.marketMaxPages,
      githubUpstream: typeof raw.githubUpstream === 'string' ? raw.githubUpstream.trim() : '',
      maxRepos: typeof raw.maxRepos === 'number' && raw.maxRepos >= 1 && raw.maxRepos <= 100 ? Math.floor(raw.maxRepos) : DEFAULT_CATALOG_SOURCE_CONFIG.maxRepos,
      timeoutMs: typeof raw.timeoutMs === 'number' && raw.timeoutMs >= 1_000 && raw.timeoutMs <= 120_000 ? Math.floor(raw.timeoutMs) : DEFAULT_CATALOG_SOURCE_CONFIG.timeoutMs,
      cacheTtlMs: typeof raw.cacheTtlMs === 'number' && raw.cacheTtlMs >= 0 && raw.cacheTtlMs <= 3_600_000 ? Math.floor(raw.cacheTtlMs) : DEFAULT_CATALOG_SOURCE_CONFIG.cacheTtlMs,
    }
  } catch {
    return { ...DEFAULT_CATALOG_SOURCE_CONFIG }
  }
}

/** 原子写入目录源配置。 */
export async function writeCatalogSourceConfig(home: string, patch: Partial<CatalogSourceConfig>): Promise<CatalogSourceConfig> {
  const next = await normalizeCatalogSourceConfig({ ...readCatalogSourceConfig(home), ...patch })
  const path = sourceConfigPath(home)
  await mkdir(join(home, 'mygo-panel'), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
  return next
}

/** 规范化用户提交的配置 patch。 */
export async function normalizeCatalogSourceConfig(input: Partial<CatalogSourceConfig>): Promise<CatalogSourceConfig> {
  const base = { ...DEFAULT_CATALOG_SOURCE_CONFIG, ...input }
  const localSources = Array.isArray(input.localSources)
    ? input.localSources.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : base.localSources
  const hubOrigins = Array.isArray(input.hubOrigins) && input.hubOrigins.length > 0
    ? input.hubOrigins.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('https://'))
    : base.hubOrigins
  return {
    localSources: [...new Set(localSources)],
    hubOrigins: [...new Set(hubOrigins)],
    marketUrl: typeof input.marketUrl === 'string' && input.marketUrl.trim() !== '' ? input.marketUrl.trim() : base.marketUrl,
    marketMaxPages: typeof input.marketMaxPages === 'number'
      ? Math.min(100, Math.max(1, Math.floor(input.marketMaxPages)))
      : base.marketMaxPages,
    githubUpstream: typeof input.githubUpstream === 'string' ? input.githubUpstream.trim() : base.githubUpstream,
    maxRepos: typeof input.maxRepos === 'number' ? Math.min(100, Math.max(1, Math.floor(input.maxRepos))) : base.maxRepos,
    timeoutMs: typeof input.timeoutMs === 'number' ? Math.min(120_000, Math.max(1_000, Math.floor(input.timeoutMs))) : base.timeoutMs,
    cacheTtlMs: typeof input.cacheTtlMs === 'number' ? Math.min(3_600_000, Math.max(0, Math.floor(input.cacheTtlMs))) : base.cacheTtlMs,
  }
}

const HOME = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
  ? process.env.DSH_HOME
  : join(homedir(), '.dsh')

/** 默认源配置（测试/服务构造时可注入 home 重新读取）。 */
export function defaultHome(): string {
  return HOME
}

/** 包名 → mygo 插件 id（无 dsh.mygo.id 时取 unscoped 短名并清洗）。 */
function pluginIdOf(pkg: { readonly name?: unknown; readonly dsh?: unknown }): string | undefined {
  const mygo = (pkg.dsh as { readonly mygo?: { readonly id?: unknown } } | undefined)?.mygo
  if (typeof mygo?.id === 'string' && /^[a-z][a-z0-9-]*$/.test(mygo.id)) return mygo.id
  const name = typeof pkg.name === 'string' ? pkg.name : undefined
  if (name === undefined) return undefined
  const short = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  const cleaned = short.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return /^[a-z][a-z0-9-]*$/.test(cleaned) ? cleaned : undefined
}

/** 最小 HubEntry 合成（market/local/github 包没有 hub 治理元数据，按 unknown 展示）。 */
function syntheticEntry(input: {
  readonly id: string
  readonly packageName: string
  readonly version?: string
  readonly description?: string
  readonly spec: string
  readonly repo?: string
  readonly tags?: readonly string[]
  readonly kind?: string
  readonly authorName?: string
  readonly archived?: boolean
  readonly installable?: boolean
}): HubEntry {
  const install = {
    mode: 'profile-bundle',
    adapter: 'official-profile/v1',
    packageName: input.packageName,
    spec: input.spec,
  } as const
  const blocked = input.installable === false
  return {
    id: input.id,
    displayName: input.id,
    description: input.description ?? '',
    kind: input.kind ?? 'bundle',
    tags: input.tags ?? [],
    author: { name: input.authorName ?? input.repo ?? 'local' },
    version: input.version ?? null,
    license: 'unknown',
    risk: {
      level: 'unknown',
      facts: {
        vulnerabilityScan: 'unknown',
        permissions: 'unknown',
        nativeCode: 'unknown',
        installScripts: 'unknown',
      },
    },
    listing: { state: blocked ? 'blocked' : 'auto-listed' },
    maintenance: { state: input.archived === true ? 'archived' : 'active' },
    install,
    latestRelease: 'local',
    releases: [{
      id: 'local',
      version: input.version ?? null,
      ref: 'local',
      updatedAt: '',
      channel: 'local',
      install,
    }],
    ...(input.repo === undefined ? {} : { links: { repository: `https://github.com/${input.repo}` } }),
  } as unknown as HubEntry
}

/** 扫描一个本地 checkout 根目录（一层深；无 dsh.bundle 的目录跳过）。 */
export function scanLocalRoot(root: string): readonly HubEntry[] {
  const absolute = resolve(root)
  if (!existsSync(absolute)) return []
  let names: string[] = []
  try {
    names = readdirSync(absolute, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
  const out: HubEntry[] = []
  for (const name of names) {
    try {
      const pkg = JSON.parse(readFileSync(join(absolute, name, 'package.json'), 'utf8')) as {
        readonly name?: unknown
        readonly version?: unknown
        readonly description?: unknown
        readonly dsh?: { readonly bundle?: { readonly patch?: unknown }; readonly mygo?: unknown }
      }
      if (typeof pkg.name !== 'string' || pkg.dsh?.bundle?.patch === undefined) continue
      const id = pluginIdOf({ name: pkg.name, dsh: pkg.dsh })
      if (id === undefined) continue
      out.push(syntheticEntry({
        id,
        packageName: pkg.name,
        ...(typeof pkg.version === 'string' ? { version: pkg.version } : {}),
        ...(typeof pkg.description === 'string' ? { description: pkg.description } : {}),
        spec: join(absolute, name),
      }))
    } catch {
      // 非包目录/坏 package.json：跳过
    }
  }
  return out
}

/** dshfind 插件市场 REST 行（只消费目录字段）。 */
interface MarketPluginRow {
  readonly full_name?: unknown
  readonly name?: unknown
  readonly owner?: unknown
  readonly repository_url?: unknown
  readonly description?: unknown
  readonly tags?: unknown
  readonly language?: unknown
  readonly archived?: unknown
  readonly install?: {
    readonly kind?: unknown
    readonly pkg_name?: unknown
    readonly npm_published?: unknown
    readonly release_tgz_url?: unknown
  }
}

/** 从市场行构造条目；无 npm/tarball 安装意图时展示但 blocked。 */
function marketEntryOf(row: MarketPluginRow): HubEntry | undefined {
  if (typeof row.full_name !== 'string' || row.full_name === '' || typeof row.name !== 'string') return undefined
  const repo = row.full_name
  const short = row.name
  const id = short.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return undefined
  const install = row.install
  const npmInstallable = install?.npm_published === true
  const pkgName = npmInstallable && typeof install.pkg_name === 'string' && install.pkg_name !== '' ? install.pkg_name : ''
  const tgzUrl = typeof install?.release_tgz_url === 'string' && install.release_tgz_url.startsWith('https://')
    ? install.release_tgz_url
    : ''
  const installable = pkgName !== '' || tgzUrl !== ''
  const spec = pkgName !== '' ? pkgName : tgzUrl
  return syntheticEntry({
    id,
    packageName: pkgName,
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    spec: installable ? spec : '',
    repo,
    ...(Array.isArray(row.tags) ? { tags: row.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
    kind: typeof row.language === 'string' && row.language !== '' ? row.language : 'plugin',
    authorName: typeof row.owner === 'string' ? row.owner : repo,
    archived: row.archived === true,
    installable,
  })
}

/** 拉取插件市场（固定 data_version 的分页同步；页数受 marketMaxPages 限制）。 */
async function fetchMarketEntries(url: string, maxPages: number, timeoutMs: number): Promise<readonly HubEntry[]> {
  const perPage = 100
  let dataVersion: string | undefined
  const out: HubEntry[] = []
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (dataVersion !== undefined) params.set('data_version', dataVersion)
    const response = await fetchWithTimeout(`${url}${url.includes('?') ? '&' : '?'}${params.toString()}`, {}, timeoutMs)
    if (!response.ok) throw new Error(`插件市场 HTTP ${response.status}`)
    const doc = JSON.parse(await response.text()) as {
      readonly data?: readonly MarketPluginRow[]
      readonly data_version?: unknown
      readonly total_pages?: unknown
      readonly error?: { readonly code?: unknown }
    }
    if (doc.error?.code === 'stale_data') throw new Error('插件市场 data_version 已过期，请重试')
    if (typeof doc.data_version === 'string') dataVersion = doc.data_version
    for (const row of doc.data ?? []) {
      const entry = marketEntryOf(row)
      if (entry !== undefined) out.push(entry)
    }
    const totalPages = typeof doc.total_pages === 'number' ? doc.total_pages : page
    if (page >= totalPages) break
  }
  return out
}

/** GitHub 账号仓库枚举（匿名或 GITHUB_TOKEN 环境变量）。 */
async function fetchGithubEntries(upstream: string, maxRepos: number, timeoutMs: number): Promise<readonly HubEntry[]> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-mygo-panel',
    ...(token === undefined || token === '' ? {} : { authorization: `Bearer ${token}` }),
  }
  const reposResponse = await fetchWithTimeout(
    `https://api.github.com/users/${encodeURIComponent(upstream)}/repos?per_page=${maxRepos}&sort=updated`,
    { headers },
    timeoutMs,
  )
  if (!reposResponse.ok) {
    throw new Error(`GitHub API HTTP ${reposResponse.status}`)
  }
  const repos = JSON.parse(await reposResponse.text()) as ReadonlyArray<{ readonly full_name?: unknown; readonly default_branch?: unknown }>
  const out: HubEntry[] = []
  for (const repo of repos) {
    if (typeof repo.full_name !== 'string') continue
    const ref = typeof repo.default_branch === 'string' && repo.default_branch !== '' ? repo.default_branch : 'HEAD'
    try {
      const pkgResponse = await fetchWithTimeout(
        `https://raw.githubusercontent.com/${repo.full_name}/${ref}/package.json`,
        {},
        timeoutMs,
      )
      if (!pkgResponse.ok) continue
      const pkg = JSON.parse(await pkgResponse.text()) as {
        readonly name?: unknown
        readonly version?: unknown
        readonly description?: unknown
        readonly dsh?: { readonly bundle?: { readonly patch?: unknown }; readonly mygo?: unknown }
      }
      if (typeof pkg.name !== 'string' || pkg.dsh?.bundle?.patch === undefined) continue
      const id = pluginIdOf({ name: pkg.name, dsh: pkg.dsh })
      if (id === undefined) continue
      out.push(syntheticEntry({
        id,
        packageName: pkg.name,
        ...(typeof pkg.version === 'string' ? { version: pkg.version } : {}),
        ...(typeof pkg.description === 'string' ? { description: pkg.description } : {}),
        spec: `github:${repo.full_name}#${ref}`,
        repo: repo.full_name,
      }))
    } catch {
      // 单个仓库失败不阻断枚举
    }
  }
  return out
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** 合并三源：local > hub > github；败者仅补 repo 链接。 */
export function mergeEntries(sources: readonly ResolvedSource[]): {
  readonly entries: readonly HubEntry[]
  readonly sourceById: ReadonlyMap<string, CatalogSourceKind>
} {
  const byId = new Map<string, { readonly entry: HubEntry; readonly kind: CatalogSourceKind }>()
  for (const kind of ['local', 'market', 'hub', 'github'] as const) {
    for (const source of sources) {
      if (source.kind !== kind) continue
      for (const entry of source.entries) {
        const existing = byId.get(entry.id)
        if (existing === undefined) {
          byId.set(entry.id, { entry, kind })
          continue
        }
        const repo = existing.entry.links?.repository ?? entry.links?.repository
        if (existing.entry.links?.repository === undefined && repo !== undefined) {
          byId.set(entry.id, {
            ...existing,
            entry: { ...existing.entry, links: { ...(existing.entry.links ?? {}), repository: repo } },
          })
        }
      }
    }
  }
  return {
    entries: [...byId.values()].map(item => item.entry).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    sourceById: new Map([...byId.values()].map(item => [item.entry.id, item.kind])),
  }
}

/** 目录源服务：读配置、拉三源、合并、缓存、翻译安装 spec。 */
export class CatalogSourceService {
  private resolution: {
    readonly entries: readonly HubEntry[]
    readonly reports: readonly CatalogSourceReport[]
    readonly specById: ReadonlyMap<string, HubEntry>
    readonly sourceById: ReadonlyMap<string, CatalogSourceKind>
    readonly at: number
  } | undefined
  private inflight: Promise<Awaited<ReturnType<CatalogSourceService['resolve']>>> | undefined

  constructor(
    private readonly home: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  config(): CatalogSourceConfig {
    return readCatalogSourceConfig(this.home)
  }

  async saveConfig(patch: Partial<CatalogSourceConfig>): Promise<CatalogSourceConfig> {
    const next = await writeCatalogSourceConfig(this.home, patch)
    this.resolution = undefined
    return next
  }

  invalidate(): void {
    this.resolution = undefined
  }

  async document(installed: readonly HubInstalledFact[], refresh = false): Promise<CatalogDocument> {
    const resolution = await this.resolve(refresh)
    return projection(resolution.entries, resolution.reports, installed, resolution.sourceById)
  }

  async installTarget(id: string): Promise<CatalogInstallTarget> {
    const resolution = await this.resolve(false)
    const entry = resolution.specById.get(id)
    if (entry === undefined) {
      return { ok: false, id, error: `目录没有条目 ${JSON.stringify(id)}`, advisories: [] }
    }
    const source = resolution.sourceById.get(id)
    const release = pickHubRelease(entry)
    if (release === undefined) {
      return { ok: false, id, error: `条目 ${id} 没有可用 release`, advisories: [] }
    }
    if ((source === 'local' || source === 'github') && release.install.mode === 'profile-bundle') {
      // local/github 是 mygo 自己的执行面 spec：绝对路径或 github ref，
      // 不走 hub registry 的精确 semver/钉 commit 翻译门。
      return { ok: true, id, spec: release.install.spec, experimental: false, advisories: [] }
    }
    const translated = await translateHubInstall(release.install, { allowFileSpec: false })
    if (translated.kind === 'display') {
      return { ok: false, id, error: translated.reason, advisories: [] }
    }
    return {
      ok: true,
      id,
      spec: translated.spec,
      experimental: translated.experimental,
      advisories: [],
    }
  }

  private async resolve(refresh: boolean): Promise<{
    readonly entries: readonly HubEntry[]
    readonly reports: readonly CatalogSourceReport[]
    readonly specById: ReadonlyMap<string, HubEntry>
    readonly sourceById: ReadonlyMap<string, CatalogSourceKind>
    readonly at: number
  }> {
    const held = this.resolution
    const config = this.config()
    if (!refresh && held !== undefined && Date.now() - held.at < config.cacheTtlMs) return held
    if (!refresh && this.inflight !== undefined) return this.inflight
    const run = this.resolveSources(config).then(({ entries, reports, sourceById }) => {
      const specById = new Map(entries.map(entry => [entry.id, entry]))
      return { entries, reports, specById, sourceById, at: Date.now() }
    })
    this.inflight = run
    try {
      const result = await run
      this.resolution = result
      return result
    } finally {
      this.inflight = undefined
    }
  }

  private async resolveSources(config: CatalogSourceConfig): Promise<{
    readonly entries: readonly HubEntry[]
    readonly reports: readonly CatalogSourceReport[]
    readonly sourceById: ReadonlyMap<string, CatalogSourceKind>
  }> {
    const reports: CatalogSourceReport[] = []
    const sources: ResolvedSource[] = []

    // local：最高优先级，扫描失败逐根报告。
    let localCount = 0
    const localEntries: HubEntry[] = []
    for (const root of config.localSources) {
      try {
        const entries = scanLocalRoot(root)
        localCount += entries.length
        localEntries.push(...entries)
      } catch (error) {
        reports.push({ kind: 'local', origin: root, ok: false, count: 0, error: error instanceof Error ? error.message : String(error) })
      }
    }
    if (config.localSources.length > 0) {
      sources.push({ kind: 'local', origin: config.localSources.join(', '), entries: localEntries })
      reports.unshift({ kind: 'local', origin: config.localSources.join(', '), ok: true, count: localCount })
    }

    // market：默认插件市场（dshfind REST），固定 data_version 分页。
    try {
      const entries = await fetchMarketEntries(config.marketUrl, config.marketMaxPages, config.timeoutMs)
      sources.push({ kind: 'market', origin: config.marketUrl, entries })
      reports.push({ kind: 'market', origin: config.marketUrl, ok: true, count: entries.length })
    } catch (error) {
      reports.push({
        kind: 'market',
        origin: config.marketUrl,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // hub：registry fetch/验签/降级交给 mygo-loader-hub。
    try {
      const loaded = await loadHubRegistry({
        origins: config.hubOrigins,
        vendoredFallback: true,
        ...(this.fetchImpl === globalThis.fetch ? {} : { fetchImpl: this.fetchImpl as never }),
      })
      sources.push({ kind: 'hub', origin: originLabel(loaded.source), entries: loaded.registry.entries })
      reports.push({ kind: 'hub', origin: originLabel(loaded.source), ok: true, count: loaded.registry.entries.length })
    } catch (error) {
      reports.push({ kind: 'hub', origin: config.hubOrigins.join(', '), ok: false, count: 0, error: error instanceof Error ? error.message : String(error) })
    }

    // github：可选账号枚举，失败只报告不阻断。
    if (config.githubUpstream !== '') {
      try {
        const entries = await fetchGithubEntries(config.githubUpstream, config.maxRepos, config.timeoutMs)
        sources.push({ kind: 'github', origin: config.githubUpstream, entries })
        reports.push({ kind: 'github', origin: config.githubUpstream, ok: true, count: entries.length })
      } catch (error) {
        reports.push({ kind: 'github', origin: config.githubUpstream, ok: false, count: 0, error: error instanceof Error ? error.message : String(error) })
      }
    }

    const merged = mergeEntries(sources)
    return { entries: merged.entries, reports, sourceById: merged.sourceById }
  }
}

function originLabel(source: HubRegistrySource): string {
  if (source.kind === 'remote') return source.origin
  if (source.kind === 'snapshot') return source.path
  return 'vendored snapshot'
}

function projection(
  entries: readonly HubEntry[],
  reports: readonly CatalogSourceReport[],
  installed: readonly HubInstalledFact[],
  sourceById: ReadonlyMap<string, CatalogSourceKind>,
): CatalogDocument {
  return {
    available: true,
    source: {
      adapter: 'hub',
      schema: 'mygo-catalog/v1',
      revision: 0,
      generatedAt: '',
      origins: reports.filter(report => report.kind === 'hub').map(report => report.origin),
      snapshotId: '',
      signature: null,
    },
    reports,
    entries: entries.map(entry => ({
      ...hubEntryRow(entry, installed),
      ...(sourceById.get(entry.id) === undefined ? {} : { source: sourceById.get(entry.id) }),
    })),
  }
}
