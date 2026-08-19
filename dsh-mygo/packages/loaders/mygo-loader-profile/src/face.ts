/**
 * profile 安装执行面（P3 原生形态；P5 从 mygo-cli 收敛进本包）：
 * profile 目录跑 pnpm + 按 `dsh.bundle` 声明对账 `dsh.profile.bundles`
 * （对齐官方 `dsh plugin` 的 reconcile 语义，直接复用
 * @deepseek-ai/dsh-app-boot 的 profile API）；enable/disable = profile
 * cordis.patch.yml 的 id 定向 `disabled` patch 块写入/移除。
 * 本面是所有其他 loader 的最终执行面。
 * @module @r05en1cu/dsh-mygo-loader-profile/face
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import type { ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { assertInsideHome, DISABLE_BLOCK_BEGIN, DISABLE_BLOCK_END, hasLiveBlock, liveBlockPackages, liveUninstall, resolveDshHome, writeLiveBlock } from '@r05en1cu/dsh-mygo'

export interface ProfileExecOptions {
  /** 目标 profile 名。 */
  readonly profile: string
  /** $DSH_HOME 覆盖（测试注入；缺省进程环境）。 */
  readonly home?: string
  /** pnpm 命令的调用目录（相对路径 spec 的锚点；缺省 process.cwd()）。 */
  readonly cwd?: string
  /** 构建政策拦截时自动写白名单并重试一次（P7-A1；缺省 true）。 */
  readonly autoFixPnpmPolicies?: boolean
  /**
   * rc8 registry auth：调用方解析好的子进程 env 增量（`.npmrc` 受管块
   * `${REF}` 占位经 credentials 解析）；缺省透传 process.env。
   */
  readonly env?: Readonly<Record<string, string>>
}

export interface ProfileExecResult {
  readonly ok: boolean
  readonly profile: string
  /** 对账后的 dsh.profile.bundles 列表（install/uninstall）。 */
  readonly bundles?: readonly string[]
  /** 本次自动放行的构建脚本键（P7-A1；写入 profile pnpm-workspace.yaml）。 */
  readonly allowedBuilds?: readonly string[]
  /** r7：新装/变更的包由 live rail 受管块在管（运行期重放生效，install）。 */
  readonly live?: boolean
  /** r7：本次卸载剥除了 live rail 受管块（先剥块后 pnpm remove，uninstall）。 */
  readonly liveStripped?: boolean
  readonly error?: string | undefined
}

/** dsh 安装锚点（in-box bundle 解析用）；不可解析时退回 profile 自身锚点。 */
function installAnchor(profileDir: string): string {
  try {
    return createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
  } catch {
    return join(profileDir, 'package.json')
  }
}

/** 对齐官方 plugin.ts：依赖解析出 dsh.bundle 声明即为 bundle。 */
function exportsPatch(packageName: string, profileDir: string): boolean {
  let dir: string
  try {
    dir = resolveBundleDir('mygo', packageName, installAnchor(profileDir), profileDir)
  } catch {
    return false
  }
  const manifest = readProfileManifest('mygo', dir)
  return manifest.dsh?.bundle?.patch !== undefined
}

/** 按安装后对账 dsh.profile.bundles（官方 reconcilePlugins 同语义）。 */
function reconcilePlugins(before: ProfileManifest, profileDir: string): void {
  const after = readProfileManifest('mygo', profileDir)
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const dependencies = Object.keys(after.dependencies ?? {})
  const plugins = [...(after.dsh?.profile?.bundles ?? [])]
  // r7 单轨规则：live rail 受管块在管的包不进 bundles（同 id 双 insert 对
  // boot 是致命错误；块内行重启后由 profile patch 层照常物化）。
  const livePackages = new Set(liveBlockPackages(readPatchText(profileDir)))
  let changed = false
  for (const packageName of dependencies) {
    if (livePackages.has(packageName)) continue
    const isBundle = exportsPatch(packageName, profileDir)
    if (isBundle && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    }
  }
  const dependencySet = new Set(dependencies)
  for (const packageName of [...plugins]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, profileDir)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return
  after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles: plugins } }
  writeProfileManifest(profileDir, after)
}

/** 相对路径 spec 锚定到调用目录（pnpm 以 profile 目录为 cwd）。 */
function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  return `${match.groups.prefix ?? ''}${resolve(cwd, match.groups.path)}`
}

function runPnpm(profileDir: string, args: readonly string[], cwd: string, env?: Readonly<Record<string, string>>): { readonly ok: boolean; readonly error?: string; readonly output: string } {
  const result = spawnSync('pnpm', args.map(argument => anchorPathSpec(argument, cwd)), {
    cwd: profileDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf8',
    // rc8 registry auth：解析好的 ${REF} env 增量并入子进程环境。
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  // 透传保持终端可见性（原 stdio: inherit 语义），捕获供政策检测。
  if (typeof result.stdout === 'string' && result.stdout !== '') process.stdout.write(result.stdout)
  if (typeof result.stderr === 'string' && result.stderr !== '') process.stderr.write(result.stderr)
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, error: 'pnpm 不在 PATH 上', output }
    return { ok: false, error: String(result.error), output }
  }
  if (result.status !== 0) return { ok: false, error: `pnpm 退出码 ${result.status ?? 1}（profile 目录 ${profileDir}）`, output }
  return { ok: true, output }
}

// ---------------------------------------------------------------------------
// P7-A1：pnpm 构建政策双门槛（allowBuilds / blockExoticSubdeps）检测与
// 治理层一键放行（对齐官方 plugin.ts:150-155 的引导语义，落地为 mygo
// 治理操作而非用户手工）。
// ---------------------------------------------------------------------------

/** 从 pnpm 输出解析被拦截构建脚本的精确键（"Ignored build scripts: k1, k2"）。 */
export function detectIgnoredBuildKeys(output: string): readonly string[] {
  const match = /Ignored build scripts:\s*([^\n]+(?:\n(?!\S)[^\n]+)*)/.exec(output)
  if (match?.[1] === undefined) return []
  return match[1]
    .split(/[,\s]+/)
    .map(entry => entry.trim())
    .filter(entry => entry !== '' && !entry.startsWith('Run '))
}

/** 检测 pnpm 是否因构建政策拦截而失败（allowBuilds 门槛）。 */
export function isBuildPolicyBlock(output: string): boolean {
  return /ERR_PNPM_IGNORED_BUILDS|ERR_PNPM_STRICT_DEP_BUILDS/.test(output)
}

/** 检测 git 子依赖拦截（blockExoticSubdeps 门槛；P6 遗留 #4）。 */
export function isExoticSubdepBlock(output: string): boolean {
  return /blockExoticSubdeps|exotic subdep/i.test(output)
}

/** allowBuilds 键（name@spec）→ 包名（scope 感知的最后一个 @ 切分）。 */
function packageNameOfBuildKey(key: string): string {
  const at = key.startsWith('@') ? key.indexOf('@', 1) : key.indexOf('@')
  return at === -1 ? key : key.slice(0, at)
}

/**
 * 一键写 profile pnpm-workspace.yaml 白名单：allowBuilds 键置 true
 * （覆盖 pnpm 自追加的占位值 `set this to true or false`，缺块则建块），
 * 可选 blockExoticSubdeps: false。幂等；返回是否改动。
 */
export function ensureProfilePnpmSettings(
  profileDir: string,
  settings: { readonly allowBuilds?: readonly string[]; readonly blockExoticSubdeps?: boolean },
): { readonly changed: boolean; readonly path: string } {
  const path = join(profileDir, 'pnpm-workspace.yaml')
  let text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  let changed = false
  const keys = settings.allowBuilds ?? []
  if (keys.length > 0) {
    if (!/^allowBuilds:/m.test(text)) {
      text = `${text.trimEnd()}\nallowBuilds:\n`
      changed = true
    }
    for (const key of keys) {
      const quoted = `'${key.replaceAll("'", "''")}'`
      const entry = new RegExp(`^(\\s+)${escapeRegExp(quoted)}:.*$`, 'm')
      if (entry.test(text)) {
        const next = text.replace(entry, `$1${quoted}: true`)
        if (next !== text) {
          text = next
          changed = true
        }
      } else {
        text = text.replace(/^allowBuilds:\n/m, `allowBuilds:\n  ${quoted}: true\n`)
        changed = true
      }
    }
  }
  if (settings.blockExoticSubdeps === true && !/^blockExoticSubdeps:/m.test(text)) {
    text = `${text.trimEnd()}\n# mygo 治理层放行：git 子依赖（扩展经 git spec 安装时需要）\nblockExoticSubdeps: false\n`
    changed = true
  }
  if (changed) writeFileSync(path, text, 'utf8')
  return { changed, path }
}

/** 确保 profile 目录已初始化（官方模板规则）；P4 隔离闸：目录必须在目标实例 HOME 内。 */
function ensureProfile(options: ProfileExecOptions): string {
  const dir = resolveProfileDir(options.profile, options.home)
  assertInsideHome(options.home ?? resolveDshHome(process.env), dir)
  if (!existsSync(join(dir, 'package.json'))) {
    initProfile(dir, PROFILE_TEMPLATES[options.profile] ?? DEFAULT_PROFILE_BUNDLES)
  }
  return dir
}

/** profile 安装：profile 目录 pnpm add + bundle 对账。 */
export function profileInstall(spec: string, options: ProfileExecOptions): ProfileExecResult {
  const dir = ensureProfile(options)
  const before = readProfileManifest('mygo', dir)
  let run = runPnpm(dir, ['add', spec], options.cwd ?? process.cwd(), options.env)
  let allowedBuilds: readonly string[] | undefined
  if (!run.ok && options.autoFixPnpmPolicies !== false) {
    // P7-A1：构建政策双门槛一键放行——检测拦截 → 写白名单 → 重试一次
    // → rebuild 实际执行被放行的构建脚本。
    const keys = detectIgnoredBuildKeys(run.output)
    const exotic = isExoticSubdepBlock(run.output)
    if ((isBuildPolicyBlock(run.output) && keys.length > 0) || exotic) {
      ensureProfilePnpmSettings(dir, {
        allowBuilds: keys,
        ...(exotic ? { blockExoticSubdeps: true } : {}),
      })
      run = runPnpm(dir, ['add', spec], options.cwd ?? process.cwd(), options.env)
      if (run.ok && keys.length > 0) {
        const names = [...new Set(keys.map(packageNameOfBuildKey))]
        const rebuild = runPnpm(dir, ['rebuild', ...names], options.cwd ?? process.cwd(), options.env)
        if (!rebuild.ok) {
          return { ok: false, profile: options.profile, error: `白名单已写入但 rebuild 失败：${rebuild.error ?? ''}` }
        }
        allowedBuilds = keys
      }
    }
  }
  if (!run.ok) return { ok: false, profile: options.profile, error: run.error }
  reconcilePlugins(before, dir)
  const after = readProfileManifest('mygo', dir)
  // r7：新装/版本变更的包若已在 live rail 受管块在管（升级场景），运行期
  // 重放即生效；否则进 bundles，重启/boot 物化。
  const liveSet = new Set(liveBlockPackages(readPatchText(dir)))
  const beforeDeps = before.dependencies ?? {}
  const live = Object.entries(after.dependencies ?? {})
    .some(([name, spec]) => beforeDeps[name] !== spec && liveSet.has(name))
  return {
    ok: true,
    profile: options.profile,
    bundles: after.dsh?.profile?.bundles ?? [],
    live,
    ...(allowedBuilds === undefined ? {} : { allowedBuilds }),
  }
}

/** profile 卸载：profile 目录 pnpm remove + bundle 对账。 */
export function profileUninstall(name: string, options: ProfileExecOptions): ProfileExecResult {
  const dir = ensureProfile(options)
  const before = readProfileManifest('mygo', dir)
  // r7 live rail：先剥受管块（实例在跑时 host 重放即 live dispose），再
  // pnpm remove——反了残留行会在下次重放/重启 import 失败连坐整次重放
  // （CLI 与面板同口径；面板路径已剥时此处幂等 no-op）。
  const home = options.home ?? resolveDshHome(process.env)
  const liveStripped = hasLiveBlock(home, options.profile, name)
  if (liveStripped) liveUninstall(home, options.profile, name)
  const run = runPnpm(dir, ['remove', name], options.cwd ?? process.cwd(), options.env)
  if (!run.ok) {
    if (liveStripped) {
      // pnpm 失败 = 包未卸载，恢复 live 块（物化源不能丢；恢复尽力而为）。
      try {
        writeLiveBlock(home, options.profile, name, resolveBundleDir('mygo', name, installAnchor(dir), dir))
      } catch {
        // 包目录不可解析等：块已剥，下次 boot 由 bundles/依赖残态兜底
      }
    }
    return { ok: false, profile: options.profile, error: run.error }
  }
  reconcilePlugins(before, dir)
  const after = readProfileManifest('mygo', dir)
  return {
    ok: true,
    profile: options.profile,
    bundles: after.dsh?.profile?.bundles ?? [],
    ...(liveStripped ? { liveStripped } : {}),
  }
}

/** 读 profile 用户 patch 层文本（缺省为空文档）。 */
function readPatchText(dir: string): string {
  const path = join(dir, 'cordis.patch.yml')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * profile 启停：写 profile cordis.patch.yml 的 id 定向 disabled patch 块
 * （标记块包裹，enable = 移除块，disable = 追加块，幂等）。
 */
export function profileSetEnabled(id: string, enabled: boolean, options: ProfileExecOptions): ProfileExecResult {
  const dir = ensureProfile(options)
  const path = join(dir, 'cordis.patch.yml')
  const text = readPatchText(dir)
  const begin = `${DISABLE_BLOCK_BEGIN} (id:${id}) ---`
  const pattern = new RegExp(`\\n?${escapeRegExp(begin)}\\n(?:.*\\n)*?${escapeRegExp(DISABLE_BLOCK_END)}\\n?`)
  const stripped = text.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n')
  if (enabled) {
    const next = stripped === text ? text : stripped
    if (next !== text) writeFileSync(path, next === '' ? '' : next, 'utf8')
    return { ok: true, profile: options.profile }
  }
  if (stripped !== text) return { ok: true, profile: options.profile } // 已有禁用块，幂等
  const block = `${begin}\n- id: ${id}\n  disabled: true\n${DISABLE_BLOCK_END}\n`
  const head = text.trimEnd()
  writeFileSync(path, (head === '' ? '' : `${head}\n\n`) + block, 'utf8')
  return { ok: true, profile: options.profile }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
