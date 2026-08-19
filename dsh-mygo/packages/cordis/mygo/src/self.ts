/**
 * mygo 自身安装事实（版本 / 远端 / commit）。
 *
 * 版本事实来源按优先级：`$DSH_HOME/mygo-self.json#version`（安装器写入，
 * 与仓库 `VERSION` 文件同源；install.sh 退役后由 P3 新安装形态承担）→
 * 内置回退：包自身 package.json 版本（开发/harness 环境）。
 * 统一依赖图（`dsh-mygo` 成员）与 BOM 导出都用这一份事实，避免
 * `MYGO_MANAGER_VERSION` 硬编码漂移（历史坑：常量 0.1.0 与仓库 0.1.1 不一致）。
 * @module @r05en1cu/dsh-mygo/src/self
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { parseVersion } from './semver-range.ts'

/** mygo 自身安装记录（`mygo-self.json` 的解析结果）。 */
export interface MygoSelfInfo {
  /** 安装版本；缺失/非法时回退 `0.1.0`。 */
  readonly version: string
  readonly url?: string
  readonly ref?: string
  readonly commit?: string
  readonly installedAt?: number
}

/** 回退版本：开发/harness 环境没有 mygo-self.json 时读取包自身版本。 */
function packageVersionFallback(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { readonly version?: unknown }
    if (typeof pkg.version === 'string' && isSemver(pkg.version)) return pkg.version
  } catch {
    // fall through to the hardcoded fallback
  }
  return '0.1.0'
}

const FALLBACK_VERSION = packageVersionFallback()

function isSemver(value: unknown): value is string {
  return typeof value === 'string' && parseVersion(value) !== undefined
}

/** 读取当前 mygo 自身安装事实；文件缺失/损坏时返回回退版本。 */
export function readMygoSelf(): MygoSelfInfo {
  try {
    const raw = readFileSync(dshHomePath('mygo-self.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      readonly version?: unknown
      readonly url?: unknown
      readonly ref?: unknown
      readonly commit?: unknown
      readonly installedAt?: unknown
    }
    return {
      version: isSemver(parsed.version) ? parsed.version : FALLBACK_VERSION,
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(typeof parsed.ref === 'string' ? { ref: parsed.ref } : {}),
      ...(typeof parsed.commit === 'string' ? { commit: parsed.commit } : {}),
      ...(typeof parsed.installedAt === 'number' ? { installedAt: parsed.installedAt } : {}),
    }
  } catch {
    return { version: FALLBACK_VERSION }
  }
}

/** 模块加载时解析一次：统一依赖图与 BOM 导出共享同一版本事实。 */
export const MYGO_SELF = readMygoSelf()

/** mygo 自身在统一依赖图中的版本（`dsh-mygo` 成员版本）。 */
export const MYGO_MANAGER_VERSION = MYGO_SELF.version

/**
 * bundle 安装路径的自身事实写入（P3 补位 install.sh 的写入者职责）：
 * 服务启动时把本包 package.json 事实（版本 + 仓库 url）写入
 * `$DSH_HOME/mygo-self.json`（内容相同则跳过；失败不阻断启动）。
 */
export function writeMygoSelfInstallation(now: () => number = () => Math.floor(Date.now() / 1000)): void {
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    let pkg: { readonly name?: unknown; readonly version?: unknown; readonly repository?: unknown } | undefined
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const candidate = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as typeof pkg
        if (candidate?.name === '@r05en1cu/dsh-mygo') {
          pkg = candidate
          break
        }
      } catch {
        // 继续向上找
      }
      dir = dirname(dir)
    }
    if (pkg === undefined || !isSemver(pkg.version)) return
    const repo = pkg.repository as { readonly url?: unknown } | undefined
    const next = {
      ...(typeof repo?.url === 'string' ? { url: repo.url } : {}),
      version: pkg.version,
      installedAt: now(),
    }
    const path = dshHomePath('mygo-self.json')
    const existing = readMygoSelf()
    if (existing.version === next.version && existing.url === next.url) return
    writeFileSync(path, JSON.stringify(next) + '\n', 'utf8')
  } catch {
    // best-effort：自身事实缺失不阻断服务启动（self.ts 回退链兜底）
  }
}
