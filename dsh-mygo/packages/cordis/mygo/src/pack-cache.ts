/**
 * 跨实例只读共享缓存（P4）：用户家目录 `.dsh-mygo/cache/packs/` 内容寻址
 * （整个 pack 文件的 sha512 hex 作文件名），只存不可变 mygo-pack。
 *
 * - 写入：先经 pack.ts 现有校验（清单自校验 manifestSha256 + vendored
 *   成员 sha512/fileSize 逐条复核），staging → rename 原子发布；同内容
 *   第二次写入直接命中（`cached: true`，零写盘）。
 * - 导入：hardlink 优先、copy 兜底（跨设备 EXDEV 等场景）；目标目录由
 *   调用方给定并自行过 assertInsideHome（缓存在用户级，落盘必须在目标
 *   实例 HOME 内）。
 * - 只读共享：缓存文件发布后不再改写（内容寻址保证同名即同内容）；
 *   并发发布为同内容原子 rename，无竞态损坏面。
 * @module @r05en1cu/dsh-mygo/src/pack-cache
 */

import { createHash, randomUUID } from 'node:crypto'
import { copyFile, link, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computePackManifestSha256,
  listGzipTarMembers,
  parsePackManifest,
} from './package/pack.ts'
import { resolveMygoUserRoot } from './instances.ts'

const SHA512_RE = /^[0-9a-f]{128}$/

/** 共享缓存目录（用户级，非实例 HOME）。 */
export function packCacheDir(root?: string): string {
  return join(root ?? resolveMygoUserRoot(), 'cache', 'packs')
}

/** 缓存内 pack 路径（sha512 内容寻址；非法 sha512 直接拒绝，防路径逃逸）。 */
export function cachedPackPath(sha512: string, root?: string): string {
  if (!SHA512_RE.test(sha512)) {
    throw new Error(`非法 pack 内容寻址 sha512（须 128 位 hex）：${JSON.stringify(sha512)}`)
  }
  return join(packCacheDir(root), `${sha512}.mygo-pack`)
}

export interface CachePackResult {
  /** 整个 pack 文件的 sha512（hex；内容寻址键）。 */
  readonly sha512: string
  /** 缓存内路径。 */
  readonly path: string
  /** 是否命中既有缓存（true = 本次零写盘）。 */
  readonly cached: boolean
}

/**
 * 把一个 mygo-pack 发布进共享缓存：整体字节 sha512 寻址；发布前复用
 * pack.ts 校验（清单自校验 + vendored 成员哈希），不合法即拒绝入缓存。
 */
export async function cachePack(packPath: string, options: { readonly root?: string } = {}): Promise<CachePackResult> {
  const bytes = new Uint8Array(await readFile(packPath))
  const unpacked = listGzipTarMembers(bytes)
  if (unpacked.tar === undefined || unpacked.members === undefined) {
    throw new Error(`pack 不是合法 gzip/tar，拒绝入缓存：${unpacked.problems.join('；')}`)
  }
  const manifestMember = unpacked.members.find(member => member.name === 'mygo-pack.json')
  if (manifestMember === undefined || manifestMember.typeflag !== '0') {
    throw new Error('pack 缺少 mygo-pack.json 成员，拒绝入缓存')
  }
  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(
      Buffer.from(unpacked.tar.subarray(manifestMember.dataOffset, manifestMember.dataOffset + manifestMember.size)).toString('utf8'),
    )
  } catch (error) {
    throw new Error(`pack 清单不是合法 JSON，拒绝入缓存：${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = parsePackManifest(manifestRaw)
  if (parsed.value === undefined) {
    throw new Error(`pack 清单无效，拒绝入缓存：${parsed.problems.map(problem => `${problem.path}: ${problem.message}`).join('；')}`)
  }
  if (computePackManifestSha256(parsed.value) !== parsed.value.manifestSha256) {
    throw new Error('pack 清单自校验失败（manifestSha256 失配），拒绝入缓存')
  }
  for (const file of parsed.value.files) {
    const member = unpacked.members.find(item => item.name === file.path)
    if (member === undefined || member.typeflag !== '0') {
      throw new Error(`pack 清单声明的 vendored 文件不存在：${file.path}，拒绝入缓存`)
    }
    const content = unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size)
    if (member.size !== file.fileSize || createHash('sha512').update(content).digest('hex') !== file.sha512) {
      throw new Error(`pack vendored 文件哈希/大小失配：${file.path}，拒绝入缓存`)
    }
  }
  const sha512 = createHash('sha512').update(bytes).digest('hex')
  const dir = packCacheDir(options.root)
  const target = join(dir, `${sha512}.mygo-pack`)
  try {
    await stat(target)
    return { sha512, path: target, cached: true }
  } catch {
    // 未命中：staging → rename 原子发布
  }
  await mkdir(dir, { recursive: true })
  const staging = join(dir, `.staging-${randomUUID()}`)
  await writeFile(staging, bytes)
  await rename(staging, target)
  return { sha512, path: target, cached: false }
}

export interface ImportCachedPackResult {
  /** 导入后的目标路径。 */
  readonly path: string
  /** 导入方式：hardlink 优先，copy 兜底（跨设备等）。 */
  readonly via: 'hardlink' | 'copy'
}

/**
 * 从共享缓存导入一个 pack 到目标目录（目标目录由调用方给定并自行过
 * assertInsideHome）。目标已存在同内容文件时直接复用（内容寻址保证
 * 同名即同内容）。
 */
export async function importCachedPack(
  sha512: string,
  destDir: string,
  options: { readonly root?: string } = {},
): Promise<ImportCachedPackResult> {
  const source = cachedPackPath(sha512, options.root)
  try {
    await stat(source)
  } catch {
    throw new Error(`共享缓存中没有该 pack：${sha512.slice(0, 12)}…（${source}）`)
  }
  await mkdir(destDir, { recursive: true })
  const dest = join(destDir, `${sha512}.mygo-pack`)
  try {
    await stat(dest)
    return { path: dest, via: 'hardlink' }
  } catch {
    // 目标不存在：导入
  }
  try {
    await link(source, dest)
    return { path: dest, via: 'hardlink' }
  } catch {
    await copyFile(source, dest)
    return { path: dest, via: 'copy' }
  }
}
