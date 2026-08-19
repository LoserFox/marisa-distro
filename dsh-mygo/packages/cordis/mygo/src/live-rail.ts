/**
 * r7 live rail（运行期装卸）：live rail = profile cordis.patch.yml 内 mygo
 * 受管块（`# >>> mygo live block: <pkg>` 包裹），块内容是 bundle 自带
 * patch 行原文（字节级内嵌，`!!js` 等形态不失真）。host watchUserPatches
 * 对 patch 文件事务性 live 重放——写块即活装、剥块即活卸（2026-08-15
 * spike 实测证实）；行持久化在 patch 文件里，重启后 boot 照常物化。
 *
 * 单轨规则：一个包同一时刻只能在一轨——live rail 包必须退出
 * `dsh.profile.bundles`（同 id 双 insert 在 boot 是 exit=1 致命错误）。
 * 单轨切换由调用方保证（lifecycle 写块前把包移出 bundles；face 的
 * reconcile 经 liveBlockPackages 排除）；本模块只管 patch 层块读写。
 *
 * 顺序约束（spike 硬证据）：装 = 先 pnpm 落盘后写块；卸 = 先剥块后 pnpm。
 * live 重放失败是静默的（watcher 吞错），写后必须 verifyEntryState 主动
 * 验证，不能假设写文件即生效。
 * @module @r05en1cu/dsh-mygo/src/live-rail
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { patchFactsFromText } from './bundle-rail.ts'
import { hasYamlContent, mutatePatchFile, readPatchText } from './patch-io.ts'

/** live rail 受管块标记（removePatchRows 兜底清理同口径）。 */
export const LIVE_BLOCK_BEGIN = (pkg: string): string => `# >>> mygo live block: ${pkg}`
export const LIVE_BLOCK_END = (pkg: string): string => `# <<< mygo live block: ${pkg}`

/**
 * live 受管块整段匹配（组 1 = 包名，起止标记包名须一致）。带 /g，仅在
 * String.replace 中使用（每次调用重置 lastIndex；勿跨调用 exec 复用）。
 */
export const LIVE_BLOCK_PATTERN = /\n?# >>> mygo live block: (\S+)\n[\s\S]*?# <<< mygo live block: \1\n?/g

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** patch 文本内全部 live 受管块的包名（出现序；face reconcile 排除用）。 */
export function liveBlockPackages(text: string): readonly string[] {
  const packages: string[] = []
  for (const match of text.matchAll(/# >>> mygo live block: (\S+)\n/g)) {
    const pkg = match[1]
    if (pkg !== undefined) packages.push(pkg)
  }
  return packages
}

/** 目标包的 live 受管块是否在 profile patch 层。 */
export function hasLiveBlock(home: string, profile: string, packageName: string): boolean {
  return readPatchText(home, profile).includes(LIVE_BLOCK_BEGIN(packageName))
}

/** 读 bundle 包内 patch 文件原文（dsh.bundle.patch 声明；无声明/缺失返回 undefined）。 */
function readBundlePatchText(bundleDir: string): string | undefined {
  let pkg: { readonly dsh?: { readonly bundle?: { readonly patch?: unknown } } }
  try {
    pkg = JSON.parse(readFileSync(join(bundleDir, 'package.json'), 'utf8')) as typeof pkg
  } catch {
    return undefined
  }
  const patchRel = pkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string') return undefined
  const patchPath = join(bundleDir, patchRel)
  return existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : undefined
}

/** bundle patch 的 insert 行 id（预检撞车判定与写后验证共用）。 */
function insertRowIdsOf(patchText: string): readonly string[] {
  return patchFactsFromText(patchText)
    .filter(fact => fact.kind === 'insert')
    .map(fact => fact.rowId)
}

/** host 组合函数面（dsh-app-boot 的最小结构切面，运行期按 host 安装版本解析）。 */
interface AppBootLike {
  loadProfile(binName: string, name: string, installAnchor: string, home?: string): {
    readonly layers: readonly { readonly patches: readonly unknown[] }[]
    readonly patches: readonly unknown[]
  }
  composeEntries(
    layers: readonly (readonly unknown[])[],
    warn?: (message: string) => void,
  ): readonly unknown[]
}

/**
 * 解析 host 组合函数模块：profiles 兜底软链锚点优先（host boot 时
 * healProfilesModuleFallback 把 dsh 安装目录可达依赖软链进
 * profiles/node_modules，组合口径以 host 安装版本为准）；本包位置兜底
 * （仓内开发/测试形态）。createRequire 仅做解析，模块经动态 import 加载
 * （dsh-app-boot 是 ESM）。解析失败返回 undefined（预检降级，不阻断）。
 */
async function importAppBoot(home: string): Promise<AppBootLike | undefined> {
  const anchors = [join(home, 'profiles', 'noop.js'), fileURLToPath(import.meta.url)]
  for (const anchor of anchors) {
    try {
      const entry = createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot')
      return await (import(pathToFileURL(entry).href) as Promise<AppBootLike>)
    } catch {
      // 换下一个锚点
    }
  }
  return undefined
}

/**
 * 离线组合当前 profile 的有效条目 id 集合（loadProfile + composeEntries，
 * 与 boot 同一份组合语义）。任何一步失败返回 undefined——预检是增强不是
 * 门槛，调用方降级跳过并 warn。
 */
async function composedEntryIds(home: string, profile: string): Promise<ReadonlySet<string> | undefined> {
  const boot = await importAppBoot(home)
  if (boot === undefined) return undefined
  try {
    const profilesAnchor = join(home, 'profiles', 'noop.js')
    let installAnchor = join(home, 'profiles', profile, 'package.json')
    try {
      installAnchor = createRequire(profilesAnchor).resolve('@deepseek-ai/dsh/package.json')
    } catch {
      // dsh 安装锚点不可解析：profile 目录锚点兜底（bundle 解析走 profile node_modules）
    }
    const loaded = boot.loadProfile('mygo', profile, installAnchor, home)
    const entries = boot.composeEntries([...loaded.layers.map(layer => layer.patches), loaded.patches])
    const ids = new Set<string>()
    for (const entry of entries) {
      const id = (entry as { readonly id?: unknown } | null)?.id
      if (typeof id === 'string') ids.add(id)
    }
    return ids
  } catch {
    return undefined
  }
}

export interface LivePrecheckResult {
  readonly ok: boolean
  /** bundle patch 的 insert 行 id（写后验证用；预检失败也带回）。 */
  readonly rowIds: readonly string[]
  /** 降级/跳过说明（warn 级，不阻断安装）。 */
  readonly warnings: readonly string[]
  readonly error?: string | undefined
}

/**
 * live 安装离线预检：bundle patch 可解析 + insert 行 id 与现有组合树
 * （含 bundle 层）不撞车。撞车即拒绝——同 id 双 insert 在 boot 是致命
 * 错误、live 会毒化整次重放。host 组合函数不可达时降级跳过（warnings
 * 携带说明），不阻断安装。
 */
export async function precheckLiveInstall(
  home: string,
  profile: string,
  bundleDir: string,
): Promise<LivePrecheckResult> {
  const patchText = readBundlePatchText(bundleDir)
  if (patchText === undefined) {
    return {
      ok: false,
      rowIds: [],
      warnings: [],
      error: `bundle 无 dsh.bundle.patch 声明或 patch 文件缺失：${bundleDir}`,
    }
  }
  const rowIds = insertRowIdsOf(patchText)
  const warnings: string[] = []
  const existing = await composedEntryIds(home, profile)
  if (existing === undefined) {
    warnings.push('离线组合预检降级跳过（host 组合函数不可达或组合失败）；id 撞车风险由写后验证兜底')
  } else {
    const collisions = rowIds.filter(id => existing.has(id))
    if (collisions.length > 0) {
      return {
        ok: false,
        rowIds,
        warnings,
        error: `insert 行 id 与现有组合树撞车（同 id 双 insert 对 boot 是致命错误）：${collisions.join('、')}`,
      }
    }
  }
  return { ok: true, rowIds, warnings }
}

export interface LiveBlockWrite {
  readonly ok: boolean
  /** 写入块的 insert 行 id（写后验证用）。 */
  readonly rowIds: readonly string[]
  readonly error?: string | undefined
}

/**
 * 写 live 受管块（经 patch-io 串行原子写；同包已存在则整体替换，幂等）。
 * 块内容 = bundle patch 原文；`[]` 占位文档先摘除再追加（`[]` 后跟块
 * 内容构成非法 YAML）。
 */
export function writeLiveBlock(
  home: string,
  profile: string,
  packageName: string,
  bundleDir: string,
): LiveBlockWrite {
  const patchText = readBundlePatchText(bundleDir)
  if (patchText === undefined) {
    return {
      ok: false,
      rowIds: [],
      error: `bundle 无 dsh.bundle.patch 声明或 patch 文件缺失：${bundleDir}`,
    }
  }
  const rowIds = insertRowIdsOf(patchText)
  const block = `${LIVE_BLOCK_BEGIN(packageName)}\n${patchText.trimEnd()}\n${LIVE_BLOCK_END(packageName)}\n`
  const selfPattern = new RegExp(
    `\\n?${escapeRegExp(LIVE_BLOCK_BEGIN(packageName))}\\n[\\s\\S]*?${escapeRegExp(LIVE_BLOCK_END(packageName))}\\n?`,
  )
  try {
    mutatePatchFile(home, profile, (text) => {
      let base = text.includes(LIVE_BLOCK_BEGIN(packageName)) ? text.replace(selfPattern, '\n') : text
      if (base.trim() === '[]') base = ''
      const head = base.replace(/\s+$/, '')
      return head === '' ? block : `${head}\n\n${block}`
    })
  } catch (error) {
    return { ok: false, rowIds, error: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, rowIds }
}

export interface LiveBlockRemoval {
  readonly ok: boolean
  /** 被剥除块内的 insert 行 id（dispose 验证用）；无块时为空（幂等）。 */
  readonly rowIds: readonly string[]
  readonly error?: string | undefined
}

/**
 * 剥除 live 受管块（经 patch-io；无块幂等 ok、不改写文件）。剥除后无
 * YAML 内容行时回落 `[]`（仅注释/空白的文件解析为 null，boot fail-loud）。
 */
export function liveUninstall(home: string, profile: string, packageName: string): LiveBlockRemoval {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(LIVE_BLOCK_BEGIN(packageName))}\\n([\\s\\S]*?)${escapeRegExp(LIVE_BLOCK_END(packageName))}\\n?`,
  )
  try {
    let rowIds: readonly string[] = []
    mutatePatchFile(home, profile, (text) => {
      const match = pattern.exec(text)
      if (match === null) return undefined
      rowIds = insertRowIdsOf(match[1] ?? '')
      const stripped = text.replace(pattern, '\n')
      const body = stripped.replace(/\n{3,}/g, '\n\n').trimEnd()
      return hasYamlContent(body) ? `${body}\n` : body === '' ? '[]\n' : `${body}\n[]\n`
    })
    return { ok: true, rowIds }
  } catch (error) {
    return { ok: false, rowIds: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** host loader 条目快照面（duck-typed；cordis-plugin-loader Entry 的最小切面）。 */
interface LoaderEntryLike {
  readonly id?: unknown
  readonly fiber?: unknown
}

/**
 * 读 host loader 条目快照：条目 id → 是否有存活 fiber（fiber 被 dispose
 * 后 Entry 置回 undefined；条目随剥块整行移除）。loader 服务不可达或
 * 枚举失败返回 undefined——调用方据此判定「实例在跑」。
 */
export function loaderEntrySnapshot(get: (name: string) => unknown): ReadonlyMap<string, boolean> | undefined {
  try {
    const loader = get('loader') as { entries?: () => Iterable<LoaderEntryLike> } | undefined
    if (typeof loader?.entries !== 'function') return undefined
    const snapshot = new Map<string, boolean>()
    for (const entry of loader.entries()) {
      if (typeof entry?.id === 'string') {
        snapshot.set(entry.id, entry.fiber !== undefined && entry.fiber !== null)
      }
    }
    return snapshot
  } catch {
    return undefined
  }
}

/** 行 id 在快照中的状态（条目 id 是层级形态 `include:<rowId>`，按末段匹配）。 */
function rowState(snapshot: ReadonlyMap<string, boolean>, rowId: string): 'active' | 'inactive' | 'absent' {
  const suffix = `:${rowId}`
  for (const [id, active] of snapshot) {
    if (id === rowId || id.endsWith(suffix)) return active ? 'active' : 'inactive'
  }
  return 'absent'
}

/**
 * 写后验证：轮询 host loader 条目直到目标行达到期望态（spike 实测重放
 * 延迟 1-2 秒量级）。mode 'active' = 全部行有条目且 fiber 存活（live
 * 安装验证）；'inactive' = 全部行无条目或 fiber 已 dispose（剥块删条目
 * 与 disable 摘 fiber 同口径）。loader 不可达立即 false。
 */
export async function verifyEntryState(
  get: (name: string) => unknown,
  rowIds: readonly string[],
  mode: 'active' | 'inactive',
  timeoutMs = 10_000,
  intervalMs = 250,
): Promise<boolean> {
  if (rowIds.length === 0) return true
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const snapshot = loaderEntrySnapshot(get)
    if (snapshot === undefined) return false
    const reached = rowIds.every(id => mode === 'active'
      ? rowState(snapshot, id) === 'active'
      : rowState(snapshot, id) !== 'active')
    if (reached) return true
    if (Date.now() >= deadline) return false
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

/** live 安装组合面（离线预检 + 写受管块）；单轨切换（退出 bundles）由调用方在预检通过后做。 */
export interface LiveInstallResult extends LiveBlockWrite {
  readonly warnings: readonly string[]
}

/** live 安装：离线组合预检 → 写受管块（激活验证由调用方经 verifyEntryState 做）。 */
export async function liveInstall(
  home: string,
  profile: string,
  packageName: string,
  bundleDir: string,
): Promise<LiveInstallResult> {
  const pre = await precheckLiveInstall(home, profile, bundleDir)
  if (!pre.ok) {
    return { ok: false, rowIds: pre.rowIds, warnings: pre.warnings, ...(pre.error === undefined ? {} : { error: pre.error }) }
  }
  const written = writeLiveBlock(home, profile, packageName, bundleDir)
  return { ...written, warnings: pre.warnings }
}

/**
 * boot/运行期对账（r7 P5）：同一包同时出现在 dsh.profile.bundles 与 live
 * 受管块 = 下次 boot 同 id 双 insert（exit=1 致命；boot 挂死时 mygo 没有
 * 运行机会，故对账必须在实例活着时做）。bundle 赢：剥 live 块，行随下次
 * boot 从 bundle 层物化（当前会话该包的 live 行随重放摘掉，重启后恢复）。
 * 返回被剥块的包名；无重叠返回空。
 */
export function reconcileLiveRailOverlap(home: string, profile: string): readonly string[] {
  const manifestPath = join(home, 'profiles', profile, 'package.json')
  let bundles: readonly string[]
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      readonly dsh?: { readonly profile?: { readonly bundles?: unknown } }
    }
    const list = parsed.dsh?.profile?.bundles
    bundles = Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
  const bundleSet = new Set(bundles)
  const overlap = liveBlockPackages(readPatchText(home, profile)).filter(pkg => bundleSet.has(pkg))
  const stripped: string[] = []
  for (const pkg of overlap) {
    if (liveUninstall(home, profile, pkg).ok) stripped.push(pkg)
  }
  return stripped
}
