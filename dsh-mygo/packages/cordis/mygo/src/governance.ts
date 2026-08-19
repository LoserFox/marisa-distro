/**
 * 治理视图（P3，pnpm 安装状态为唯一真相源）：从 profile 实际安装状态
 * （package.json dependencies + dsh.profile.bundles 层列表 + 用户 patch 层
 * 的 disabled 行）重建的只读视图。RegistryStore 降级为运行时缓存——治理
 * 事实（装/卸/启/停）以 profile 文件为准，每次读取实时重建。
 * @module @r05en1cu/dsh-mygo/src/governance
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

/** 一份 profile 的治理视图。 */
export interface GovernanceView {
  readonly profile: string
  readonly profileDir: string
  /** profile 清单 dependencies（pnpm 安装状态）。 */
  readonly dependencies: Readonly<Record<string, string>>
  /** dsh.profile.bundles 层列表（bundle 对账结果）。 */
  readonly bundles: readonly string[]
  /** 用户 patch 层中 disabled 的行 id（启停事实）。 */
  readonly disabledRows: readonly string[]
  /** 用户 patch 层路径（缺失时视图各面为空集合）。 */
  readonly patchPath: string
  /**
   * 实例 dsh 版本（P4 多实例治理事实；跨版本不共享可写状态的记录面）。
   * 由服务层按实例填充，纯文件重建路径（readGovernanceView）下缺省。
   */
  readonly dshVersion?: string
}

/** 从 patch 层文本提取 `disabled: true` 的行 id（文本级，容忍 !!js 等自定义标签）。 */
export function disabledRowsOf(patchText: string): readonly string[] {
  const out: string[] = []
  const entry = /-\s+id:\s*([a-z][a-z0-9-]*)((?:\n(?![-\s]).*)*)\n?\s+disabled:\s*true/g
  for (const match of patchText.matchAll(entry)) {
    if (match[1] !== undefined) out.push(match[1])
  }
  return out.sort()
}

/** 重建一个 profile 的治理视图（profile 目录缺文件时按空集合计）。 */
export function readGovernanceView(profileDir: string, profile?: string): GovernanceView {
  const name = profile ?? profileDir.split('/').filter(segment => segment !== '').pop() ?? ''
  let dependencies: Readonly<Record<string, string>> = {}
  let bundles: readonly string[] = []
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>
      readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
    }
    dependencies = manifest.dependencies ?? {}
    bundles = manifest.dsh?.profile?.bundles ?? []
  } catch {
    // profile 未初始化：空视图
  }
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  return {
    profile: name,
    profileDir,
    dependencies,
    bundles,
    disabledRows: disabledRowsOf(patchText),
    patchPath,
  }
}

// ---------------------------------------------------------------------------
// P7-A3：bundle 解析预检（模块解析失败早期响亮化）
// ---------------------------------------------------------------------------

/** 一条 bundle 解析问题。 */
export interface BundleResolutionProblem {
  readonly name: string
  readonly reason: string
}

/**
 * 预检治理视图中「已装进 profile dependencies」的 bundle 是否可解析
 * （拼错包名/缺失在治理面响亮报错，不等 assertEntriesActivated 的晚期
 * 失败）。解析口径 = 从 profile 目录向上的 Node 解析链（覆盖 profile
 * node_modules 与 profiles/node_modules 回退链接）；模板自带但未进
 * dependencies 的 bundle 行不预检（由宿主锚点解析）。
 */
export function checkBundleResolution(
  view: GovernanceView,
  options: { readonly resolve?: (name: string) => boolean } = {},
): readonly BundleResolutionProblem[] {
  const resolve = options.resolve ?? defaultBundleResolver(view.profileDir)
  const problems: BundleResolutionProblem[] = []
  for (const name of view.bundles) {
    if (view.dependencies[name] === undefined) continue
    if (!resolve(name)) {
      problems.push({ name, reason: `bundle ${name} 声明在 dependencies 但无法从 profile 目录解析（拼写错误或未安装）` })
    }
  }
  return problems
}

function defaultBundleResolver(profileDir: string): (name: string) => boolean {
  const require = createRequire(join(profileDir, 'package.json'))
  return (name: string) => {
    try {
      require.resolve(name)
      return true
    } catch {
      return false
    }
  }
}
