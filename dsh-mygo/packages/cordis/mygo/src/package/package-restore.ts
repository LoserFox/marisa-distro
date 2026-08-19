/**
 * 插件包还原（普通落盘语义，2026-08-13 范围重塑）：把一个 npm 插件版本
 * 下载/校验/解包到**调用方指定目录**，并写入 `.mygo-package.json` 事实文件
 * （manifest + 内容哈希）。不再承诺「不可变 store / 唯一真相」：目标目录的
 * 布局与生命周期由调用方（package-manager / pack 还原）决定。
 * @module @r05en1cu/dsh-mygo/src/package/package-restore
 */

import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { downloadTarball, type RegistryVersionInfo } from './registry-client.ts'
import { integritySha512Hex, sha256File, sha256Text, sha512File } from './hash.ts'
import { parsePackageManifest, pathProblemsOf, type PluginManifestV2 } from './manifest-v2.ts'

const execFileAsync = promisify(execFile)

/** One restored package fact. */
export interface RestoredPackage {
  readonly id: string
  readonly version: string
  readonly dir: string
  readonly entry: string
  readonly manifest: PluginManifestV2
  readonly entrySha256: string
  readonly manifestSha256: string
  /** 入口文件内容 sha512（hex；还原时现场计算）。 */
  readonly entrySha512: string
  /** vendored tarball 整体 sha512（hex；npm integrity 解析转 hex，缺省缺省）。 */
  readonly tarballSha512?: string
  /** entry 文件字节数。 */
  readonly entryFileSize?: number
  readonly integrity?: string
  /** P8：还原来源（pack 内嵌 / pack 引用拉取）；不进事实哈希的尾部记账字段。 */
  readonly origin?: 'pack-embedded' | 'pack-reference'
}

export interface RestorePackageOptions {
  readonly token?: string
  /** tar executable; defaults to `tar` (POSIX/Windows 10+ ship it). */
  readonly tarCmd?: string
  /** 本地 tarball 字节（pack 安装；跳过 registry 下载，design-r4 D-A3）。 */
  readonly localTarballBytes?: Uint8Array
  /** 本地 tarball 期望 sha512（hex；pack files[].sha512，先校验后落盘）。 */
  readonly expectedSha512Hex?: string
  /** 临时工作目录（解包中转；默认目标目录旁的系统临时目录）。 */
  readonly tmpDir?: string
  /** P8：还原来源记账（写进事实文件尾部，不进 manifestSha256）。 */
  readonly origin?: 'pack-embedded' | 'pack-reference'
}

/** Path traversal guard: resolved path must stay under the package root. */
function assertInside(root: string, candidate: string): string {
  const resolved = resolve(root, candidate)
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`entry 逃出包目录：${candidate}`)
  }
  return resolved
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

/**
 * Download, verify, extract, and atomically restore one plugin version into
 * the caller-specified `target` dir. Reuses an existing identical restore
 * (fact file match), replacing a corrupt one.
 */
export async function restorePackage(
  target: string,
  versionInfo: RegistryVersionInfo,
  options: RestorePackageOptions = {},
): Promise<RestoredPackage> {
  const manifest = versionInfo.manifest
  if (manifest === undefined) {
    throw new Error(
      `候选 ${versionInfo.version} 没有有效 dsh.mygo manifest：${(versionInfo.manifestProblems ?? []).join('；')}`,
    )
  }
  if (await pathExists(target)) {
    const existing = await readRestoredPackage(target, manifest.id, versionInfo.version)
    if (existing !== undefined && existing.entrySha256 !== '') return existing
    await rm(target, { recursive: true, force: true })
  }

  const work = join(options.tmpDir ?? dirname(target), `.mygo-restore-${randomUUID()}`)
  const tarball = join(work, 'package.tgz')
  const extracted = join(work, 'extracted')
  const pkgRoot = join(extracted, 'package')
  await mkdir(work, { recursive: true })
  try {
    if (options.localTarballBytes !== undefined) {
      if (options.expectedSha512Hex !== undefined) {
        const actual = createHash('sha512').update(options.localTarballBytes).digest('hex')
        if (actual !== options.expectedSha512Hex) {
          throw new Error(`本地 tarball 完整性校验失败（sha512 期望 ${options.expectedSha512Hex.slice(0, 12)}…）`)
        }
      }
      await writeFile(tarball, options.localTarballBytes)
    } else {
      await downloadTarball(versionInfo.tarball, tarball, {
        ...(options.token === undefined ? {} : { token: options.token }),
        ...(versionInfo.integrity === undefined ? {} : { integrity: versionInfo.integrity }),
      })
    }
    await mkdir(extracted, { recursive: true })
    await execFileAsync(options.tarCmd ?? 'tar', ['-xzf', tarball, '-C', extracted])
    if (!(await pathExists(pkgRoot))) {
      throw new Error(`tarball 缺少 package/ 根目录（${versionInfo.version}）`)
    }
    const packageJsonRaw = await readFile(join(pkgRoot, 'package.json'), 'utf8')
    const parsed = parsePackageManifest(JSON.parse(packageJsonRaw))
    if (parsed.value === undefined) {
      throw new Error(`包内 manifest 校验失败：${parsed.problems.map(problem => `${problem.path}: ${problem.message}`).join('；')}`)
    }
    if (parsed.value.id !== manifest.id || parsed.value.version !== versionInfo.version) {
      throw new Error(`包内 manifest 与 registry 元数据不一致（${parsed.value.id}@${parsed.value.version}）`)
    }
    // B10 安装期路径安全：manifest 解析已验 entry/bundles/paches，此处双保险。
    const pathProblems = pathProblemsOf(parsed.value)
    if (pathProblems.length > 0) {
      throw new Error(`包内 manifest 路径逃逸：${pathProblems.map(problem => `${problem.path}: ${problem.message}`).join('；')}`)
    }
    assertInside(pkgRoot, parsed.value.entry)
    // entrySha512 = 入口文件内容哈希（落盘前现场计算）；tarballSha512 =
    // vendored tarball 整体哈希（npm integrity 解析转 hex；不可解析时缺省）。
    const entrySha512 = await sha512File(assertInside(pkgRoot, parsed.value.entry))
    const tarballSha512 = integritySha512Hex(versionInfo.integrity)
    // 确定性：manifestSha256 只对稳定载荷计算；installedAt / entrySha512 仅作
    // 尾部记账字段保留在事实文件里，不进哈希（否则同输入两次还原产物不等）。
    const factBase = {
      format: 'dsh.mygo-package/v1',
      id: parsed.value.id,
      version: versionInfo.version,
      entry: parsed.value.entry,
      manifest: parsed.value,
      ...(versionInfo.integrity === undefined ? {} : { integrity: versionInfo.integrity }),
      ...(tarballSha512 === undefined ? {} : { tarballSha512 }),
    }
    const manifestSha256 = sha256Text(JSON.stringify(factBase))
    await writeFile(
      join(pkgRoot, '.mygo-package.json'),
      JSON.stringify({
        ...factBase,
        entrySha512,
        manifestSha256,
        installedAt: new Date().toISOString(),
        ...(options.origin === undefined ? {} : { origin: options.origin }),
      }, null, 2),
    )
    await mkdir(dirname(target), { recursive: true })
    await rename(pkgRoot, target)
    const entryPath = assertInside(target, parsed.value.entry)
    const entrySha256 = await sha256File(entryPath)
    const entryStats = await stat(entryPath)
    return {
      id: parsed.value.id,
      version: versionInfo.version,
      dir: target,
      entry: parsed.value.entry,
      manifest: parsed.value,
      entrySha256,
      manifestSha256,
      entrySha512,
      ...(tarballSha512 === undefined ? {} : { tarballSha512 }),
      entryFileSize: entryStats.size,
      ...(versionInfo.integrity === undefined ? {} : { integrity: versionInfo.integrity }),
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Read one restored package's fact file. */
export async function readRestoredPackage(
  dir: string,
  id: string,
  version: string,
): Promise<RestoredPackage | undefined> {
  try {
    const raw = await readFile(join(dir, '.mygo-package.json'), 'utf8')
    const fact = JSON.parse(raw) as {
      readonly format?: unknown
      readonly id?: unknown
      readonly version?: unknown
      readonly entry?: unknown
      readonly manifest?: unknown
      readonly integrity?: unknown
      readonly entrySha256?: unknown
      readonly manifestSha256?: unknown
      readonly entrySha512?: unknown
      readonly tarballSha512?: unknown
      readonly entryFileSize?: unknown
      readonly origin?: unknown
    }
    if (fact.format !== 'dsh.mygo-package/v1' || fact.id !== id || fact.version !== version) return undefined
    const manifest = fact.manifest as PluginManifestV2 | undefined
    if (manifest === undefined || typeof fact.entry !== 'string') return undefined
    const entrySha256 = typeof fact.entrySha256 === 'string' ? fact.entrySha256 : await sha256File(assertInside(dir, fact.entry))
    const manifestSha256 = typeof fact.manifestSha256 === 'string'
      ? fact.manifestSha256
      : (() => {
        const stable = JSON.parse(raw) as Record<string, unknown>
        delete stable.manifestSha256
        delete stable.installedAt
        delete stable.entrySha512
        return sha256Text(JSON.stringify(stable))
      })()
    return {
      id,
      version,
      dir,
      entry: fact.entry,
      manifest,
      entrySha256,
      manifestSha256,
      entrySha512: typeof fact.entrySha512 === 'string'
        ? fact.entrySha512
        : await sha512File(assertInside(dir, fact.entry)),
      ...(typeof fact.tarballSha512 === 'string' ? { tarballSha512: fact.tarballSha512 } : {}),
      entryFileSize: typeof fact.entryFileSize === 'number'
        ? fact.entryFileSize
        : (await stat(assertInside(dir, fact.entry))).size,
      ...(typeof fact.integrity === 'string' ? { integrity: fact.integrity } : {}),
      ...(fact.origin === 'pack-embedded' || fact.origin === 'pack-reference' ? { origin: fact.origin } : {}),
    }
  } catch {
    return undefined
  }
}
