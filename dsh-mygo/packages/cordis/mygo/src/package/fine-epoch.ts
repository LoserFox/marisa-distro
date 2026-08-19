/**
 * 挂载时导出快照注册表 + 前置门（design-r3 §1.1/§4.1，B13）：挂载时缓存的
 * 导出快照、纯内存比较、禁磁盘 I/O（EB-D20）。
 *
 * 定论（P7-B6 复核，2026-08-14）：**保持独立模块，不并入 requires-gate**。
 * 复核面：消费方不止政策闸——lifecycle.ts 的挂载/替换链路同时持有
 * FineEpochRegistry（快照生命周期随 fiber）并直接调 preGate/captureExports；
 * requires-gate.ts 只消费 preGate 与快照类型。并入会把「快照注册表 +
 * 捕获」的运行时所有权语义塞进纯求值的政策闸模块，违反两者既定分层
 * （requires-gate 是纯函数面，fine-epoch 是带所有权的注册表）。独立细
 * epoch 指纹函数（fineEpoch）无生产消费者，已删除（P1）。
 * @module @r05en1cu/dsh-mygo/src/package/fine-epoch
 */

/** 提供者符号投影快照（挂载时缓存；纯内存）。 */
export interface ProviderSymbolSnapshot {
  readonly pluginId: string
  readonly version: string
  /** 挂载时缓存的导出符号集合（确定性排序）。 */
  readonly exports: readonly string[]
  /** 提供方声明的符号别名（别名 → 规范符号，EB-D19）。 */
  readonly aliases?: Readonly<Record<string, string>>
}

/** 一次前置门校验结果。 */
export interface PreGateResult {
  readonly ok: boolean
  /** 消费者被用但提供者缺失的符号。 */
  readonly missing: readonly string[]
  /** 经符号别名解析通过的符号。 */
  readonly aliased: readonly string[]
}

/**
 * 挂载时缓存导出快照（纯内存，A5：10k 符号亚毫秒）。
 * 键处理口径（修复批次 2 / review#1 A16 镜像）：自有键全量收录——包括名为
 * `constructor` / `__proto__` 的自有导出（defineProperty 声明的合法符号面）；
 * 原型层继续过滤这三个键并止步于 Object.prototype（防原型链污染），
 * 与 requires-gate.ts 的原型安全查表同口径。
 */
export function captureExports(value: unknown): readonly string[] {
  const keys = new Set<string>()
  let current: unknown = value
  let level = 0
  for (;;) {
    const isObject = typeof current === 'object' && current !== null
    const isRootFunction = level === 0 && typeof current === 'function'
    if (!isObject && !isRootFunction) break
    for (const key of Object.getOwnPropertyNames(current as object)) {
      // 仅原型层过滤：自有层（level 0）是插件的合法导出面，全量收录。
      if (level > 0 && (key === '__proto__' || key === 'constructor' || key === 'prototype')) continue
      keys.add(key)
    }
    current = Object.getPrototypeOf(current as object)
    level += 1
    if (current === Object.prototype) break
  }
  return [...keys].sort()
}

/**
 * 前置门：消费者被用符号投影 ⊆ 提供者导出快照（符号别名先解析）。
 * 纯内存 Set 差比较，无磁盘 I/O（EB-D20）；预算微秒~亚毫秒（A5）。
 */
export function preGate(
  consumerSymbols: readonly string[],
  snapshot: ProviderSymbolSnapshot | undefined,
): PreGateResult {
  if (snapshot === undefined) {
    return { ok: false, missing: [...consumerSymbols], aliased: [] }
  }
  const providerExports = new Set(snapshot.exports)
  const missing: string[] = []
  const aliased: string[] = []
  for (const symbol of consumerSymbols) {
    if (providerExports.has(symbol)) continue
    const canonical = snapshot.aliases?.[symbol]
    if (canonical !== undefined && providerExports.has(canonical)) {
      aliased.push(symbol)
      continue
    }
    missing.push(symbol)
  }
  return { ok: missing.length === 0, missing, aliased }
}

/**
 * 挂载时快照注册表：能力 → 提供者快照；随 fiber 生命周期清理（B19 同生命周期）。
 * 只读、不阻断；requires 政策闸的前置门与报告候选集消费。
 */
export class FineEpochRegistry {
  private readonly snapshots = new Map<string, ProviderSymbolSnapshot>()

  /** 注册/更新一次挂载时快照（同实例换值不改变 uid/版本/投影）。 */
  set(service: string, snapshot: ProviderSymbolSnapshot): void {
    this.snapshots.set(service, snapshot)
  }

  /** 移除一个能力/提供者快照（unprovide / fiber 卸载）。 */
  delete(service: string): boolean {
    return this.snapshots.delete(service)
  }

  /** 当前快照；缺省 undefined（服务缺失）。 */
  get(service: string): ProviderSymbolSnapshot | undefined {
    return this.snapshots.get(service)
  }

  /** 已知提供者清单（报告候选集；B19 观测记录另行记账）。 */
  knownProviders(service: string): readonly string[] {
    const snapshot = this.snapshots.get(service)
    return snapshot === undefined ? [] : [snapshot.pluginId]
  }

  /** 全部快照（只读视图）。 */
  entries(): readonly { readonly service: string; readonly snapshot: ProviderSymbolSnapshot }[] {
    return [...this.snapshots.entries()].map(([service, snapshot]) => ({ service, snapshot }))
  }
}
