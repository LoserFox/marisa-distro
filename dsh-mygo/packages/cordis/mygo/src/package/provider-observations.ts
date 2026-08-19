/**
 * 服务提供者观测记录（design-r3 §2.1 记账机制，B19）：由于 manifest 不声明
 * 「提供服务」，requires 报告候选集 MUST 来自运行期观测——谁在何时 provide
 * 过什么服务（插件 id、服务名、时间、生命周期状态）。随 fiber 生命周期清理；
 * 只读、不阻断，仅用于报告与诊断。
 * @module @r05en1cu/dsh-mygo/src/package/provider-observations
 */

/** 提供者生命周期状态（供报告归因）。 */
export type ProviderLifecycleState = 'active' | 'inactive' | 'disabled' | 'policy-rejected'

/** 一条服务提供者观测记录。 */
export interface ProviderObservation {
  readonly service: string
  readonly pluginId: string
  readonly version: string
  readonly firstSeen: number
  readonly lastSeen: number
  readonly state: ProviderLifecycleState
}

/** 服务提供者观测注册表（B19；随 fiber 生命周期清理）。 */
export class ProviderObservationRegistry {
  private readonly records = new Map<string, ProviderObservation>()

  /**
   * 记录/刷新一次 provide 观测。同 (service, pluginId) 合并，更新 lastSeen 与状态。
   */
  observe(
    service: string,
    pluginId: string,
    version: string,
    now: number,
    state: ProviderLifecycleState = 'active',
  ): void {
    const key = `${service}\u0000${pluginId}`
    const previous = this.records.get(key)
    this.records.set(key, {
      service,
      pluginId,
      version,
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: now,
      state,
    })
  }

  /** 更新一条记录的状态（如提供者进入 INACTIVE / 政策拒绝）。 */
  updateState(service: string, pluginId: string, state: ProviderLifecycleState, now: number): void {
    const key = `${service}\u0000${pluginId}`
    const record = this.records.get(key)
    if (record === undefined) return
    this.records.set(key, { ...record, state, lastSeen: now })
  }

  /** 移除一个提供者（unprovide / fiber 卸载；随生命周期清理）。 */
  remove(service: string, pluginId: string): boolean {
    return this.records.delete(`${service}\u0000${pluginId}`)
  }

  /** 某服务的已知提供者候选清单（当前 ACTIVE + 历史，A6；报告候选集）。 */
  candidates(service: string): readonly ProviderObservation[] {
    return [...this.records.values()]
      .filter(record => record.service === service)
      .sort((a, b) => a.firstSeen - b.firstSeen || (a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0))
  }

  /** 全部记录（只读视图）。 */
  entries(): readonly ProviderObservation[] {
    return [...this.records.values()].sort((a, b) =>
      a.firstSeen - b.firstSeen || (a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0))
  }

  /** 清空（引擎 dispose）。 */
  clear(): void {
    this.records.clear()
  }
}
