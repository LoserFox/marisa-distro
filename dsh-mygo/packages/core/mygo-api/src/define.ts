/**
 * Type-carrying entry point for plugin authors. `definePlugin` 的产出同时是
 * 受管 manifest 与 Cordis 可挂载模块：`ctx.plugin()` 可直接消费（P2 合并
 * 裁决——原 `toCordisPlugin` 包装与本函数语义重复，已并入；挂载面以
 * 非枚举属性承载，严格校验器（strict zod）只见 manifest 字段）。
 * @module @r05en1cu/dsh-mygo-api/src/define
 */

import type { PluginDefinition, Schemastery } from './types.ts'

/** `definePlugin` 产出上的 Cordis 挂载面（非枚举属性；manager 缺席时 inject 失败即挂载失败）。 */
export interface CordisMountShape {
  readonly name: string
  readonly inject: readonly ['pluginManager']
  readonly Config: Schemastery
  apply(ctx: ManagerAdoptContext, config: unknown): void
}

/** 挂载面需要的最小宿主面：`ctx.pluginManager.adopt`（自举进受管集）。 */
export interface ManagerAdoptContext {
  readonly pluginManager: {
    adopt(definition: PluginDefinition, config: unknown): Promise<void>
  }
}

/** `definePlugin` 的返回类型：manifest 全集 + Cordis 挂载面。 */
export type DefinedPlugin = PluginDefinition & CordisMountShape

/**
 * Declare one managed plugin. The returned object IS the manifest (strict
 * validators see exactly the declared fields) AND a Loader/`ctx.plugin`-
 * mountable module: its non-enumerable `apply` self-adopts into the manager
 * (`inject: ['pluginManager']` makes a missing manager fail loud at mount).
 * @param definition - plugin manifest to carry.
 * @returns the mountable definition.
 */
export function definePlugin(definition: PluginDefinition): DefinedPlugin {
  const out = { ...definition }
  const mount: CordisMountShape = {
    name: definition.id,
    inject: ['pluginManager'],
    Config: definition.config,
    apply(ctx, config) {
      // Activation is async through the manager's staging; the Loader treats
      // the mount fiber as settled and the manager publishes the static
      // handle when adoption completes.
      void ctx.pluginManager.adopt(definition, config)
    },
  }
  for (const key of ['name', 'inject', 'Config', 'apply'] as const) {
    Object.defineProperty(out, key, { value: mount[key], enumerable: false, configurable: true })
  }
  return out as DefinedPlugin
}
