/**
 * 嵌套包（bundled dependencies）治理（《第二轮增强》1–4 条）：
 * 递归扫描 bundles 声明、校验声明与实际一致、检测“求解器不可见”打包。
 * @module @r05en1cu/dsh-mygo/src/package/bundle-scan
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { parsePackageManifest, type PluginManifestV2 } from './manifest-v2.ts'

/** One scanned bundled manifest. */
export interface ScannedBundle {
  readonly owner: string
  readonly declared: { readonly id: string; readonly version: string; readonly path: string }
  readonly manifest: PluginManifestV2
  readonly dir: string
}

export interface BundleScanResult {
  readonly bundles: readonly ScannedBundle[]
  readonly problems: readonly string[]
}

const MAX_DEPTH = 8

function assertInside(root: string, candidate: string): string {
  const resolved = resolve(root, candidate)
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`bundle path 逃出包目录：${candidate}`)
  }
  return resolved
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Recursively scan a plugin's declared bundles. Each bundled package must
 * carry a valid dsh.mygo manifest whose id/version match the declaration.
 */
export async function scanBundles(
  owner: string,
  root: string,
  declared: readonly { readonly id: string; readonly version: string; readonly path: string }[],
  depth = 0,
  visited = new Set<string>(),
): Promise<BundleScanResult> {
  const bundles: ScannedBundle[] = []
  const problems: string[] = []
  if (depth > MAX_DEPTH) {
    problems.push(`${owner}: bundles 递归超过 ${MAX_DEPTH} 层`)
    return { bundles, problems }
  }
  for (const entry of declared) {
    const key = `${owner}#${entry.path}`
    if (visited.has(key)) {
      problems.push(`${owner}: bundles 循环声明（${entry.path}）`)
      continue
    }
    visited.add(key)
    const dir = assertInside(root, entry.path)
    if (!(await isDirectory(dir))) {
      problems.push(`${owner}: bundle 目录不存在（${entry.path}）`)
      continue
    }
    let raw: string
    try {
      raw = await readFile(join(dir, 'package.json'), 'utf8')
    } catch {
      problems.push(`${owner}: bundle 缺少 package.json（${entry.path}）`)
      continue
    }
    const parsed = parsePackageManifest(JSON.parse(raw))
    if (parsed.value === undefined) {
      problems.push(`${owner}: bundle ${entry.id} manifest 无效：${parsed.problems.map(p => `${p.path}: ${p.message}`).join('；')}`)
      continue
    }
    if (parsed.value.id !== entry.id || parsed.value.version !== entry.version) {
      problems.push(
        `${owner}: bundle 声明与实际不一致（声明 ${entry.id}@${entry.version}，实际 ${parsed.value.id}@${parsed.value.version}）`,
      )
      continue
    }
    bundles.push({ owner, declared: entry, manifest: parsed.value, dir })
    if (parsed.value.bundles.length > 0) {
      const nested = await scanBundles(parsed.value.id, dir, parsed.value.bundles, depth + 1, visited)
      bundles.push(...nested.bundles)
      problems.push(...nested.problems)
    }
  }
  return { bundles, problems }
}

/** Whether one file's source touches dsh core APIs (static import scan). */
export function sourceCallsDshCore(source: string): boolean {
  return /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]@deepseek-ai\//.test(source)
}

/** 提取一个源码文件里的 `@deepseek-ai/*` 说明符（from/import()/require()）。 */
export function dshCoreSpecifiers(source: string): readonly string[] {
  const out: string[] = []
  const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)(['"])(@deepseek-ai\/[^'"]+)\1/g
  for (const match of source.matchAll(re)) {
    const specifier = match[2]
    if (specifier !== undefined && !out.includes(specifier)) out.push(specifier)
  }
  return out
}

/** 从说明符取包名（scoped 取前两段，普通取第一段）。 */
export function packageNameOfSpecifier(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') && parts.length >= 2
    ? `${parts[0]}/${parts[1] as string}`
    : (parts[0] as string)
}

/**
 * Detect “求解器不可见”打包：未在 bundles 声明、但满足以下任一条件的嵌套包：
 * 1) 本身是插件（有 dsh.mygo）；2) import 任何 @deepseek-ai/*（调用 dsh 核心
 * API）；3) 显式 `dsh.mygo.shared === true`（共享状态）。
 * 纯叶子库（三者皆否）允许内联。
 */
export async function detectUndeclaredBundles(
  root: string,
  declaredPaths: readonly string[],
  options: {
    /** package.json dependencies/peerDependencies/optionalDependencies 键集。 */
    readonly declaredSpecifiers?: ReadonlySet<string>
    /** 插件自身 npm 包名（自身子路径 import 不属未声明，KF-1 裁决）。 */
    readonly selfPackageName?: string
  } = {},
): Promise<readonly string[]> {
  const problems: string[] = []
  const skip = new Set(declaredPaths.map(path => resolve(root, path)))
  const rootPackageJson = join(root, 'package.json')
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 6) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.mygo-package.json') continue
      const full = join(dir, entry.name)
      if (skip.has(full)) continue
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (entry.name === 'package.json') {
        if (full === rootPackageJson) continue
        try {
          const raw = JSON.parse(await readFile(full, 'utf8')) as {
            readonly dsh?: { readonly mygo?: { readonly shared?: unknown } }
          }
          if (raw.dsh?.mygo !== undefined) {
            problems.push(
              raw.dsh.mygo.shared === true
                ? `未声明共享状态包：${full}（dsh.mygo.shared=true 必须经 bundles 声明）`
                : `未声明内嵌插件：${full}（带 dsh.mygo 的嵌套包必须经 bundles 声明）`,
            )
          }
        } catch {
          // unreadable manifest: skip
        }
        continue
      }
      if (/\.[cm]?[jt]s$/.test(entry.name)) {
        try {
          const source = await readFile(full, 'utf8')
          if (sourceCallsDshCore(source)) {
            for (const specifier of dshCoreSpecifiers(source)) {
              const pkgName = packageNameOfSpecifier(specifier)
              if (options.declaredSpecifiers?.has(pkgName) === true || options.selfPackageName === pkgName) continue
              problems.push(
                `未声明 dsh 核心调用：${full}（${specifier} 未声明于 dependencies/peerDependencies/optionalDependencies，也未经 bundles 声明）`,
              )
            }
          }
        } catch {
          // unreadable source: skip
        }
      }
    }
  }
  await walk(root, 0)
  return problems
}
