/**
 * hub install intent 翻译（P5）：
 * - `profile-bundle` → pnpm intent（精确 semver 归一为 `name@version`；钉
 *   commit git spec 原样交给 pnpm），由 profile loader 执行；
 * - `guided/*` → display（无可执行 intent：只展示，拒绝安装并说明）；
 * - `repository-plugin` → 默认拒绝（该安装轨 0812 已删除，待官方态度），
 *   除非目标 `.dsh-plugin` 目录含 `dsh.bundle` 声明（启发式探针放行，
 *   标注实验性，走 git 子目录 spec 交 profile loader）。
 * @module @r05en1cu/dsh-mygo-loader-hub/intent
 */

import type { HubFetch, HubInstallIntent } from './registry.ts'

/** 翻译产物：pnpm（交 profile 执行面）或 display（只展示/拒绝）。 */
export type HubTranslatedInstall =
  | {
    readonly kind: 'pnpm'
    readonly spec: string
    readonly packageName: string
    /** repository-plugin 启发式放行 → true（实验性，输出面必须标注）。 */
    readonly experimental: boolean
  }
  | { readonly kind: 'display'; readonly reason: string }

const EXACT_SEMVER_RE = /^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const PINNED_GIT_RE = /^(?:git\+https:\/\/|https:\/\/|github:)[^#\s]+#[0-9a-f]{40}$/
const REPOSITORY_PLUGIN_RE = /^github:([^/\s#&]+)\/([^/\s#&]+)#([0-9a-f]{40})(?:&path:(\/[^ \s&]+))?$/

/** repository-plugin 默认拒绝文案（安装轨 0812 已删除）。 */
export const REPOSITORY_TRACK_REMOVED =
  'repository-plugin 安装轨在 0812 已删除，待官方态度；如目标 .dsh-plugin 目录含 dsh.bundle 声明可经启发式探针实验性放行'

/** 探针结果：目标 .dsh-plugin 目录是否含 dsh.bundle 声明。 */
export type RepositoryBundleProbe = (spec: string) => Promise<boolean>

/**
 * 默认探针：抓 raw.githubusercontent 上钉死 commit 的 package.json，检查
 * `dsh.bundle` 声明。网络失败/404/解析失败一律 false（默认拒绝侧）。
 */
export function createRepositoryBundleProbe(fetchImpl?: HubFetch): RepositoryBundleProbe {
  const fetcher = fetchImpl ?? (globalThis.fetch as unknown as HubFetch)
  return async (spec: string): Promise<boolean> => {
    const match = REPOSITORY_PLUGIN_RE.exec(spec)
    if (match === null) return false
    const [, owner, repo, commit, path] = match
    const pluginPath = path ?? '/.dsh-plugin'
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commit}${pluginPath}/package.json`
    try {
      const response = await fetcher(url)
      if (!response.ok) return false
      const pkg = JSON.parse(await response.text()) as { readonly dsh?: { readonly bundle?: unknown } }
      return typeof pkg.dsh?.bundle === 'object' && pkg.dsh.bundle !== null
    } catch {
      return false
    }
  }
}

export interface TranslateHubInstallOptions {
  /**
   * 本地快照来源（离线验证/内网镜像）允许 file: spec；远程 registry 的
   * profile-bundle spec 必须是精确 semver 或钉 commit git（registry-core
   * isExactPackageSpec 同口径）。
   */
  readonly allowFileSpec?: boolean
  /** repository-plugin 启发式探针；不提供时一律默认拒绝。 */
  readonly probeRepositoryBundle?: RepositoryBundleProbe
}

/**
 * 翻译一个 hub install intent。同步部分零 I/O；repository-plugin 需要
 * 探针时为异步。
 */
export async function translateHubInstall(
  intent: HubInstallIntent,
  options: TranslateHubInstallOptions = {},
): Promise<HubTranslatedInstall> {
  if (intent.mode === 'guided') {
    return {
      kind: 'display',
      reason: `guided/${intent.method} 条目没有可执行安装意图：请按源仓库指引手动安装（mygo 不做引导式安装）`,
    }
  }
  if (intent.mode === 'repository-plugin') {
    const probe = options.probeRepositoryBundle
    if (probe === undefined || !(await probe(intent.spec))) {
      return { kind: 'display', reason: REPOSITORY_TRACK_REMOVED }
    }
    return { kind: 'pnpm', spec: intent.spec, packageName: '', experimental: true }
  }
  // profile-bundle
  const { packageName, spec } = intent
  if (EXACT_SEMVER_RE.test(spec)) {
    return { kind: 'pnpm', spec: `${packageName}@${spec}`, packageName, experimental: false }
  }
  if (PINNED_GIT_RE.test(spec)) {
    return { kind: 'pnpm', spec, packageName, experimental: false }
  }
  if (options.allowFileSpec === true && /^(?:file:\S+|\/\S+|\S+\.(?:tgz|tar\.gz))$/.test(spec)) {
    // 本地快照（离线验证/内网镜像）才允许 file:/绝对路径/tarball spec。
    return { kind: 'pnpm', spec, packageName, experimental: false }
  }
  return {
    kind: 'display',
    reason: `profile-bundle spec 不是精确 semver / 钉 commit git（${spec}），拒绝安装`,
  }
}
