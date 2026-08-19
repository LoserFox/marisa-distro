/**
 * mygo-cli 的安装相关实现（P5 重构口径）：profile 安装执行面（pnpm +
 * dsh.bundle 对账 + patch 层启停）已收敛进
 * @r05en1cu/dsh-mygo-loader-profile（LoaderAdapter 形态，所有 loader 的
 * 最终执行面），本文件 re-export 该面以保持既有引用不破坏；P4 多实例
 * 接管（adopt / clone）仍为本模块自有实现。
 * @module @r05en1cu/dsh-mygo-cli/install
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import {
  MYGO_MANAGER_VERSION,
  assertInsideHome,
  buildPluginPack,
  cachePack,
  compareVersions,
  importCachedPack,
  installPluginPack,
  listGzipTarMembers,
  listInstances,
  parseVersion,
  registerInstance,
  resolveMygoPaths,
} from '@r05en1cu/dsh-mygo'
import type { InstanceRecord } from '@r05en1cu/dsh-mygo'
import { profileInstall } from '@r05en1cu/dsh-mygo-loader-profile'

// P5：profile 执行面收敛进 loader 包；此处 re-export 兼容既有引用。
export {
  profileInstall,
  profileSetEnabled,
  profileUninstall,
} from '@r05en1cu/dsh-mygo-loader-profile'
export type { ProfileExecOptions, ProfileExecResult } from '@r05en1cu/dsh-mygo-loader-profile'

// ---------------------------------------------------------------------------
// P4 多实例接管：adopt（登记 + 首次对账）与 clone（跨实例插件搬运）
// ---------------------------------------------------------------------------

/** adopt 对账结果（只读扫描 + 用户级登记；不写对端插件状态）。 */
export interface AdoptInstanceResult {
  readonly ok: boolean
  readonly home: string
  /** 登记后的实例记录（用户级登记处）。 */
  readonly record?: InstanceRecord
  /** 首次对账发现的 profile 名列表。 */
  readonly profiles?: readonly string[]
  /** 对端 mygo 自身安装版本（$HOME/mygo-self.json 事实）。 */
  readonly mygoVersion?: string
  readonly error?: string | undefined
}

/** 从对端 HOME 的 profile 安装里探测 dsh 版本（首个可解析的为准）。 */
function detectDshVersion(home: string, profiles: readonly string[]): string | undefined {
  for (const profile of profiles) {
    try {
      const pkg = JSON.parse(readFileSync(
        join(home, 'profiles', profile, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
        'utf8',
      )) as { readonly version?: unknown }
      if (typeof pkg.version === 'string' && pkg.version !== '') return pkg.version
    } catch {
      // 该 profile 未安装 dsh 运行时，继续找
    }
  }
  return undefined
}

/**
 * `mygo adopt --home <path>`：把另一个实例（$DSH_HOME）登记进用户级
 * 登记处并做首次对账（只读扫描 profiles / mygo-self.json / dsh 版本）。
 * 唯一的写入面是用户级登记处本身——不写对端插件状态。
 */
export function adoptInstance(home: string, options: { readonly root?: string } = {}): AdoptInstanceResult {
  const resolved = resolve(home)
  if (!existsSync(resolved)) {
    return { ok: false, home: resolved, error: `目标实例 HOME 不存在：${resolved}` }
  }
  let profiles: readonly string[] = []
  try {
    profiles = readdirSync(join(resolved, 'profiles'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  } catch {
    // 无 profiles 目录：空实例
  }
  let mygoVersion: string | undefined
  try {
    const self = JSON.parse(readFileSync(join(resolved, 'mygo-self.json'), 'utf8')) as { readonly version?: unknown }
    if (typeof self.version === 'string' && self.version !== '') mygoVersion = self.version
  } catch {
    // mygo-self.json 缺失/损坏：版本事实缺省
  }
  const dshVersion = detectDshVersion(resolved, profiles)
  const record = registerInstance(
    { home: resolved, ...(dshVersion === undefined ? {} : { dshVersion }) },
    options.root === undefined ? {} : { root: options.root },
  )
  return {
    ok: true,
    home: resolved,
    record,
    profiles,
    ...(mygoVersion === undefined ? {} : { mygoVersion }),
  }
}

/** clone 结果。 */
export interface ClonePluginResult {
  readonly ok: boolean
  readonly id: string
  readonly version?: string
  /** 共享缓存内容寻址键（整 pack sha512）。 */
  readonly sha512?: string
  /** 共享缓存是否命中（true = 第二次导入零写盘）。 */
  readonly cacheHit?: boolean
  /** 缓存导入方式（hardlink 优先，copy 兜底）。 */
  readonly via?: 'hardlink' | 'copy'
  readonly error?: string | undefined
}

/**
 * `mygo clone --from <homeA> --to <homeB> <plugin>`：A 侧把指定插件确定性
 * 重打包为 mygo-pack → 发布进用户级共享缓存（内容寻址，第二次命中零写盘）
 * → 导入 B 侧 tmp（hardlink 优先 copy 兜底）→ 经 installPluginPack 还原
 * 安装进 B 的 `$DSH_HOME/mygo/packages/`。两侧 HOME 都必须已登记
 * （adopt 或服务启动登记）；from 与 to 不得相同；所有 B 侧落盘过
 * assertInsideHome 闸（跨 HOME 写被拒绝）。
 */
export async function clonePlugin(
  from: string,
  to: string,
  id: string,
  options: { readonly root?: string } = {},
): Promise<ClonePluginResult> {
  const fromHome = resolve(from)
  const toHome = resolve(to)
  if (fromHome === toHome) {
    return { ok: false, id, error: 'from 与 to 是同一实例 HOME，clone 无意义（已拒绝）' }
  }
  const registry = listInstances(options.root === undefined ? {} : { root: options.root })
  if (!registry.some(record => record.home === fromHome)) {
    return { ok: false, id, error: `源实例未登记（先 mygo adopt --home ${fromHome}）` }
  }
  if (!registry.some(record => record.home === toHome)) {
    return { ok: false, id, error: `目标实例未登记（先 mygo adopt --home ${toHome}）` }
  }
  const fromPaths = resolveMygoPaths('clone', { DSH_HOME: fromHome })
  const toPaths = resolveMygoPaths('clone', { DSH_HOME: toHome })
  // 隔离闸：B 侧一切落盘必须落在 B 的 HOME 内。
  assertInsideHome(toHome, toPaths.packagesRoot)
  assertInsideHome(toHome, toPaths.tmpDir)
  const idDir = join(fromPaths.packagesRoot, id)
  let versions: string[]
  try {
    versions = readdirSync(idDir).sort((left, right) => {
      const parsedLeft = parseVersion(left)
      const parsedRight = parseVersion(right)
      if (parsedLeft === undefined || parsedRight === undefined) {
        return left < right ? -1 : left > right ? 1 : 0
      }
      return compareVersions(parsedLeft, parsedRight)
    })
  } catch {
    return { ok: false, id, error: `源实例没有已还原的插件 ${id}（${idDir} 不存在）` }
  }
  const version = versions[versions.length - 1]
  if (version === undefined) {
    return { ok: false, id, error: `源实例没有已还原的插件 ${id}（无版本目录）` }
  }
  if (readRestoredPackageSync(idDir, id, version) === undefined) {
    return { ok: false, id, error: `源实例的 ${id}@${version} 缺少有效事实文件（.mygo-package.json）` }
  }
  await mkdir(fromPaths.tmpDir, { recursive: true })
  await mkdir(toPaths.tmpDir, { recursive: true })
  const stagingPack = join(fromPaths.tmpDir, `clone-${id}-${randomUUID()}.mygo-pack`)
  try {
    const built = await buildPluginPack(
      { installRoot: fromPaths.packagesRoot, tmpDir: fromPaths.tmpDir, profile: 'clone', managerVersion: MYGO_MANAGER_VERSION },
      { output: stagingPack, plugins: [id], includeCommunityDeps: false },
    )
    if (!built.ok) {
      return { ok: false, id, error: `A 侧导出失败：${built.report.summary}` }
    }
    const cached = await cachePack(stagingPack, options.root === undefined ? {} : { root: options.root })
    const imported = await importCachedPack(cached.sha512, toPaths.tmpDir, options.root === undefined ? {} : { root: options.root })
    const installed = await installPluginPack(
      { installRoot: toPaths.packagesRoot, tmpDir: toPaths.tmpDir, profile: 'clone', managerVersion: MYGO_MANAGER_VERSION },
      imported.path,
    )
    if (!installed.ok) {
      return { ok: false, id, error: `B 侧还原失败：${installed.report.summary}` }
    }
    return {
      ok: true,
      id,
      version,
      sha512: cached.sha512,
      cacheHit: cached.cached,
      via: imported.via,
    }
  } finally {
    await rm(stagingPack, { force: true })
  }
}

/** 同步版事实文件读取（clone 预检用；异步版 readRestoredPackage 的轻量镜像）。 */
function readRestoredPackageSync(idDir: string, id: string, version: string): boolean {
  try {
    const fact = JSON.parse(readFileSync(join(idDir, version, '.mygo-package.json'), 'utf8')) as {
      readonly format?: unknown
      readonly id?: unknown
      readonly version?: unknown
    }
    return fact.format === 'dsh.mygo-package/v1' && fact.id === id && fact.version === version
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// P8：restore 自动注册（语义等价于用户手工跑 dsh plugin add）
// ---------------------------------------------------------------------------

export interface PackMemberLike {
  readonly id: string
  readonly version: string
  readonly packageName: string
  readonly origin: 'embedded' | 'reference'
}

export interface PackMemberRegistration {
  readonly id: string
  readonly packageName: string
  readonly origin: 'embedded' | 'reference'
  /** 是否经 dsh.bundle 对账进 dsh.profile.bundles（false = 仅 dependencies）。 */
  readonly bundled: boolean
}

export interface RegisterPackMembersResult {
  readonly ok: boolean
  readonly registrations: readonly PackMemberRegistration[]
  readonly error?: string | undefined
}

/** 从 pack 中提取一个内嵌成员的 vendored tarball 到临时文件。 */
async function extractEmbeddedMember(packPath: string, id: string, version: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(packPath))
  const unpacked = listGzipTarMembers(bytes)
  if (unpacked.tar === undefined || unpacked.members === undefined) {
    throw new Error(`pack 不是合法 gzip/tar：${unpacked.problems.join('；')}`)
  }
  const manifestRaw = unpacked.members.find(member => member.name === 'mygo-pack.json')
  if (manifestRaw === undefined) throw new Error('pack 缺 mygo-pack.json')
  const manifest = JSON.parse(
    Buffer.from(unpacked.tar.subarray(manifestRaw.dataOffset, manifestRaw.dataOffset + manifestRaw.size)).toString('utf8'),
  ) as { readonly files?: readonly { readonly pluginId: string; readonly version: string; readonly path: string }[] }
  const file = (manifest.files ?? []).find(entry => entry.pluginId === id && entry.version === version)
  if (file === undefined) throw new Error(`pack 中没有内嵌成员 ${id}@${version}`)
  const member = unpacked.members.find(candidate => candidate.name === file.path)
  if (member === undefined) throw new Error(`pack 缺成员文件 ${file.path}`)
  const dest = join(await mkdtemp(join(tmpdir(), 'mygo-register-')), `${id}-${version}.tgz`)
  await writeFile(dest, unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size))
  return dest
}

/**
 * restore 后把成员注册进目标 profile：内嵌成员提取 vendored tarball 走
 * profileInstall（pnpm add tarball + bundle 对账），引用成员按钉死 spec
 * （packageName@version）走同一路径——与 dsh plugin add 完全同语义，
 * 幂等且不产生双行/双账。
 */
export async function registerPackMembers(
  packPath: string,
  members: readonly PackMemberLike[],
  target: { readonly home: string; readonly profile: string },
): Promise<RegisterPackMembersResult> {
  const registrations: PackMemberRegistration[] = []
  for (const member of members) {
    let spec = `${member.packageName}@${member.version}`
    if (member.origin === 'embedded') {
      try {
        spec = await extractEmbeddedMember(packPath, member.id, member.version)
      } catch (error) {
        return { ok: false, registrations, error: `提取内嵌成员 ${member.id} 失败：${error instanceof Error ? error.message : String(error)}` }
      }
    }
    const outcome = profileInstall(spec, { profile: target.profile, home: target.home, cwd: dirname(spec) })
    if (!outcome.ok) {
      return { ok: false, registrations, error: `注册 ${member.packageName} 失败：${outcome.error ?? 'pnpm 失败'}` }
    }
    registrations.push({
      id: member.id,
      packageName: member.packageName,
      origin: member.origin,
      bundled: (outcome.bundles ?? []).includes(member.packageName),
    })
  }
  return { ok: true, registrations }
}
