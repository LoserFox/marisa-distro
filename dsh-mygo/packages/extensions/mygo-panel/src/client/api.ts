/**
 * mygo 面板 API 共享层（r7 面板重做）：类型化 fetch 客户端 + 全部面板
 * 数据类型。面板与配置卡片两个槽位共用；node half 的 /api/mygo/* 契约
 * 在此单点镜像。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/api
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: { readonly method?: string; readonly body?: unknown }): Promise<T> {
  const res = await fetch('/api/mygo' + path, {
    method: init?.method ?? 'GET',
    ...(init?.body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
  })
  const data = (await res.json()) as T & {
    readonly ok?: boolean
    readonly error?: string
    readonly code?: string
    readonly details?: Readonly<Record<string, unknown>>
  }
  if (data.ok === false) {
    throw new ApiError(
      data.error ?? `HTTP ${res.status}`,
      res.status,
      data.code,
      data.details,
    )
  }
  return data
}

/** 兼容性声明（depends/breaks/recommends/suggests/conflicts 边）。 */
export interface PluginCompatibility {
  readonly depends?: Readonly<Record<string, string>>
  readonly breaks?: Readonly<Record<string, string>>
  readonly recommends?: Readonly<Record<string, string>>
  readonly suggests?: Readonly<Record<string, string>>
  readonly conflicts?: Readonly<Record<string, string>>
}

/** 一条受管插件行（bridge 轨或 bundle 轨）。 */
export interface MygoPluginRow {
  readonly id: string
  readonly version: string
  readonly status: string
  readonly origin: string
  readonly generation: number
  readonly rail?: 'bridge' | 'bundle' | 'live'
  readonly hostConflicts?: readonly string[]
  readonly entrypoints?: readonly string[]
  readonly compatibility?: PluginCompatibility
  readonly policyStatus?: string
  readonly reason?: string
}

/** 一条远程更新行。 */
export interface RemoteUpdateRow {
  readonly id: string
  readonly kind: 'plugin' | 'mygo'
  readonly url: string
  readonly ref: string
  readonly currentCommit: string
  readonly latestCommit?: string
  readonly upToDate?: boolean
  readonly error?: string
}

/** 计划求值结论（enable/disable/install 前的 plan）。 */
export interface PlanShape {
  readonly accepted: boolean
  readonly error?: { readonly code: string; readonly message: string }
  readonly warnings?: readonly string[]
}

/** /api/mygo/status 概览。 */
export interface StatusResult {
  readonly mygo: {
    readonly version: string
    readonly selfCommit?: string
    readonly ref?: string
    readonly url?: string
  }
  readonly plugins: {
    readonly total: number
    readonly bridge: number
    readonly bundle: number
    readonly enabled: number
    readonly disabled: number
    readonly quarantined: number
    readonly shadowed: number
  }
  readonly bom: {
    readonly exists: boolean
    readonly generatedAt?: string
    readonly members?: number
    readonly commit?: string
  }
}

/** 一条 registry 绑定（.npmrc 受管块行 + 凭据 describe 徽标；永不携带值）。 */
export interface RegistryRow {
  readonly scope: string
  readonly registry: string
  readonly authRef?: string
  readonly credential?: {
    readonly configured: boolean
    readonly source?: string
    readonly writable: boolean
  }
}

/** 批量更新单条结果。 */
export interface BatchUpdateResult {
  readonly id: string
  readonly ok: boolean
  readonly updated?: boolean
  readonly message?: string
  readonly error?: string
}

export interface HelperMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface HelperStatus {
  readonly status?: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  readonly startedAt?: number
  readonly runId?: string
  readonly messages?: readonly HelperMessage[]
  readonly error?: string
}

/** hub catalog 的一条条目。 */
export interface HubCatalogEntry {
  /** 获胜目录源。 */
  readonly source?: 'local' | 'market' | 'hub' | 'github'
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly kind: string
  readonly tags: readonly string[]
  readonly author: { readonly name: string; readonly url?: string }
  readonly version: string | null
  readonly license: string
  readonly risk: {
    readonly level: 'unknown' | 'low' | 'medium' | 'high' | 'critical'
    readonly facts: {
      readonly sourcePinned?: boolean
      readonly vulnerabilityScan?: 'unknown' | 'passed' | 'findings'
      readonly permissions?: 'unknown' | 'declared' | 'reviewed'
      readonly nativeCode?: 'unknown' | 'present' | 'absent'
      readonly installScripts?: 'unknown' | 'present' | 'absent'
    }
  }
  readonly listing: {
    readonly state: 'auto-listed' | 'review-required' | 'reviewed' | 'blocked'
    readonly catalogStatus?: string
    readonly trustedPublisher?: string
  }
  readonly maintenance: {
    readonly state: 'active' | 'deprecated' | 'archived'
    readonly notice?: string | null
    readonly successor?: string | null
  }
  readonly latestRelease: string
  readonly links?: { readonly atlas?: string; readonly repository?: string }
  readonly installed?: {
    readonly id: string
    readonly rail: 'bridge' | 'bundle' | 'live'
    readonly version?: string
    readonly update: 'available' | 'current' | 'unknown'
  }
  readonly assessment: {
    readonly installable: boolean
    readonly blocks: readonly string[]
    readonly advisories: readonly string[]
  }
}

export interface HubCatalogSource {
  readonly adapter: 'hub'
  readonly schema: string
  readonly revision: number
  readonly generatedAt: string
  readonly origins: readonly string[]
  readonly snapshotId: string
  readonly signature: { readonly algorithm: 'Ed25519'; readonly keyId: string; readonly value: string } | null
}

export interface HubCatalogResult {
  readonly available: boolean
  readonly source: HubCatalogSource
  readonly reports: readonly HubSourceReport[]
  readonly entries: readonly HubCatalogEntry[]
}

/** 逐源解析报告。 */
export interface HubSourceReport {
  readonly kind: 'local' | 'market' | 'hub' | 'github'
  readonly origin: string
  readonly ok: boolean
  readonly count: number
  readonly error?: string
}

/** 目录源配置（$DSH_HOME/mygo-panel/catalog-sources.json）。 */
export interface HubSourceConfig {
  readonly localSources: readonly string[]
  readonly hubOrigins: readonly string[]
  readonly marketUrl: string
  readonly marketMaxPages: number
  readonly githubUpstream: string
  readonly maxRepos: number
  readonly timeoutMs: number
  readonly cacheTtlMs: number
}

export interface HubInstallResult {
  readonly id: string
  readonly entryId?: string
  readonly message: string
  readonly activated?: 'live' | 'pending-restart'
  readonly plan?: PlanShape
  readonly hostConflicts?: readonly string[]
  readonly advisories?: readonly string[]
  readonly experimental?: boolean
}

export const api = {
  hubCatalog(refresh = false): Promise<HubCatalogResult> {
    return request<HubCatalogResult>(refresh ? '/hub?refresh=1' : '/hub')
  },
  hubSources(): Promise<{ readonly config: HubSourceConfig }> {
    return request('/hub/sources')
  },
  saveHubSources(config: Partial<HubSourceConfig>): Promise<{ readonly config: HubSourceConfig; readonly message: string }> {
    return request('/hub/sources', { method: 'PUT', body: config })
  },
  hubInstall(id: string, releaseId?: string): Promise<HubInstallResult> {
    return request<HubInstallResult>('/hub/install', {
      method: 'POST',
      body: { id, ...(releaseId === undefined || releaseId === '' ? {} : { releaseId }) },
    })
  },
  hubUpdate(id: string, releaseId?: string): Promise<HubInstallResult> {
    return request<HubInstallResult>('/hub/update', {
      method: 'POST',
      body: { id, ...(releaseId === undefined || releaseId === '' ? {} : { releaseId }) },
    })
  },
  status(): Promise<StatusResult> {
    return request<StatusResult>('/status')
  },
  plugins(): Promise<{ readonly plugins: readonly MygoPluginRow[] }> {
    return request('/plugins')
  },
  plan(op: 'enable' | 'disable', id: string): Promise<{ readonly plan: PlanShape }> {
    return request('/plan', { method: 'POST', body: { op, id } })
  },
  enable(id: string): Promise<{ readonly message: string }> {
    return request(`/plugins/${encodeURIComponent(id)}/enable`, { method: 'POST' })
  },
  disable(id: string, force = false): Promise<{ readonly message: string }> {
    return request(`/plugins/${encodeURIComponent(id)}/disable`, {
      method: 'POST',
      ...(force ? { body: { force: true } } : {}),
    })
  },
  uninstall(id: string, force = false): Promise<{ readonly message: string }> {
    return request(`/plugins/${encodeURIComponent(id)}/uninstall`, {
      method: 'POST',
      ...(force ? { body: { force: true } } : {}),
    })
  },
  pluginConfig(id: string): Promise<{
    readonly id: string
    readonly current: unknown
    readonly revision: number
    readonly schema?: { readonly description?: string; readonly fields?: readonly import('./ConfigFields').ConfigFieldShape[] }
    readonly template?: unknown
  }> {
    return request(`/plugins/${encodeURIComponent(id)}/config`)
  },
  saveConfig(id: string, config: unknown, expectedRevision?: number): Promise<{ readonly message: string }> {
    return request(`/plugins/${encodeURIComponent(id)}/config`, {
      method: 'POST',
      body: { config, ...(expectedRevision === undefined ? {} : { expectedRevision }) },
    })
  },
  installPlan(payload: Record<string, unknown>): Promise<{
    readonly id: string
    readonly plan: PlanShape
    readonly configTemplate?: unknown
  }> {
    return request('/install-plan', { method: 'POST', body: payload })
  },
  install(payload: Record<string, unknown>): Promise<{ readonly message: string }> {
    return request('/install', { method: 'POST', body: payload })
  },
  bundlesInstall(spec: string): Promise<{
    readonly id: string
    readonly plan: PlanShape
    readonly message: string
    /** r7 live rail：live = 运行期已激活；pending-restart = 重启后生效。 */
    readonly activated?: 'live' | 'pending-restart'
    readonly hostConflicts?: readonly string[]
  }> {
    return request('/bundles/install', { method: 'POST', body: { spec } })
  },
  updates(): Promise<{ readonly updates: readonly RemoteUpdateRow[] }> {
    return request('/updates')
  },
  updatePlugin(id: string): Promise<{ readonly message: string; readonly updated?: boolean }> {
    return request(`/updates/plugins/${encodeURIComponent(id)}`, { method: 'POST' })
  },
  updateMygo(): Promise<{ readonly message: string; readonly updated: boolean }> {
    return request('/updates/mygo', { method: 'POST' })
  },
  updateAll(ids?: readonly string[]): Promise<{ readonly message: string; readonly results: readonly BatchUpdateResult[] }> {
    return request('/updates/plugins', {
      method: 'POST',
      ...(ids === undefined || ids.length === 0 ? {} : { body: { ids } }),
    })
  },
  helperStart(): Promise<HelperStatus> {
    return request('/config-helper', { method: 'POST', body: { action: 'start' } })
  },
  helperChat(message: string): Promise<HelperStatus> {
    return request('/config-helper', { method: 'POST', body: { action: 'chat', message } })
  },
  helperStop(): Promise<HelperStatus> {
    return request('/config-helper', { method: 'POST', body: { action: 'stop' } })
  },
  helperStatus(): Promise<HelperStatus> {
    return request('/config-helper', { method: 'POST', body: { action: 'status' } })
  },
  bomExport(): Promise<{ readonly message: string; readonly jsonPath: string; readonly mdPath: string }> {
    return request('/bom/export', { method: 'POST' })
  },
  registries(): Promise<{
    readonly registries: readonly RegistryRow[]
    readonly credentialsAvailable: boolean
  }> {
    return request('/registries')
  },
  saveRegistry(scope: string, registry: string, authRef?: string): Promise<{ readonly message: string }> {
    return request(`/registries/${encodeURIComponent(scope)}`, {
      method: 'PUT',
      body: { registry, ...(authRef === undefined ? {} : { authRef }) },
    })
  },
  removeRegistry(scope: string): Promise<{ readonly message: string }> {
    return request(`/registries/${encodeURIComponent(scope)}`, { method: 'DELETE' })
  },
  setCredential(ref: string, value: string): Promise<{ readonly message: string }> {
    return request(`/credentials/${encodeURIComponent(ref)}`, { method: 'PUT', body: { value } })
  },
  unsetCredential(ref: string): Promise<{ readonly message: string }> {
    return request(`/credentials/${encodeURIComponent(ref)}`, { method: 'DELETE' })
  },
}

export const STATUS_LABEL: Record<string, string> = {
  enabled: '已启用',
  disabled: '已停用',
  quarantined: '隔离',
  shadowed: '遮蔽',
  uninstalled: '未安装',
}

export const STATUS_TONE: Record<string, 'ok' | 'off' | 'warn' | 'danger' | 'dim'> = {
  enabled: 'ok',
  disabled: 'dim',
  quarantined: 'danger',
  shadowed: 'warn',
}

export const RAIL_LABEL: Record<string, string> = {
  bridge: 'bridge',
  bundle: 'bundle',
  live: 'live',
}

/** 兼容性边渲染顺序与标签。 */
export const COMPAT_EDGES: readonly { readonly key: keyof PluginCompatibility; readonly label: string; readonly hard: boolean }[] = [
  { key: 'depends', label: '依赖', hard: true },
  { key: 'breaks', label: '冲突(硬)', hard: true },
  { key: 'recommends', label: '建议', hard: false },
  { key: 'suggests', label: '推荐', hard: false },
  { key: 'conflicts', label: '抵触', hard: false },
]

export function formatTime(iso: string | undefined): string {
  if (iso === undefined) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', { hour12: false })
}
