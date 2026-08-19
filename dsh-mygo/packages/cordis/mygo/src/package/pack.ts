/**
 * mygo plugin pack 分发体系（design-r4；2026-08-13 范围重塑）：
 * - 自建最小格式 `mygo-pack/v1`（tar.gz 容器 + 单一清单）；
 * - 确定性打包（固定成员序 / mtime/owner 归一 / gzip 无时间戳）；
 * - 安装 = 清单自校验 → 成员预检（自实现 tar 头部解析）→ vendored 哈希校验
 *   → 普通落盘还原；无跨插件求解、无 lockfile 读写（pnpm 安装状态为唯一
 *   真相源，pack 只搬运 `(id, version)` 粒度的 vendored tarball）。
 * - files[].sha512 + fileSize 成员级校验为 pack 自身完整性服务（保留）。
 * - P8：成员二态——内嵌（files[]，现状默认）与 npm 引用式（references[]：
 *   打包时从 registry 元数据固化 spec/integrity/tarball；restore 时在线
 *   拉取 + integrity 硬校验，离线点名 fail-loud；两者可混合；清单无
 *   references 键的旧 pack 照常还原）。
 * 零新增第三方依赖；tar 头部遍历为最小自实现（design-r4 §3/§6）。
 * @module @r05en1cu/dsh-mygo/src/package/pack
 */

import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { isEscapingPath, parsePackageManifest, pathProblemsOf, type PluginManifestV2 } from './manifest-v2.ts'
import { readRestoredPackage, restorePackage } from './package-restore.ts'
import { fetchRegistryMetadata } from './registry-client.ts'
import { integritySha512Hex, sha256Text } from './hash.ts'
import type { ConflictEntry, ResolutionReport } from './report.ts'
import { isValidRange, matchesVersionRange } from '../semver-range.ts'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Pack manifest schema（design-r4 §2；D-A1/D-A2；2026-08-13 去 lockfile 载荷）
// ---------------------------------------------------------------------------

export interface PackGenerated {
  readonly by: string
  readonly version: string
  readonly profile: string
  readonly at: string
}

export interface PackPluginDecl {
  readonly id: string
  /** 精确版本（无求解：pack 只搬运钉死的 (id, version) 对）。 */
  readonly version: string
  readonly packageName: string
}

export interface PackFileEntry {
  /** `files/<i>.tgz`（i = files[] 下标；files[] 按 (id, version) 排序）。 */
  readonly path: string
  readonly pluginId: string
  /** 该 vendored tarball 对应的精确版本。 */
  readonly version: string
  readonly packageName: string
  readonly sha512: string
  readonly fileSize: number
  /** packer 侧记录的 npm integrity（若有）；透传保语义载荷。 */
  readonly integrity?: string
}

export interface PackCommunityDep {
  readonly name: string
  /** package.json 中声明的区间（dependencies/peerDependencies 原文值）。 */
  readonly range: string
  readonly kind: 'dependency' | 'peerDependency'
  readonly owner: string
}

/**
 * 引用式成员（P8）：pack 不内嵌包体，只固化 npm 引用——restore 时在线
 * 拉取。`integrity`/`tarball` 打包时从 registry 元数据固化（可审计、
 * 防漂移）；spec 为钉死的 `packageName@version`。
 */
export interface PackReferenceEntry {
  readonly pluginId: string
  /** 精确版本（与 plugins[] 对齐钉死）。 */
  readonly version: string
  readonly packageName: string
  /** 钉死 npm 引用：`packageName@version`。 */
  readonly spec: string
  /** registry dist.integrity（`sha512-<base64>`）。 */
  readonly integrity: string
  /** registry dist.tarball 固化 URL。 */
  readonly tarball: string
}

export interface PackManifest {
  readonly format: 'mygo-pack/v1'
  readonly formatVersion: 1
  readonly name: string
  readonly version: string
  readonly generated: PackGenerated
  readonly manifestSha256: string
  readonly plugins: readonly PackPluginDecl[]
  readonly files: readonly PackFileEntry[]
  /** P8：npm 引用式成员（缺省 = []，旧 v1 pack 语义不变）。 */
  readonly references: readonly PackReferenceEntry[]
  readonly communityDeps: readonly PackCommunityDep[]
}

export interface ManifestProblemRef {
  readonly path: string
  readonly message: string
}

const PACK_FORMAT = 'mygo-pack/v1'
const ID_RE = /^[a-z][a-z0-9-]*$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SHA512_RE = /^[0-9a-f]{128}$/
const SHA256_RE = /^[0-9a-f]{64}$/
const FILE_PATH_RE = /^files\/\d+\.tgz$/

/** gzip 解压上限（A7）：单条 gzip 流解压后 ≤ 256 MiB，超限 → pack-invalid。 */
export const MAX_GUNZIP_BYTES = 256 * 1024 * 1024
/** 单 archive 成员数上限（A7）：≤ 10000，超限 → pack-invalid。 */
export const MAX_TAR_MEMBERS = 10000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解析并校验 pack 清单；返回问题清单（一次输出全部）。 */
export function parsePackManifest(raw: unknown): {
  readonly value?: PackManifest
  readonly problems: readonly ManifestProblemRef[]
} {
  const problems: ManifestProblemRef[] = []
  const push = (path: string, message: string): void => {
    problems.push({ path, message })
  }
  if (!isRecord(raw)) {
    push('$', '清单不是对象')
    return { problems }
  }
  if (raw.format !== PACK_FORMAT) {
    push('format', `期望 ${PACK_FORMAT}，实际 ${String(raw.format)}`)
  }
  if (raw.formatVersion !== 1) {
    push('formatVersion', `不支持的 formatVersion：${String(raw.formatVersion)}（当前支持 1）`)
  }
  if (typeof raw.name !== 'string' || raw.name === '') push('name', 'name 必须是非空字符串')
  if (typeof raw.version !== 'string' || !SEMVER_RE.test(raw.version)) {
    push('version', 'version 必须是 semver')
  }
  if (typeof raw.manifestSha256 !== 'string' || !SHA256_RE.test(raw.manifestSha256)) {
    push('manifestSha256', 'manifestSha256 必须是 64 位 hex')
  }
  const generated = raw.generated
  if (!isRecord(generated)
    || typeof generated.by !== 'string' || typeof generated.version !== 'string'
    || typeof generated.profile !== 'string' || typeof generated.at !== 'string') {
    push('generated', 'generated 缺 by/version/profile/at')
  }

  const plugins: PackPluginDecl[] = []
  if (!Array.isArray(raw.plugins)) {
    push('plugins', 'plugins 必须是数组')
  } else {
    for (const [index, entry] of raw.plugins.entries()) {
      const path = `plugins[${index}]`
      if (!isRecord(entry)) {
        push(path, '不是对象')
        continue
      }
      if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) push(`${path}.id`, '非法插件 id')
      if (typeof entry.version !== 'string' || !SEMVER_RE.test(entry.version)) push(`${path}.version`, 'version 必须是 semver')
      if (typeof entry.packageName !== 'string' || entry.packageName === '') push(`${path}.packageName`, 'packageName 必须是非空字符串')
      plugins.push({
        id: String(entry.id ?? ''),
        version: String(entry.version ?? ''),
        packageName: String(entry.packageName ?? ''),
      })
    }
  }

  const files: PackFileEntry[] = []
  if (!Array.isArray(raw.files)) {
    push('files', 'files 必须是数组')
  } else {
    const pluginKeys = new Set(plugins.map(plugin => `${plugin.id}@${plugin.version}`))
    for (const [index, entry] of raw.files.entries()) {
      const path = `files[${index}]`
      if (!isRecord(entry)) {
        push(path, '不是对象')
        continue
      }
      const filePath = typeof entry.path === 'string' ? entry.path : ''
      if (!FILE_PATH_RE.test(filePath) || isEscapingPath(filePath)) push(`${path}.path`, '路径必须是 files/<i>.tgz 形态且不逃逸')
      const version = typeof entry.version === 'string' ? entry.version : ''
      if (typeof entry.pluginId !== 'string' || !pluginKeys.has(`${String(entry.pluginId)}@${version}`)) {
        push(`${path}.pluginId`, 'pluginId+version 必须在 plugins 中')
      }
      if (typeof entry.packageName !== 'string' || entry.packageName === '') push(`${path}.packageName`, 'packageName 必须是非空字符串')
      if (typeof entry.sha512 !== 'string' || !SHA512_RE.test(entry.sha512)) push(`${path}.sha512`, 'sha512 必须是 128 位 hex')
      if (typeof entry.fileSize !== 'number' || !Number.isInteger(entry.fileSize) || entry.fileSize < 0) {
        push(`${path}.fileSize`, 'fileSize 必须是非负整数')
      }
      if (entry.integrity !== undefined && typeof entry.integrity !== 'string') push(`${path}.integrity`, 'integrity 必须是字符串')
      files.push({
        path: filePath,
        pluginId: String(entry.pluginId ?? ''),
        version,
        packageName: String(entry.packageName ?? ''),
        sha512: String(entry.sha512 ?? ''),
        fileSize: Number(entry.fileSize ?? -1),
        ...(entry.integrity === undefined ? {} : { integrity: String(entry.integrity) }),
      })
    }
  }

  const communityDeps: PackCommunityDep[] = []
  if (!Array.isArray(raw.communityDeps)) {
    push('communityDeps', 'communityDeps 必须是数组')
  } else {
    for (const [index, entry] of raw.communityDeps.entries()) {
      const path = `communityDeps[${index}]`
      if (!isRecord(entry)) {
        push(path, '不是对象')
        continue
      }
      if (typeof entry.name !== 'string' || entry.name === '') push(`${path}.name`, 'name 必须是非空字符串')
      if (typeof entry.range !== 'string' || !isValidRange(entry.range)) push(`${path}.range`, '非法 semver 区间')
      if (entry.kind !== 'dependency' && entry.kind !== 'peerDependency') push(`${path}.kind`, 'kind 必须是 dependency/peerDependency')
      if (typeof entry.owner !== 'string' || entry.owner === '') push(`${path}.owner`, 'owner 必须是非空字符串')
      communityDeps.push({
        name: String(entry.name ?? ''),
        range: String(entry.range ?? ''),
        kind: entry.kind === 'dependency' ? 'dependency' : 'peerDependency',
        owner: String(entry.owner ?? ''),
      })
    }
  }

  // P8：引用式成员（可选数组；缺省 = []，旧 v1 pack 不变）。
  const references: PackReferenceEntry[] = []
  if (raw.references !== undefined) {
    if (!Array.isArray(raw.references)) {
      push('references', 'references 必须是数组')
    } else {
      const pluginKeys = new Set(plugins.map(plugin => `${plugin.id}@${plugin.version}`))
      for (const [index, entry] of raw.references.entries()) {
        const path = `references[${index}]`
        if (!isRecord(entry)) {
          push(path, '不是对象')
          continue
        }
        const version = typeof entry.version === 'string' ? entry.version : ''
        if (typeof entry.pluginId !== 'string' || !pluginKeys.has(`${String(entry.pluginId ?? '')}@${version}`)) {
          push(`${path}.pluginId`, 'pluginId+version 必须在 plugins 中')
        }
        if (typeof entry.packageName !== 'string' || entry.packageName === '') push(`${path}.packageName`, 'packageName 必须是非空字符串')
        const spec = typeof entry.spec === 'string' ? entry.spec : ''
        if (spec !== `${String(entry.packageName ?? '')}@${version}`) push(`${path}.spec`, 'spec 必须是钉死的 packageName@version')
        if (typeof entry.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/=]+$/.test(entry.integrity)) {
          push(`${path}.integrity`, 'integrity 必须是 sha512-<base64> 形态')
        }
        if (typeof entry.tarball !== 'string' || !/^https?:\/\/\S+$/.test(entry.tarball)) {
          push(`${path}.tarball`, 'tarball 必须是 http(s) URL')
        }
        references.push({
          pluginId: String(entry.pluginId ?? ''),
          version,
          packageName: String(entry.packageName ?? ''),
          spec,
          integrity: String(entry.integrity ?? ''),
          tarball: String(entry.tarball ?? ''),
        })
      }
    }
  }

  if (problems.length > 0) return { problems }
  return {
    value: {
      format: PACK_FORMAT,
      formatVersion: 1,
      name: raw.name as string,
      version: raw.version as string,
      generated: {
        by: (raw.generated as PackGenerated).by,
        version: (raw.generated as PackGenerated).version,
        profile: (raw.generated as PackGenerated).profile,
        at: (raw.generated as PackGenerated).at,
      },
      manifestSha256: raw.manifestSha256 as string,
      plugins,
      files,
      references,
      communityDeps,
    },
    problems,
  }
}

/** 规范键序语义载荷（manifestSha256 计算口径；时间戳归一，D-A5）。 */
export function canonicalPackPayload(manifest: PackManifest): Record<string, unknown> {
  return {
    format: PACK_FORMAT,
    formatVersion: 1,
    name: manifest.name,
    version: manifest.version,
    generated: {
      by: manifest.generated.by,
      version: manifest.generated.version,
      profile: manifest.generated.profile,
      at: '<t>',
    },
    plugins: manifest.plugins.map(plugin => ({
      id: plugin.id,
      version: plugin.version,
      packageName: plugin.packageName,
    })),
    files: manifest.files.map(file => ({
      path: file.path,
      pluginId: file.pluginId,
      version: file.version,
      packageName: file.packageName,
      sha512: file.sha512,
      fileSize: file.fileSize,
      ...(file.integrity === undefined ? {} : { integrity: file.integrity }),
    })),
    // P8：references 仅在非空时进规范载荷——旧 v1 pack（无 references 键）
    // 的 manifestSha256 验证口径不变（向后兼容）。
    ...((manifest.references ?? []).length === 0 ? {} : {
      references: (manifest.references ?? []).map(reference => ({
        pluginId: reference.pluginId,
        version: reference.version,
        packageName: reference.packageName,
        spec: reference.spec,
        integrity: reference.integrity,
        tarball: reference.tarball,
      })),
    }),
    communityDeps: manifest.communityDeps.map(dep => ({
      name: dep.name,
      range: dep.range,
      kind: dep.kind,
      owner: dep.owner,
    })),
  }
}

/** 计算清单自校验哈希（sha256 of 规范键序语义 JSON）。 */
export function computePackManifestSha256(manifest: PackManifest): string {
  return sha256Text(JSON.stringify(canonicalPackPayload(manifest)))
}

// ---------------------------------------------------------------------------
// 最小 tar 头部遍历（design-r4 §3/§6：成员预检防换行文件名绕过）
// ---------------------------------------------------------------------------

export interface TarMember {
  readonly name: string
  readonly typeflag: string
  readonly size: number
  /** 数据区起点（tar buffer 内绝对偏移；仅 regular file 有意义）。 */
  readonly dataOffset: number
}

function decodeField(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString('utf8')
  const nul = text.indexOf('\0')
  return (nul >= 0 ? text.slice(0, nul) : text).trimEnd()
}

/** 归一成员名：去掉前导 `./`（GNU tar 对 `.` 根产生的形态）。 */
export function normalizeTarName(name: string): string {
  return name.startsWith('./') ? name.slice(2) : name
}

/** 遍历 tar 头部（不验证内容哈希；gzip 已解压）。成员数受 maxMembers 上限（A7）。 */
export function listTarMembers(
  tar: Uint8Array,
  maxMembers = MAX_TAR_MEMBERS,
): {
  readonly members: readonly TarMember[]
  readonly problems: readonly string[]
} {
  const members: TarMember[] = []
  const problems: string[] = []
  let offset = 0
  let zeroBlocks = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (Array.from(header).every(byte => byte === 0)) {
      zeroBlocks += 1
      if (zeroBlocks >= 2) break
      offset += 512
      continue
    }
    zeroBlocks = 0
    const rawName = decodeField(header.subarray(0, 100))
    const rawSize = decodeField(header.subarray(124, 136))
    const size = Number.parseInt(rawSize === '' ? '0' : rawSize, 8)
    if (!Number.isFinite(size) || size < 0) {
      problems.push(`tar 头部大小字段非法：${rawSize}`)
      break
    }
    const typeflag = String.fromCharCode(header[156] ?? 0)
    const prefix = decodeField(header.subarray(345, 500))
    const name = prefix === '' ? rawName : `${prefix}/${rawName}`
    members.push({
      name: normalizeTarName(name),
      typeflag,
      size,
      dataOffset: offset + 512,
    })
    if (members.length >= maxMembers) {
      problems.push(`tar 成员数超过上限 ${maxMembers}（实际 ≥ ${maxMembers}）`)
      break
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return { members, problems }
}

/** 解压 gzip + 遍历成员（失败返回 problems）；解压受 MAX_GUNZIP_BYTES 上限（A7）。 */
export function listGzipTarMembers(bytes: Uint8Array): {
  readonly tar?: Uint8Array
  readonly members?: readonly TarMember[]
  readonly problems: readonly string[]
} {
  try {
    const tar = gunzipSync(bytes, { maxOutputLength: MAX_GUNZIP_BYTES })
    const result = listTarMembers(tar)
    if (result.problems.length > 0) return { problems: result.problems }
    return { tar, members: result.members, problems: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof Error && (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      // Node 不返回流的实际解压大小；如实报告超限事实与上限值（A7）。
      return {
        problems: [`gzip 解压后超过上限 ${MAX_GUNZIP_BYTES} 字节（流实际大小无法在拒绝点测得，仅知超过上限）`],
      }
    }
    return { problems: [message] }
  }
}

function memberBytes(tar: Uint8Array, member: TarMember): Uint8Array {
  return tar.subarray(member.dataOffset, member.dataOffset + member.size)
}

function findMember(members: readonly TarMember[], name: string): TarMember | undefined {
  return members.find(member => member.name === name)
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 打包（design-r4 §5 确定性；B21）
// ---------------------------------------------------------------------------

export interface PackContext {
  /** 已还原插件根目录（`<root>/<id>/<version>/`）；build 枚举源、install 落盘目标。 */
  readonly installRoot: string
  /** 临时工作目录（打包/还原中转）。 */
  readonly tmpDir: string
  readonly profile: string
  readonly managerVersion: string
  readonly coreVersion?: string
  readonly tarCmd?: string
}

export interface PackBuildOptions {
  readonly output: string
  /** 是否收割社区依赖声明（默认 true；B25）。 */
  readonly includeCommunityDeps?: boolean
  /** 只打包指定插件 id 集（P4 clone 导出；缺省打包全部已还原插件）。 */
  readonly plugins?: readonly string[]
  /**
   * P8：引用式成员（id 列表或 'all'）。列入的成员不内嵌包体，打包时从
   * registry 元数据固化 dist.integrity/tarball 进清单（可审计、防漂移）。
   */
  readonly references?: 'all' | readonly string[]
  /** P8：引用固化的 registry 元数据来源（缺省 NPM_CONFIG_REGISTRY 或官方）。 */
  readonly registry?: string
}

export type PackBuildOutcome =
  | { readonly ok: true; readonly packPath: string; readonly sha256: string; readonly manifest: PackManifest }
  | { readonly ok: false; readonly report: ResolutionReport }

function packReport(summary: string, conflicts: readonly ConflictEntry[]): ResolutionReport {
  return {
    code: 'pack-invalid',
    summary,
    scope: 'pack',
    cycles: [],
    conflicts,
  }
}

async function readPackageJson(dir: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * 从已还原目录确定性重打包 vendored tarball：`package/` 根、固定排序、
 * mtime/owner 归一、排除 `.mygo-package.json`（含 installedAt，D-A5）。
 */
async function retarPackage(
  dir: string,
  tgzPath: string,
  tarPath: string,
  tarCmd: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  try {
    await execFileAsync(tarCmd, [
      '-cf', tarPath,
      '-C', dir,
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--exclude=.mygo-package.json',
      '--transform=s,^\\./,package/,',
      '.',
    ])
    // gzip 无时间戳（Node zlib；与 gzip -n 同归一语义，D-A5）。
    await writeFile(tgzPath, gzipSync(await readFile(tarPath)))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

function sha512Hex(bytes: Uint8Array): string {
  return createHash('sha512').update(bytes).digest('hex')
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 枚举 installRoot 下全部有效还原（`<id>/<version>/` + 事实文件），确定性排序。 */
async function enumerateRestored(installRoot: string): Promise<readonly { readonly id: string; readonly version: string; readonly dir: string }[]> {
  const out: { id: string; version: string; dir: string }[] = []
  let ids: string[]
  try {
    ids = (await readdir(installRoot)).sort()
  } catch {
    return []
  }
  for (const id of ids) {
    const idDir = join(installRoot, id)
    let versions: string[]
    try {
      versions = (await readdir(idDir)).sort()
    } catch {
      continue
    }
    for (const version of versions) {
      const dir = join(idDir, version)
      const restored = await readRestoredPackage(dir, id, version)
      if (restored !== undefined) out.push({ id, version, dir })
    }
  }
  return out
}

/** 构建 mygo-pack（确定性；B21/B25）。枚举 installRoot 的已还原插件集。 */
export async function buildPluginPack(
  ctx: PackContext,
  options: PackBuildOptions,
): Promise<PackBuildOutcome> {
  const filter = options.plugins === undefined ? undefined : new Set(options.plugins)
  const restored = (await enumerateRestored(ctx.installRoot))
    .filter(entry => filter === undefined || filter.has(entry.id))
  if (restored.length === 0) {
    const summary = filter === undefined
      ? '没有可打包的已还原插件（installRoot 为空）'
      : `没有可打包的已还原插件（过滤集 ${[...filter].join(', ')} 在 installRoot 无匹配）`
    return { ok: false, report: packReport(summary, []) }
  }
  const work = await mkdtemp(join(ctx.tmpDir, 'mygo-pack-'))
  const packageRoot = join(work, 'package')
  const filesDir = join(packageRoot, 'files')
  await mkdir(filesDir, { recursive: true })
  try {
    const tarCmd = ctx.tarCmd ?? 'tar'
    const packageNames = new Map<string, string>()
    for (const entry of restored) {
      const fact = await readRestoredPackage(entry.dir, entry.id, entry.version)
      if (fact !== undefined) {
        const pkg = await readPackageJson(entry.dir)
        if (typeof pkg?.name === 'string') packageNames.set(`${entry.id}@${entry.version}`, pkg.name)
      }
    }
    const managedNames = new Set(packageNames.values())
    // P8：引用式成员集（id → 引用）；其余成员照常内嵌。
    const referenceIds = new Set<string>(
      options.references === 'all'
        ? restored.map(entry => entry.id)
        : options.references ?? [],
    )
    for (const id of referenceIds) {
      if (!restored.some(entry => entry.id === id)) {
        return { ok: false, report: packReport(`引用式成员 ${id} 不在已还原集内`, []) }
      }
    }
    const embedded = restored.filter(entry => !referenceIds.has(entry.id))
    const referenceEntries: PackReferenceEntry[] = []
    const fileEntries: PackFileEntry[] = []
    const communityDeps: PackCommunityDep[] = []
    const problems: ConflictEntry[] = []
    const collectDeps = async (entry: { readonly id: string; readonly version: string; readonly dir: string }): Promise<void> => {
      if (options.includeCommunityDeps === false) return
      const pkg = await readPackageJson(entry.dir)
      if (pkg === undefined) return
      const collect = (
        source: Record<string, unknown> | undefined,
        kind: 'dependency' | 'peerDependency',
      ): void => {
        for (const [name, range] of Object.entries(source ?? {})) {
          if (typeof range !== 'string' || managedNames.has(name)) continue
          communityDeps.push({ name, range, kind, owner: entry.id })
        }
      }
      collect(pkg.dependencies as Record<string, unknown> | undefined, 'dependency')
      collect(pkg.peerDependencies as Record<string, unknown> | undefined, 'peerDependency')
    }
    for (const entry of restored.filter(entry => referenceIds.has(entry.id))) {
      // 引用固化：registry 元数据取该版本的 dist.integrity/tarball。
      const packageName = packageNames.get(`${entry.id}@${entry.version}`) ?? entry.id
      try {
        const metadata = await fetchRegistryMetadata(packageName, {
          ...(options.registry === undefined ? {} : { registry: options.registry }),
        })
        const versionInfo = metadata.versions.find(candidate => candidate.version === entry.version)
        if (versionInfo?.integrity === undefined) {
          problems.push({
            plugin: entry.id,
            constraint: { kind: 'pack', target: packageName, range: entry.version },
            chain: [entry.id],
            candidates: [{ version: entry.version, rejected: ['registry 元数据缺该版本或缺 dist.integrity（无法固化引用）'] }],
            actions: ['改用内嵌式打包（去掉 --ref）或确认 registry 提供 integrity'],
          })
          continue
        }
        referenceEntries.push({
          pluginId: entry.id,
          version: entry.version,
          packageName,
          spec: `${packageName}@${entry.version}`,
          integrity: versionInfo.integrity,
          tarball: versionInfo.tarball,
        })
        await collectDeps(entry)
      } catch (error) {
        problems.push({
          plugin: entry.id,
          constraint: { kind: 'pack', target: packageName, range: entry.version },
          chain: [entry.id],
          candidates: [{ version: entry.version, rejected: [`引用固化失败：${error instanceof Error ? error.message : String(error)}`] }],
          actions: ['检查 registry 可达性后重试，或改用内嵌式打包'],
        })
      }
    }
    referenceEntries.sort((a, b) => `${a.pluginId}@${a.version}`.localeCompare(`${b.pluginId}@${b.version}`))
    for (const [index, entry] of embedded.entries()) {
      const tgzPath = join(filesDir, `${index}.tgz`)
      const tarPath = join(work, `${index}.tar`)
      const retar = await retarPackage(entry.dir, tgzPath, tarPath, tarCmd)
      if (!retar.ok) {
        problems.push({
          plugin: entry.id,
          constraint: { kind: 'pack', target: entry.id, range: entry.version },
          chain: [entry.id],
          candidates: [{ version: entry.version, rejected: [`确定性重打包失败：${retar.reason}`] }],
          actions: ['检查系统 tar 是否支持 --sort=name/--transform'],
        })
        continue
      }
      const bytes = await readFile(tgzPath)
      const parsed = listGzipTarMembers(new Uint8Array(bytes))
      if (parsed.problems.length > 0 || parsed.members === undefined
        || findMember(parsed.members, 'package/package.json') === undefined) {
        problems.push({
          plugin: entry.id,
          constraint: { kind: 'pack', target: tgzPath, range: entry.version },
          chain: [entry.id],
          candidates: [{ version: entry.version, rejected: ['重打包产物不是合法 npm tarball（缺 package/package.json）'] }],
          actions: ['检查还原目录完整性后重试'],
        })
        continue
      }
      const fact = await readRestoredPackage(entry.dir, entry.id, entry.version)
      fileEntries.push({
        path: `files/${index}.tgz`,
        pluginId: entry.id,
        version: entry.version,
        packageName: packageNames.get(`${entry.id}@${entry.version}`) ?? entry.id,
        sha512: sha512Hex(new Uint8Array(bytes)),
        fileSize: bytes.length,
        ...(fact?.integrity === undefined ? {} : { integrity: fact.integrity }),
      })
      await collectDeps(entry)
    }
    if (problems.length > 0) {
      return {
        ok: false,
        report: {
          ...packReport(`打包失败：${problems.length} 个插件无法打包`, problems),
        },
      }
    }
    communityDeps.sort((a, b) => {
      const byName = a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      if (byName !== 0) return byName
      const byOwner = a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0
      if (byOwner !== 0) return byOwner
      return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0
    })
    const manifestBase: Omit<PackManifest, 'manifestSha256'> = {
      format: PACK_FORMAT,
      formatVersion: 1,
      name: `${ctx.profile}-plugins`,
      version: '1.0.0',
      generated: {
        by: 'dsh-mygo',
        version: ctx.managerVersion,
        profile: ctx.profile,
        at: '<t>',
      },
      plugins: restored.map(entry => ({
        id: entry.id,
        version: entry.version,
        packageName: packageNames.get(`${entry.id}@${entry.version}`) ?? entry.id,
      })),
      files: fileEntries,
      references: referenceEntries,
      communityDeps,
    }
    const manifest: PackManifest = {
      ...manifestBase,
      manifestSha256: sha256Text(JSON.stringify(canonicalPackPayload(manifestBase as PackManifest))),
    }
    // 空 references 不落盘（保持全内嵌 pack 输出与 P8 前逐字节一致；
    // parse 时缺省归一为 []）。
    const { references: _omit, ...manifestRest } = manifest
    const manifestForWrite = referenceEntries.length === 0
      ? manifestRest
      : { ...manifestRest, references: referenceEntries }
    await writeFile(join(packageRoot, 'mygo-pack.json'), JSON.stringify(manifestForWrite, null, 2) + '\n', 'utf8')

    const tarPath = join(work, 'pack.tar')
    await execFileAsync(tarCmd, [
      '-cf', tarPath,
      '-C', packageRoot,
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      'mygo-pack.json',
      'files',
    ])
    // Node zlib gzipSync：gzip 头不嵌文件名/时间戳（与 gzip -n 同归一语义，D-A5）。
    const packBytes = gzipSync(await readFile(tarPath))
    await mkdir(dirname(options.output), { recursive: true })
    await writeFile(`${options.output}.tmp`, packBytes)
    await rename(`${options.output}.tmp`, options.output)
    return { ok: true, packPath: options.output, sha256: sha256Hex(new Uint8Array(packBytes)), manifest }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 安装（design-r4 §3/§6/§7；B22/B23/B24/B25；2026-08-13 去求解/lockfile）
// ---------------------------------------------------------------------------

export interface PackInstallOptions {
  /** 安装侧 core 版本覆盖（缺省用 PackContext.coreVersion）。 */
  readonly coreVersion?: string
  /** P8：引用式成员拉取的 fetch 注入（测试/代理；缺省全局 fetch）。 */
  readonly fetchImpl?: (url: string) => Promise<{
    readonly ok: boolean
    readonly status: number
    arrayBuffer(): Promise<ArrayBuffer>
  }>
}

export type PackInstallOutcome =
  | {
    readonly ok: true
    /** 本次还原的 (id, version) 清单（确定性序）。 */
    readonly restored: readonly { readonly id: string; readonly version: string }[]
    /** P8：成员明细（id/version/packageName/来源），注册面消费。 */
    readonly members: readonly {
      readonly id: string
      readonly version: string
      readonly packageName: string
      readonly origin: 'embedded' | 'reference'
    }[]
    readonly warnings: readonly string[]
  }
  | { readonly ok: false; readonly report: ResolutionReport }

function hashReport(conflicts: readonly ConflictEntry[], summary: string): ResolutionReport {
  return {
    code: 'pack-hash-mismatch',
    summary,
    scope: 'pack',
    cycles: [],
    conflicts,
  }
}

/** 安装 mygo-pack：全部校验先于任何落盘写入（整体拒绝，D-A7）；离线。 */
export async function installPluginPack(
  ctx: PackContext,
  packPath: string,
  options: PackInstallOptions = {},
): Promise<PackInstallOutcome> {
  let packBytes: Uint8Array
  try {
    packBytes = new Uint8Array(await readFile(packPath))
  } catch (error) {
    return {
      ok: false,
      report: packReport(`无法读取 pack 文件：${error instanceof Error ? error.message : String(error)}`, []),
    }
  }
  const unpacked = listGzipTarMembers(packBytes)
  if (unpacked.tar === undefined || unpacked.members === undefined) {
    return {
      ok: false,
      report: packReport(`pack 不是合法 gzip/tar：${unpacked.problems.join('；')}`, []),
    }
  }
  const members = unpacked.members
  const manifestMember = findMember(members, 'mygo-pack.json')
  if (manifestMember === undefined || manifestMember.typeflag !== '0') {
    return { ok: false, report: packReport('pack 缺少 mygo-pack.json 成员', []) }
  }
  // A5-pack：清单成员 JSON 解析加固——畸形 JSON → pack-invalid（带文件指针），
  // 原始 SyntaxError MUST NOT 逃逸出 installPluginPack。
  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(Buffer.from(memberBytes(unpacked.tar, manifestMember)).toString('utf8')) as unknown
  } catch (error) {
    return {
      ok: false,
      report: packReport(
        `pack 清单不是合法 JSON（mygo-pack.json）：${error instanceof Error ? error.message : String(error)}`,
        [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: 'mygo-pack.json', range: 'json' },
          chain: ['<pack>'],
          candidates: [{ version: '<manifest>', rejected: ['清单成员不是合法 JSON'] }],
          actions: ['重新打包或从可信来源获取 pack'],
        }],
      ),
    }
  }
  const parsed = parsePackManifest(manifestRaw)
  if (parsed.value === undefined) {
    return {
      ok: false,
      report: packReport(
        `pack 清单无效：${parsed.problems.map(problem => `${problem.path}: ${problem.message}`).join('；')}`,
        parsed.problems.map(problem => ({
          plugin: '<pack>',
          constraint: { kind: 'pack', target: problem.path, range: 'manifest' },
          chain: ['<pack>'],
          candidates: [{ version: '<manifest>', rejected: [problem.message] }],
          actions: ['重新打包或修复清单'],
        })),
      ),
    }
  }
  const manifest = parsed.value
  const expectedSha = computePackManifestSha256(manifest)
  if (expectedSha !== manifest.manifestSha256) {
    return {
      ok: false,
      report: packReport('pack 清单自校验失败（manifestSha256 失配）', [{
        plugin: '<pack>',
        constraint: { kind: 'pack', target: 'mygo-pack.json', range: 'manifestSha256' },
        chain: ['<pack>'],
        candidates: [{ version: '<manifest>', rejected: [`清单哈希失配（期望 ${manifest.manifestSha256.slice(0, 12)}…）`] }],
        actions: ['重新打包或从可信来源获取 pack'],
      }]),
    }
  }

  // 成员清单前置校验：精确成员集 + 类型限制（防换行文件名绕过，design-r4 §3）。
  const allowedNames = new Set(['mygo-pack.json', 'files/', ...manifest.files.map(file => file.path)])
  const unknownMembers = members
    .filter(member => !allowedNames.has(member.name) || (member.typeflag !== '0' && member.typeflag !== '5'))
    .map(member => `${member.name}（type ${member.typeflag}）`)
  if (unknownMembers.length > 0) {
    return {
      ok: false,
      report: packReport(`pack 含未知/非法成员：${unknownMembers.join('；')}`, unknownMembers.map(name => ({
        plugin: '<pack>',
        constraint: { kind: 'pack', target: name, range: 'members' },
        chain: ['<pack>'],
        candidates: [{ version: '<member>', rejected: ['成员不在清单声明集合内'] }],
        actions: ['从可信来源重新获取 pack'],
      }))),
    }
  }

  // 空 pack 显式拒绝（A18，已裁决）：plugins 为空 → pack-invalid，预检阶段拒绝。
  if (manifest.plugins.length === 0) {
    return {
      ok: false,
      report: packReport('pack 不含任何插件（plugins 为空），拒绝空 pack 还原', [{
        plugin: '<pack>',
        constraint: { kind: 'pack', target: 'plugins', range: 'empty' },
        chain: ['<pack>'],
        candidates: [{ version: '<manifest>', rejected: ['plugins 数组为空'] }],
        actions: ['重新打包并确认 pack 包含至少一个插件'],
      }]),
    }
  }

  // 预检：plugins[] ↔ files[] ∪ references[] 以 (id, version) 一一对应
  // （P8：内嵌成员在 files[]，引用成员在 references[]，两者不重叠）。
  const pluginKeySet = new Set<string>()
  for (const plugin of manifest.plugins) {
    const key = `${plugin.id}@${plugin.version}`
    if (pluginKeySet.has(key)) {
      return {
        ok: false,
        report: packReport(`pack 清单 plugins[] 重复声明插件 ${key}`, [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: plugin.id, range: 'plugins' },
          chain: ['<pack>'],
          candidates: [{ version: plugin.version, rejected: ['plugins[] 重复 (id, version)'] }],
          actions: ['重新打包'],
        }]),
      }
    }
    pluginKeySet.add(key)
  }
  const seenFileKeys = new Set<string>()
  for (const [index, file] of manifest.files.entries()) {
    if (file.path !== `files/${index}.tgz`) {
      return {
        ok: false,
        report: packReport(`pack 清单 files[${index}].path 必须是 files/${index}.tgz（实际 ${file.path}）`, [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: file.path, range: 'files' },
          chain: ['<pack>'],
          candidates: [{ version: '<manifest>', rejected: ['files[] 下标与 path 不匹配'] }],
          actions: ['重新打包'],
        }]),
      }
    }
    const key = `${file.pluginId}@${file.version}`
    if (seenFileKeys.has(key)) {
      return {
        ok: false,
        report: packReport(`pack 清单 files[] 重复声明插件 ${key}`, [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: file.path, range: 'files' },
          chain: ['<pack>'],
          candidates: [{ version: file.version, rejected: ['files[] 重复 (id, version)'] }],
          actions: ['重新打包'],
        }]),
      }
    }
    seenFileKeys.add(key)
  }
  const seenReferenceKeys = new Set<string>()
  for (const reference of manifest.references) {
    const key = `${reference.pluginId}@${reference.version}`
    if (seenReferenceKeys.has(key) || seenFileKeys.has(key)) {
      return {
        ok: false,
        report: packReport(`pack 清单成员 ${key} 在 files[]/references[] 重复声明`, [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: key, range: 'references' },
          chain: ['<pack>'],
          candidates: [{ version: reference.version, rejected: ['成员同时出现在内嵌与引用集合'] }],
          actions: ['重新打包'],
        }]),
      }
    }
    seenReferenceKeys.add(key)
  }
  const memberKeys = new Set([...seenFileKeys, ...seenReferenceKeys])
  if (memberKeys.size !== pluginKeySet.size || [...pluginKeySet].some(key => !memberKeys.has(key))) {
    const missing = [...pluginKeySet].filter(key => !memberKeys.has(key))
    const extra = [...memberKeys].filter(key => !pluginKeySet.has(key))
    return {
      ok: false,
      report: packReport(
        `pack 清单 plugins[] 与成员集（files[]∪references[]）不一一对应（缺：${missing.join(', ') || '无'}；多出：${extra.join(', ') || '无'}）`,
        [{
          plugin: '<pack>',
          constraint: { kind: 'pack', target: missing[0] ?? extra[0] ?? 'plugins', range: 'files' },
          chain: ['<pack>'],
          candidates: [{ version: '<manifest>', rejected: ['plugins[] 与成员集合不一致'] }],
          actions: ['重新打包并保持 plugins[] 与 files[]∪references[] 一一对应'],
        }],
      ),
    }
  }

  // vendored 文件哈希校验（先于一切落盘写入，mrpack 先例；pack 自身完整性）。
  const hashConflicts: ConflictEntry[] = []
  const fileBytes = new Map<string, Uint8Array>()
  for (const file of manifest.files) {
    const member = findMember(members, file.path)
    if (member === undefined || member.typeflag !== '0') {
      hashConflicts.push({
        plugin: '<pack>',
        constraint: { kind: 'pack', target: file.path, range: 'missing' },
        chain: ['<pack>'],
        candidates: [{ version: '<file>', rejected: ['清单声明的 vendored 文件不存在'] }],
        actions: ['重新打包'],
      })
      continue
    }
    const bytes = memberBytes(unpacked.tar, member)
    if (member.size !== file.fileSize || sha512Hex(bytes) !== file.sha512) {
      hashConflicts.push({
        plugin: '<pack>',
        constraint: { kind: 'pack', target: file.path, range: 'sha512' },
        chain: ['<pack>'],
        candidates: [{
          version: '<file>',
          rejected: [`内容哈希/大小失配（声明 sha512 ${file.sha512.slice(0, 12)}…，大小 ${file.fileSize}）`],
        }],
        actions: ['从可信来源重新获取 pack'],
      })
      continue
    }
    fileBytes.set(file.path, bytes)
  }
  if (hashConflicts.length > 0) {
    return {
      ok: false,
      report: hashReport(hashConflicts, `pack 文件校验失败：${hashConflicts.length} 个文件`),
    }
  }

  // P8：引用式成员在线拉取（全部拉取与 integrity 校验先于任何落盘写入；
  // 失败即整体拒绝、零写盘，并点名缺失成员——离线环境的 fail-loud 面）。
  const referenceBytes = new Map<string, Uint8Array>()
  if (manifest.references.length > 0) {
    const fetchFailures: ConflictEntry[] = []
    for (const reference of manifest.references) {
      const key = `${reference.pluginId}@${reference.version}`
      try {
        const response = await (options.fetchImpl ?? fetch)(reference.tarball)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const expectedHex = integritySha512Hex(reference.integrity)
        const actualHex = createHash('sha512').update(bytes).digest('hex')
        if (expectedHex === undefined || actualHex !== expectedHex) {
          throw new Error(`integrity 不符（清单声明 ${reference.integrity.slice(0, 28)}…）`)
        }
        referenceBytes.set(key, bytes)
      } catch (error) {
        fetchFailures.push({
          plugin: reference.pluginId,
          constraint: { kind: 'pack', target: reference.tarball, range: reference.version },
          chain: [reference.pluginId],
          candidates: [{
            version: reference.version,
            rejected: [`引用成员拉取失败：${error instanceof Error ? error.message : String(error)}`],
          }],
          actions: ['确认网络/registry 可达后重试，或换用全内嵌 pack（离线场景）'],
        })
      }
    }
    if (fetchFailures.length > 0) {
      return {
        ok: false,
        report: packReport(
          `引用式成员拉取失败（restore 引用成员需要在线）：${fetchFailures.map(failure => `${failure.plugin}@${failure.constraint.range}`).join(', ')}`,
          fetchFailures,
        ),
      }
    }
  }

  // 统一成员还原面（plugins[] 序确定性；内嵌与引用同路径同语义）。
  const restorePlan = manifest.plugins.map(plugin => {
    const key = `${plugin.id}@${plugin.version}`
    const file = manifest.files.find(candidate => `${candidate.pluginId}@${candidate.version}` === key)
    if (file !== undefined) {
      return { origin: 'embedded' as const, plugin, file, bytes: fileBytes.get(file.path) }
    }
    const reference = manifest.references.find(candidate => `${candidate.pluginId}@${candidate.version}` === key)
    return { origin: 'reference' as const, plugin, reference, bytes: referenceBytes.get(key) }
  })

  // 内层 tarball 预检（B23）：manifest 形状/身份一致性，全部通过才落盘。
  const preflightManifests = new Map<string, PluginManifestV2>()
  const preflightProblems: ConflictEntry[] = []
  for (const plan of restorePlan) {
    const target = plan.origin === 'embedded' ? plan.file?.path ?? '' : plan.reference?.tarball ?? ''
    const bytes = plan.bytes
    if (bytes === undefined) continue
    const inner = listGzipTarMembers(bytes)
    if (inner.tar === undefined || inner.members === undefined) {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'tarball' },
        chain: [plan.plugin.id],
        candidates: [{ version: '<file>', rejected: [`内层 tarball 非法：${inner.problems.join('；')}`] }],
        actions: ['重新打包'],
      })
      continue
    }
    const pkgJsonMember = findMember(inner.members, 'package/package.json')
    if (pkgJsonMember === undefined || pkgJsonMember.typeflag !== '0') {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'package.json' },
        chain: [plan.plugin.id],
        candidates: [{ version: '<file>', rejected: ['内层 tarball 缺 package/package.json'] }],
        actions: ['重新打包'],
      })
      continue
    }
    let pkgRaw: Record<string, unknown>
    try {
      pkgRaw = JSON.parse(Buffer.from(memberBytes(inner.tar, pkgJsonMember)).toString('utf8')) as Record<string, unknown>
    } catch {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'package.json' },
        chain: [plan.plugin.id],
        candidates: [{ version: '<file>', rejected: ['package.json 不是合法 JSON'] }],
        actions: ['重新打包'],
      })
      continue
    }
    const pluginParsed = parsePackageManifest(pkgRaw)
    if (pluginParsed.value === undefined) {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'manifest' },
        chain: [plan.plugin.id],
        candidates: [{ version: '<file>', rejected: pluginParsed.problems.map(problem => `${problem.path}: ${problem.message}`) }],
        actions: ['由插件作者修复 dsh.mygo manifest'],
      })
      continue
    }
    if (pkgRaw.name !== plan.plugin.packageName || pluginParsed.value.id !== plan.plugin.id
      || pluginParsed.value.version !== plan.plugin.version) {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'identity' },
        chain: [plan.plugin.id],
        candidates: [{
          version: pluginParsed.value.version,
          rejected: [`包身份与清单不一致（packageName=${String(pkgRaw.name)}，id=${pluginParsed.value.id}，声明=${plan.plugin.id}@${plan.plugin.version}）`],
        }],
        actions: ['重新打包'],
      })
      continue
    }
    const pathProblems = pathProblemsOf(pluginParsed.value)
    if (pathProblems.length > 0) {
      preflightProblems.push({
        plugin: plan.plugin.id,
        constraint: { kind: 'pack', target, range: 'paths' },
        chain: [plan.plugin.id],
        candidates: [{ version: pluginParsed.value.version, rejected: pathProblems.map(problem => `${problem.path}: ${problem.message}`) }],
        actions: ['由插件作者修复路径声明'],
      })
      continue
    }
    preflightManifests.set(`${plan.plugin.id}@${plan.plugin.version}`, pluginParsed.value)
  }
  if (preflightProblems.length > 0) {
    // 任务 1.3：summary 必须携带实际违例与上限值（而非只报个数）。
    const detailLines = preflightProblems.flatMap(problem => problem.candidates[0]?.rejected ?? [])
    return {
      ok: false,
      report: packReport(`pack 内层校验失败：${preflightProblems.length} 个插件（${detailLines.join('；')}）`, preflightProblems),
    }
  }

  // 落盘还原（普通目录语义）：任一失败回滚本次新增目录 + 还原移开的既有目录。
  const createdDirs: string[] = []
  const createdIdDirs: string[] = []
  const movedAside = new Map<string, string>()
  const rollback = async (): Promise<void> => {
    for (const dir of [...createdDirs].reverse()) {
      await rm(dir, { recursive: true, force: true })
    }
    // 本 restore 新建的 id 级目录（现为空）一并摘除；仅在 id 目录为本次新建时
    // 才允许递归删除，避免误删既有的其他版本目录（零残留口径）。
    for (const dir of [...createdIdDirs].reverse()) {
      await rm(dir, { recursive: true, force: true })
    }
    for (const [dir, backup] of movedAside) {
      await rm(dir, { recursive: true, force: true })
      await rename(backup, dir)
    }
  }
  const restored: { id: string; version: string }[] = []
  for (const plan of restorePlan) {
    const bytes = plan.bytes
    const preflightManifest = preflightManifests.get(`${plan.plugin.id}@${plan.plugin.version}`)
    if (bytes === undefined || preflightManifest === undefined) {
      // 预检 1:1 + 哈希环之后本分支不可达；防御性保留并保证零残留。
      await rollback()
      return {
        ok: false,
        report: packReport(`还原缺少成员包体：${plan.plugin.id}`, [{
          plugin: plan.plugin.id,
          constraint: { kind: 'pack', target: plan.plugin.id, range: plan.plugin.version },
          chain: [plan.plugin.id],
          candidates: [{ version: plan.plugin.version, rejected: ['无对应成员条目'] }],
          actions: ['重新打包'],
        }]),
      }
    }
    const dir = join(ctx.installRoot, plan.plugin.id, plan.plugin.version)
    const existing = await readRestoredPackage(dir, plan.plugin.id, plan.plugin.version)
    if (existing !== undefined && existing.entrySha256 !== '') {
      // 同版本有效事实文件已存在：复用，不重写。
      restored.push({ id: plan.plugin.id, version: plan.plugin.version })
      continue
    }
    // 目录不存在或损坏：先移开旧目录（若存在）再全新还原，失败可整体回滚。
    const idDir = dirname(dir)
    const existed = await dirExists(dir)
    const idDirExisted = existed || await dirExists(idDir)
    if (existed) {
      await mkdir(idDir, { recursive: true })
      await mkdir(ctx.tmpDir, { recursive: true })
      const backup = join(ctx.tmpDir, `mygo-restore-bak-${randomUUID()}`)
      await rename(dir, backup)
      movedAside.set(dir, backup)
    }
    const expectedSha512Hex = plan.origin === 'embedded'
      ? plan.file?.sha512
      : integritySha512Hex(plan.reference?.integrity ?? '')
    const sourceIntegrity = plan.origin === 'embedded' ? plan.file?.integrity : plan.reference?.integrity
    try {
      await restorePackage(dir, {
        version: plan.plugin.version,
        tarball: plan.origin === 'embedded' ? plan.file?.path ?? '' : plan.reference?.tarball ?? '',
        manifest: preflightManifest,
        ...(sourceIntegrity === undefined ? {} : { integrity: sourceIntegrity }),
      }, {
        localTarballBytes: bytes,
        ...(expectedSha512Hex === undefined ? {} : { expectedSha512Hex }),
        tmpDir: ctx.tmpDir,
        origin: plan.origin === 'embedded' ? 'pack-embedded' : 'pack-reference',
        ...(ctx.tarCmd === undefined ? {} : { tarCmd: ctx.tarCmd }),
      })
    } catch (error) {
      await rollback()
      return {
        ok: false,
        report: packReport(`还原失败：${plan.plugin.id}（${error instanceof Error ? error.message : String(error)}）`, [{
          plugin: plan.plugin.id,
          constraint: { kind: 'pack', target: plan.origin === 'embedded' ? plan.file?.path ?? '' : plan.reference?.tarball ?? '', range: plan.plugin.version },
          chain: [plan.plugin.id],
          candidates: [{ version: plan.plugin.version, rejected: ['成员包体提取/校验失败'] }],
          actions: ['从可信来源重新获取 pack 后重试'],
        }]),
      }
    }
    if (!existed) createdDirs.push(dir)
    if (!idDirExisted) createdIdDirs.push(idDir)
    restored.push({ id: plan.plugin.id, version: plan.plugin.version })
  }
  for (const backup of movedAside.values()) {
    await rm(backup, { recursive: true, force: true })
  }

  // 双存在 + 社区元数据告警（B25；永不阻断）。
  const coreVersion = options.coreVersion ?? ctx.coreVersion
  const warnings: string[] = []
  const managedPackageNames = new Set(manifest.plugins.map(plugin => plugin.packageName))
  for (const dep of manifest.communityDeps) {
    warnings.push(`社区依赖（${dep.kind}）：${dep.owner} 声明 ${dep.name}@${dep.range}——mygo 不安装，需 npm 侧解析`)
    if (managedPackageNames.has(dep.name)) {
      warnings.push(`双存在风险：${dep.name} 既是本 pack 的 mygo 插件，又被 ${dep.owner} 以 ${dep.kind} 声明（重复实例风险，two-tier §10）`)
    }
    const isCoreSignal = dep.name === '@deepseek-ai/dsh' || dep.name === 'cordis' || dep.name === '@deepseek-ai/dsh-tools'
    if (isCoreSignal && coreVersion !== undefined && !matchesVersionRange(coreVersion, dep.range)) {
      warnings.push(`核心版本告警：当前 dsh 核心 ${coreVersion} 不满足 ${dep.name} 声明的 ${dep.range}`)
    }
  }

  const memberFacts = restorePlan.map(plan => ({
    id: plan.plugin.id,
    version: plan.plugin.version,
    packageName: plan.plugin.packageName,
    origin: plan.origin,
  }))
  return { ok: true, restored, members: memberFacts, warnings }
}
