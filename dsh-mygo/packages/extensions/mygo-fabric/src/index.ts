/**
 * mygo fabric extension 治理壳（P6）：extension 登记表首条 + fabric 组合缝
 * 的受管块启用/停用。包根同时是 mygo 受管插件形态（name/inject/apply）：
 * 挂载即把 fabric 登记进 `pluginManager` 的 extension 注册面，fiber 清理
 * 注销（发现/启停走 mygo 治理面）。
 * @module @r05en1cu/dsh-mygo-ext-fabric
 */

import type { ExtensionRegistration } from '@r05en1cu/dsh-mygo'
import { fabricExtensionRegistration } from './fabric.ts'

export {
  FABRIC_BLOCK_BEGIN,
  FABRIC_BLOCK_END,
  FABRIC_DEFAULT_SPECS,
  FABRIC_EXTENSION_ID,
  FABRIC_PACKAGES,
  disableFabric,
  enableFabric,
  fabricExtensionRegistration,
  fabricManagedBlock,
  findStrayFabricRow,
  removeManagedExtensionBlock,
} from './fabric.ts'
export type { FabricTarget, FabricToggleResult } from './fabric.ts'

/** 管理器 extension 注册面的最小结构。 */
interface ExtensionRegistryHost {
  registerExtension(registration: ExtensionRegistration): () => void
}

/** 宿主 ctx 最小结构（cordis Context 的 get/effect 子集）。 */
interface FabricPluginContext {
  get<T = unknown>(key: string): T | undefined
  effect?(fn: () => () => void, label?: string): void
}

/** Cordis 插件名（稳定；manifest id 同源）。 */
export const name = 'dsh-mygo-fabric'

export const inject = ['pluginManager']

/**
 * mygo 受管插件形态：挂载即把 fabric 扩展登记进治理面（纯登记，零
 * I/O——安装/启停动作由 enableFabric/disableFabric 显式驱动）。
 */
export function apply(ctx: FabricPluginContext): void {
  const manager = ctx.get<ExtensionRegistryHost>('pluginManager')
  if (manager === undefined) {
    throw new Error('dsh-mygo-fabric: 需要 pluginManager 服务（extension 注册面）')
  }
  const dispose = manager.registerExtension(fabricExtensionRegistration())
  ctx.effect?.(() => dispose, 'dsh-mygo-fabric.teardown')
}
