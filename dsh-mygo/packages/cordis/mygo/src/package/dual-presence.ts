/**
 * 双存在检测（design-r3 §5.2/B12；two-tier §10）：同一包既以插件身份被
 * loader 注册、又以 npm 依赖身份嵌套存在于某插件 node_modules 时，输出
 * 重复实例风险警告。MUST NOT 阻断。社区侧永远只读。
 * @module @r05en1cu/dsh-mygo/src/package/dual-presence
 */

/** 双存在检测输入：一个插件的包级元数据（npm + mygo 声明）。 */
export interface DualPresenceInput {
  readonly pluginId: string
  /** 该插件 package.json 的 dependencies（嵌套 npm 依赖事实）。 */
  readonly dependencies?: Readonly<Record<string, string>>
  /** 当前已知插件 id 集（loader 注册面）。 */
  readonly registeredIds: ReadonlySet<string>
  /** 当前已知服务需求（canonical requires + legacy service: 前缀）。 */
  readonly serviceRequirements?: Readonly<Record<string, unknown>>
}

/** 一条双存在告警（告警级；永不阻断）。 */
export interface DualPresenceWarning {
  readonly kind: 'npm-nested-plugin' | 'service-requirement'
  readonly pluginId: string
  readonly target: string
  readonly detail: string
}

/** 检测双存在（纯函数；只读、告警级、不阻断，two-tier §10）。 */
export function detectDualPresence(input: DualPresenceInput): readonly DualPresenceWarning[] {
  const warnings: DualPresenceWarning[] = []
  for (const [dependency, range] of Object.entries(input.dependencies ?? {})) {
    const name = dependency.startsWith('@') ? dependency.split('/').slice(0, 2).join('/') : dependency.split('/')[0] as string
    if (input.registeredIds.has(name)) {
      warnings.push({
        kind: 'npm-nested-plugin',
        pluginId: input.pluginId,
        target: name,
        detail: `${input.pluginId} 的 dependencies 包含已注册插件 ${name}（${range}）：可能双份模块实例/单例身份分裂`,
      })
    }
  }
  for (const [key] of Object.entries(input.serviceRequirements ?? {})) {
    const service = key.startsWith('service:') ? key.slice('service:'.length) : key
    if (input.registeredIds.has(service)) {
      warnings.push({
        kind: 'service-requirement',
        pluginId: input.pluginId,
        target: service,
        detail: `${input.pluginId} 的服务需求 ${key} 与插件 id ${service} 重叠：重复实例风险`,
      })
    }
  }
  return warnings
}
