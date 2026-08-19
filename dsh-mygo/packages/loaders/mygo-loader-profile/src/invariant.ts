/**
 * 包级 invariant 伴生（官方模板形态）：本包自身无运行期事件序列，
 * 注册空 installer 以保留包级归属（替换为真实不变量后生效）。
 * @module @r05en1cu/dsh-mygo-loader-profile/invariant
 */

import type { Context } from '@deepseek-ai/cordis'

const PACKAGE_NAME = '@r05en1cu/dsh-mygo-loader-profile'

type InvariantInstaller = (ctx: Context, fail: InvariantFailure) => void | Promise<void>

/** 包级不变量失败类型。 */
type InvariantFailure = (message: string) => never

/** 宿主 invariant 注册表的最小契约。 */
interface InvariantRegistry {
  register(packageName: string, installer: (ctx: Context, fail: InvariantFailure) => void | Promise<void>): () => void
}

/** Cordis 伴生插件名。 */
export const name = 'dsh-mygo-loader-profile-invariant'

/** 伴生需要宿主 invariants 服务。 */
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

/** 注册本包的不变量伴生。 */
export const apply = (ctx: Context): Promise<() => void> => {
  const registry = ctx.get('invariants') as InvariantRegistry | undefined
  if (registry === undefined) {
    return Promise.reject(new Error(`invariant companion requires the "invariants" service for ${PACKAGE_NAME}`))
  }
  return Promise.resolve(registry.register(PACKAGE_NAME, install))
}
