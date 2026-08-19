/**
 * dsh-hub 市场 LoaderAdapter（P5）：registry 拉取/验签/降级、可安装判定
 * 与治理元数据评估、install intent 翻译（profile-bundle → profile 执行面；
 * guided 只展示；repository-plugin 默认拒绝 + 启发式实验放行）、
 * collections 原子安装。
 *
 * 包根同时是 mygo 受管插件形态（name/inject/apply）：挂载时把绑定
 * vendored 快照的 hub adapter 注册进 `pluginManager` 的 loader 注册面，
 * 卸载随 fiber 清理注销（发现/启停走 mygo 治理面）。
 * @module @r05en1cu/dsh-mygo-loader-hub
 */

import type { LoaderAdapter } from '@r05en1cu/dsh-mygo-api'
import { createHubLoaderAdapter } from './adapter.ts'
import { loadVendoredHubSnapshot } from './registry.ts'

export {
  HUB_BUILTIN_KEYS,
  HUB_REGISTRY_ORIGINS,
  HUB_REGISTRY_SCHEMA,
  HubRegistryError,
  canonicalJson,
  loadHubRegistry,
  loadVendoredHubSnapshot,
  parseHubRegistry,
  vendoredSnapshotPath,
  verifyHubRegistry,
} from './registry.ts'
export type {
  HubCollection,
  HubCollectionItem,
  HubEntry,
  HubFetch,
  HubInstallIntent,
  HubLoadOptions,
  HubLoadResult,
  HubRegistry,
  HubRegistryKey,
  HubRegistrySource,
  HubRelease,
  HubSignature,
  HubVerification,
  HubVerifyOptions,
} from './registry.ts'
export { assessHubEntry, pickHubRelease } from './assess.ts'
export type { HubAssessment } from './assess.ts'
export {
  REPOSITORY_TRACK_REMOVED,
  createRepositoryBundleProbe,
  translateHubInstall,
} from './intent.ts'
export type {
  HubTranslatedInstall,
  RepositoryBundleProbe,
  TranslateHubInstallOptions,
} from './intent.ts'
export { createHubLoaderAdapter } from './adapter.ts'
export type { CreateHubLoaderAdapterOptions, HubLoaderAdapter } from './adapter.ts'
export { installHubCollection } from './collections.ts'
export type { HubCollectionExecutor, HubCollectionInstallResult } from './collections.ts'

/** 管理器 loader 注册面的最小结构。 */
interface LoaderRegistryHost {
  registerLoaderAdapter(adapter: LoaderAdapter): () => void
}

/** 宿主 ctx 最小结构（cordis Context 的 effect/get 子集）。 */
interface HubPluginContext {
  get<T = unknown>(key: string): T | undefined
  effect?(fn: () => () => void, label?: string): void
}

/** Cordis 插件名（稳定；manifest id 同源）。 */
export const name = 'dsh-mygo-loader-hub'

export const inject = ['pluginManager']

/**
 * mygo 受管插件形态：挂载即把绑定 vendored 快照的 hub adapter 注册进
 * 治理面（远程刷新经 CLI hub 命令显式加载后重新注册；boot 期零网络
 * I/O）。管理器缺失时 fail loud（inject 已声明，正常不会缺）。
 */
export function apply(ctx: HubPluginContext): void {
  const manager = ctx.get<LoaderRegistryHost>('pluginManager')
  if (manager === undefined) {
    throw new Error('dsh-mygo-loader-hub: 需要 pluginManager 服务（loader 注册面）')
  }
  const adapter = createHubLoaderAdapter({ registry: loadVendoredHubSnapshot() })
  const dispose = manager.registerLoaderAdapter(adapter)
  ctx.effect?.(() => dispose, 'dsh-mygo-loader-hub.teardown')
}
