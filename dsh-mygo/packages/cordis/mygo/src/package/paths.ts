/**
 * mygo 基础路径：一切相对 `$DSH_HOME/mygo` 分配，
 * 禁止依赖 process.cwd / __dirname / dsh 安装位置 / npx 缓存。
 * 2026-08-13 范围重塑：dsh.lock/v1 lockfile 已删除（pnpm 安装状态为唯一
 * 真相源），路径表同步去掉 lockfile 目录。
 * @module @r05en1cu/dsh-mygo/src/package/paths
 */

import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/** All mygo-allocated paths for one profile. */
export interface MygoPaths {
  /** `$DSH_HOME/mygo` */
  readonly base: string
  /** 已还原插件根目录：`<base>/packages/<id>/<version>/`（普通落盘，无 store 语义） */
  readonly packagesRoot: string
  /** Plugin config: `<base>/config/` */
  readonly configDir: string
  /** Install staging: `<base>/tmp/` */
  readonly tmpDir: string
  /** Generated bridge packages: `<base>/bridges/` */
  readonly bridgesDir: string
}

/**
 * Resolve `$DSH_HOME` deterministically from the environment (or the user
 * home default). Never consults `process.cwd()`.
 */
export function resolveDshHome(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const explicit = env.DSH_HOME
  return typeof explicit === 'string' && explicit !== '' ? explicit : join(homedir(), '.dsh')
}

/** Resolve all mygo-allocated paths. */
export function resolveMygoPaths(
  _profile: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): MygoPaths {
  const base = join(resolveDshHome(env), 'mygo')
  return {
    base,
    packagesRoot: join(base, 'packages'),
    configDir: join(base, 'config'),
    tmpDir: join(base, 'tmp'),
    bridgesDir: join(base, 'bridges'),
  }
}

/** Restored package dir for one plugin id+version. */
export function packageDir(paths: MygoPaths, id: string, version: string): string {
  return join(paths.packagesRoot, id, version)
}

/**
 * HOME 隔离闸（P4 多实例）：目标路径必须落在指定实例 HOME（$DSH_HOME）
 * 内，否则拒绝写入——跨 HOME 写被拒绝。resolve 后做前缀判定，与
 * package-restore.ts 的 assertInside（B10 包内防逃逸）同模式；唯一合法
 * 的 HOME 外写面是用户级登记处与共享缓存（家目录 .dsh-mygo/，非实例 HOME）。
 * @returns 归一后的目标绝对路径。
 */
export function assertInsideHome(home: string, target: string): string {
  const resolvedHome = resolve(home)
  const resolved = resolve(target)
  if (resolved !== resolvedHome && !resolved.startsWith(`${resolvedHome}${sep}`)) {
    throw new Error(`目标路径逃出实例 HOME：${target}（实例 HOME=${resolvedHome}）`)
  }
  return resolved
}

/** Plugin config file path. */
export function pluginConfigPath(paths: MygoPaths, id: string): string {
  return join(paths.configDir, `${id}.json`)
}

/**
 * Resolve the dsh core version: `DSH_CORE_VERSION` env override, then a
 * caller-provided anchor (the npm-dsh package version), else `undefined`.
 * Tests inject `DSH_CORE_VERSION` for determinism.
 */
export function resolveCoreVersion(
  env: Readonly<Record<string, string | undefined>> = process.env,
  anchor?: { readonly version?: string },
): string | undefined {
  if (typeof env.DSH_CORE_VERSION === 'string' && env.DSH_CORE_VERSION !== '') {
    return env.DSH_CORE_VERSION
  }
  return anchor?.version
}
