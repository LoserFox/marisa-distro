/**
 * LoaderAdapter 注册表（P5 loader 扩展体系）：mygo 核心只持有注册表结构
 * （对齐 BUILTIN_LOADERS 形态），适配器实现由包/受管插件在运行时注册。
 * 内置执行面 id 仅 `'profile'`（profile loader 是所有其他 loader 的最终
 * 执行面）；hub 等来源适配器作为 mygo 受管插件注册，发现走
 * `pluginManager.loaderAdapters()`，启停随插件 fiber 清理注销。
 * @module @r05en1cu/dsh-mygo/src/loader-adapters
 */

import type { InstallIntent, LoaderAdapter } from '@r05en1cu/dsh-mygo-api'

/** 内置 loader adapter id（v1 仅 profile 执行面；其余来源走受管插件注册）。 */
export const BUILTIN_LOADER_ADAPTERS = ['profile'] as const

/** 合法 adapter id（与插件 id 同词汇）。 */
const ADAPTER_ID_RE = /^[a-z][a-z0-9-]*$/

/** 一次 spec 解析命中：来源适配器 + 安装意图。 */
export interface LoaderAdapterResolution {
  readonly adapter: LoaderAdapter
  readonly intent: InstallIntent
}

/**
 * LoaderAdapter 注册表。注册幂等不允（重复 id 直接拒绝——同一来源两个
 * 实现必属装配错误）；register 返回注销器，供插件 fiber 清理时调用
 * （启停随治理面）。
 */
export class LoaderAdapterRegistry {
  private readonly adapters = new Map<string, LoaderAdapter>()

  /** 注册一个适配器；重复/非法 id 抛出。返回注销器（幂等）。 */
  register(adapter: LoaderAdapter): () => void {
    if (!ADAPTER_ID_RE.test(adapter.id)) {
      throw new Error(`非法 loader adapter id（须匹配 ${ADAPTER_ID_RE.source}）：${JSON.stringify(adapter.id)}`)
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`loader adapter ${adapter.id} 已注册（重复注册拒绝）`)
    }
    this.adapters.set(adapter.id, adapter)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      // 只注销同一实例（防御注销期间被他人重注册同 id 的竞态）
      if (this.adapters.get(adapter.id) === adapter) this.adapters.delete(adapter.id)
    }
  }

  /** 按 id 取适配器。 */
  get(id: string): LoaderAdapter | undefined {
    return this.adapters.get(id)
  }

  /** 已注册适配器列表（按 id 字典序，确定性）。 */
  list(): readonly LoaderAdapter[] {
    return [...this.adapters.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  /**
   * 逐适配器试解析一个外部 spec（注册表序 = id 字典序，确定性）；全部不
   * 识别返回 undefined（调用方报「未知安装来源」）。
   */
  resolve(spec: string): LoaderAdapterResolution | undefined {
    for (const adapter of this.list()) {
      const intent = adapter.resolve(spec)
      if (intent !== null) return { adapter, intent }
    }
    return undefined
  }
}
