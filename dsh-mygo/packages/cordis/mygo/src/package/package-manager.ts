/**
 * 插件包管理器（2026-08-13 范围重塑）：单插件版本选择（无跨插件约束求解）
 * → 下载并普通落盘还原；dsh.lock/v1 lockfile 已删除（pnpm 安装状态为唯一
 * 真相源），加载期不再有「对照 lockfile 校验磁盘」环节。mygo-pack 构建/安装
 * 委派给 pack.ts（确定性 tar 能力保留）。
 * @module @r05en1cu/dsh-mygo/src/package/package-manager
 */

import { detectUndeclaredBundles, scanBundles } from './bundle-scan.ts'
import { probePackageExports, verifyPluginSymbols } from './symbol-verify.ts'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { PluginManifestV2 } from './manifest-v2.ts'
import { restorePackage, type RestoredPackage } from './package-restore.ts'
import { packageDir, type MygoPaths } from './paths.ts'
import { fetchRegistryMetadata } from './registry-client.ts'
import { selectVersion } from './version-select.ts'
import type { ResolutionReport } from './report.ts'
import {
  buildPluginPack,
  installPluginPack,
  type PackBuildOptions,
  type PackBuildOutcome,
  type PackInstallOptions,
  type PackInstallOutcome,
} from './pack.ts'

export interface PackageManagerOptions {
  readonly paths: MygoPaths
  readonly profile: string
  readonly registry?: string
  readonly token?: string
  readonly tarCmd?: string
  readonly coreVersion?: string
  /** profile 钉定（包名/插件 id → 精确版本），作为版本选择输入。 */
  readonly pins?: ReadonlyMap<string, { readonly version: string; readonly source?: string }>
  /** 符号校验的 exports 提供者；缺省从 profile node_modules 解析。 */
  readonly exportsProvider?: (specifier: string) => Promise<ReadonlySet<string> | undefined>
  readonly managerVersion: string
}

export type PackageInstallOutcome =
  | {
    readonly ok: true
    readonly installed: RestoredPackage
    readonly warnings: readonly string[]
  }
  | { readonly ok: false; readonly report: ResolutionReport }

/** 默认 exports 提供者：从 profile node_modules 解析目标包并探测运行时导出。 */
function defaultExportsProvider(
  paths: MygoPaths,
  profile: string,
): (specifier: string) => Promise<ReadonlySet<string> | undefined> {
  const profileDir = join(paths.base, '..', 'profiles', profile)
  return async (specifier: string): Promise<ReadonlySet<string> | undefined> => {
    try {
      const req = createRequire(join(profileDir, 'noop.js'))
      const pkgPath = req.resolve(`${specifier}/package.json`)
      const root = dirname(pkgPath)
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
        readonly main?: unknown
        readonly exports?: Readonly<Record<string, { readonly default?: unknown }>>
      }
      let entry = 'lib/index.js'
      if (typeof pkg.main === 'string') entry = pkg.main
      const defaultExport = pkg.exports?.['.']?.default
      if (typeof defaultExport === 'string') entry = defaultExport
      // 探针容错（P3）：入口缺失/不可 import 一律按不可解析（unverified）放行，
      // 探测失败 MUST NOT 逃逸为未捕获异常。
      const { existsSync } = await import('node:fs')
      const entryPath = join(root, entry)
      if (!existsSync(entryPath)) return undefined
      return await probePackageExports(entryPath)
    } catch {
      return undefined
    }
  }
}

/** The package management orchestration surface. */
export class PluginPackageManager {
  constructor(private readonly options: PackageManagerOptions) {}

  /** Registry metadata with auth options applied. */
  private async fetchMetadata(name: string): Promise<ReturnType<typeof fetchRegistryMetadata>> {
    return fetchRegistryMetadata(name, {
      ...(this.options.registry === undefined ? {} : { registry: this.options.registry }),
      ...(this.options.token === undefined ? {} : { token: this.options.token }),
    })
  }

  /** 单插件版本选择：候选集 + 请求区间 + profile 钉定（无跨插件求解）。 */
  private selectFor(
    packageName: string,
    candidates: readonly { readonly version: string; readonly manifest?: PluginManifestV2 | undefined }[],
    range: string | undefined,
    canonicalId: string,
  ): ReturnType<typeof selectVersion> {
    const pin = this.options.pins?.get(packageName)?.version ?? this.options.pins?.get(canonicalId)?.version
    return selectVersion({
      candidates,
      ...(range === undefined ? {} : { range }),
      ...(pin === undefined ? {} : { pin }),
      ...(this.options.coreVersion === undefined ? {} : { coreVersion: this.options.coreVersion }),
    })
  }

  /**
   * Install one npm plugin package: registry metadata → deterministic
   * version selection → plain restore into `<packagesRoot>/<id>/<version>/`
   * → bundle/symbol checks. No lockfile write（pnpm 安装状态为唯一真相源）。
   */
  async resolveInstall(
    source: { readonly package: string; readonly range?: string },
  ): Promise<PackageInstallOutcome> {
    const metadata = await this.fetchMetadata(source.package)
    const idCandidates = metadata.versions.filter(entry => entry.manifest !== undefined)
    if (idCandidates.length === 0) {
      return {
        ok: false,
        report: {
          code: 'resolve-failed',
          summary: `${source.package} 没有带有效 dsh.mygo manifest 的候选版本`,
          cycles: [],
          conflicts: [{
            plugin: source.package,
            constraint: { kind: 'entry', target: 'self', range: 'manifest' },
            chain: [source.package],
            candidates: metadata.versions.map(version => ({
              version: version.version,
              rejected: version.manifestProblems ?? ['无有效 manifest'],
            })),
            actions: ['由插件作者补充 dsh.mygo（id/version/entry/core）'],
          }],
        },
      }
    }

    const canonicalId = idCandidates[0]?.manifest?.id
    if (canonicalId === undefined) {
      return { ok: false, report: { code: 'resolve-failed', summary: `${source.package} 无 manifest id`, cycles: [], conflicts: [] } }
    }
    const selected = this.selectFor(source.package, idCandidates, source.range, canonicalId)
    if (!selected.ok) {
      return {
        ok: false,
        report: {
          code: 'resolve-failed',
          summary: `${canonicalId} 版本选择失败：${selected.reasons.join('；')}`,
          cycles: [],
          conflicts: [{
            plugin: canonicalId,
            constraint: { kind: 'entry', target: canonicalId, range: source.range ?? '*' },
            chain: [canonicalId],
            candidates: idCandidates.map(entry => ({ version: entry.version, rejected: [] })),
            actions: ['调整请求区间或 profile 钉定版本后重试'],
          }],
        },
      }
    }
    const versionInfo = idCandidates.find(entry => entry.version === selected.version)
    // 选择结果必来自候选集；防御性保留（MUST NOT 以 undefined 继续）。
    if (versionInfo === undefined) {
      return {
        ok: false,
        report: {
          code: 'resolve-failed',
          summary: `选定版本 ${selected.version} 不在 registry 候选集中`,
          cycles: [],
          conflicts: [{
            plugin: canonicalId,
            constraint: { kind: 'pin', target: canonicalId, range: selected.version },
            chain: [canonicalId],
            candidates: [{ version: selected.version, rejected: ['registry 元数据无该版本'] }],
            actions: ['调整 profile 钉定版本或解除钉定', '选择 registry 现存版本重新安装'],
          }],
        },
      }
    }
    const installedPackage = await restorePackage(
      packageDir(this.options.paths, canonicalId, versionInfo.version),
      versionInfo,
      {
        tmpDir: this.options.paths.tmpDir,
        ...(this.options.token === undefined ? {} : { token: this.options.token }),
        ...(this.options.tarCmd === undefined ? {} : { tarCmd: this.options.tarCmd }),
      },
    )
    const scanned = await scanBundles(installedPackage.manifest.id, installedPackage.dir, installedPackage.manifest.bundles)
    const pkgJson = JSON.parse(await readFile(join(installedPackage.dir, 'package.json'), 'utf8')) as {
      readonly name?: unknown
      readonly dependencies?: Readonly<Record<string, unknown>>
      readonly peerDependencies?: Readonly<Record<string, unknown>>
      readonly optionalDependencies?: Readonly<Record<string, unknown>>
    }
    const declaredSpecifiers = new Set([
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.peerDependencies ?? {}),
      ...Object.keys(pkgJson.optionalDependencies ?? {}),
    ])
    const undeclared = await detectUndeclaredBundles(
      installedPackage.dir,
      installedPackage.manifest.bundles.map(bundle => bundle.path),
      {
        declaredSpecifiers,
        ...(typeof pkgJson.name === 'string' ? { selfPackageName: pkgJson.name } : {}),
      },
    )
    if (scanned.problems.length > 0 || undeclared.length > 0) {
      return {
        ok: false,
        report: {
          code: 'bundle-invalid',
          summary: [...scanned.problems, ...undeclared].join('；'),
          cycles: [],
          conflicts: [{
            plugin: installedPackage.manifest.id,
            constraint: { kind: 'entry', target: 'bundles', range: 'manifest' },
            chain: [installedPackage.manifest.id],
            candidates: [{ version: installedPackage.version, rejected: [...scanned.problems, ...undeclared] }],
            actions: ['补充/修正 dsh.mygo.bundles 声明或移除未声明内嵌包'],
          }],
        },
      }
    }
    const symbolChecks = await verifyPluginSymbols(
      installedPackage.dir,
      this.options.exportsProvider ?? defaultExportsProvider(this.options.paths, this.options.profile),
    )
    const missing = symbolChecks.filter(check => check.missing)
    if (missing.length > 0) {
      return {
        ok: false,
        report: {
          code: 'symbol-missing',
          summary: `${installedPackage.manifest.id} 引用了目标包不存在的符号（${missing.length} 个）`,
          cycles: [],
          conflicts: [{
            plugin: installedPackage.manifest.id,
            constraint: { kind: 'entry', target: 'symbols', range: 'exports' },
            chain: [installedPackage.manifest.id],
            candidates: [{
              version: installedPackage.version,
              rejected: missing.map(check => `${check.file}: ${check.specifier}#${check.symbol} 不存在`),
            }],
            actions: ['升级/降级目标包到提供该符号的版本，或改用不引用该符号的插件版本'],
          }],
        },
      }
    }
    const warnings: string[] = [
      ...selected.warnings,
      ...symbolChecks
        .filter(check => check.unverified === true)
        .map(check => `${check.file}: ${check.specifier}#${check.symbol} 无法验证（目标包不可解析），按警告放行`),
    ]
    return { ok: true, installed: installedPackage, warnings }
  }

  /**
   * Pure resolution preview (no download, no disk write): returns the chosen
   * version's manifest so `plan()` can preview without side effects.
   */
  async preview(
    source: { readonly package: string; readonly range?: string },
  ): Promise<{ readonly ok: true; readonly manifest: PluginManifestV2 } | { readonly ok: false; readonly report: ResolutionReport }> {
    const metadata = await this.fetchMetadata(source.package)
    const idCandidates = metadata.versions.filter(entry => entry.manifest !== undefined)
    if (idCandidates.length === 0) {
      return {
        ok: false,
        report: {
          code: 'resolve-failed',
          summary: `${source.package} 没有带有效 dsh.mygo manifest 的候选版本`,
          cycles: [],
          conflicts: [{
            plugin: source.package,
            constraint: { kind: 'entry', target: 'self', range: 'manifest' },
            chain: [source.package],
            candidates: metadata.versions.map(version => ({
              version: version.version,
              rejected: version.manifestProblems ?? ['无有效 manifest'],
            })),
            actions: ['由插件作者补充 dsh.mygo（id/version/entry/core）'],
          }],
        },
      }
    }
    const canonicalId = idCandidates[0]?.manifest?.id
    if (canonicalId === undefined) {
      return { ok: false, report: { code: 'resolve-failed', summary: `${source.package} 无 manifest id`, cycles: [], conflicts: [] } }
    }
    const selected = this.selectFor(source.package, idCandidates, source.range, canonicalId)
    if (!selected.ok) {
      return {
        ok: false,
        report: {
          code: 'resolve-failed',
          summary: `${canonicalId} 版本选择失败：${selected.reasons.join('；')}`,
          cycles: [],
          conflicts: [],
        },
      }
    }
    const versionInfo = idCandidates.find(entry => entry.version === selected.version)
    if (versionInfo?.manifest === undefined) {
      return { ok: false, report: { code: 'resolve-failed', summary: 'preview 无选定 manifest', cycles: [], conflicts: [] } }
    }
    return { ok: true, manifest: versionInfo.manifest }
  }

  /**
   * 从 installRoot 的已还原插件集构建确定性 mygo-pack（design-r4 B21/B25）。
   * 离线；同一输入两次构建产物字节级一致（T32）。
   */
  async buildPack(options: PackBuildOptions): Promise<PackBuildOutcome> {
    return buildPluginPack({
      installRoot: this.options.paths.packagesRoot,
      tmpDir: this.options.paths.tmpDir,
      profile: this.options.profile,
      managerVersion: this.options.managerVersion,
      ...(this.options.coreVersion === undefined ? {} : { coreVersion: this.options.coreVersion }),
      ...(this.options.tarCmd === undefined ? {} : { tarCmd: this.options.tarCmd }),
    }, options)
  }

  /**
   * 安装 mygo-pack：清单/成员/哈希预检 → 普通落盘还原（design-r4 B23）。
   * 全部校验先于任何落盘写入；离线；无 lockfile 读写。
   */
  async installPack(packPath: string, options: PackInstallOptions = {}): Promise<PackInstallOutcome> {
    return installPluginPack({
      installRoot: this.options.paths.packagesRoot,
      tmpDir: this.options.paths.tmpDir,
      profile: this.options.profile,
      managerVersion: this.options.managerVersion,
      ...(this.options.coreVersion === undefined ? {} : { coreVersion: this.options.coreVersion }),
      ...(this.options.tarCmd === undefined ? {} : { tarCmd: this.options.tarCmd }),
    }, packPath, options)
  }
}
