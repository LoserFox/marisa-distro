/**
 * dsh-mygo-panel node half: a small JSON API over the mygo PluginManager
 * surface plus a local plugin installer. Sources: GitHub clone, local
 * folder, and zip/tar.gz archives. Installed plugins are copied into
 * `$DSH_HOME/mygo-plugins/<id>`, wrapped in a projected bridge package
 * (`@r05en1cu/<id>-mygo`) so both halves reach the web app: the node
 * half re-adopts through mygo, and the browser half (dshClient) is served
 * from the bridge and enters the client roster via a profile patch row.
 * @module @r05en1cu/dsh-mygo-ext-panel
 */
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, openSync } from 'node:fs'
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { basename, delimiter, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginManager } from '@r05en1cu/dsh-mygo'
import { compatibilityViolationLines, compatibilityWarningLines } from '@r05en1cu/dsh-mygo'
import { listPatchRowIds, readProfilePatchText, readRowConfig, readRowConfigRevision, removePatchRows, upsertRowConfig } from '@r05en1cu/dsh-mygo'
import { hasLiveBlock, liveUninstall, loaderEntrySnapshot, verifyEntryState, writeLiveBlock } from '@r05en1cu/dsh-mygo'
import { listRegistries, removeRegistry, upsertRegistry } from '@r05en1cu/dsh-mygo'
import type { CredentialsLike } from '@r05en1cu/dsh-mygo'
import { profileUninstall } from '@r05en1cu/dsh-mygo-loader-profile'
import { buildArgsFor, listMygoPackageDirs, swapTreeIntoPlace } from './workspace-packages.js'
import type {
  PluginCompatibility,
  PluginHandleInfo,
  RawCordisFunctionPlugin,
  RawPluginDeclaration,
} from '@r05en1cu/dsh-mygo-api'

const execFileAsync = promisify(execFile)

/**
 * The dsh source checkout root, when present. npm/npx 布局下不存在 → 所有
 * checkout 专属路径（构建/自更新/workspace 链接）降级为不执行；桥接投影等
 * 用户级路径继续走 $DSH_HOME。
 */
const CHECKOUT = resolveCheckoutDir(dirname(fileURLToPath(import.meta.url)))
/** 源码模式 = 在 dsh checkout 内安装；否则为 npm 布局。 */
const SOURCE_MODE = CHECKOUT !== undefined

/** Walk up from a module dir to a dsh checkout marker; npm layout → undefined. */
function resolveCheckoutDir(from: string): string | undefined {
  let dir = from
  for (let depth = 0; depth < 8; depth++) {
    if (
      existsSync(join(dir, 'packages', 'client', 'tsdown.client.ts'))
      || existsSync(join(dir, 'apps', 'cli', 'src', 'bin.ts'))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** Managed install root: every installed plugin lives in its own subdirectory. */
const HOME_ROOT = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
  ? process.env.DSH_HOME
  : join(homedir(), '.dsh')
const INSTALL_DIR = join(HOME_ROOT, 'mygo-plugins')

/** mygo 自身安装状态（install.sh 写入，供检查/热更新自身）。 */
const SELF_STATE = join(HOME_ROOT, 'mygo-self.json')

/** User skill root scanned by dsh-skill-local (flat `name.md` skills). */
const SKILLS_ROOT = join(HOME_ROOT, 'skills')

/**
 * 生效 profile 名（P4 收口）：模块级常量改为运行时推导，与 mygo
 * service.ts 的 resolveProfileName 同源——显式 DSH_PROFILE env 优先，
 * 缺省从 loader baseUrl（profile 目录 URL，app-boot 挂载前设置）取目录名；
 * apply 尚未运行就访问 → fail loud。
 */
let runtimeProfile: string | undefined

function resolvePanelProfile(ctx: PanelContext): string {
  const fromEnv = process.env.DSH_PROFILE
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv
  const baseUrl = (ctx as { readonly baseUrl?: unknown }).baseUrl
  if (typeof baseUrl === 'string' && baseUrl.startsWith('file:')) {
    const pathname = decodeURIComponent(new URL(baseUrl).pathname).replace(/\/+$/, '')
    const name = pathname.split('/').pop()
    if (name !== undefined && name !== '') return name
  }
  throw new Error('dsh-mygo-panel: 无法推导 profile 名（DSH_PROFILE 未设置且 loader baseUrl 不可用）')
}

/** 当前 profile 名（仅 apply 之后可用）。 */
function panelProfile(): string {
  if (runtimeProfile === undefined) {
    throw new Error('dsh-mygo-panel: apply 尚未运行，profile 名未解析')
  }
  return runtimeProfile
}

/** Profile patch row file (loader rows the boot composes). */
function profilePatchPath(): string {
  return join(HOME_ROOT, 'profiles', panelProfile(), 'cordis.patch.yml')
}

/** Per-plugin manifest file inside each installed directory. */
const MANIFEST = '.mygo-install.json'

/** Per-app manifest file inside each installed external-app directory. */

/** Append-only operation log for external apps (best-effort records). */

// rc.3：桥接行装配/可解析性校验收敛进 bridge-rows.ts（纯函数可测面）。
import { buildProfilePatchText, filterResolvableRows, isBridgeRowResolvable } from './bridge-rows.js'
// rc8：live rail 事件通道（SSE 端点 + 广播面）。
import { beginPanelOperation, broadcastLiveRail, finishPanelOperation, liveRowUrlOf, registerLiveEventsRoute } from './live-events.js'
// P0：目录源层（hub/local/github 三源合并）+ trust fence。
import type { HubInstalledFact } from './hub-catalog.js'
import { CatalogSourceService, type CatalogSourceConfig } from './catalog-sources.js'
import { isLoopbackRequest, isTrustedRequest, type TrustRequest } from './trust-fence.js'

export const name = 'dsh-mygo-panel'
export const inject = ['pluginManager', 'webServer']

/** bundle 卸载路由的结果信封（API 层直接透传）。 */
export interface BundleUninstallOutcome {
  readonly ok: boolean
  readonly id?: string
  readonly message?: string
  readonly error?: string
  readonly warning?: string
}

/**
 * bundle 轨成员的卸载（r6 路由修正；r7 live rail 重排）：profile 执行面
 * （pnpm remove + reconcile，与官方 dsh plugin remove 同路径），带守卫——
 * 面板自身（dsh-mygo-ext-panel）拒绝经自身卸载；dsh-mygo 核心需 force 确认
 * （管理面中断警告）；卸载前跑 plan 预览（dependent-exists 等拒绝）。
 * r7 运行期顺序（spike 硬约束「先删行后 pnpm」）：live rail 包先剥受管
 * live 块 + 验证 dispose 再 pnpm remove；boot rail 包且实例在跑先写受管
 * disable 块 live 摘 fiber + 验证再走现流程。最后清理该成员在用户 patch
 * 层的 config 覆盖行与受管块（rc.6 残留 bugfix；rowId 先于卸载推导；
 * removePatchRows 兼作 live 块崩溃残留兜底）。桥接轨成员不经此路由
 * （维持引擎 uninstall 语义）。
 */
export async function routeBundleUninstall(
  ctx: PanelContext,
  id: string,
  force: boolean,
  profile: string = panelProfile(),
): Promise<BundleUninstallOutcome> {
  if (id === 'dsh-mygo-ext-panel') {
    return {
      ok: false,
      error: '面板不能经自身卸载（请求正由它服务）。请改用 dsh plugin remove @r05en1cu/dsh-mygo-ext-panel',
    }
  }
  if (id === 'dsh-mygo' && !force) {
    return {
      ok: false,
      error: '卸载 dsh-mygo 核心将中断 mygo 管理面（含本面板）。确认请带 force: true，或改用 dsh plugin remove @r05en1cu/dsh-mygo',
    }
  }
  const plan = await ctx.pluginManager.plan({ op: 'uninstall', id })
  if (!plan.accepted) {
    return { ok: false, error: plan.error?.message ?? '卸载预览被拒绝' }
  }
  const member = ctx.pluginManager.bundleList().find(candidate => candidate.id === id)
  // rc.6 残留 bugfix：rowId 必须在卸载前推导（bundle 包目录随 pnpm remove 消失，
  // 之后 bundleRowIdOf 无从读 bundle patch，只能回退成员 id 而清错目标）。
  const rowId = await rowIdOfBundleMember(id, member?.packageName, profile)
  const packageName = member?.packageName ?? id
  const getService = (name: string): unknown => ctx.get(name)
  const loaderReachable = loaderEntrySnapshot(getService) !== undefined
  // liveEffective = 运行期已 dispose/摘取（文案据此区分刷新生效/重启生效）。
  let liveEffective = false
  if (hasLiveBlock(HOME_ROOT, profile, packageName)) {
    // live rail 包：先剥块活卸、验证 dispose，再 pnpm remove（反了残留行
    // 会在下次重放/重启 import 失败连坐整次重放）。
    const removal = liveUninstall(HOME_ROOT, profile, packageName)
    if (!removal.ok) {
      return { ok: false, error: `live 块剥除失败：${removal.error ?? ''}` }
    }
    if (removal.rowIds.length === 0) {
      liveEffective = true
    } else if (loaderReachable) {
      const disposed = await verifyEntryState(getService, removal.rowIds, 'inactive')
      if (!disposed) {
        // 验证超时：包文件尚在，重写 live 块恢复原状，不执行 pnpm remove。
        const dir = resolveProfilePackageDir(packageName, profile)
        if (dir !== undefined) writeLiveBlock(HOME_ROOT, profile, packageName, dir)
        return {
          ok: false,
          error: `live 卸载验证超时：行 ${removal.rowIds.join('、')} 未 dispose（live 块已恢复，未执行 pnpm remove）`,
        }
      }
      liveEffective = true
    }
  } else if (loaderReachable && member !== undefined) {
    // boot rail 包且实例在跑：先写受管 disable 块 live 摘 fiber（companion
    // 块口径，removePatchRows 会后置清理），验证通过再走现流程；摘取失败
    // 降级现流程（重启后完全生效）。
    try {
      await ctx.pluginManager.bundleSetEnabled(id, false)
      const insertIds = member.patchFacts
        .filter(fact => fact.kind === 'insert')
        .map(fact => fact.rowId)
      liveEffective = insertIds.length === 0
        || await verifyEntryState(getService, insertIds, 'inactive')
    } catch {
      // 纯 config 覆盖行等不可行级停用形态：维持现流程
    }
  }
  const outcome = profileUninstall(packageName, { profile, home: HOME_ROOT })
  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? 'pnpm remove 失败' }
  }
  // 清理 r6 upsert 写入的 config 覆盖行与受管 disable/companion/live 块
  // （残留行会让卡片数据源/配置导出带出已卸载插件；清理失败不翻转卸载
  // 结果，降级为 warning）。
  const cleanup = removePatchRows(HOME_ROOT, profile, rowId === id ? [id] : [rowId, id])
  const warnings = [
    ...(id === 'dsh-mygo' ? ['mygo 管理面已随核心卸载中断'] : []),
    ...(cleanup.ok ? [] : [`配置行清理失败（请手工检查 profile cordis.patch.yml）：${cleanup.error ?? ''}`]),
  ]
  // rc8：live 生效（dispose 已验证）的卸载广播——打开中的页面页内拆卸
  // client 行；boot 轨未摘取/实例不在跑的路径不发帧（重启生效语义不变）。
  if (liveEffective) broadcastLiveRail({ type: 'live-rail', op: 'unmount', id: packageName })
  return {
    ok: true,
    id,
    message: liveEffective
      ? `插件 ${id} 已卸载，刷新页面后生效`
      : `插件 ${id} 已卸载（profile bundle 层已对账，配置行已清理；重启实例后完全生效）`,
    ...(warnings.length > 0 ? { warning: warnings.join('；') } : {}),
  }
}

/** 解析 profile 内已安装包目录（live 卸载验证超时回滚写块用）。 */
function resolveProfilePackageDir(packageName: string, profile: string): string | undefined {
  try {
    const req = createRequire(join(HOME_ROOT, 'profiles', profile, 'noop.js'))
    return dirname(req.resolve(`${packageName}/package.json`))
  } catch {
    return undefined
  }
}

/** 凭据写路由的结果信封（status + body；body 永不携带凭据值）。 */
export interface CredentialMutationResult {
  readonly status: number
  readonly body: Record<string, unknown>
}

/**
 * rc8 凭据设/删路由（官方 credentials 语义）：服务缺席 503；env 遮蔽
 * （describe.writable === false）409；空值拒绝（空值等于不存在）；任何
 * 响应不携带值。
 */
export async function routeCredentialMutation(
  credentials: CredentialsLike | undefined,
  method: 'PUT' | 'DELETE',
  ref: string,
  value?: unknown,
): Promise<CredentialMutationResult> {
  if (credentials === undefined) {
    return { status: 503, body: { ok: false, error: '宿主 credentials 服务不可达（非 web 组合？）' } }
  }
  const info = await credentials.describe(ref)
  if (!info.writable) {
    return {
      status: 409,
      body: {
        ok: false,
        writable: false,
        error: `引用 ${ref} 被更高优先级来源（如环境变量）遮蔽，写入无效——请先解除遮蔽`,
      },
    }
  }
  if (method === 'PUT') {
    if (typeof value !== 'string' || value === '') {
      return { status: 400, body: { ok: false, error: '缺少凭据值（空值等于不存在；删除请用 DELETE）' } }
    }
    await credentials.set(ref, value)
    return { status: 200, body: { ok: true, message: `凭据 ${ref} 已存入实例凭据存储（$DSH_HOME/.credentials.yaml）` } }
  }
  await credentials.unset(ref)
  return { status: 200, body: { ok: true, message: `凭据 ${ref} 已删除` } }
}

interface WebServerLike {
  register(route: {
    kind?: 'exact' | 'prefix'
    path: string
    handler(req: unknown, res: unknown): void | Promise<void>
  }): () => void
}

type PanelContext = Context & {
  readonly pluginManager: PluginManager
  readonly webServer: WebServerLike
  readonly sandbox?: {
    confine(
      argv: readonly string[],
      policy: { readonly mode: 'workspace-write'; readonly workspaceRoot: string },
    ): { readonly argv: string[] }
  }
}

interface RawRequest {
  readonly method?: string
  readonly url?: string
  readonly headers?: import('node:http').IncomingHttpHeaders
  on?(event: 'data' | 'end', listener: (chunk?: Buffer) => void): void
}

interface RawResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body: string): void
}

/** 面板路由的读/写信任面（P0 迁移自 plughub trust-fence）。 */
function panelTrustedHosts(ctx: PanelContext): readonly string[] {
  const runtime = ctx.get('webRuntime') as { readonly trustedHosts?: readonly string[] } | undefined
  return runtime?.trustedHosts ?? []
}

/** 读门：loopback 或部署显式 trusted-host，且 same-origin。 */
function panelCanRead(req: RawRequest, ctx: PanelContext): boolean {
  return isTrustedRequest(req as TrustRequest, panelTrustedHosts(ctx))
}

/** 写门：仅 loopback + same-origin，trusted-host 不豁免。 */
function panelCanWrite(req: RawRequest): boolean {
  return isLoopbackRequest(req as TrustRequest)
}

/** 面板所知的已安装事实（bridge + bundle/live 两轨合并）。 */
function panelHubInstalled(ctx: PanelContext): HubInstalledFact[] {
  const bridge = ctx.pluginManager.plugins().map((plugin: PluginHandleInfo): HubInstalledFact => ({
    id: plugin.id,
    ...(plugin.version === '' ? {} : { version: plugin.version }),
    rail: 'bridge',
  }))
  const bundles = ctx.pluginManager.bundleList().map((member): HubInstalledFact => ({
    id: member.id,
    packageName: member.packageName,
    ...(member.version === undefined || member.version === '' ? {} : { version: member.version }),
    rail: member.live === true ? 'live' : 'bundle',
  }))
  return [...bridge, ...bundles]
}

/** 面板目录源服务（apply 时按 $DSH_HOME 构造）。 */
let panelCatalogSources: CatalogSourceService | undefined

/** GET /api/mygo/hub 文档（三源合并 + 逐源报告）。 */
async function panelHubDocument(ctx: PanelContext, refresh: boolean) {
  if (panelCatalogSources === undefined) {
    return {
      available: false,
      source: {
        adapter: 'hub' as const,
        schema: 'unavailable',
        revision: 0,
        generatedAt: '',
        origins: [],
        snapshotId: '',
        signature: null,
      },
      reports: [],
      entries: [],
    }
  }
  return panelCatalogSources.document(panelHubInstalled(ctx), refresh)
}

interface InstallManifest {
  readonly id: string
  readonly method: 'github' | 'folder' | 'archive'
  readonly source: string
  readonly entry: string
  /** Installed package version; the compatibility-check anchor. */
  readonly version?: string
  /** Declarative `dsh.mygo` section read from the installed package.json. */
  readonly declarative?: DeclarativeSection
  /** Remote repository provenance when installed from GitHub. */
  readonly remote?: RemoteRef
  skillFile?: string
  readonly config?: unknown
  readonly installDeps?: boolean
  readonly installedAt: number
}

/** The `dsh.mygo` section of an installed plugin's package.json (v1). */
interface DeclarativeSection {
  readonly entrypoints?: Readonly<Record<string, readonly (string | { readonly value: unknown })[]>>
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
}

interface InstallRequest {
  readonly method?: 'github' | 'folder' | 'archive'
  readonly url?: string
  readonly ref?: string
  readonly path?: string
  readonly config?: unknown
  /** Install the plugin's runtime `dependencies` with npm (opt-in). */
  readonly installDeps?: boolean
}

/** Remote repository provenance recorded for GitHub-installed plugins/apps. */
interface RemoteRef {
  readonly url: string
  /** Git ref checked at install (`HEAD` when no branch was given). */
  readonly ref: string
  /** Installed commit SHA. */
  readonly commit: string
}

/** mygo 自身安装状态。 */
interface MygoSelfState {
  readonly url: string
  readonly ref: string
  readonly commit: string
  readonly installedAt: number
}

/** Bridge package directory for one installed plugin id. */
function bridgeDirOf(id: string): string {
  return join(INSTALL_DIR, `${id}-mygo`)
}

/** Bridge package name for one installed plugin id. */
function bridgeNameOf(id: string): string {
  return `@r05en1cu/${id}-mygo`
}

/** Client service id → provider package map for bridge dependency completion. */
const CLIENT_SERVICE_PACKAGES: Readonly<Record<string, string>> = {
  slots: '@deepseek-ai/dsh-client-ui-slots',
}

/**
 * Extract the client bundle's fiber-level inject list (`exports.inject` /
 * `const inject = [...]`) and map the service ids to provider packages. The
 * bridge's `dshClient.inject` must name the provider packages (host client
 * composition loads them as dependency edges); a bundle declaring
 * `inject: ['slots']` without the package edge fails with
 * "cannot get property 'slots' without inject" in the browser.
 */
function clientServicePackagesOf(clientText: string): string[] {
  const match = /(?:exports\.inject|const inject)\s*=\s*\[([^\]]*)\]/.exec(clientText)
  if (match === null || match[1] === undefined) return []
  const names = new Set<string>()
  for (const raw of match[1].split(',')) {
    const id = raw.trim().replace(/^['"]|['"]$/g, '')
    const pkg = CLIENT_SERVICE_PACKAGES[id]
    if (pkg !== undefined) names.add(pkg)
  }
  return [...names]
}

/** Derive a manifest-safe plugin id from a package name. */
function pluginIdOf(packageName: string): string {
  const base = packageName.includes('/') ? packageName.slice(packageName.lastIndexOf('/') + 1) : packageName
  const cleaned = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'plugin'
}

/** Candidate entry files, in priority order. */
function entryCandidates(root: string): string[] {
  return [
    join(root, 'lib', 'index.js'),
    join(root, 'src', 'index.ts'),
    join(root, 'index.ts'),
    join(root, 'index.js'),
  ]
}

/** Resolve a plugin's runnable entry, honoring package.json.main when present. */
async function resolveEntry(root: string): Promise<string> {
  let main: string | undefined
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { readonly main?: unknown }
    if (typeof pkg.main === 'string' && pkg.main.length > 0) main = pkg.main
  } catch {
    // no package.json: fall through to candidate entries
  }
  const candidates = main === undefined ? entryCandidates(root) : [resolve(root, main), ...entryCandidates(root)]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      // keep looking
    }
  }
  throw new Error('未找到插件入口（package.json main / lib/index.js / src/index.ts）')
}

/**
 * Resolve a plugin entry from the package's declared surface, even before the
 * build artifact exists: the official repository-plugin format
 * (`package.json#dsh.entry`) ships source only and must be built during
 * install, so the declared path is the install-time contract.
 */
async function resolveEntryDeclared(root: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      readonly dsh?: { readonly entry?: unknown }
      readonly main?: unknown
    }
    const declared = typeof pkg.dsh?.entry === 'string' && pkg.dsh.entry.length > 0
      ? pkg.dsh.entry
      : typeof pkg.main === 'string' && pkg.main.length > 0
        ? pkg.main
        : undefined
    if (declared !== undefined) return resolve(root, declared)
  } catch {
    // unreadable manifest: fall through to the built-artifact resolver
  }
  return resolveEntry(root)
}

/** Whether one package root follows the official `.dsh-plugin` repository format. */
async function isRepositoryPluginPackage(root: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      readonly dsh?: { readonly entry?: unknown }
    }
    return typeof pkg.dsh?.entry === 'string' && pkg.dsh.entry.length > 0
  } catch {
    return false
  }
}

/**
 * Import one plugin entry and unwrap CJS default exports. `fresh` appends a
 * unique query to the file URL: Node's ESM registry caches modules by URL, so
 * reinstalling the same plugin id in one process would otherwise hand the
 * manager the previous version's module. The query is stripped by
 * `fileURLToPath` and relative-URL resolution, so `import.meta.url` users are
 * unaffected.
 */
async function importEntry(entry: string, fresh = false): Promise<RawCordisFunctionPlugin> {
  const base = pathToFileURL(entry).href
  const mod = await import(fresh ? `${base}?mygo=${Date.now()}` : base) as {
    readonly default?: RawCordisFunctionPlugin
    readonly apply?: unknown
    readonly name?: string
  }
  const raw = mod.default ?? (mod as unknown as RawCordisFunctionPlugin)
  if (typeof raw.apply !== 'function') {
    throw new Error(`插件入口 ${entry} 没有 apply 函数`)
  }
  return raw
}

/**
 * Read the declarative `dsh.mygo` section from an installed package's
 * package.json: `{ entrypoints, compatibility }` plus the package version
 * (the compatibility-check anchor). Unknown/ill-shaped sections are ignored —
 * a stock ecosystem plugin without the section keeps the old derived
 * manifest behaviour.
 */
async function readDeclarativeManifest(
  root: string,
): Promise<{ readonly version: string; readonly declarative?: DeclarativeSection } | undefined> {
  let pkg: { readonly version?: unknown; readonly dsh?: { readonly mygo?: unknown } }
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as typeof pkg
  } catch {
    return undefined
  }
  if (typeof pkg.version !== 'string' || pkg.version.trim() === '') return undefined
  const section = pkg.dsh?.mygo
  const declarative: {
    entrypoints?: DeclarativeSection['entrypoints']
    compatibility?: PluginCompatibility
    provides?: readonly string[]
  } = {}
  if (typeof section === 'object' && section !== null && !Array.isArray(section)) {
    const record = section as Record<string, unknown>
    if (typeof record.entrypoints === 'object' && record.entrypoints !== null && !Array.isArray(record.entrypoints)) {
      declarative.entrypoints = record.entrypoints as NonNullable<DeclarativeSection['entrypoints']>
    }
    if (typeof record.compatibility === 'object' && record.compatibility !== null && !Array.isArray(record.compatibility)) {
      const compat = record.compatibility as Record<string, unknown>
      const block: {
        requires?: PluginCompatibility['requires']
        depends?: PluginCompatibility['depends']
        breaks?: PluginCompatibility['breaks']
        recommends?: PluginCompatibility['recommends']
        suggests?: PluginCompatibility['suggests']
        conflicts?: PluginCompatibility['conflicts']
      } = {}
      if (typeof compat.requires === 'object' && compat.requires !== null && !Array.isArray(compat.requires)) {
        block.requires = compat.requires as NonNullable<PluginCompatibility['requires']>
      }
      if (typeof compat.depends === 'object' && compat.depends !== null && !Array.isArray(compat.depends)) {
        block.depends = compat.depends as NonNullable<PluginCompatibility['depends']>
      }
      if (typeof compat.breaks === 'object' && compat.breaks !== null && !Array.isArray(compat.breaks)) {
        block.breaks = compat.breaks as NonNullable<PluginCompatibility['breaks']>
      }
      if (typeof compat.recommends === 'object' && compat.recommends !== null && !Array.isArray(compat.recommends)) {
        block.recommends = compat.recommends as NonNullable<PluginCompatibility['recommends']>
      }
      if (typeof compat.suggests === 'object' && compat.suggests !== null && !Array.isArray(compat.suggests)) {
        block.suggests = compat.suggests as NonNullable<PluginCompatibility['suggests']>
      }
      if (typeof compat.conflicts === 'object' && compat.conflicts !== null && !Array.isArray(compat.conflicts)) {
        block.conflicts = compat.conflicts as NonNullable<PluginCompatibility['conflicts']>
      }
      if (Object.keys(block).length > 0) declarative.compatibility = block
    }
    if (Array.isArray(record.provides)) {
      const provides = record.provides.filter((entry): entry is string => typeof entry === 'string')
      if (provides.length > 0) declarative.provides = provides
    }
  }
  return {
    version: pkg.version,
    ...(Object.keys(declarative).length === 0 ? {} : { declarative: declarative as DeclarativeSection }),
  }
}

/** Build the manager-facing declaration from an InstallManifest's stored section. */
function toDeclaration(
  value: { readonly version?: string; readonly declarative?: DeclarativeSection } | undefined,
): RawPluginDeclaration | undefined {
  if (value === undefined) return undefined
  return {
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.declarative?.entrypoints === undefined
      ? {}
      : { entrypoints: value.declarative.entrypoints }),
    ...(value.declarative?.compatibility === undefined
      ? {}
      : { compatibility: value.declarative.compatibility }),
    ...(value.declarative?.provides === undefined
      ? {}
      : { provides: value.declarative.provides }),
  }
}

/** Copy a plugin directory, excluding node_modules/.git so deps resolve from the harness. */
async function copyPluginTree(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    filter: (candidate: string) => {
      const tail = candidate.slice(source.length)
      const parts = tail.split(sep).filter(part => part.length > 0)
      return !parts.includes('node_modules') && !parts.includes('.git')
    },
  })
}

/** mygo 体系运行包：安装目录 node_modules 链接的固定清单。 */
const MYGO_RUNTIME_PACKAGES = [
  '@r05en1cu/dsh-mygo',
  '@r05en1cu/dsh-mygo-api',
  '@r05en1cu/dsh-mygo-loader-profile',
  '@r05en1cu/dsh-mygo-loader-hub',
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
] as const

/**
 * Link the runtime packages an installed plugin needs into its node_modules.
 * P3 起不再假设 dsh checkout：链接对象 = 固定 mygo 体系包 ∪ 目标插件
 * package.json 声明的 dependencies，全部从面板自身模块解析链取真实目录
 * （workspace 链接或宿主安装均可）。解析失败的跳过（装载期以原始错误
 * fail loud）。
 */
async function ensureNodeModulesLink(target: string): Promise<void> {
  const require = createRequire(import.meta.url)
  const names = new Set<string>(MYGO_RUNTIME_PACKAGES)
  try {
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, unknown>>
    }
    for (const name of Object.keys(pkg.dependencies ?? {})) names.add(name)
  } catch {
    // 无 package.json 时只链固定清单
  }
  for (const name of names) {
    try {
      const pkgDir = dirname(require.resolve(`${name}/package.json`))
      const link = join(target, 'node_modules', name)
      await mkdir(dirname(link), { recursive: true })
      await symlink(pkgDir, link, 'dir')
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: string }).code !== 'EEXIST') {
        if ((error as { code?: string }).code !== 'MODULE_NOT_FOUND') throw error
      }
    }
  }
}

/** Find one workspace package directory under the dsh checkout by name. */
async function findWorkspacePackage(name: string): Promise<string | undefined> {
  if (CHECKOUT === undefined) return undefined
  const packagesRoot = join(CHECKOUT, 'packages')
  let groups: string[]
  try {
    groups = (await readdir(packagesRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return undefined
  }
  for (const group of groups) {
    const groupDir = join(packagesRoot, group)
    let entries: string[]
    try {
      entries = (await readdir(groupDir, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    } catch {
      continue
    }
    for (const entry of entries) {
      try {
        const pkg = JSON.parse(await readFile(join(groupDir, entry, 'package.json'), 'utf8')) as {
          readonly name?: unknown
        }
        if (pkg.name === name) return join(groupDir, entry)
      } catch {
        // not a package directory
      }
    }
  }
  return undefined
}

/**
 * Link `@deepseek-ai/*` runtime dependencies into a real node_modules so they
 * resolve to the dsh checkout instead of npm (these packages are not
 * published). Idempotent: npm may prune or replace the links during install,
 * so callers re-run this after `npm install`.
 */
async function linkWorkspaceDependencies(target: string, dependencies: Record<string, string>): Promise<void> {
  const scopeDir = join(target, 'node_modules', '@deepseek-ai')
  for (const name of Object.keys(dependencies)) {
    if (!name.startsWith('@deepseek-ai/')) continue
    const workspace = await findWorkspacePackage(name)
    if (workspace === undefined) continue
    await mkdir(scopeDir, { recursive: true })
    const link = join(scopeDir, name.slice(name.lastIndexOf('/') + 1))
    try {
      await symlink(workspace, link, 'dir')
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: string }).code !== 'EEXIST') {
        throw error
      }
    }
  }
}

/** Runtime `dependencies` declared by one plugin root (not devDependencies). */
async function runtimeDependenciesOf(root: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      readonly dependencies?: Record<string, string>
    }
    return pkg.dependencies ?? {}
  } catch {
    return {}
  }
}

/** Every declared dependency surface (deps + peers + devDeps) of one plugin root. */
async function allDependenciesOf(root: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      readonly dependencies?: Record<string, string>
      readonly peerDependencies?: Record<string, string>
      readonly devDependencies?: Record<string, string>
    }
    return { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies }
  } catch {
    return {}
  }
}

/**
 * The declared browser client half of one plugin root: the `exports['./client']`
 * target when the package also declares `dsh.client.platform === 'web'`
 * (0810+) or the legacy `dshClient.platform === 'web'` (0809).
 */
async function clientTargetOf(root: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      readonly dshClient?: { readonly platform?: string }
      readonly dsh?: { readonly client?: { readonly platform?: string } }
      readonly exports?: Record<string, { readonly default?: string } | string>
    }
    const clientExport = pkg.exports?.['./client']
    const target = typeof clientExport === 'string' ? clientExport : clientExport?.default
    if (typeof target !== 'string' || target.length === 0) return undefined
    const platform = pkg.dsh?.client?.platform ?? pkg.dshClient?.platform
    if (platform !== 'web') return undefined
    return target
  } catch {
    return undefined
  }
}

/** Whether `path` exists and is a regular file. */
async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** 配置卡片基础设施（r6）：schema 内省/模板/bundle 行 id/配置导入导出（见 config-cards.ts）。 */
import {
  buildConfigExport,
  bundleRowIdOf,
  configSchemaInfoOf,
  configSchemaTemplateOf,
  CONFIG_EXPORT_FORMAT,
  mergeSecretConfigWrite,
  parseConfigImport,
  partitionImportTargets,
  redactSecretConfig,
  resolveConfigSchema,
  type ConfigFieldInfo,
  type ConfigSchemaInfo,
  type ConfigSchemaLike,
} from './config-cards.js'

/** Read the declared Config schema of one plugin root by importing its entry. */
async function readConfigSchemaInfo(root: string): Promise<ConfigSchemaInfo | undefined> {
  let entry: string
  try {
    entry = await (await isRepositoryPluginPackage(root) ? resolveEntryDeclared(root) : resolveEntry(root))
  } catch {
    return undefined
  }
  let raw: unknown
  try {
    raw = await importEntry(entry, true)
  } catch {
    return undefined
  }
  const Config = (raw as { Config?: unknown } | undefined)?.Config
  if (typeof Config !== 'function') return undefined
  return configSchemaInfoOf(Config as ConfigSchemaLike)
}

// ---------------------------------------------------------------------------
// r6：配置注入（webui 插件页）的后端面——卡片枚举 / 读写 / 导入导出
// ---------------------------------------------------------------------------

/** 一张配置卡片（config-cards API 的返回单元）。 */
interface ConfigCardInfo {
  readonly id: string
  readonly kind: 'bridge' | 'bundle'
  /** bundle 行的 patch 行 id（config 写入目标；bridge 同 id）。 */
  readonly rowId: string
  readonly packageName: string
  readonly schema: ConfigSchemaInfo
  readonly config: unknown
  readonly revision: number
  readonly enabled: boolean
}

async function firstExisting(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await fileExists(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

/**
 * 枚举有 Config schema 的受管插件卡片：bridge 轨（面板安装目录，schema
 * 经 fresh import 读 Config 导出）+ bundle 轨（profile bundle 成员，包目
 * 录经 profile node_modules/兜底链解析，行 id 取 bundle patch 首个 insert
 * 行）。无 Config 的插件静默跳过（不出卡片不报错）。
 */
async function collectConfigCards(ctx: PanelContext): Promise<readonly ConfigCardInfo[]> {
  const out: ConfigCardInfo[] = []
  const managerPlugins = new Map(ctx.pluginManager.plugins().map(plugin => [plugin.id, plugin] as const))
  // bridge 轨
  let dirNames: string[] = []
  try {
    dirNames = (await readdir(INSTALL_DIR, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    dirNames = []
  }
  for (const dirName of dirNames) {
    if (dirName.endsWith('-mygo') || dirName.startsWith('.')) continue
    try {
      const manifest = JSON.parse(await readFile(join(INSTALL_DIR, dirName, MANIFEST), 'utf8')) as InstallManifest
      const schema = await readConfigSchemaInfo(join(INSTALL_DIR, dirName))
      if (schema === undefined) continue
      const current = ctx.pluginManager.configOf(manifest.id) ?? manifest.config ?? {}
      const redacted = redactSecretConfig(schema.fields, current)
      out.push({
        id: manifest.id,
        kind: 'bridge',
        rowId: manifest.id,
        packageName: bridgeNameOf(manifest.id),
        schema: { ...schema, fields: redacted.fields },
        config: redacted.config,
        revision: ctx.pluginManager.configRevisionOf(manifest.id) ?? 0,
        enabled: managerPlugins.get(manifest.id)?.status === 'enabled',
      })
    } catch {
      // 读取失败的安装物：跳过（rc.3 同口径 fail-soft）
    }
  }
  // bundle 轨
  const profileDir = join(HOME_ROOT, 'profiles', panelProfile())
  for (const member of ctx.pluginManager.bundleList()) {
    const packageName = member.packageName ?? member.id
    const dir = await firstExisting([
      join(profileDir, 'node_modules', packageName),
      join(HOME_ROOT, 'profiles', 'node_modules', packageName),
    ])
    if (dir === undefined) continue
    const schema = await readConfigSchemaInfo(dir)
    if (schema === undefined) continue
    let rowId = member.id
    try {
      rowId = bundleRowIdOf(await readFile(join(dir, 'cordis.patch.yml'), 'utf8')) ?? member.id
    } catch {
      // bundle 无 patch 文件：回退成员 id
    }
    const current = readRowConfig(HOME_ROOT, panelProfile(), rowId)
    const revisionState = readRowConfigRevision(HOME_ROOT, panelProfile(), rowId)
    const redacted = redactSecretConfig(schema.fields, current.ok ? current.config : {})
    out.push({
      id: member.id,
      kind: 'bundle',
      rowId,
      packageName,
      schema: { ...schema, fields: redacted.fields },
      config: redacted.config,
      revision: revisionState.ok ? revisionState.revision : 0,
      enabled: member.enabled,
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** 单个 config 读取（bridge → configOf；bundle → patch 行）。 */
async function readPluginConfig(ctx: PanelContext, id: string, kind: string, rowId?: string): Promise<unknown> {
  if (kind === 'bridge') return ctx.pluginManager.configOf(id) ?? {}
  const result = readRowConfig(HOME_ROOT, panelProfile(), rowId ?? id)
  return result.ok ? result.config : {}
}

/** 单个 config revision 读取（bridge → 引擎；bundle → patch 行）。 */
function readPluginConfigRevision(ctx: PanelContext, id: string, kind: string, rowId?: string): number {
  if (kind === 'bridge') return ctx.pluginManager.configRevisionOf(id) ?? 0
  const result = readRowConfigRevision(HOME_ROOT, panelProfile(), rowId ?? id)
  return result.ok ? result.revision : 0
}

/** 从 PluginError 中取 config-revision-conflict 事实。 */
function configConflictOf(error: unknown): { readonly expected: number; readonly actual: number } | undefined {
  const candidate = error as { readonly code?: unknown; readonly details?: unknown }
  if (candidate.code !== 'config-revision-conflict') return undefined
  const details = candidate.details as { readonly expected?: unknown; readonly actual?: unknown } | undefined
  if (typeof details?.expected !== 'number' || typeof details.actual !== 'number') return undefined
  return { expected: details.expected, actual: details.actual }
}

/** bundle 行 id 推导（写路径）：bundle patch 首个 insert 行，回退成员 id。 */
async function rowIdOfBundleMember(id: string, packageName?: string, profile: string = panelProfile()): Promise<string> {
  const dir = await firstExisting([
    join(HOME_ROOT, 'profiles', profile, 'node_modules', packageName ?? id),
    join(HOME_ROOT, 'profiles', 'node_modules', packageName ?? id),
  ])
  if (dir !== undefined) {
    try {
      return bundleRowIdOf(await readFile(join(dir, 'cordis.patch.yml'), 'utf8')) ?? id
    } catch {
      // fallback
    }
  }
  return id
}

/** 导出整 profile 用户层 config（patch 全部行的 config 快照）。 */
async function exportProfileConfigs(): Promise<Record<string, Record<string, unknown>>> {
  const text = readProfilePatchText(HOME_ROOT, panelProfile())
  const out: Record<string, Record<string, unknown>> = {}
  for (const id of listPatchRowIds(text)) {
    const result = readRowConfig(HOME_ROOT, panelProfile(), id)
    if (result.ok && result.config !== undefined) out[id] = result.config
  }
  return out
}

/** Deep-merge one example object into a template, touching schema-known keys only. */
function mergeKnownConfigKeys(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue
    const current = target[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)
      && typeof current === 'object' && current !== null && !Array.isArray(current)) {
      mergeKnownConfigKeys(current as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}

/** Bounded scan for JSON config examples inside one plugin root. */
async function findConfigJsonExamples(root: string): Promise<unknown[]> {
  const out: unknown[] = []
  const scan = async (dir: string, depth: number): Promise<void> => {
    if (depth > 2) return
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      if (entry.isDirectory()) {
        await scan(join(dir, entry.name), depth + 1)
      } else if (entry.isFile() && /(?:^|[.-])config[^/]*\.json$/i.test(entry.name)) {
        try {
          const parsed = JSON.parse(await readFile(join(dir, entry.name), 'utf8'))
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) out.push(parsed)
        } catch {
          // unreadable example: skip
        }
      }
    }
  }
  await scan(root, 0)
  return out
}

/** Build the starter config for one plugin root: schema template + JSON examples, schema-validated. */
async function buildConfigTemplate(root: string): Promise<ConfigSchemaInfo | undefined> {
  const info = await readConfigSchemaInfo(root)
  if (info === undefined) return undefined
  const template = info.template as Record<string, unknown>
  for (const example of await findConfigJsonExamples(root)) {
    mergeKnownConfigKeys(template, example as Record<string, unknown>)
  }
  // The schema is callable: validate the merged template and keep its
  // normalized form; on failure fall back to the plain schema template.
  try {
    const raw = await (async () => {
      let entry: string
      try {
        entry = await (await isRepositoryPluginPackage(root) ? resolveEntryDeclared(root) : resolveEntry(root))
      } catch {
        return undefined
      }
      const module = await importEntry(entry, true)
      return (module as { Config?: unknown }).Config
    })()
    if (typeof raw === 'function') {
      const normalized = (raw as (value: unknown) => unknown)(template)
      if (typeof normalized === 'object' && normalized !== null && !Array.isArray(normalized)) {
        return { ...info, template: normalized }
      }
    }
  } catch {
    // keep the un-normalized template
  }
  return info
}

/** Build-time env: expose the dsh checkout and its toolchain on PATH. */
function buildEnv(): NodeJS.ProcessEnv {
  if (CHECKOUT === undefined) return { ...process.env }
  return {
    ...process.env,
    DSH_CHECKOUT: CHECKOUT,
    PATH: `${join(CHECKOUT, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`,
  }
}

/** Link one package found under the pnpm store into the target node_modules. */
async function linkStorePackage(
  target: string,
  storePrefix: string,
  storeSubPath: string,
  linkPath: string,
): Promise<void> {
  if (CHECKOUT === undefined) return
  const store = join(CHECKOUT, 'node_modules', '.pnpm')
  let entries: string[]
  try {
    entries = await readdir(store)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.startsWith(storePrefix)) continue
    const source = join(store, entry, 'node_modules', storeSubPath)
    try {
      if (!(await stat(source)).isDirectory()) continue
    } catch {
      continue
    }
    await mkdir(dirname(join(target, linkPath)), { recursive: true })
    try {
      await symlink(source, join(target, linkPath), 'dir')
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: string }).code !== 'EEXIST') {
        throw error
      }
    }
    return
  }
}

/**
 * Link build-time framework packages from the checkout into a real
 * node_modules: vendored cordis/schemastery, react/react-dom, and the
 * type packages tsc needs. Runtime singleton identity is unaffected — the
 * host owns those instances; these links only let the plugin's build run.
 */
async function linkFrameworkDependencies(target: string): Promise<void> {
  if (CHECKOUT === undefined) return
  const flat = join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules')
  for (const name of ['cordis', 'schemastery']) {
    const source = join(flat, name)
    try {
      if (!(await stat(source)).isDirectory()) continue
      await symlink(source, join(target, 'node_modules', name), 'dir')
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: string }).code !== 'EEXIST') {
        throw error
      }
    }
  }
  await linkStorePackage(target, 'react@', 'react', 'node_modules/react')
  await linkStorePackage(target, 'react-dom@', 'react-dom', 'node_modules/react-dom')
  await linkStorePackage(target, '@types+react@', '@types/react', 'node_modules/@types/react')
  const typesFlat = join(flat, '@types')
  try {
    if ((await stat(typesFlat)).isDirectory()) {
      await symlink(typesFlat, join(target, 'node_modules', '@types'), 'dir')
    }
  } catch (error) {
    if (!(error instanceof Error) || (error as { code?: string }).code !== 'EEXIST') {
      throw error
    }
  }
}

/** Bounded scan for nested package.json manifests (old monorepo-style repos). */
async function findNestedPackageManifests(
  tree: string,
  maxDepth = 4,
): Promise<Array<{
  readonly dir: string
  readonly pkg: {
    readonly name?: unknown
    readonly private?: unknown
    readonly devDependencies?: Record<string, unknown>
  }
}>> {
  const found: Array<{
    readonly dir: string
    readonly pkg: {
      readonly name?: unknown
      readonly private?: unknown
      readonly devDependencies?: Record<string, unknown>
    }
  }> = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        await walk(join(dir, entry.name), depth + 1)
      } else if (entry.isFile() && entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
            readonly name?: unknown
            readonly private?: unknown
            readonly devDependencies?: Record<string, unknown>
          }
          found.push({ dir, pkg })
        } catch {
          // unreadable manifest: skip
        }
      }
    }
  }
  await walk(tree, 1)
  return found
}

/**
 * Detect an old (0804/0805-era) dsh workspace plugin: a nested private
 * `@deepseek-ai/dsh-*` package whose devDependencies use the pnpm
 * `workspace:` protocol. Such plugins must live inside the dsh monorepo and
 * often ship a core UI patch; the panel deliberately does not support them.
 */
async function detectOldWorkspacePlugin(tree: string): Promise<string | undefined> {
  const manifests = await findNestedPackageManifests(tree)
  for (const { dir, pkg } of manifests) {
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@deepseek-ai/dsh-')) continue
    const devDependencies = pkg.devDependencies ?? {}
    const hasWorkspaceProtocol = Object.values(devDependencies)
      .some(spec => typeof spec === 'string' && spec.startsWith('workspace:'))
    if (pkg.private === true && hasWorkspaceProtocol) {
      return `仓库包含旧版 dsh 工作区插件 ${pkg.name}（${dir}）：`
        + '这是 0804/0805 时代需要放进 dsh 源码仓库并打补丁的 monorepo 插件，版本过老，'
        + '面板不支持直接安装。请改用作者提供的新版独立包，或按仓库 README 的官方方式安装。'
    }
  }
  return undefined
}

/**
 * Run one install command against a manifest stripped of pnpm `link:` specs
 * (npm rejects those protocols outright), restoring the original manifest
 * afterwards. The linked workspace packages are provided by the panel's own
 * symlinks, so the entries are only a build-time convenience for pnpm.
 */
async function withInstallableManifest(
  target: string,
  run: () => Promise<unknown>,
  injectFramework = false,
): Promise<void> {
  const manifestPath = join(target, 'package.json')
  let original: string
  try {
    original = await readFile(manifestPath, 'utf8')
  } catch {
    await run()
    return
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(original) as Record<string, unknown>
  } catch {
    await run()
    return
  }
  let changed = false
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field]
    if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) continue
    const entries = Object.entries(deps as Record<string, unknown>)
    // Drop `link:`/`workspace:` specs always。源码模式下还要丢弃
    // `@deepseek-ai/*`（由 checkout workspace 链接提供）；npm 模式下这些包
    // 已在私仓发布，保留给 npm install。
    const kept = entries.filter(([name, spec]) => {
      if (typeof spec === 'string' && (spec.startsWith('link:') || spec.startsWith('workspace:'))) return false
      if (SOURCE_MODE && name.startsWith('@deepseek-ai/')) return false
      return true
    })
    if (kept.length === entries.length) continue
    pkg[field] = Object.fromEntries(kept)
    changed = true
  }
  if (!changed && !injectFramework) {
    await run()
    return
  }
  if (injectFramework) {
    // Build-time tsc needs vendored framework types (cordis/schemastery) that
    // are usually peer-only and skipped by --legacy-peer-deps. Declaring them
    // as `file:` deps makes npm keep them for the duration of the install, so
    // a `prepare` script running mid-install can resolve the types.
    const dependencies = (pkg.dependencies ?? {}) as Record<string, string>
    if (CHECKOUT !== undefined) {
      for (const name of ['cordis', 'schemastery']) {
        if (dependencies[name] !== undefined) continue
        dependencies[name] = `file:${join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules', name)}`
      }
    }
    pkg.dependencies = dependencies
  }
  await writeFile(manifestPath, JSON.stringify(pkg, null, 2))
  try {
    await run()
  } finally {
    await writeFile(manifestPath, original)
  }
}

/**
 * Install the plugin's runtime dependencies into a REAL node_modules inside
 * the installed directory, and when the plugin declares a browser client
 * half whose artifact the repository does not ship, build it with the
 * repository's own `npm run build` (devDependencies installed, checkout
 * toolchain on PATH). The harness symlink is replaced because npm must be
 * able to write; `@deepseek-ai/*` workspace deps are linked from the checkout
 * before and after the install so private packages never hit npm.
 */
async function installRuntimeDependencies(
  target: string,
  dependencies: Record<string, string>,
  allDependencies: Record<string, string>,
  buildClientTarget?: string,
  options: { readonly ignoreScripts?: boolean; readonly buildTarget?: string } = {},
): Promise<void> {
  const commandErrorText = (error: unknown): string => {
    if (error instanceof Error) {
      const detail = (error as { stderr?: unknown }).stderr
      return typeof detail === 'string' && detail !== '' ? `${error.message}\n${detail}` : error.message
    }
    return String(error)
  }
  const link = join(target, 'node_modules')
  await rm(link, { force: true, recursive: true })
  await mkdir(link, { recursive: true })
  await linkWorkspaceDependencies(target, allDependencies)
  const probe = options.buildTarget ?? buildClientTarget
  if (probe === undefined) {
    await withInstallableManifest(
      target,
      () => execFileAsync(
        'npm',
        [
          'install',
          '--omit=dev',
          '--no-audit',
          '--no-fund',
          '--legacy-peer-deps',
          ...(options.ignoreScripts === true ? ['--ignore-scripts'] : []),
        ],
        { cwd: target, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 },
      ),
    )
    await linkWorkspaceDependencies(target, allDependencies)
    return
  }
  // Full install (devDependencies included) so the repo's own build can run;
  // legacy-peer-deps keeps npm from fetching the unpublished dsh packages.
    await withInstallableManifest(
      target,
      () => execFileAsync(
        'npm',
        [
          'install',
          '--no-audit',
          '--no-fund',
          '--legacy-peer-deps',
          ...(options.ignoreScripts === true ? ['--ignore-scripts'] : []),
        ],
        { cwd: target, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 },
      ),
      true,
    )
  await linkWorkspaceDependencies(target, allDependencies)
  await linkFrameworkDependencies(target)
  // Some repositories build during `npm install` via their `prepare` script
  // (the git-install path), so the artifact may already exist. Only run the
  // declared build when it does not, falling back to `prepare` for repos
  // whose `build` assumes a sibling harness checkout.
  const probeMissing = !(await fileExists(join(target, probe)))
  const clientMissing = buildClientTarget !== undefined && !(await fileExists(join(target, buildClientTarget)))
  if (probeMissing || clientMissing) {
    try {
      await execFileAsync(
        'npm',
        ['run', 'build'],
        { cwd: target, timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: buildEnv() },
      )
    } catch (buildError) {
      if (options.ignoreScripts === true) {
        // Official `.dsh-plugin` packages run `dsh-plugin-prepare` in
        // `prepare`/`prepack`; that helper is a devDependency we do not
        // install, so the declared build is the only valid fallback.
        throw new Error(`构建失败（npm run build: ${commandErrorText(buildError)}）`)
      }
      await execFileAsync(
        'npm',
        ['run', 'prepare'],
        { cwd: target, timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: buildEnv() },
      ).catch((prepareError: unknown) => {
        throw new Error(
          `构建失败（npm run build: ${commandErrorText(buildError)}；npm run prepare: ${commandErrorText(prepareError)}）`,
        )
      })
    }
  }
  await linkWorkspaceDependencies(target, allDependencies)
  if (options.ignoreScripts === true && !(await fileExists(join(target, probe)))) {
    throw new Error(`构建完成但插件入口产物缺失: ${probe}`)
  }
  if (buildClientTarget !== undefined && !(await fileExists(join(target, buildClientTarget)))) {
    throw new Error(`构建完成但 client half 产物缺失: ${buildClientTarget}`)
  }
}

/** Locate the plugin root after clone/extract: the tree itself, or its single inner directory. */
async function locatePluginRoot(tree: string): Promise<string> {
  try {
    await resolveEntry(tree)
    return tree
  } catch {
    // Official repository-plugin format: the actual package lives in the
    // `.dsh-plugin` subdirectory and may ship source only (`dsh.entry` is
    // the declared build target), so accept the manifest even without lib.
    const official = join(tree, '.dsh-plugin')
    if (await isRepositoryPluginPackage(official)) return official
    const entries = (await readdir(tree, { withFileTypes: true })).filter(entry => entry.isDirectory())
    if (entries.length === 1) {
      const inner = join(tree, entries[0]!.name)
      try {
        await resolveEntry(inner)
        return inner
      } catch {
        const innerOfficial = join(inner, '.dsh-plugin')
        if (await isRepositoryPluginPackage(innerOfficial)) return innerOfficial
      }
    }
    const unsupported = await detectOldWorkspacePlugin(tree)
    if (unsupported !== undefined) throw new Error(unsupported)
    throw new Error('未找到插件入口（package.json main / lib/index.js / src/index.ts）')
  }
}

/**
 * Generate the projected bridge package for one installed plugin and link it
 * into the checkout's node_modules scope so the web loader can resolve it.
 * The bridge node half re-adopts through mygo; the bridge client half serves
 * the plugin's browser bundle with the embedded module id rewritten.
 */
async function ensureProjectedBridge(manifest: InstallManifest): Promise<void> {
  const pluginDir = join(INSTALL_DIR, manifest.id)
  const bridgeDir = bridgeDirOf(manifest.id)
  const bridgeName = bridgeNameOf(manifest.id)
  await mkdir(bridgeDir, { recursive: true })
  await mkdir(join(bridgeDir, 'src'), { recursive: true })

  const pluginPkg = JSON.parse(await readFile(join(pluginDir, 'package.json'), 'utf8')) as {
    readonly name?: unknown
    readonly dshClient?: { readonly inject?: readonly string[]; readonly platform?: string }
    readonly dsh?: { readonly client?: { readonly inject?: readonly string[]; readonly platform?: string } }
    readonly exports?: Record<string, { readonly default?: string } | string>
  }
  const originalName = typeof pluginPkg.name === 'string' ? pluginPkg.name : bridgeName
  const clientTarget = await clientTargetOf(pluginDir)
  const declaredClientInject = pluginPkg.dsh?.client?.inject ?? pluginPkg.dshClient?.inject ?? []
  let completedClientInject: readonly string[] = declaredClientInject
  if (clientTarget !== undefined) {
    try {
      const clientText = await readFile(join(pluginDir, clientTarget), 'utf8')
      const extra = clientServicePackagesOf(clientText)
      if (extra.length > 0) completedClientInject = [...new Set([...declaredClientInject, ...extra])]
    } catch {
      // unreadable client bundle: keep the declared edges
    }
  }

  const bridgePackage = {
    name: bridgeName,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'src/index.ts',
    exports: {
      '.': './src/index.ts',
      ...(clientTarget !== undefined ? { './client': './lib/client.js' } : {}),
      './package.json': './package.json',
    },
    ...(clientTarget !== undefined
      ? {
          // 0809 roster reads dshClient; 0810 ClientModuleHost reads dsh.client.
          dshClient: { platform: 'web' as const, inject: completedClientInject },
          dsh: { client: { platform: 'web' as const, inject: completedClientInject } },
        }
      : {}),
  }
  await writeFile(join(bridgeDir, 'package.json'), JSON.stringify(bridgePackage, null, 2))

  const rawDeclaration = toDeclaration(manifest)
  const declarationLiteral = rawDeclaration === undefined
    ? 'undefined'
    : JSON.stringify(rawDeclaration)
  const bridgeSource = `/**
 * Generated dsh-mygo bridge for installed plugin ${manifest.id} (do not edit).
 * bridge template v3: host-service retry + stale-install recovery.
 */
import type { PluginManager } from '@r05en1cu/dsh-mygo'

export const name = ${JSON.stringify(`${manifest.id}-mygo`)}
export const inject = ['pluginManager']

const DECLARATION = ${declarationLiteral}
const MAX_SUPPORT_TRIES = 5

export function apply(ctx: { readonly pluginManager: PluginManager }, config: unknown): void {
  void (async () => {
    let rawModule: unknown
    try {
      rawModule = await import('../../${manifest.id}/${manifest.entry}')
    } catch (error: unknown) {
      console.error('[dsh-mygo-panel] 插件 ${manifest.id} 导入失败，跳过挂载:', error instanceof Error ? error.message : String(error))
      return
    }
    const raw = (rawModule as { default?: unknown }).default ?? rawModule
    let support = await ctx.pluginManager.checkSupport(raw, ${JSON.stringify(manifest.id)}, DECLARATION)
    // Boot order may mount a required plugin or host service after this row
    // (alphabetical row order vs declared requires; async host services such
    // as 'workspace' finish activation later): retry a short window before
    // skipping, so a dependency arriving later in the same boot still lands.
    let attempt = 1
    while (!support.ok && attempt < MAX_SUPPORT_TRIES
      && (String(support.reason).includes('兼容性冲突') || String(support.reason).includes('宿主缺少服务'))) {
      await new Promise(resolve => setTimeout(resolve, 500))
      support = await ctx.pluginManager.checkSupport(raw, ${JSON.stringify(manifest.id)}, DECLARATION)
      attempt += 1
    }
    if (!support.ok) {
      console.warn('[dsh-mygo-panel] 插件 ${manifest.id} 不受支持，跳过挂载:', support.reason)
      return
    }
    await ctx.pluginManager.adoptRaw(raw, config ?? {}, ${JSON.stringify(manifest.id)}, DECLARATION)
  })().catch((error: unknown) => {
    console.error('[dsh-mygo-panel] bridge adopt failed:', error)
  })
}
`
  await writeFile(join(bridgeDir, 'src', 'index.ts'), bridgeSource)

  if (clientTarget !== undefined) {
    const sourceClient = join(pluginDir, clientTarget)
    const sourceMap = `${sourceClient}.map`
    await mkdir(join(bridgeDir, 'lib'), { recursive: true })
    let clientText = await readFile(sourceClient, 'utf8')
    // Strip the sourceMappingURL comment: appending the gate after it would
    // comment out the gate (a line comment runs to the end of the line).
    clientText = clientText.replace(/\/\/# sourceMappingURL=.*$/m, '')
    // Keep the original bundle's registration id (raw id) and append a
    // mygo status gate that registers the BRIDGE id: the gate materializes
    // the original factory and applies it only while the managed plugin is
    // enabled. This makes a disabled plugin's browser half stop on reload
    // (the browser side of sfw/ads-style plugins has no node-side dispatch
    // gate and previously kept running off its local default config).
    // The bundle registers under its own id: package name on 0809-era
    // bundles, absolute package path on 0810-era bundles (gen-config writes
    // the absolute path so Loader and client-modules resolve independently).
    // The gate must require the ACTUAL registered id, not the package name.
    const registeredId = /__ModuleLoader__\.load\(\s*\{\s*id:\s*"([^"]+)"/.exec(clientText)?.[1]
    const rawId = JSON.stringify(registeredId ?? originalName)
    const bridgeId = JSON.stringify(bridgeName)
    const pluginId = JSON.stringify(manifest.id)
    const gate = `
;(function () {
  /* mygo-generated status gate v2 (do not edit) */
  var rawId = ${rawId}
  var bridgeId = ${bridgeId}
  var pluginId = ${pluginId}
  var enabled = true
  try {
    var xhr = new XMLHttpRequest()
    xhr.open('GET', '/api/mygo/plugins?t=' + Date.now(), false)
    xhr.send(null)
    if (xhr.status >= 200 && xhr.status < 300) {
      var data = JSON.parse(xhr.responseText)
      var row = (data.plugins || []).filter(function (p) { return p.id === pluginId })[0]
      if (row) enabled = row.status === 'enabled'
    }
  } catch (e) {
    enabled = true
  }
  window.__ModuleLoader__.load({
    id: bridgeId,
    factory: function (require) {
      var raw = require(rawId)
      return {
        name: raw.name || pluginId,
        inject: raw.inject,
        apply: function (ctx) {
          if (!enabled) return
          return raw.apply(ctx)
        }
      }
    }
  })
})();
`
    await writeFile(join(bridgeDir, 'lib', 'client.js'), clientText + gate)
    try {
      await copyFile(sourceMap, join(bridgeDir, 'lib', 'client.js.map'))
    } catch {
      // source map is optional
    }
  }

  // Project into the active profile's node_modules (npm-native). 源码模式
  // 下额外投影到 checkout，兼容旧布局；npm 布局不写 dsh 安装目录。
  if (CHECKOUT !== undefined) {
    const scopeDir = join(CHECKOUT, 'node_modules', '@r05en1cu')
    await mkdir(scopeDir, { recursive: true })
    const link = join(scopeDir, `${manifest.id}-mygo`)
    await rm(link, { force: true, recursive: false })
    await symlink(bridgeDir, link, 'dir')
  }
  const profileScope = join(HOME_ROOT, 'profiles', panelProfile(), 'node_modules', '@r05en1cu')
  await mkdir(profileScope, { recursive: true })
  const profileLink = join(profileScope, `${manifest.id}-mygo`)
  await rm(profileLink, { force: true, recursive: false })
  await symlink(bridgeDir, profileLink, 'dir')
}

/** Remove a projected bridge: package dir, checkout link, and generated files. */
async function removeProjectedBridge(id: string): Promise<void> {
  await rm(bridgeDirOf(id), { recursive: true, force: true })
  if (CHECKOUT !== undefined) {
    await rm(join(CHECKOUT, 'node_modules', '@r05en1cu', `${id}-mygo`), { force: true, recursive: false })
  }
  await rm(join(HOME_ROOT, 'profiles', panelProfile(), 'node_modules', '@r05en1cu', `${id}-mygo`), {
    force: true,
    recursive: false,
  })
}

/**
 * Remove the `mygo-rdb-store` composition row from the profile patch. Called
 * when the owning extension (mygo-rdb) is uninstalled: without the store
 * provider row, the manager automatically falls back to the built-in sqlite
 * registry route on the next boot.
 */
async function removeStoreProviderRows(): Promise<void> {
  let text = ''
  try {
    text = await readFile(profilePatchPath(), 'utf8')
  } catch {
    return
  }
  const lines = text.split('\n')
  const out: string[] = []
  let inEntry = false
  for (const line of lines) {
    if (!inEntry && /^\s*- id:\s+mygo-rdb-store\s*$/.test(line)) {
      inEntry = true
      continue
    }
    if (inEntry) {
      // Entry body is indented deeper than the sibling `- id:` rows; stop at
      // the next sibling row or any top-level line.
      if (/^    - id:/.test(line) || /^[^\s]/.test(line)) inEntry = false
      else continue
    }
    out.push(line)
  }
  const next = out.join('\n')
  if (next !== text) await writeFile(profilePatchPath(), next)
}

/** One profile bridge row plus the ordering facts needed for dependency-first layout. */
interface BridgeRow {
  readonly id: string
  readonly name: string
  readonly config: unknown
  readonly installedAt: number
  /** Declared `compatibility.requires` keys that name other installed plugins. */
  readonly requires: readonly string[]
}

/**
 * Collect bridge rows from every installed plugin with a generated bridge.
 * When `liveConfigs` is provided, a plugin's current manager config wins
 * over the install-time manifest config, so hot-config updates survive a
 * restart (the row is the boot-time authority).
 */
async function collectBridgeRows(
  liveConfigs?: Readonly<Record<string, unknown>>,
): Promise<BridgeRow[]> {
  let ids: string[]
  try {
    ids = (await readdir(INSTALL_DIR, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
  const rows: BridgeRow[] = []
  for (const dirName of ids) {
    if (dirName.endsWith('-mygo')) continue
    try {
      const manifest = JSON.parse(await readFile(join(INSTALL_DIR, dirName, MANIFEST), 'utf8')) as InstallManifest
      const bridgePkg = join(bridgeDirOf(manifest.id), 'package.json')
      await stat(bridgePkg)
      rows.push({
        id: `${manifest.id}-mygo`,
        name: bridgeNameOf(manifest.id),
        config: liveConfigs?.[manifest.id] ?? manifest.config ?? {},
        installedAt: manifest.installedAt ?? 0,
        requires: Object.keys(manifest.declarative?.compatibility?.requires ?? {}),
      })
    } catch {
      // no manifest or no bridge: skip
    }
  }
  return orderBridgeRows(rows)
}

/**
 * Dependency-first bridge-row layout: a plugin declaring
 * `compatibility.requires` on another installed plugin must mount after it,
 * so boot-time `checkSupport` sees the dependency. Pure topo sort over the
 * declared requires; cycles and unknown targets fall back to install order,
 * and the generated bridge additionally retries a short window as a safety
 * net for indirect ordering gaps.
 */
function orderBridgeRows(rows: BridgeRow[]): BridgeRow[] {
  if (rows.length < 2) return rows
  const byId = new Map(rows.map(row => [row.id, row]))
  const pending = new Map(rows.map(row => [
    row.id,
    new Set(row.requires.filter(target => byId.has(`${target}-mygo`))),
  ]))
  const byInstalledThenId = (left: BridgeRow, right: BridgeRow): number => {
    if (left.installedAt !== right.installedAt) return left.installedAt - right.installedAt
    return left.id.localeCompare(right.id)
  }
  const ordered: BridgeRow[] = []
  const ready = rows
    .filter(row => (pending.get(row.id)?.size ?? 0) === 0)
    .sort(byInstalledThenId)
  while (ready.length > 0) {
    const row = ready.shift() as BridgeRow
    ordered.push(row)
    for (const other of rows) {
      const deps = pending.get(other.id)
      if (deps === undefined || !deps.has(row.id)) continue
      deps.delete(row.id)
      if (deps.size === 0) {
        ready.push(other)
        ready.sort(byInstalledThenId)
      }
    }
  }
  const remaining = rows.filter(row => !ordered.includes(row)).sort(byInstalledThenId)
  return [...ordered, ...remaining]
}

/** Rewrite the web profile patch, preserving any user content before the managed block. */
async function syncBridgeRows(
  liveConfigs?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const rows = await collectBridgeRows(liveConfigs)
  const profileDir = join(HOME_ROOT, 'profiles', panelProfile())
  // rc.3 升级路径安全加固：不可解析的桥接行（陈旧安装物/失效 scope/链接
  // 缺失）跳过 + 一次性告警，绝不写出会让 boot fail-loud 的行。
  const kept = filterResolvableRows(
    rows,
    name => isBridgeRowResolvable(profileDir, HOME_ROOT, name),
    row => warnStaleOnce(
      row.id,
      `[dsh-mygo-panel] 桥接包 ${row.name} 在 profile ${panelProfile()} 不可解析（陈旧安装物），`
      + `已跳过该桥接行（boot 安全）；清理建议：检查 ${INSTALL_DIR} 下对应目录，`
      + '确认废弃后可删除该目录与桥接目录',
    ),
  )
  let existing = ''
  try {
    existing = await readFile(profilePatchPath(), 'utf8')
  } catch {
    existing = ''
  }
  const next = buildProfilePatchText(existing, kept)
  if (next === existing) return
  await mkdir(dirname(profilePatchPath()), { recursive: true })
  await writeFile(profilePatchPath(), next)
}

/** 陈旧条目一次性告警（同进程同 id 只报一次）。 */
const warnedStale = new Set<string>()
function warnStaleOnce(id: string, message: string): void {
  if (warnedStale.has(id)) return
  warnedStale.add(id)
  console.warn(message)
}

/**
 * One-time bridge template upgrade: rewrite any installed bridge that still
 * uses the old static-import template with the guarded dynamic-import +
 * checkSupport version. A broken old bridge could abort the whole plugin
 * tree before the panel ever runs; this runs at panel mount so healthy
 * installs converge to the guarded template on the next boot.
 */
async function regenerateBridges(): Promise<void> {
  let ids: string[]
  try {
    ids = (await readdir(INSTALL_DIR, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return
  }
  for (const dirName of ids) {
    if (dirName.endsWith('-mygo')) continue
    try {
      const manifest = JSON.parse(await readFile(join(INSTALL_DIR, dirName, MANIFEST), 'utf8')) as InstallManifest
      const bridgeSrc = join(bridgeDirOf(manifest.id), 'src', 'index.ts')
      const text = await readFile(bridgeSrc, 'utf8')
      if (text.includes('bridge template v3')) {
        // Node half is current; also require the client status gate when the
        // plugin ships a browser half (sfw/ads-style UI plugins otherwise
        // keep their browser effects after disable).
        const clientPath = join(bridgeDirOf(manifest.id), 'lib', 'client.js')
        try {
          const clientText = await readFile(clientPath, 'utf8')
          if (clientText.includes('mygo-generated status gate v2')) continue
        } catch {
          // no client half: nothing to upgrade
          continue
        }
      }
      await ensureProjectedBridge(manifest)
    } catch {
      // unreadable or already upgraded; keep whatever bridge exists
    }
  }
}

/**
 * 0809→0810 兼容补字段：给存量桥接包补 `dsh.client` 声明。新装桥接已经双写
 * （dshClient + dsh.client）；历史安装只有 dshClient，0810 的
 * ClientModuleHost 不认，浏览器半部会缺席。幂等：已有 `dsh.client` 或没有
 * `./client` 导出的桥接跳过。
 */
async function ensureBridgeClientDeclarations(): Promise<void> {
  let ids: string[]
  try {
    ids = (await readdir(INSTALL_DIR, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return
  }
  for (const id of ids) {
    if (id.endsWith('-mygo')) continue
    const pkgPath = join(bridgeDirOf(id), 'package.json')
    let bridge: {
      readonly exports?: Record<string, unknown>
      readonly dshClient?: {
        readonly platform?: string
        readonly inject?: readonly string[]
        readonly immediately?: boolean
      }
      readonly dsh?: { readonly client?: unknown }
    }
    try {
      bridge = JSON.parse(await readFile(pkgPath, 'utf8'))
    } catch {
      continue
    }
    if (bridge.exports?.['./client'] === undefined) continue
    if (bridge.dsh?.client !== undefined) continue
    const legacy = bridge.dshClient
    if (legacy === undefined) continue
    const dsh = { ...bridge.dsh }
    dsh.client = {
      ...(legacy.platform === undefined ? {} : { platform: legacy.platform }),
      ...(legacy.inject === undefined ? {} : { inject: legacy.inject }),
      ...(legacy.immediately === undefined ? {} : { immediately: legacy.immediately }),
    }
    await writeFile(pkgPath, `${JSON.stringify({ ...bridge, dsh }, null, 2)}\n`)
  }
}

async function readMygoSelfState(): Promise<MygoSelfState | undefined> {
  try {
    return JSON.parse(await readFile(SELF_STATE, 'utf8')) as MygoSelfState
  } catch {
    return undefined
  }
}

interface RemoteUpdateStatus {
  readonly id: string
  readonly kind: 'plugin' | 'mygo'
  readonly url: string
  readonly ref: string
  readonly currentCommit: string
  readonly latestCommit?: string
  readonly upToDate?: boolean
  readonly error?: string
}

async function writeMygoSelfState(state: MygoSelfState): Promise<void> {
  await writeFile(SELF_STATE, JSON.stringify(state, null, 2))
}

/** BOM 落盘状态（概览端点用；无 BOM / 格式不符 → exists: false，fail-soft）。 */
async function readBomStatus(): Promise<{
  readonly exists: boolean
  readonly generatedAt?: string
  readonly members?: number
  readonly commit?: string
}> {
  try {
    const parsed = JSON.parse(await readFile(
      join(HOME_ROOT, 'mygo-boms', panelProfile(), 'dsh.bom.json'),
      'utf8',
    )) as {
      readonly format?: unknown
      readonly generated?: { readonly at?: unknown; readonly commit?: unknown }
      readonly lock?: { readonly members?: unknown }
    }
    if (parsed.format !== 'dsh.bom/v1') return { exists: false }
    return {
      exists: true,
      ...(typeof parsed.generated?.at === 'string' ? { generatedAt: parsed.generated.at } : {}),
      ...(typeof parsed.generated?.commit === 'string' ? { commit: parsed.generated.commit } : {}),
      ...(Array.isArray(parsed.lock?.members) ? { members: parsed.lock.members.length } : {}),
    }
  } catch {
    return { exists: false }
  }
}

/** 枚举 manifest 带远程来源（remote）的已安装插件（id 排序稳定）。 */
async function remoteInstallEntries(): Promise<Array<{
  readonly id: string
  readonly kind: 'plugin'
  readonly remote: RemoteRef
}>> {
  const entries: Array<{ readonly id: string; readonly kind: 'plugin'; readonly remote: RemoteRef }> = []
  try {
    for (const dirName of (await readdir(INSTALL_DIR, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)) {
      if (dirName.endsWith('-mygo')) continue
      try {
        const manifest = JSON.parse(await readFile(join(INSTALL_DIR, dirName, MANIFEST), 'utf8')) as InstallManifest
        if (manifest.remote !== undefined) entries.push({ id: manifest.id, kind: 'plugin', remote: manifest.remote })
      } catch {
        // unreadable manifest: skip
      }
    }
  } catch {
    // no plugin installs yet
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Scan every installed plugin/app whose manifest carries remote provenance
 * and compare the installed commit against the remote ref. Folder/archive
 * installs have no remote and are skipped by design.
 */
async function listUpdates(): Promise<readonly RemoteUpdateStatus[]> {
  const results: RemoteUpdateStatus[] = []
  const self = await readMygoSelfState()
  if (self !== undefined) {
    try {
      const latestCommit = await remoteLatest(self.url, self.ref)
      results.push({
        id: 'dsh-mygo',
        kind: 'mygo',
        url: self.url,
        ref: self.ref,
        currentCommit: self.commit,
        latestCommit,
        upToDate: self.commit === latestCommit,
      })
    } catch (error) {
      results.push({
        id: 'dsh-mygo',
        kind: 'mygo',
        url: self.url,
        ref: self.ref,
        currentCommit: self.commit,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const entries = await remoteInstallEntries()
  for (const { id, kind, remote } of entries) {
    try {
      const latestCommit = await remoteLatest(remote.url, remote.ref)
      results.push({
        id,
        kind,
        url: remote.url,
        ref: remote.ref,
        currentCommit: remote.commit,
        latestCommit,
        upToDate: remote.commit === latestCommit,
      })
    } catch (error) {
      results.push({
        id,
        kind,
        url: remote.url,
        ref: remote.ref,
        currentCommit: remote.commit,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

/**
 * mygo 自身热更新：clone 远端仓库 → 以整个仓库为最小更新单元，枚举
 * packages/ 下全部 @r05en1cu/* 工作区包逐一同步进 checkout → 逐包重建 →
 * 记录新 commit。Loader 会在响应后由 profile patch 变更触发热重载，受管
 * 插件在重载后通过 recover() 自动恢复。
 */
async function updateMygoFromRemote(
  _ctx: PanelContext,
): Promise<{ readonly ok: true; readonly id: string; readonly updated: boolean; readonly message: string; readonly commit?: string }> {
  if (CHECKOUT === undefined) {
    throw new Error('源码自更新仅支持 checkout 安装；npm 安装请通过包管理器更新 mygo')
  }
  const self = await readMygoSelfState()
  if (self === undefined) throw new Error('未记录 mygo 自身安装信息（请用 install.sh 安装）')
  const latestCommit = await remoteLatest(self.url, self.ref)
  if (latestCommit === self.commit) {
    return { ok: true, id: 'dsh-mygo', updated: false, message: 'mygo 已是最新' }
  }
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-mygo-update-'))
  try {
    await cloneFromGitHub(self.url, self.ref === 'HEAD' ? undefined : self.ref, tmp)
    // 整仓同步：克隆里的包目录清单即更新单元，不再维护固定三目录对。
    const packageDirs = await listMygoPackageDirs(tmp)
    if (packageDirs.length === 0) {
      throw new Error('克隆仓库中没有找到任何 mygo 包（仓库结构异常？）')
    }
    for (const rel of packageDirs) {
      const src = join(tmp, rel)
      const dst = join(CHECKOUT, rel)
      await rm(dst, { recursive: true, force: true })
      await mkdir(dst, { recursive: true })
      await copyPluginTree(src, dst)
    }
    await execFileAsync('pnpm', ['install'], { cwd: CHECKOUT, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 })
      .catch((error: unknown) => {
        console.error('[dsh-mygo-panel] pnpm install during self-update failed:', error)
      })
    const nodeBin = process.execPath
    const tscBin = join(CHECKOUT, 'node_modules', 'typescript', 'bin', 'tsc')
    const tsdownBin = join(CHECKOUT, 'node_modules', 'tsdown', 'dist', 'run.mjs')
    for (const rel of packageDirs) {
      const dir = join(CHECKOUT, rel)
      const args = await buildArgsFor(dir)
      await execFileAsync(
        nodeBin,
        [tscBin, ...args.tsc],
        { cwd: dir, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 },
      )
      await execFileAsync(
        nodeBin,
        [tsdownBin, ...args.tsdown],
        { cwd: dir, env: buildEnv(), timeout: 600_000, maxBuffer: 32 * 1024 * 1024 },
      )
    }
    await writeMygoSelfState({ ...self, commit: latestCommit, installedAt: Date.now() })
    return {
      ok: true,
      id: 'dsh-mygo',
      updated: true,
      message: 'mygo 已更新（整仓代码已替换并重建；Loader 热重载后生效）',
      commit: latestCommit,
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

/**
 * Live-update one remote-installed plugin: clone the new version, swap the
 * running generation through mygo's HMR replace protocol (sessions and the
 * host process stay up), then refresh the installed tree and bridge.
 */
async function updatePluginFromRemote(
  ctx: PanelContext,
  id: string,
): Promise<{ readonly ok: true; readonly id: string; readonly updated: boolean; readonly message: string; readonly commit?: string }> {
  const manifest = JSON.parse(await readFile(join(INSTALL_DIR, id, MANIFEST), 'utf8')) as InstallManifest
  const remote = manifest.remote
  if (remote === undefined) throw new Error(`插件 ${id} 没有远程仓库，无法更新`)
  const latestCommit = await remoteLatest(remote.url, remote.ref)
  if (latestCommit === remote.commit) {
    return { ok: true, id, updated: false, message: `插件 ${id} 已是最新` }
  }
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-update-'))
  try {
    await cloneFromGitHub(remote.url, remote.ref === 'HEAD' ? undefined : remote.ref, tmp)
    const root = await locatePluginRoot(tmp)
    const repositoryPlugin = await isRepositoryPluginPackage(root)
    const entry = repositoryPlugin ? await resolveEntryDeclared(root) : await resolveEntry(root)
    const raw = repositoryPlugin
      ? await (async () => {
        // Official `.dsh-plugin` sources ship uncompiled: build the fresh
        // tree in the temp checkout before the HMR swap imports the entry.
        const dependencies = await runtimeDependenciesOf(root)
        const allDependencies = await allDependenciesOf(root)
        const clientTarget = await clientTargetOf(root)
        await installRuntimeDependencies(root, dependencies, allDependencies, clientTarget, {
          ignoreScripts: true,
          buildTarget: relative(root, entry),
        })
        return await importEntry(entry, true)
      })()
      : await importEntry(entry, true)
    const declarative = await readDeclarativeManifest(root)
    const declaration = toDeclaration(declarative)
    // 顺序原子性（HMR 体验 R2）：把最易失败的步骤前置到 staging——
    // 依赖安装/构建全部在 INSTALL_DIR 下的 staging 目录完成，期间旧 live
    // 代与旧磁盘树都保持原样；HMR swap 居中（失败则旧代恢复、staging
    // 清理、磁盘未动）；成功后才原子换树（rename + 备份回滚）落盘。
    const staging = join(INSTALL_DIR, `.staging-${id}-${randomUUID()}`)
    try {
      await preparePluginFiles(
        root,
        staging,
        manifest.installDeps === true || repositoryPlugin,
        entry,
      )
      await ctx.pluginManager.updateRaw(raw, manifest.config ?? {}, id, declaration)
      await swapTreeIntoPlace(staging, join(INSTALL_DIR, id))
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    const entryRelative = relative(root, entry)
    const next: InstallManifest = {
      ...manifest,
      entry: entryRelative,
      ...(declarative === undefined ? {} : { version: declarative.version }),
      ...(declarative?.declarative === undefined ? {} : { declarative: declarative.declarative }),
      remote: { ...remote, commit: latestCommit },
      installedAt: Date.now(),
    }
    if (manifest.skillFile !== undefined) {
      try {
        await copyFile(join(root, 'SKILL.md'), manifest.skillFile)
      } catch {
        // the new version dropped the skill; keep the previous file
      }
    }
    await writeFile(join(INSTALL_DIR, id, MANIFEST), JSON.stringify(next, null, 2))
    await ensureProjectedBridge(next)
    await syncBridgeRows()
    return { ok: true, id, updated: true, message: `插件 ${id} 已更新（HMR 生效）`, commit: latestCommit }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

/**
 * Update one remote-installed external app: stop it (if running), replace the
 * app tree keeping `state/` and `logs/`, re-run setup/build, restart if it
 * was running before.
 */
async function preparePluginFiles(
  root: string,
  target: string,
  installDeps: boolean,
  entry?: string,
): Promise<void> {
  await mkdir(target, { recursive: true })
  await copyPluginTree(root, target)
  const dependencies = await runtimeDependenciesOf(root)
  const allDependencies = await allDependenciesOf(root)
  const clientTarget = await clientTargetOf(root)
  const repositoryPlugin = await isRepositoryPluginPackage(root)
  if (repositoryPlugin) {
    // The official format requires a build: install devDependencies with
    // lifecycle scripts disabled (the repo's `prepare` needs the unpublished
    // dsh-plugin-prepare helper), then run the declared build.
    await installRuntimeDependencies(target, dependencies, allDependencies, clientTarget, {
      ignoreScripts: true,
      ...(entry === undefined ? {} : { buildTarget: relative(root, entry) }),
    })
  } else if (installDeps && (Object.keys(dependencies).length > 0 || clientTarget !== undefined)) {
    await installRuntimeDependencies(target, dependencies, allDependencies, clientTarget)
  } else {
    await ensureNodeModulesLink(target)
    if (clientTarget !== undefined && !(await fileExists(join(target, clientTarget)))) {
      throw new Error(
        `插件声明了 web client half（${clientTarget}）但仓库没有构建产物；`
        + '请勾选“自动安装依赖（npm install + 构建）”重新安装',
      )
    }
  }
}

/** A resolved install source ready for manifest reading. */
interface PreparedSource {
  readonly root: string
  readonly remote?: RemoteRef
  readonly cleanup: () => Promise<void>
}

/** Clone/extract/locate one install source (folder stays in place). */
async function prepareInstallSource(body: InstallRequest): Promise<PreparedSource> {
  if (body.method === 'github') {
    const url = body.url?.trim()
    if (url === undefined || url.length === 0) throw new Error('缺少 GitHub 仓库地址')
    const tmp = await mkdtemp(join(tmpdir(), 'dsh-install-'))
    try {
      await cloneFromGitHub(url, body.ref, tmp)
      const root = await locatePluginRoot(tmp)
      const commit = await gitHeadOf(tmp)
      return {
        root,
        remote: { url, ref: body.ref?.trim() || 'HEAD', commit },
        cleanup: () => rm(tmp, { recursive: true, force: true }),
      }
    } catch (error) {
      await rm(tmp, { recursive: true, force: true })
      throw error
    }
  }
  if (body.method === 'folder') {
    const folder = body.path?.trim()
    if (folder === undefined || folder.length === 0) throw new Error('缺少文件夹路径')
    const root = resolve(folder)
    if ((await stat(root)).isDirectory() !== true) throw new Error(`不是文件夹: ${root}`)
    return {
      root: await locatePluginRoot(root),
      cleanup: () => Promise.resolve(),
    }
  }
  if (body.method === 'archive') {
    const file = body.path?.trim()
    if (file === undefined || file.length === 0) throw new Error('缺少压缩包路径')
    const archive = resolve(file)
    if ((await stat(archive)).isFile() !== true) throw new Error(`不是文件: ${archive}`)
    const tmp = await mkdtemp(join(tmpdir(), 'dsh-install-'))
    try {
      await extractArchive(archive, tmp)
      return {
        root: await locatePluginRoot(tmp),
        cleanup: () => rm(tmp, { recursive: true, force: true }),
      }
    } catch (error) {
      await rm(tmp, { recursive: true, force: true })
      throw error
    }
  }
  throw new Error('method 必须是 github / folder / archive')
}

/** Derive the manager-side plugin id from a located plugin root. */
async function pluginIdFromRoot(pluginRoot: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8')) as { readonly name?: unknown }
    if (typeof pkg.name === 'string' && pkg.name.trim() !== '') return pluginIdOf(pkg.name)
  } catch {
    // fall through to the directory name
  }
  return pluginIdOf(basename(pluginRoot))
}

async function installFromRoot(
  pluginManager: PluginManager,
  pluginRoot: string,
  method: InstallManifest['method'],
  source: string,
  config: unknown,
  installDeps = false,
  idOverride?: string,
  remote?: RemoteRef,
): Promise<{ readonly ok: true; readonly id: string; readonly message: string }> {
  let id = idOverride
  if (id === undefined || id.length === 0) {
    try {
      const pkg = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8')) as { readonly name?: unknown }
      id = typeof pkg.name === 'string' ? pluginIdOf(pkg.name) : undefined
    } catch {
      id = undefined
    }
    if (id === undefined) id = pluginIdOf(basename(pluginRoot))
  }
  const repositoryPlugin = await isRepositoryPluginPackage(pluginRoot)
  const entry = repositoryPlugin ? await resolveEntryDeclared(pluginRoot) : await resolveEntry(pluginRoot)
  const target = join(INSTALL_DIR, id)
  try {
    await stat(target)
    // The install directory exists. Block only when the plugin is live in the
    // manager; orphaned/skipped installs (a bridge row whose node half failed
    // support preflight at boot, or a crashed install) are replaced so a retry
    // lands instead of dead-ending.
    const live = pluginManager.plugins().some(plugin => plugin.id === id)
    if (live) throw new Error(`插件 ${id} 已安装，请先卸载或清理安装目录`)
    console.warn(`[dsh-mygo-panel] 插件 ${id} 存在未挂载的残留安装，覆盖重装`)
    await rm(target, { recursive: true, force: true })
    await removeProjectedBridge(id)
    await syncBridgeRows()
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as { code?: string }).code !== 'ENOENT') {
      throw error
    }
  }
  await mkdir(target, { recursive: true })
  try {
    await preparePluginFiles(pluginRoot, target, installDeps || repositoryPlugin, entry)
    // First-install config template: when the caller did not provide config,
    // derive a starter object from the plugin's Config schema (plus any JSON
    // config examples in the repo), so a required-field schema does not turn
    // into a chicken-and-egg "请在安装时填写 config" error.
    let resolvedConfig = config
    if (resolvedConfig === undefined) {
      const template = await buildConfigTemplate(target)
      if (template !== undefined) {
        console.info(`[dsh-mygo-panel] 插件 ${id} 未提供配置，已按 schema 自动生成模板配置`)
        resolvedConfig = template.template
      }
    }
    const declarative = await readDeclarativeManifest(target)
    const declaration = toDeclaration(declarative)
    // P1 起求解器级联动作已删除：安装前做 plan 预览（求值，拒绝即报错），
    // 不再连带启用下游。
    {
      // Compatibility preflight against the live managed set before any bridge
      // row is written: a broken combination is refused with the constraint
      // chain instead of surfacing at the next boot.
      const preflight = pluginManager.checkCompatibility({
        id,
        ...(declaration === undefined
          ? {}
          : {
              version: declaration.version,
              compatibility: declaration.compatibility,
            }),
      })
      if (preflight.violations.length > 0) {
        throw new Error(`兼容性冲突，拒绝安装：\n${compatibilityViolationLines(preflight).join('\n')}`)
      }
      const warnings = compatibilityWarningLines(preflight)
      if (warnings.length > 0) {
        console.warn(`[dsh-mygo-panel] 兼容性警告（不阻塞安装）：\n${warnings.join('\n')}`)
      }
    }
    const entryRelative = relative(pluginRoot, entry)
    const manifest: InstallManifest = {
      id,
      method,
      source,
      entry: entryRelative,
      ...(declarative === undefined ? {} : { version: declarative.version }),
      ...(declarative?.declarative === undefined ? {} : { declarative: declarative.declarative }),
      ...(remote === undefined ? {} : { remote }),
      installedAt: Date.now(),
      ...(resolvedConfig === undefined ? {} : { config: resolvedConfig }),
      ...(installDeps ? { installDeps: true } : {}),
    }
    // A flat SKILL.md at the plugin root is synced into the user skill root so
    // the harness `skill` tool can load it (dsh-skill-local scans that root).
    const skillSource = join(pluginRoot, 'SKILL.md')
    try {
      const skillText = await readFile(skillSource, 'utf8')
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skillText)
      let skillName = id
      if (frontmatter !== null) {
        const nameLine = /^name:\s*(.+)$/m.exec(frontmatter[1])
        if (nameLine !== null && nameLine[1] !== undefined && nameLine[1].trim() !== '') {
          skillName = nameLine[1].trim()
        }
      }
      const skillTarget = join(SKILLS_ROOT, `${skillName}.md`)
      await mkdir(SKILLS_ROOT, { recursive: true })
      await copyFile(skillSource, skillTarget)
      manifest.skillFile = skillTarget
    } catch {
      // no SKILL.md: nothing to sync
    }
    await writeFile(join(target, MANIFEST), JSON.stringify(manifest, null, 2))
    await pluginManager.clearUninstallTombstone(id)
    const raw = await importEntry(join(target, manifest.entry), true)
    // Adopt the node half BEFORE publishing the bridge row: writing the row
    // first lets the loader's patch HMR mount the bridge concurrently, which
    // double-stages the same plugin and leaves host registrations (settings
    // namespaces) behind on failure. Publish only after adoption succeeds;
    // the row then re-adopts idempotently on the next boot.
    await pluginManager.adoptRaw(raw, resolvedConfig ?? {}, id, declaration)
    await ensureProjectedBridge(manifest)
    await syncBridgeRows()
    return { ok: true, id, message: `插件 ${id} 已安装` }
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    await removeProjectedBridge(id)
    await syncBridgeRows()
    throw error
  }
}

/** Clone a GitHub repository into a temp directory. */
async function cloneFromGitHub(url: string, ref: string | undefined, into: string): Promise<void> {
  const args = ['clone', '--depth', '1']
  if (ref !== undefined && ref.trim() !== '') args.push('--branch', ref.trim())
  args.push(url, into)
  await execFileAsync('git', args, { timeout: 120_000 })
}

/** The commit SHA of one cloned repository. */
async function gitHeadOf(repoDir: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { timeout: 30_000 })
  return stdout.trim()
}

/**
 * The remote commit SHA for one ref. Network call; private repositories
 * resolve through the user's git credentials. Fails loud on timeout/auth.
 */
async function remoteLatest(url: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['ls-remote', url, ref], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  })
  const line = stdout.split('\n').find(entry => entry.trim() !== '')
  const sha = line?.trim().split(/\s+/)[0]
  if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`无法解析远端引用 ${ref}`)
  }
  return sha
}

/** Extract a zip or tar.gz archive into a temp directory. */
async function extractArchive(file: string, into: string): Promise<void> {
  const lower = file.toLowerCase()
  if (lower.endsWith('.zip')) {
    await execFileAsync('unzip', ['-q', file, '-d', into], { timeout: 120_000 })
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await execFileAsync('tar', ['-xzf', file, '-C', into], { timeout: 120_000 })
  } else {
    throw new Error('暂仅支持 zip / tar.gz 压缩包')
  }
}

/** Read a node:http request body as text (bounded). */
function readBody(req: RawRequest, limit = 16 * 1024 * 1024): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    if (req.on === undefined) {
      resolveBody('')
      return
    }
    let raw = ''
    req.on('data', (chunk?: Buffer) => {
      raw += (chunk ?? '').toString('utf8')
      if (raw.length > limit) {
        rejectBody(new Error('request body too large'))
        return
      }
    })
    req.on('end', () => resolveBody(raw))
  })
}

/** One in-flight config-helper session (per plugin). */
/** One config-helper chat message. */
interface ConfigHelperMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

/** One config-helper session: a durable continuable temporary conversation. */
interface ConfigHelperState {
  readonly pluginId: string
  readonly startedAt: number
  readonly messages: ConfigHelperMessage[]
  readonly pendingTurns: string[]
  readonly debugSessions: Array<{ readonly id: string; readonly cwd: string }>
  readonly controller: AbortController
  childId?: string
  parentAgent?: unknown
  parentHandle?: { dispose(): Promise<void> }
  parentCwd?: string
  lastSeq: number
  runStartedAt?: number
  status: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  reply?: string
  error?: string
}

/** Panel-held helper sessions; `stop` disposes the run and clears the entry. */
const configHelpers = new Map<string, ConfigHelperState>()
/** Single global conversation: the user does NOT pre-select a plugin. */
const CONFIG_HELPER_SESSION = 'global'
let helperSurfaceRefs = 0
let helperSurfaceDisposers: Array<() => void> = []

/** Tool names visible inside a config-helper child: the mygo surface + read-only analysis tools. */
const CONFIG_HELPER_TOOL_ALLOW: readonly string[] = [
  'mygo_helper_status',
  'mygo_helper_check',
  'mygo_helper_install',
  'mygo_helper_config',
  'mygo_helper_update_config',
  'skill',
  'read',
  'glob',
  'grep',
]

/** The helper-only skill body: the default install/check/config workflow. */
const CONFIG_HELPER_SKILL = `# mygo 配置助手

你是 mygo 插件管理器的配置助手专用技能。当用户请求安装、检查或配置插件时，按下面的默认流程执行：

1. 需要安装插件（用户给了 GitHub 地址 / 本地目录 / 压缩包）：
   - 先调用 mygo_helper_check（method/url/path）检查安装源：拿到插件 id、入口、requires、配置模板与兼容性计划；
   - 与用户确认后调用 mygo_helper_install 安装（可传 config；不传时安装器会自动按 schema 生成模板配置，installDeps 建议 true）；
   - 安装完成后用 mygo_helper_status 确认插件已启用。
  2. 需要配置已安装插件：
   - 调用 mygo_helper_config 读取 schema 字段、默认值与当前配置；
   - 用 read/glob/grep 补充阅读 README 或配置样例确认字段含义；
   - 与用户逐项确认后调用 mygo_helper_update_config 应用。
3. 不要修改任何插件文件；安装与更新一律通过 mygo 工具完成，不要手写文件；
   严禁自己执行 pnpm/npm/git 安装依赖（宿主安装器会处理），不要请求沙箱升级。

输出保持简洁中文；需要用户决定的事项明确提问。`

/** Register the helper-only tools + skill while at least one helper session is active. */
function registerHelperSurface(ctx: PanelContext): void {
  if (helperSurfaceRefs > 0) {
    helperSurfaceRefs += 1
    return
  }
  helperSurfaceRefs += 1
  const disposers: Array<() => void> = []
  const tools = ctx.get('tools') as { register(tool: unknown): () => void } | undefined
  if (tools !== undefined) {
    for (const tool of helperToolSurface(ctx)) {
      try {
        disposers.push(tools.register(tool))
      } catch (error) {
        console.warn(`[dsh-mygo-panel] 配置助手工具注册失败: ${String(error)}`)
      }
    }
  }
  const skills = ctx.get('skills') as { register(skill: unknown): () => void } | undefined
  if (skills !== undefined) {
    disposers.push(skills.register({
      name: 'mygo-config-helper',
      description: 'mygo 插件配置助手专用：远端拉取/本地检查插件、读取配置项并调用 mygo 安装',
      content: CONFIG_HELPER_SKILL,
      source: 'runtime',
      invocation: { modelInvocable: true, userInvocable: false },
    }))
  }
  helperSurfaceDisposers = disposers
}

/** Release the helper-only surface when the last active helper closes. */
function releaseHelperSurface(): void {
  helperSurfaceRefs = Math.max(0, helperSurfaceRefs - 1)
  if (helperSurfaceRefs > 0) return
  for (const disposer of helperSurfaceDisposers) {
    try {
      disposer()
    } catch {
      // best effort
    }
  }
  helperSurfaceDisposers = []
}

/** The `mygo_helper_*` tool set: guarded to config-helper child sessions only. */
function helperToolSurface(ctx: PanelContext): unknown[] {
  const holder = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): unknown => ({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    timeoutMs: name === 'mygo_helper_install' ? 600_000 : 120_000,
    execute: async (args: unknown, exec: { agent?: { id?: string } }): Promise<string> => {
      const caller = exec.agent?.id
      const allowed = [...configHelpers.values()].some(state => state.childId === caller)
      if (!allowed) throw new Error(`${name} 仅配置助手会话可用`)
      return JSON.stringify(await handler((args ?? {}) as Record<string, unknown>))
    },
  })
  return [
    holder('mygo_helper_status', '列出受管插件；传 pluginId 时同时返回该插件的当前配置', {
      type: 'object',
      properties: { pluginId: { type: 'string' } },
      additionalProperties: false,
    }, async (args) => {
      const pluginId = typeof args.pluginId === 'string' && args.pluginId !== '' ? args.pluginId : undefined
      return {
        plugins: ctx.pluginManager.plugins().map(plugin => ({
          id: plugin.id,
          version: plugin.version,
          status: plugin.status,
          ...(plugin.compatibility === undefined ? {} : { compatibility: plugin.compatibility }),
        })),
        ...(pluginId === undefined ? {} : { config: ctx.pluginManager.configOf(pluginId) }),
      }
    }),
    holder('mygo_helper_check', '检查一个安装源（github/folder/archive）：插件 id、入口、requires、配置模板与兼容性计划', {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['github', 'folder', 'archive'] },
        url: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['method'],
      additionalProperties: false,
    }, async (args) => {
      const method = args.method === 'folder' || args.method === 'archive' ? args.method : 'github'
      const prepared = await prepareInstallSource({
        method,
        ...(typeof args.url === 'string' && args.url !== '' ? { url: args.url } : {}),
        ...(typeof args.path === 'string' && args.path !== '' ? { path: args.path } : {}),
      } as InstallRequest)
      try {
        const id = await pluginIdFromRoot(prepared.root)
        const declarative = await readDeclarativeManifest(prepared.root)
        const configTemplate = await buildConfigTemplate(prepared.root)
        const plan = await ctx.pluginManager.planInstall({
          id,
          ...(declarative === undefined ? {} : { version: declarative.version }),
          ...(declarative?.declarative?.compatibility === undefined
            ? {}
            : { compatibility: declarative.declarative.compatibility }),
        })
        return {
          id,
          entry: await (async () => {
            try {
              return await (await isRepositoryPluginPackage(prepared.root)
                ? resolveEntryDeclared(prepared.root)
                : resolveEntry(prepared.root))
            } catch {
              return undefined
            }
          })(),
          requires: Object.keys(declarative?.declarative?.compatibility?.requires ?? {}),
          configTemplate: configTemplate?.template,
          plan: { accepted: plan.accepted, error: plan.error?.message },
        }
      } finally {
        await prepared.cleanup()
      }
    }),
    holder('mygo_helper_install', '安装插件（github/folder/archive）；未传 config 时自动使用 schema 模板', {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['github', 'folder', 'archive'] },
        url: { type: 'string' },
        path: { type: 'string' },
        config: { type: 'object' },
        installDeps: { type: 'boolean' },
      },
      required: ['method'],
      additionalProperties: false,
    }, async (args) => {
      const method = args.method === 'folder' || args.method === 'archive' ? args.method : 'github'
      const prepared = await prepareInstallSource({
        method,
        ...(typeof args.url === 'string' && args.url !== '' ? { url: args.url } : {}),
        ...(typeof args.path === 'string' && args.path !== '' ? { path: args.path } : {}),
      } as InstallRequest)
      try {
        return await installFromRoot(
          ctx.pluginManager,
          prepared.root,
          method,
          method === 'github'
            ? (typeof args.url === 'string' ? args.url : '')
            : (typeof args.path === 'string' ? args.path : ''),
          args.config,
          args.installDeps === true,
          undefined,
          prepared.remote,
        )
      } finally {
        await prepared.cleanup()
      }
    }),
    holder('mygo_helper_config', '读取已安装插件的配置：schema 字段、默认值、模板与当前值', {
      type: 'object',
      properties: { pluginId: { type: 'string' } },
      required: ['pluginId'],
      additionalProperties: false,
    }, async (args) => {
      const pluginId = String(args.pluginId ?? '')
      const info = await buildConfigTemplate(join(INSTALL_DIR, pluginId))
      return {
        pluginId,
        current: ctx.pluginManager.configOf(pluginId) ?? {},
        ...(info === undefined
          ? {}
          : { schema: { description: info.description, fields: info.fields }, template: info.template }),
      }
    }),
    holder('mygo_helper_update_config', '更新已安装插件配置（HMR 生效）', {
      type: 'object',
      properties: {
        pluginId: { type: 'string' },
        config: { type: 'object' },
      },
      required: ['pluginId', 'config'],
      additionalProperties: false,
    }, async (args) => {
      const pluginId = String(args.pluginId ?? '')
      await ctx.pluginManager.updateConfig(pluginId, args.config)
      return { pluginId, ok: true }
    }),
  ]
}

/** How long one helper turn may take before it is treated as stuck. */
const HELPER_RUN_TIMEOUT_MS = 5 * 60_000

/** Initial instructions for the continuable helper child (its first prompt). */
const HELPER_INITIAL_PROMPT = [
  '你是 mygo 插件管理器的配置助手，帮助用户安装/检查/配置插件。',
  '安装、检查、配置一律使用 mygo-config-helper 技能与 mygo_helper_* 工具。',
  '用户不会预先选择插件：你需要从对话中识别目标插件（需要时可先调用 mygo_helper_status 列出已安装插件），',
  '不确定插件 id 或安装源时直接向用户提问，不要臆测。',
  '严禁自己执行 pnpm/npm/git 安装依赖或请求沙箱升级：依赖安装由 mygo_helper_install 在宿主完成。',
  '',
  '这是一段临时对话：每轮你会收到用户的新消息，回复保持简洁中文；',
  '需要用户决定的事项明确提问。现在不要输出欢迎语，等待用户第一条消息。',
].join('\n')

/** Await one promise with a wall-clock deadline. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms)
      timer.unref?.()
    }),
  ])
}

/** Whether the helper was closed (avoids TS narrowing across async boundaries). */
function isHelperStopped(state: ConfigHelperState): boolean {
  return state.status === 'stopped'
}

/** Extract text content from assistant/message session events. */
function assistantTextOf(events: readonly unknown[]): string {
  const blocks: unknown[] = []
  for (const raw of events) {
    const event = raw as {
      readonly type?: string
      readonly data?: {
        readonly content?: unknown
        readonly message?: { readonly content?: unknown }
      }
    }
    if (event.type !== 'assistant/message') continue
    const content = event.data?.message?.content ?? event.data?.content
    if (Array.isArray(content)) blocks.push(...content)
  }
  return blocks
    .filter((block): block is { readonly type: 'text'; readonly text: string } => {
      return typeof block === 'object' && block !== null
        && (block as { readonly type?: string }).type === 'text'
        && typeof (block as { readonly text?: unknown }).text === 'string'
    })
    .map(block => block.text)
    .join('\n')
    .trim()
}

/** Resolve the live child Agent, waiting a short window for publication. */
async function waitForAgent(ctx: PanelContext, childId: string): Promise<{ whenIdle(): Promise<void> }> {
  const agents = ctx.get('agents') as { get(id: string): unknown } | undefined
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const agent = agents?.get(childId) as { whenIdle(): Promise<void> } | undefined
    if (agent !== undefined && typeof agent.whenIdle === 'function') return agent
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('助手子会话未就绪')
}

/** Highest seq currently persisted for one session. */
async function currentMaxSeq(ctx: PanelContext, childId: string): Promise<number> {
  const persistence = ctx.get('sessionPersistence') as
    | { inspect(id: string): Promise<{ events: readonly { readonly seq: number }[] }> }
    | undefined
  if (persistence === undefined) return 0
  const inspected = await persistence.inspect(childId)
  return inspected.events.at(-1)?.seq ?? 0
}

/** Create the durable continuable helper conversation (dedicated temp parent + child). */
async function ensureHelperConversation(ctx: PanelContext, state: ConfigHelperState): Promise<void> {
  if (state.childId !== undefined && state.parentAgent !== undefined) return
  const agents = ctx.get('agents') as
    | {
        create(options: {
          sessionId: string
          meta?: { cwd?: string; origin?: 'subagent' }
        }): Promise<{ agent: unknown; dispose(): Promise<void> }>
      }
    | undefined
  const subagents = ctx.get('subagents') as
    | {
        startContinuable(spec: unknown): Promise<{ childId: string; messageId: string }>
      }
    | undefined
  if (agents === undefined || subagents === undefined) {
    state.status = 'error'
    state.error = '宿主缺少 agents / subagents 服务，配置助手不可用'
    throw new Error(state.error)
  }
  const defaultModel = (ctx.get('agentDefaultModel') as
    | { currentSelection(): { provider?: string; model?: string } }
    | undefined)?.currentSelection()
  const agentOptions = defaultModel?.provider !== undefined && defaultModel?.model !== undefined
    ? { provider: defaultModel.provider, model: defaultModel.model }
    : undefined
  const tempSessionId = `session-${randomUUID()}`
  const handle = await agents.create({
    sessionId: tempSessionId,
    meta: { cwd: process.cwd(), origin: 'subagent' },
    ...(agentOptions === undefined ? {} : { agentOptions }),
  })
  state.parentHandle = handle
  state.parentAgent = handle.agent
  state.parentCwd = process.cwd()
  state.debugSessions.push({ id: tempSessionId, cwd: state.parentCwd })
  const started = await subagents.startContinuable({
    provider: 'spawn',
    label: 'mygo-config-helper',
    request: {
      prompt: [{ type: 'text', text: HELPER_INITIAL_PROMPT }],
      parent: handle.agent,
      persona: '你是严谨、只读、善于分析插件配置的 mygo 配置助手；安装/检查必须走 mygo-config-helper 技能与 mygo_helper_* 工具。',
      toolFilter: { allow: CONFIG_HELPER_TOOL_ALLOW },
      ...(agentOptions === undefined ? {} : { agentOptions }),
    },
    signal: state.controller.signal,
  })
  state.childId = started.childId
  state.debugSessions.push({ id: started.childId, cwd: state.parentCwd })
  // Discard the child's greeting to the initial instructions.
  try {
    const agent = await waitForAgent(ctx, started.childId)
    await withTimeout(agent.whenIdle(), HELPER_RUN_TIMEOUT_MS)
    state.lastSeq = await currentMaxSeq(ctx, started.childId)
  } catch {
    // Greeting read is best-effort; the first user reply still works.
  }
}

/** Deliver one queued turn to the continuable child and read its reply. */
async function runHelperTurn(ctx: PanelContext, state: ConfigHelperState): Promise<void> {
  const message = state.pendingTurns.shift()
  if (message === undefined) return
  const subagents = ctx.get('subagents') as
    | {
        followup(parent: unknown, childId: string, content: unknown[], options: unknown): Promise<unknown>
        interrupt(childId: string, authority: unknown): void
      }
    | undefined
  const persistence = ctx.get('sessionPersistence') as
    | { inspect(id: string): Promise<{ events: readonly { readonly seq: number }[] }> }
    | undefined
  if (subagents === undefined || state.childId === undefined || state.parentAgent === undefined) {
    state.status = 'error'
    state.error = '助手会话未就绪，请关闭后重新打开'
    return
  }
  state.status = 'running'
  state.error = undefined
  state.reply = undefined
  state.runStartedAt = Date.now()
  try {
    await subagents.followup(state.parentAgent, state.childId, [{ type: 'text', text: message }], {
      source: { kind: 'user' },
      signal: state.controller.signal,
    })
    const agent = await waitForAgent(ctx, state.childId)
    await withTimeout(agent.whenIdle(), HELPER_RUN_TIMEOUT_MS)
    if (isHelperStopped(state)) return
    const inspected = persistence === undefined
      ? { events: [] as readonly { readonly seq: number }[] }
      : await persistence.inspect(state.childId)
    const fresh = inspected.events.filter(event => event.seq > state.lastSeq)
    state.lastSeq = inspected.events.at(-1)?.seq ?? state.lastSeq
    const reply = assistantTextOf(fresh)
    state.status = 'done'
    state.error = undefined
    state.reply = reply
    if (reply !== '') state.messages.push({ role: 'assistant', content: reply })
    if (state.pendingTurns.length > 0) void runHelperTurn(ctx, state)
  } catch (error) {
    if (isHelperStopped(state)) return
    const timedOut = error instanceof Error && error.message === 'timeout'
    if (timedOut) {
      try {
        subagents.interrupt(state.childId, { kind: 'ancestor', agent: state.parentAgent })
      } catch {
        // best effort
      }
    }
    state.status = 'error'
    state.error = timedOut
      ? '助手长时间未响应，已中止，请重新发送'
      : error instanceof Error ? error.message : String(error)
  }
}

/** One config-helper chat message: queue into the durable conversation and drive turns. */
async function chatWithConfigHelper(
  ctx: PanelContext,
  message: string,
): Promise<{ ok: true; runId: string; startedAt: number; queued: boolean }> {
  let state = configHelpers.get(CONFIG_HELPER_SESSION)
  if (state === undefined || state.status === 'stopped') {
    state = {
      pluginId: CONFIG_HELPER_SESSION,
      startedAt: Date.now(),
      messages: [],
      pendingTurns: [],
      debugSessions: [],
      controller: new AbortController(),
      lastSeq: 0,
      status: 'idle',
    }
    configHelpers.set(CONFIG_HELPER_SESSION, state)
    registerHelperSurface(ctx)
  }
  const text = message.trim()
  if (text === '') throw new Error('消息不能为空')
  state.messages.push({ role: 'user', content: text })
  const queued = state.status === 'running'
  state.pendingTurns.push(text)
  if (queued) {
    return { ok: true, runId: state.childId ?? '', startedAt: state.startedAt, queued: true }
  }
  try {
    await ensureHelperConversation(ctx, state)
    if (state.status === 'error') throw new Error(state.error ?? '助手初始化失败')
    void runHelperTurn(ctx, state)
  } catch (error) {
    state.status = 'error'
    state.error = error instanceof Error ? error.message : String(error)
    throw error
  }
  return { ok: true, runId: state.childId ?? '', startedAt: state.startedAt, queued: false }
}

/** Stop the config helper: close the continuable child, dispose the temp parent, clear records. */
async function stopConfigHelper(ctx: PanelContext): Promise<{ ok: true; cleared: boolean }> {
  const state = configHelpers.get(CONFIG_HELPER_SESSION)
  if (state === undefined) return { ok: true, cleared: false }
  state.status = 'stopped'
  state.pendingTurns.length = 0
  state.controller.abort()
  const subagents = ctx.get('subagents') as
    | {
        interrupt(childId: string, authority: unknown): void
        drainDescendants(parents: readonly unknown[]): Promise<void>
      }
    | undefined
  if (subagents !== undefined && state.childId !== undefined && state.parentAgent !== undefined) {
    try {
      subagents.interrupt(state.childId, { kind: 'ancestor', agent: state.parentAgent })
    } catch {
      // best effort
    }
    try {
      await subagents.drainDescendants([state.parentAgent])
    } catch {
      // best effort
    }
  }
  if (state.parentHandle !== undefined) {
    try {
      await state.parentHandle.dispose()
    } catch {
      // best effort
    }
    state.parentHandle = undefined
  }
  configHelpers.delete(CONFIG_HELPER_SESSION)
  releaseHelperSurface()
  await cleanupHelperDebugSessions(ctx, state.debugSessions)
  return { ok: true, cleared: true }
}

/** Remove the durable sessions a helper created (best-effort; jsonl artifacts are per-session dirs). */
async function cleanupHelperDebugSessions(
  ctx: PanelContext,
  sessions: ReadonlyArray<{ readonly id: string; readonly cwd: string }>,
): Promise<void> {
  if (sessions.length === 0) return
  const persistence = ctx.get('sessionPersistence') as
    | {
        locate(meta: { readonly id: string; readonly cwd?: string }):
          { readonly kind?: string; readonly path?: string } | undefined
      }
    | undefined
  if (persistence === undefined) return
  for (const session of sessions) {
    try {
      const location = persistence.locate({ id: session.id, cwd: session.cwd })
      if (location?.path === undefined || location.path === '') continue
      const target = /\.(?:zstd|jsonl|log)$/.test(location.path) ? dirname(location.path) : location.path
      await rm(target, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }
}

/**
 * 执行一条目录条目安装/更新（P0）：条目 id 由目录源服务翻译成 pnpm spec
 * 后走 bundle rail；安装与更新的 precondition 相反。
 */
async function runHubBundleInstall(
  ctx: PanelContext,
  id: string,
  releaseId: string | undefined,
  op: 'install' | 'update',
): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
  if (panelCatalogSources === undefined) {
    return { status: 503, body: { ok: false, error: '目录源服务未初始化' } }
  }
  const target = await panelCatalogSources.installTarget(id)
  if (!target.ok) {
    return {
      status: 409,
      body: {
        ok: false,
        id: target.id,
        error: target.error,
        ...(target.advisories.length === 0 ? {} : { advisories: target.advisories }),
      },
    }
  }
  const document = await panelCatalogSources.document(panelHubInstalled(ctx))
  const installed = document.entries.find(entry => entry.id === id)?.installed
  if (op === 'install' && installed !== undefined) {
    return {
      status: 409,
      body: {
        ok: false,
        id,
        error: `条目 ${id} 已安装（${installed.rail} 轨${installed.version === undefined ? '' : ' v' + installed.version}），如需拉取最新版本请使用更新`,
      },
    }
  }
  if (op === 'update' && installed === undefined) {
    return { status: 409, body: { ok: false, id, error: `条目 ${id} 未安装，不能更新` } }
  }
  const operation = beginPanelOperation(op, id)
  let result: Awaited<ReturnType<PanelContext['pluginManager']['bundleInstall']>>
  try {
    result = await ctx.pluginManager.bundleInstall(target.spec)
  } catch (error) {
    finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
    return {
      status: 400,
      body: {
        ok: false,
        id,
        error: error instanceof Error ? error.message : String(error),
        ...(target.advisories.length === 0 ? {} : { advisories: target.advisories }),
      },
    }
  }
  const needsRestart = result.activated !== 'live'
  finishPanelOperation(operation, 'ok', undefined, needsRestart)
  if (result.activated === 'live') {
    const url = liveRowUrlOf(name => ctx.get(name), result.member.packageName)
    broadcastLiveRail({
      type: 'live-rail',
      op: 'mount',
      id: result.member.packageName,
      ...(url === undefined ? {} : { url }),
    })
  }
  return {
    status: 200,
    body: {
      ok: true,
      id: result.member.id,
      entryId: id,
      message: result.activated === 'live'
        ? `条目 ${id} 已安装并激活（刷新页面后界面可见）`
        : `条目 ${id} 已安装（重启实例后生效）`,
      activated: result.activated ?? 'pending-restart',
      plan: {
        accepted: result.plan.accepted,
        ...(result.plan.error === undefined ? {} : { error: result.plan.error }),
        ...(result.plan.warnings === undefined || result.plan.warnings.length === 0
          ? {}
          : { warnings: result.plan.warnings }),
      },
      ...(result.member.hostConflicts.length === 0 ? {} : { hostConflicts: result.member.hostConflicts }),
      ...(target.advisories.length === 0 ? {} : { advisories: target.advisories }),
      ...(target.experimental ? { experimental: true } : {}),
    },
  }
}

export function apply(ctx: PanelContext): void {
  // P4：profile 名运行时推导（DSH_PROFILE env → loader baseUrl 目录名），
  // 与 mygo service.ts 的 resolveProfileName 同源；后续 patch/桥接投影
  // 全部经 panelProfile()/profilePatchPath() 取生效值。
  runtimeProfile = resolvePanelProfile(ctx)
  panelCatalogSources = new CatalogSourceService(HOME_ROOT)
  void (async () => {
    await syncBridgeRows()
    await regenerateBridges()
    await ensureBridgeClientDeclarations()
  })().catch((error: unknown) => {
    console.error('[dsh-mygo-panel] startup sync failed:', error)
  })
  // rc8：live rail 事件通道（exact 先于下面的 /api/mygo prefix 匹配）。
  // P0：SSE 走与 /api/mygo 相同的读门（exact route 不经过 prefix handler）。
  registerLiveEventsRoute(ctx.webServer, req => panelCanRead(req as RawRequest, ctx))
  ctx.webServer.register({
    kind: 'prefix',
    path: '/api/mygo',
    handler: async (reqRaw: unknown, resRaw: unknown): Promise<void> => {
      const req = reqRaw as RawRequest
      const res = resRaw as RawResponse
      const method = req.method ?? 'GET'
      const path = (req.url ?? '/').split('?')[0] ?? '/'
      const json = (status: number, body: unknown): void => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        // The client status gate reads this endpoint synchronously at page
        // boot; a cached stale row would gate the browser half on an old
        // enable/disable state.
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(body))
      }
      // P0 plughub trust-fence：读门先于任何 profile 读取；写门 loopback-only。
      if (!panelCanRead(req, ctx)) {
        json(403, { ok: false, error: 'forbidden' })
        return
      }
      if (method !== 'GET' && method !== 'HEAD' && !panelCanWrite(req)) {
        json(403, {
          ok: false,
          error: '该操作会改变本机或写入宿主状态，只允许从 loopback 页面发起',
        })
        return
      }
      try {
        if (method === 'GET' && (path === '/api/mygo/plugins' || path === '/api/mygo/plugins/')) {
          const bridgePlugins = ctx.pluginManager.plugins().map((plugin: PluginHandleInfo) => ({
            id: plugin.id,
            version: plugin.version,
            status: plugin.status,
            origin: plugin.origin,
            generation: plugin.generation,
            rail: 'bridge',
            ...(plugin.entrypoints === undefined ? {} : { entrypoints: plugin.entrypoints }),
            ...(plugin.compatibility === undefined ? {} : { compatibility: plugin.compatibility }),
            ...(plugin.policyStatus === undefined ? {} : { policyStatus: plugin.policyStatus }),
            ...(plugin.reason === undefined ? {} : { reason: plugin.reason }),
          }))
          const bundlePlugins = ctx.pluginManager.bundleList().map(member => ({
            id: member.id,
            version: member.version ?? '',
            status: member.enabled ? 'enabled' : 'disabled',
            origin: 'bundle',
            generation: 0,
            rail: member.live === true ? 'live' : 'bundle',
            ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
            ...(member.hostConflicts.length === 0 ? {} : { hostConflicts: member.hostConflicts }),
          }))
          json(200, { ok: true, plugins: [...bridgePlugins, ...bundlePlugins] })
          return
        }
        if (method === 'GET' && path === '/api/mygo/status') {
          // 概览端点（面板头部）：mygo 自身版本/自更新 commit + 插件状态
          // 计数 + BOM 落盘状态。全部本地读取，无网络请求。
          const bridge = ctx.pluginManager.plugins()
          const bundles = ctx.pluginManager.bundleList()
          const countOf = (status: string): number =>
            bridge.filter(plugin => plugin.status === status).length
            + bundles.filter(member => (member.enabled ? 'enabled' : 'disabled') === status).length
          let version = 'unknown'
          try {
            const pkg = createRequire(import.meta.url)('@r05en1cu/dsh-mygo/package.json') as {
              readonly version?: unknown
            }
            if (typeof pkg.version === 'string' && pkg.version !== '') version = pkg.version
          } catch {
            // workspace/打包布局解析失败：保持 unknown
          }
          const self = await readMygoSelfState()
          const bom = await readBomStatus()
          json(200, {
            ok: true,
            mygo: {
              version,
              ...(self === undefined
                ? {}
                : { selfCommit: self.commit, ref: self.ref, url: self.url }),
            },
            plugins: {
              total: bridge.length + bundles.length,
              bridge: bridge.length,
              bundle: bundles.length,
              enabled: countOf('enabled'),
              disabled: countOf('disabled'),
              quarantined: countOf('quarantined'),
              shadowed: countOf('shadowed'),
            },
            bom,
          })
          return
        }
        if (method === 'POST' && path === '/api/mygo/bundles/install') {
          const body = JSON.parse(await readBody(req)) as { readonly spec?: string }
          const spec = body.spec?.trim()
          if (spec === undefined || spec.length === 0) throw new Error('缺少 bundle spec')
          const operation = beginPanelOperation('install', spec)
          let result: Awaited<ReturnType<PanelContext['pluginManager']['bundleInstall']>>
          try {
            result = await ctx.pluginManager.bundleInstall(spec)
          } catch (error) {
            finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
            throw error
          }
          finishPanelOperation(operation, 'ok', undefined, result.activated !== 'live')
          // rc8：live 激活的包装卸即时性广播——打开中的页面页内挂载 client 行。
          if (result.activated === 'live') {
            const url = liveRowUrlOf(name => ctx.get(name), result.member.packageName)
            broadcastLiveRail({
              type: 'live-rail',
              op: 'mount',
              id: result.member.packageName,
              ...(url === undefined ? {} : { url }),
            })
          }
          json(200, {
            ok: true,
            id: result.member.id,
            message: result.activated === 'live'
              ? `bundle ${result.member.id} 已安装并激活（刷新页面后界面可见）`
              : `bundle ${result.member.id} 已安装（重启实例后生效）`,
            activated: result.activated ?? 'pending-restart',
            plan: {
              accepted: result.plan.accepted,
              ...(result.plan.error === undefined ? {} : { error: result.plan.error }),
              ...(result.plan.warnings === undefined || result.plan.warnings.length === 0 ? {} : { warnings: result.plan.warnings }),
            },
            ...(result.member.hostConflicts.length === 0 ? {} : { hostConflicts: result.member.hostConflicts }),
          })
          return
        }
        // rc8：registry 映射与凭据管理面（.npmrc 受管块 + 官方 credentials
        // 服务；任何响应不携带机密值）。
        if (method === 'GET' && path === '/api/mygo/registries') {
          const dir = join(HOME_ROOT, 'profiles', panelProfile())
          const credentials = ctx.get('credentials') as CredentialsLike | undefined
          const registries = await Promise.all(listRegistries(dir).map(async binding => ({
            scope: binding.scope,
            registry: binding.registry,
            ...(binding.authRef === undefined ? {} : { authRef: binding.authRef }),
            ...(binding.authRef === undefined || credentials === undefined
              ? {}
              : { credential: await credentials.describe(binding.authRef) }),
          })))
          json(200, { ok: true, registries, credentialsAvailable: credentials !== undefined })
          return
        }
        const registryMatch = /^\/api\/mygo\/registries\/([^/]+)$/.exec(path)
        if (registryMatch !== null) {
          const scope = decodeURIComponent(registryMatch[1] ?? '')
          const dir = join(HOME_ROOT, 'profiles', panelProfile())
          if (method === 'PUT') {
            const body = JSON.parse(await readBody(req)) as {
              readonly registry?: unknown
              readonly authRef?: unknown
            }
            if (typeof body.registry !== 'string' || body.registry.trim() === '') {
              throw new Error('缺少 registry URL')
            }
            const result = upsertRegistry(
              dir,
              scope,
              body.registry.trim(),
              typeof body.authRef === 'string' && body.authRef.trim() !== '' ? body.authRef.trim() : undefined,
            )
            if (!result.ok) throw new Error(result.error ?? '写入失败')
            json(200, { ok: true, message: `registry ${scope} 已写入 profile .npmrc 受管块` })
            return
          }
          if (method === 'DELETE') {
            const result = removeRegistry(dir, scope)
            json(200, {
              ok: true,
              message: result.removed ? `registry ${scope} 已移除` : `registry ${scope} 不存在（幂等）`,
            })
            return
          }
        }
        const credentialMatch = /^\/api\/mygo\/credentials\/([^/]+)$/.exec(path)
        if (credentialMatch !== null && (method === 'PUT' || method === 'DELETE')) {
          const ref = decodeURIComponent(credentialMatch[1] ?? '')
          let value: unknown
          if (method === 'PUT') {
            value = (JSON.parse(await readBody(req)) as { readonly value?: unknown }).value
          }
          const result = await routeCredentialMutation(
            ctx.get('credentials') as CredentialsLike | undefined,
            method,
            ref,
            value,
          )
          json(result.status, result.body)
          return
        }
        if (method === 'POST' && path === '/api/mygo/install') {
          const body2 = JSON.parse(await readBody(req)) as InstallRequest
          const prepared = await prepareInstallSource(body2)
          const operation = beginPanelOperation('install', body2.path?.trim() || body2.url?.trim() || 'archive')
          try {
            const installed = await installFromRoot(
              ctx.pluginManager,
              prepared.root,
              body2.method as InstallManifest['method'],
              body2.method === 'github'
                ? (body2.url?.trim() ?? '')
                : body2.method === 'folder'
                  ? (body2.path?.trim() ?? '')
                  : (body2.path?.trim() ?? ''),
              body2.config,
              body2.installDeps === true,
              undefined,
              prepared.remote,
            )
            finishPanelOperation(operation, 'ok', undefined, true)
            json(200, installed)
          } catch (error) {
            finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
            throw error
          } finally {
            await prepared.cleanup()
          }
          return
        }
        if (method === 'POST' && path === '/api/mygo/install-plan') {
          const body = JSON.parse(await readBody(req)) as InstallRequest
          const prepared = await prepareInstallSource(body)
          try {
            const id = await pluginIdFromRoot(prepared.root)
            const declarative = await readDeclarativeManifest(prepared.root)
            const plan = await ctx.pluginManager.planInstall({
              id,
              ...(declarative === undefined
                ? {}
                : {
                    ...(declarative.version === undefined ? {} : { version: declarative.version }),
                    ...(declarative.declarative?.compatibility === undefined
                      ? {}
                      : { compatibility: declarative.declarative.compatibility }),
                    ...(declarative.declarative?.provides === undefined
                      ? {}
                      : { provides: declarative.declarative.provides }),
                  }),
            })
            const configInfo = await buildConfigTemplate(prepared.root)
            json(200, {
              ok: true,
              id,
              ...(configInfo === undefined
                ? {}
                : {
                    configTemplate: configInfo.template,
                    configSchema: {
                      description: configInfo.description,
                      fields: configInfo.fields,
                    },
                  }),
              plan: {
                accepted: plan.accepted,
                ...(plan.error === undefined ? {} : { error: plan.error }),
                ...(plan.warnings === undefined || plan.warnings.length === 0 ? {} : { warnings: plan.warnings }),
              },
            })
          } finally {
            await prepared.cleanup()
          }
          return
        }
        const configMatch = /^\/api\/mygo\/plugins\/([^/]+)\/config$/.exec(path)
        if (method === 'GET' && configMatch !== null) {
          const id = configMatch[1]
          let manifest: InstallManifest
          try {
            manifest = JSON.parse(await readFile(join(INSTALL_DIR, id, MANIFEST), 'utf8')) as InstallManifest
          } catch {
            throw new Error(`插件 ${id} 未安装或不是面板托管插件`)
          }
          const info = await buildConfigTemplate(join(INSTALL_DIR, id))
          const current = ctx.pluginManager.configOf(id) ?? manifest.config ?? {}
          const redacted = info === undefined
            ? { config: current as Record<string, unknown>, fields: [] }
            : redactSecretConfig(info.fields, current)
          json(200, {
            ok: true,
            id,
            current: redacted.config,
            revision: ctx.pluginManager.configRevisionOf(id) ?? 0,
            ...(info === undefined
              ? {}
              : {
                  schema: { description: info.description, fields: redacted.fields },
                  ...(typeof info.template !== 'object' || info.template === null || Array.isArray(info.template)
                    ? {}
                    : { template: redactSecretConfig(info.fields, info.template).config }),
                }),
          })
          return
        }
        if (method === 'POST' && configMatch !== null) {
          const id = configMatch[1]
          const body = JSON.parse(await readBody(req)) as {
            readonly config?: unknown
            readonly expectedRevision?: unknown
          }
          if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
            throw new Error('config 必须是 JSON 对象')
          }
          const info = await buildConfigTemplate(join(INSTALL_DIR, id))
          const stored = ctx.pluginManager.configOf(id) ?? {}
          const config = info === undefined
            ? body.config as Record<string, unknown>
            : mergeSecretConfigWrite(info.fields, body.config as Record<string, unknown>, stored)
          const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
          try {
            await ctx.pluginManager.updateConfig(id, config, expectedRevision)
          } catch (error) {
            const conflict = configConflictOf(error)
            if (conflict !== undefined) {
              json(409, {
                ok: false,
                code: 'config-revision-conflict',
                error: `插件 ${id} 配置已变化（expected revision ${conflict.expected}, actual ${conflict.actual}）`,
                id,
                ...conflict,
              })
              return
            }
            throw error
          }
          // Persist the updated config into the bridge row: the profile patch
          // is the boot-time authority, so a restart must see the new value.
          await syncBridgeRows({ [id]: ctx.pluginManager.configOf(id) })
          json(200, { ok: true, id, message: `插件 ${id} 配置已更新（HMR 生效）` })
          return
        }
        if (method === 'POST' && path === '/api/mygo/bom/export') {
          const result = await ctx.pluginManager.bomExport()
          json(200, {
            ok: true,
            jsonPath: result.jsonPath,
            mdPath: result.mdPath,
            generated: result.bom.generated,
            members: result.bom.lock.members.length,
          })
          return
        }
        // r6：配置注入后端面——卡片枚举 / 读写 / 整 profile 导入导出。
        if (method === 'GET' && path === '/api/mygo/config-cards') {
          json(200, { ok: true, cards: await collectConfigCards(ctx) })
          return
        }
        if (method === 'GET' && path === '/api/mygo/config') {
          const query = new URL(req.url ?? '/', 'http://localhost').searchParams
          const id = query.get('id') ?? ''
          const kind = query.get('kind') ?? ''
          if (id === '') {
            json(400, { ok: false, error: 'config 读取需要 id 参数' })
            return
          }
          const rowId = query.get('rowId') ?? undefined
          json(200, {
            ok: true,
            id,
            kind,
            config: await readPluginConfig(ctx, id, kind, rowId),
            revision: readPluginConfigRevision(ctx, id, kind, rowId),
          })
          return
        }
        if (method === 'PUT' && path === '/api/mygo/config') {
          const body = JSON.parse(await readBody(req)) as {
            readonly id?: string
            readonly kind?: string
            readonly rowId?: string
            readonly config?: unknown
            readonly expectedRevision?: unknown
          }
          if (body.id === undefined || typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
            json(400, { ok: false, error: 'config 写入需要 id 与对象形态的 config' })
            return
          }
          const incoming = body.config as Record<string, unknown>
          const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
          const cards = await collectConfigCards(ctx)
          const card = cards.find(candidate => candidate.id === body.id && candidate.kind === body.kind)
          if (body.kind === 'bridge') {
            const stored = ctx.pluginManager.configOf(body.id) ?? {}
            const config = card === undefined
              ? incoming
              : mergeSecretConfigWrite(card.schema.fields, incoming, stored)
            try {
              await ctx.pluginManager.updateConfig(body.id, config, expectedRevision)
            } catch (error) {
              const conflict = configConflictOf(error)
              if (conflict !== undefined) {
                json(409, {
                  ok: false,
                  code: 'config-revision-conflict',
                  error: `插件 ${body.id} 配置已变化（expected revision ${conflict.expected}, actual ${conflict.actual}）`,
                  id: body.id,
                  kind: 'bridge',
                  ...conflict,
                })
                return
              }
              throw error
            }
            await syncBridgeRows({ [body.id]: ctx.pluginManager.configOf(body.id) })
            json(200, { ok: true, id: body.id, kind: 'bridge', message: `插件 ${body.id} 配置已更新（HMR 生效）` })
            return
          }
          const rowId = body.rowId ?? await rowIdOfBundleMember(
            body.id,
            ctx.pluginManager.bundleList().find(member => member.id === body.id)?.packageName,
          )
          const current = readRowConfig(HOME_ROOT, panelProfile(), rowId)
          const config = card === undefined
            ? incoming
            : mergeSecretConfigWrite(card.schema.fields, incoming, current.ok ? current.config : {})
          const outcome = upsertRowConfig(HOME_ROOT, panelProfile(), rowId, config, expectedRevision)
          if (outcome.revisionConflict !== undefined) {
            json(409, {
              ok: false,
              code: 'config-revision-conflict',
              error: `${rowId} 行配置已变化（expected revision ${outcome.revisionConflict.expected}, actual ${outcome.revisionConflict.actual}）`,
              id: body.id,
              kind: 'bundle',
              rowId,
              ...outcome.revisionConflict,
            })
            return
          }
          if (!outcome.ok) {
            json(400, { ok: false, error: outcome.error })
            return
          }
          json(200, {
            ok: true,
            id: body.id,
            kind: 'bundle',
            rowId,
            message: `插件 ${body.id} 配置已写入 profile patch 层（宿主 watcher 重载生效）`,
          })
          return
        }
        if (method === 'GET' && path === '/api/mygo/config-export') {
          const configs = await exportProfileConfigs()
          const cards = await collectConfigCards(ctx)
          const redactedConfigs: Record<string, Record<string, unknown>> = {}
          for (const [id, config] of Object.entries(configs)) {
            const card = cards.find(candidate => candidate.id === id || candidate.rowId === id)
            redactedConfigs[id] = card === undefined
              ? config
              : redactSecretConfig(card.schema.fields, config).config
          }
          json(200, buildConfigExport(panelProfile(), redactedConfigs, new Date().toISOString()))
          return
        }
        if (method === 'PUT' && path === '/api/mygo/config-import') {
          const parsed = parseConfigImport(JSON.parse(await readBody(req)))
          if (!parsed.ok) {
            json(400, { ok: false, error: parsed.error })
            return
          }
          const patchIds = new Set(listPatchRowIds(readProfilePatchText(HOME_ROOT, panelProfile())))
          const cards = await collectConfigCards(ctx)
          const cardIds = new Set(cards.map(card => card.id))
          const bridgeIds = new Set(ctx.pluginManager.plugins().map(plugin => plugin.id))
          const partition = partitionImportTargets(parsed.configs, new Set([...patchIds, ...cardIds, ...bridgeIds]))
          const applied: string[] = []
          const failures: { readonly id: string; readonly reason: string }[] = [...partition.rejected]
          for (const id of partition.accepted) {
            try {
              const card = cards.find(candidate => candidate.id === id || candidate.rowId === id)
              if (bridgeIds.has(id)) {
                const stored = ctx.pluginManager.configOf(id) ?? {}
                const config = card === undefined
                  ? parsed.configs[id]
                  : mergeSecretConfigWrite(card.schema.fields, parsed.configs[id], stored)
                await ctx.pluginManager.updateConfig(id, config)
                applied.push(id)
                continue
              }
              const current = readRowConfig(HOME_ROOT, panelProfile(), id)
              const config = card === undefined
                ? parsed.configs[id] as Record<string, unknown>
                : mergeSecretConfigWrite(card.schema.fields, parsed.configs[id], current.ok ? current.config : {})
              const outcome = upsertRowConfig(HOME_ROOT, panelProfile(), id, config)
              if (outcome.ok) applied.push(id)
              else failures.push({ id, reason: outcome.error ?? '写入失败' })
            } catch (error) {
              failures.push({ id, reason: error instanceof Error ? error.message : String(error) })
            }
          }
          await syncBridgeRows()
          json(failures.length === 0 ? 200 : 400, {
            ok: failures.length === 0,
            applied,
            rejected: failures,
            message: failures.length === 0
              ? `已导入 ${applied.length} 个插件的配置（bridge 经 HMR、bundle 经 patch watcher 生效）`
              : `${failures.length} 个 id 导入失败`,
          })
          return
        }
        if (method === 'POST' && path === '/api/mygo/bom/check') {
          const body = JSON.parse(await readBody(req)) as { readonly target?: string }
          const report = await ctx.pluginManager.bomCheck(body.target === undefined ? {} : { target: body.target })
          json(200, { ok: report.ok, clean: report.clean, report })
          return
        }
        const helperMatch = /^\/api\/mygo\/config-helper$/.exec(path)
        if (method === 'POST' && helperMatch !== null) {
          const body = JSON.parse(await readBody(req)) as {
            readonly action?: string
            readonly message?: string
            readonly sessionId?: string
          }
          if (body.action === 'start') {
            let state = configHelpers.get(CONFIG_HELPER_SESSION)
            if (state === undefined || state.status === 'stopped') {
              state = {
                pluginId: CONFIG_HELPER_SESSION,
                startedAt: Date.now(),
                messages: [],
                debugSessions: [],
                pendingTurns: [],
                controller: new AbortController(),
                lastSeq: 0,
                status: 'idle',
              }
              configHelpers.set(CONFIG_HELPER_SESSION, state)
              registerHelperSurface(ctx)
            }
            json(200, { ok: true, startedAt: state.startedAt })
          } else if (body.action === 'chat') {
            if (typeof body.message !== 'string' || body.message.trim() === '') {
              throw new Error('message 不能为空')
            }
            json(200, await chatWithConfigHelper(ctx, body.message))
          } else if (body.action === 'stop') {
            json(200, await stopConfigHelper(ctx))
          } else if (body.action === 'status') {
            const state = configHelpers.get(CONFIG_HELPER_SESSION)
            if (state?.status === 'running' && state.runStartedAt !== undefined
              && Date.now() - state.runStartedAt > HELPER_RUN_TIMEOUT_MS) {
              const subagents = ctx.get('subagents') as
                | { interrupt(childId: string, authority: unknown): void }
                | undefined
              if (subagents !== undefined && state.childId !== undefined && state.parentAgent !== undefined) {
                try {
                  subagents.interrupt(state.childId, { kind: 'ancestor', agent: state.parentAgent })
                } catch {
                  // best effort
                }
              }
              state.pendingTurns.length = 0
              state.status = 'error'
              state.error = '助手长时间未响应，已中止，请重新发送'
            }
            json(200, state === undefined
              ? { ok: true, status: 'idle' }
              : {
                  ok: true,
                  status: state.status,
                  startedAt: state.startedAt,
                  ...(state.childId === undefined ? {} : { runId: state.childId }),
                  messages: state.messages,
                  ...(state.reply === undefined ? {} : { reply: state.reply }),
                  ...(state.error === undefined ? {} : { error: state.error }),
                })
          } else {
            throw new Error('action 必须是 start / chat / stop / status')
          }
          return
        }
        if (method === 'POST' && path === '/api/mygo/plan') {
          const body = JSON.parse(await readBody(req)) as {
            readonly op?: 'enable' | 'disable'
            readonly id?: string
            readonly force?: unknown
          }
          if (body.op !== 'enable' && body.op !== 'disable') {
            throw new Error('op 必须是 enable / disable')
          }
          if (body.id === undefined || body.id.length === 0) {
            throw new Error('缺少插件 id')
          }
          const plan = await ctx.pluginManager.plan({
            op: body.op,
            id: body.id,
            ...(body.op === 'disable' && body.force === true ? { force: true } : {}),
          } as never)
          json(200, {
            ok: true,
            plan: {
              accepted: plan.accepted,
              ...(plan.error === undefined ? {} : { error: plan.error }),
              ...(plan.warnings === undefined || plan.warnings.length === 0 ? {} : { warnings: plan.warnings }),
            },
          })
          return
        }
        if (method === 'GET' && (path === '/api/mygo/updates' || path === '/api/mygo/updates/')) {
          json(200, { ok: true, updates: await listUpdates() })
          return
        }
        if (method === 'POST' && path === '/api/mygo/updates/plugins') {
          // 批量更新（面板「全部更新」）：顺序执行，单条失败不中断；
          // body.ids 缺省 = 更新全部带远程来源的插件。
          const body = JSON.parse(await readBody(req)) as { readonly ids?: unknown }
          const wanted = new Set(
            Array.isArray(body.ids)
              ? body.ids.filter((entry): entry is string => typeof entry === 'string')
              : [],
          )
          const results: Array<{
            readonly id: string
            readonly ok: boolean
            readonly updated?: boolean
            readonly message?: string
            readonly error?: string
          }> = []
          for (const entry of await remoteInstallEntries()) {
            if (wanted.size > 0 && !wanted.has(entry.id)) continue
            try {
              const outcome = await updatePluginFromRemote(ctx, entry.id)
              results.push(outcome)
            } catch (error) {
              results.push({
                id: entry.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
          const failed = results.filter(result => !result.ok).length
          json(200, {
            ok: true,
            results,
            message: results.length === 0
              ? '没有可更新的远程插件'
              : '批量更新完成：成功 ' + (results.length - failed) + '，失败 ' + failed,
          })
          return
        }
        const updateMatch = /^\/api\/mygo\/updates\/(plugins|mygo)(?:\/([^/]+))?$/.exec(path)
        if (method === 'POST' && updateMatch !== null) {
          const kind = updateMatch[1]
          if (kind === 'mygo') {
            const result = await updateMygoFromRemote(ctx)
            json(200, result)
            if (result.updated) {
              // Touch the profile patch after the response is sent: the web
              // boot watches it and hot-reloads the tree, re-initializing
              // mygo from the freshly rebuilt code (recover() re-adopts).
              setTimeout(() => {
                void syncBridgeRows().catch((error: unknown) => {
                  console.error('[dsh-mygo-panel] self-update reload trigger failed:', error)
                })
              }, 200)
            }
            return
          }
          const id = updateMatch[2]
          if (id === undefined) throw new Error('缺少更新目标 id')
          if (kind !== 'plugins') throw new Error(`不支持的更新目标类型：${kind}`)
          const operation = beginPanelOperation('update', id)
          let updateResult: Awaited<ReturnType<typeof updatePluginFromRemote>>
          try {
            updateResult = await updatePluginFromRemote(ctx, id)
          } catch (error) {
            finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
            throw error
          }
          finishPanelOperation(operation, 'ok', undefined, updateResult.updated !== true)
          json(200, updateResult)
          return
        }
        const match = /^\/api\/mygo\/plugins\/([^/]+)\/(enable|disable|uninstall)$/.exec(path)
        if (method === 'POST' && match !== null) {
          const id = match[1]
          const action = match[2]
          if (ctx.pluginManager.bundleList().some(member => member.id === id)) {
            if (action === 'enable') {
              await ctx.pluginManager.bundleSetEnabled(id, true)
            } else if (action === 'disable') {
              let force = false
              try {
                const body = JSON.parse(await readBody(req)) as { readonly force?: unknown }
                force = body.force === true
              } catch {
                // no body: keep the default
              }
              await ctx.pluginManager.bundleSetEnabled(id, false, force)
            } else {
              // r6 卸载路由修正：bundle 轨走 profile 执行面（见 routeBundleUninstall）。
              let force = false
              try {
                const body = JSON.parse(await readBody(req)) as { readonly force?: unknown }
                force = body.force === true
              } catch {
                // no body: keep the default
              }
              const operation = beginPanelOperation('uninstall', id)
              let outcome: BundleUninstallOutcome
              try {
                outcome = await routeBundleUninstall(ctx, id, force)
              } catch (error) {
                finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
                throw error
              }
              const liveEffective = outcome.message?.includes('刷新页面后生效') === true
              finishPanelOperation(operation, 'ok', undefined, !liveEffective)
              json(outcome.ok ? 200 : 400, outcome)
            }
            return
          }
          let force = false
          if (action === 'disable') {
            try {
              const body = JSON.parse(await readBody(req)) as { readonly force?: unknown }
              force = body.force === true
            } catch {
              // no body / invalid JSON: keep the non-force default
            }
          }
          if (action === 'enable') await ctx.pluginManager.enable(id)
          else if (action === 'disable') await ctx.pluginManager.disable(id, undefined, force)
          else {
            const operation = beginPanelOperation('uninstall', id)
            try {
            let skillFile: string | undefined
            try {
              const installed = JSON.parse(await readFile(join(INSTALL_DIR, id, MANIFEST), 'utf8')) as InstallManifest
              skillFile = installed.skillFile
            } catch {
              // no manifest: nothing to clean
            }
            await ctx.pluginManager.uninstall(id)
            // Installed plugins: drop the managed directory, bridge, and rows.
            await rm(join(INSTALL_DIR, id), { recursive: true, force: true })
            await removeProjectedBridge(id)
            if (skillFile !== undefined) {
              await rm(skillFile, { force: true })
            }
            await syncBridgeRows()
            // Uninstalling the mygo-rdb extension also removes its store
            // provider row, so the manager automatically falls back to the
            // built-in sqlite registry route on the next boot.
            if (id === 'mygo-rdb') await removeStoreProviderRows()
            } catch (error) {
              finishPanelOperation(operation, 'failed', error instanceof Error ? error.message : String(error))
              throw error
            }
            finishPanelOperation(operation, 'ok', undefined, true)
          }
          json(200, {
            ok: true,
            id,
            message: action === 'enable' ? '插件已启用' : action === 'disable' ? '插件已停用' : '插件已卸载',
          })
          return
        }
        if (method === 'GET' && (path === '/api/mygo/hub' || path === '/api/mygo/hub/')) {
          const refresh = new URL(req.url ?? '/', 'http://localhost').searchParams.get('refresh') === '1'
          json(200, { ok: true, ...await panelHubDocument(ctx, refresh) })
          return
        }
        if (path === '/api/mygo/hub/sources' || path === '/api/mygo/hub/sources/') {
          if (panelCatalogSources === undefined) {
            json(503, { ok: false, error: '目录源服务未初始化' })
            return
          }
          if (method === 'GET') {
            json(200, { ok: true, config: panelCatalogSources.config() })
            return
          }
          if (method === 'PUT') {
            const body = JSON.parse(await readBody(req)) as Partial<CatalogSourceConfig>
            const config = await panelCatalogSources.saveConfig(body)
            json(200, { ok: true, config, message: '目录源配置已更新，目录已失效重取' })
            return
          }
        }
        const hubInstallMatch = /^\/api\/mygo\/hub\/(install|update)$/.exec(path)
        if (method === 'POST' && hubInstallMatch !== null) {
          const op = hubInstallMatch[1]
          if (op !== 'install' && op !== 'update') throw new Error(`不支持的 hub 操作：${op}`)
          const body = JSON.parse(await readBody(req)) as { readonly id?: unknown; readonly releaseId?: unknown }
          if (typeof body.id !== 'string' || body.id === '') throw new Error('hub 操作需要条目 id')
          const outcome = await runHubBundleInstall(
            ctx,
            body.id,
            typeof body.releaseId === 'string' && body.releaseId !== '' ? body.releaseId : undefined,
            op,
          )
          json(outcome.status, outcome.body)
          return
        }
        json(404, { ok: false, error: 'not found' })
      } catch (error) {
        const details = (error as { readonly details?: unknown }).details
        json(400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ...(details === undefined ? {} : { details }),
        })
      }
    },
  })
}
