/**
 * registry auth env 桥（rc8 P1）：spawn pnpm/dsh 前把 profile `.npmrc`
 * 受管块里的 `${REF}` 占位经官方 `ctx.credentials` 逐个解析成子进程
 * env——按操作解析不缓存（官方语义：轮换机密下一次操作即生效，无需
 * 重启）。解析失败/未配置的 ref 不阻断 spawn（pnpm 自己的 401 就是最
 * 清楚的报错），由调用方把 missing 名单写进 warnings。
 *
 * 机密值只在本函数的返回 env 里短暂停留，直接进 spawn；不写盘、不记
 * 日志、不进任何 API 响应。
 * @module @r05en1cu/dsh-mygo/src/registry-auth
 */

import { join } from 'node:path'
import { collectAuthRefs } from './npmrc.ts'

/** 官方 credentials 服务的鸭子类型面（`ctx.get('credentials')` 宽松获取）。 */
export interface CredentialsLike {
  resolve(ref: string): Promise<{ readonly value: string; readonly source: string } | undefined>
  describe(ref: string): Promise<{
    readonly configured: boolean
    readonly source?: string
    readonly writable: boolean
  }>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** resolveProfileEnv 的结果：可注入子进程的 env 增量 + 未配置 ref 名单。 */
export interface ProfileEnvResolution {
  /** `${REF}` → 值的映射（直接并入 spawn env）。 */
  readonly env: Readonly<Record<string, string>>
  /** 受管块引用但未配置（或服务缺席）的 ref 名单。 */
  readonly missing: readonly string[]
}

/**
 * 解析 profile .npmrc 受管块的 auth 引用为 spawn env。credentials 服务
 * 缺席（非 dsh 宿主/组合未含 credentials）时全部计 missing 并返回空
 * env——调用方 warn 一次即可，spawn 照常进行。
 */
export async function resolveProfileEnv(
  home: string,
  profile: string,
  credentials: CredentialsLike | undefined,
): Promise<ProfileEnvResolution> {
  const refs = collectAuthRefs(join(home, 'profiles', profile))
  if (refs.length === 0) return { env: {}, missing: [] }
  if (credentials === undefined) return { env: {}, missing: refs }
  const env: Record<string, string> = {}
  const missing: string[] = []
  for (const ref of refs) {
    // 按操作解析，不缓存——值变更下次操作即生效。
    const resolved = await credentials.resolve(ref)
    if (resolved === undefined) missing.push(ref)
    else env[ref] = resolved.value
  }
  return { env, missing }
}
