/** 检查编排：GitHub 拉取 → 非 draft 过滤 → 缓存落盘 → state 负载。 */

import { assetUrlsOf, fetchReleases, firstNonDraft, selectDownload } from './github.ts'
import type { UpdateStatePayload } from './protocol.ts'
import { proxyAgentForEnv } from './proxy.ts'
import { hasUpdate, normalizeVersion } from './semver.ts'
import { EMPTY_UPDATE_CHECK_STATE, readState, withinCacheWindow, writeState, type UpdateCheckState } from './state.ts'

/** 手动检查与定时检查共用的缓存窗口：30 秒内不重复打 GitHub API。 */
export const MANUAL_CHECK_WINDOW_MS = 30_000

export interface UpdateCheckerDeps {
  readonly repo: string
  readonly apiBase: string
  /** state.json 的绝对路径（$DSH_HOME/update-check/state.json）。 */
  readonly statePath: string
  /** 当前后端版本（MARISA_VERSION；空串 = dev 形态，检查整体隐身）。 */
  readonly currentVersion: string
  /** 安装形态（'msi' | 'standalone' | 'dev'），决定下载链接选择。 */
  readonly installForm: string
  /** 代理环境（缺省 process.env）。 */
  readonly env?: Record<string, string | undefined>
  /** 测试注入点。 */
  readonly fetchImpl?: typeof fetch
  /** 测试注入点（时间源）。 */
  readonly now?: () => number
  /** 自动检查开关的实时取值（settings 解析值）。 */
  readonly readAutoCheck?: () => boolean
}

export interface CheckOutcome {
  /** true 表示完成了一次真实 GitHub 往返；false 表示隐身模式未发请求。 */
  readonly checked: boolean
  readonly state: UpdateStatePayload
}

/** 空负载：dev 形态（currentVersion 为空）时 state/dismiss 不碰磁盘、不发请求。 */
const HIDDEN_PAYLOAD: UpdateStatePayload = {
  currentVersion: '',
  latest: null,
  hasUpdate: false,
  changelog: '',
  assets: { msi: null, standalone: null, releasePage: null, download: null },
  lastCheckAt: null,
  autoCheck: true,
  dismissedVersion: null,
}

export class UpdateChecker {
  private cached: UpdateCheckState | null = null

  constructor(private readonly deps: UpdateCheckerDeps) {}

  private async ensureLoaded(): Promise<UpdateCheckState> {
    if (this.cached === null) this.cached = await readState(this.deps.statePath)
    return this.cached
  }

  /**
   * 执行一次检查：拉取 Releases → 取第一个非 draft → 更新缓存（含 changelog
   * 与资产 URL，重启后横幅/卡片不丢失下载面）。网络失败向上抛给调用方
   * （定时任务记日志、手动路由回 502、横幅静默）。
   */
  async check(): Promise<CheckOutcome> {
    if (this.deps.currentVersion === '') return { checked: false, state: HIDDEN_PAYLOAD }
    const current = await this.ensureLoaded()
    const release = firstNonDraft(await fetchReleases({
      apiBase: this.deps.apiBase,
      repo: this.deps.repo,
      dispatcher: proxyAgentForEnv(this.deps.env),
      ...(this.deps.fetchImpl === undefined ? {} : { fetchImpl: this.deps.fetchImpl }),
    }))
    const urls = assetUrlsOf(release)
    const next: UpdateCheckState = {
      lastCheckAt: new Date((this.deps.now ?? Date.now)()).toISOString(),
      latest: release === undefined ? null : normalizeVersion(release.tagName),
      dismissedVersion: current.dismissedVersion,
      changelog: release?.body ?? '',
      assets: { msi: urls.msi, standalone: urls.standalone, releasePage: urls.releasePage },
    }
    this.cached = next
    await writeState(this.deps.statePath, next)
    return { checked: true, state: this.buildPayload(next) }
  }

  /** 只读负载：从缓存构建，不发网络请求。 */
  async payload(): Promise<UpdateStatePayload> {
    if (this.deps.currentVersion === '') return HIDDEN_PAYLOAD
    return this.buildPayload(await this.ensureLoaded())
  }

  /** 记录已忽略版本（同版本重复忽略幂等）。 */
  async dismiss(version: string): Promise<void> {
    if (this.deps.currentVersion === '') return
    const current = await this.ensureLoaded()
    const next: UpdateCheckState = { ...current, dismissedVersion: version }
    this.cached = next
    await writeState(this.deps.statePath, next)
  }

  /** 距上次检查是否不足 windowMs（手动检查缓存窗口判定）。 */
  async lastCheckWithin(nowMs: number, windowMs: number): Promise<boolean> {
    if (this.deps.currentVersion === '') return false
    return withinCacheWindow(await this.ensureLoaded(), nowMs, windowMs)
  }

  private buildPayload(state: UpdateCheckState): UpdateStatePayload {
    const currentVersion = this.deps.currentVersion
    const latest = state.latest
    return {
      currentVersion,
      latest,
      hasUpdate: latest !== null && currentVersion !== '' && hasUpdate(currentVersion, latest),
      changelog: state.changelog,
      assets: {
        msi: state.assets.msi,
        standalone: state.assets.standalone,
        releasePage: state.assets.releasePage,
        download: selectDownload(state.assets, this.deps.installForm),
      },
      lastCheckAt: state.lastCheckAt,
      autoCheck: this.deps.readAutoCheck?.() ?? true,
      dismissedVersion: state.dismissedVersion,
    }
  }
}
