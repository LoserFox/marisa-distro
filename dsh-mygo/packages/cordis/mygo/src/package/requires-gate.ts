/**
 * requires 政策闸（design-r3 §2.1/§4.4，B6）：服务级依赖仅运行期求值——
 * service-missing / provider-version-mismatch / symbol-missing，INACTIVE 在
 * 提供者出现后自动激活（EB-D16）；不进依赖图、安装期不阻断。
 * 服务版本 = 提供者插件 manifest 版本；符号投影 = 挂载时缓存快照（B13）；
 * 候选集 = 服务提供者观测记录（B19）。
 * 版本/符号维度为作者愿景级决策，超出最小语义（声明 + INACTIVE + 报告）。
 * @module @r05en1cu/dsh-mygo/src/package/requires-gate
 */

import { matchesVersionRange } from '../semver-range.ts'
import { preGate, type ProviderSymbolSnapshot } from './fine-epoch.ts'
import type { ProviderObservation } from './provider-observations.ts'
import type { ServiceResolutionReport } from './report.ts'

/** 政策闸违例类型。 */
export type RequiresViolationKind = 'service-missing' | 'provider-version-mismatch' | 'symbol-missing'

/** 一次 requires 求值结果。 */
export interface RequiresGateResult {
  readonly pluginId: string
  readonly ok: boolean
  readonly violations: readonly {
    readonly kind: RequiresViolationKind
    readonly service: string
    readonly range: string
    readonly providerVersion?: string
    readonly missingSymbols?: readonly string[]
    /** 报告候选集：B19 观测记录中的已知提供者（当前 ACTIVE + 历史，A6）。 */
    readonly candidates: readonly ProviderObservation[]
  }[]
}

/** 求值输入：插件声明、当前提供者快照、观测记录、消费者被用符号。 */
export interface RequiresGateInput {
  readonly pluginId: string
  readonly requires: Readonly<Record<string, string | readonly string[]>>
  /** 服务名 → 提供者快照（B13 挂载时缓存；undefined = 当前无提供者）。 */
  readonly snapshots: Readonly<Record<string, ProviderSymbolSnapshot | undefined>>
  /** 服务名 → 观测候选（B19）。 */
  readonly observations: Readonly<Record<string, readonly ProviderObservation[]>>
  /** 消费者被用符号（静态投影；动态访问由 B13 注册表补充）。 */
  readonly consumerSymbols?: Readonly<Record<string, readonly string[]>>
}

/**
 * 求值 requires 政策（纯函数；无磁盘 I/O，EB-D20）。每个服务的区间可接受
 * 数组（OR）；任何服务不满足 → ok=false。
 */
export function evaluateRequiresGate(input: RequiresGateInput): RequiresGateResult {
  const violations: {
    readonly kind: RequiresViolationKind
    readonly service: string
    readonly range: string
    readonly providerVersion?: string
    readonly missingSymbols?: readonly string[]
    readonly candidates: readonly ProviderObservation[]
  }[] = []
  for (const [service, rawRange] of Object.entries(input.requires).sort()) {
    const ranges = Array.isArray(rawRange) ? rawRange : [rawRange]
    // 原型安全查表（修复批次 2 / review#1 A1）：`snapshots`/`observations` 为
    // 普通对象时，键名 "toString"/"constructor" 等会命中 Object.prototype 的
    // 继承成员造成误判/崩溃——一律 hasOwn 判定。
    const snapshot = Object.prototype.hasOwnProperty.call(input.snapshots, service)
      ? input.snapshots[service]
      : undefined
    const candidates = Object.prototype.hasOwnProperty.call(input.observations, service)
      ? input.observations[service] ?? []
      : []
    if (snapshot === undefined) {
      violations.push({
        kind: 'service-missing',
        service,
        range: ranges.join(' || '),
        candidates,
      })
      continue
    }
    if (!ranges.some(range => matchesVersionRange(snapshot.version, range))) {
      violations.push({
        kind: 'provider-version-mismatch',
        service,
        range: ranges.join(' || '),
        providerVersion: snapshot.version,
        candidates,
      })
      continue
    }
    const used = input.consumerSymbols !== undefined
      && Object.prototype.hasOwnProperty.call(input.consumerSymbols, service)
      ? input.consumerSymbols[service]
      : undefined
    if (used !== undefined && used.length > 0) {
      const gate = preGate(used, snapshot)
      if (!gate.ok) {
        violations.push({
          kind: 'symbol-missing',
          service,
          range: ranges.join(' || '),
          providerVersion: snapshot.version,
          missingSymbols: gate.missing,
          candidates,
        })
      }
    }
  }
  return { pluginId: input.pluginId, ok: violations.length === 0, violations }
}

/**
 * 把一次 requires 政策闸结果渲染为服务级结构化报告（design-r3 §4.6/B7）。
 * 词汇分工（修复批次 2 / 任务 2.2）：全部违例均为符号缺失 → `symbol-missing`；
 * 含服务缺失/版本不符 → `policy-rejected`，两者不混用。
 */
export function requiresGateReport(result: RequiresGateResult): ServiceResolutionReport {
  const conflicts = result.violations.map(violation => {
    const kind: 'requires' | 'symbol' = violation.kind === 'symbol-missing' ? 'symbol' : 'requires'
    return {
      service: violation.service,
      constraint: {
        kind,
        target: violation.service,
        range: violation.range,
      },
      chain: [result.pluginId, violation.service],
      candidates: violation.candidates.map(observation => ({
        plugin: observation.pluginId,
        ...(observation.version === undefined ? {} : { version: observation.version }),
        state: observation.state,
      })),
      actions: violation.kind === 'service-missing'
        ? [`安装/启用提供 ${violation.service} 的插件（候选：${violation.candidates.map(item => item.pluginId).join(', ') || '未知'}）`]
        : violation.kind === 'provider-version-mismatch'
          ? [`将提供者升级到满足 ${violation.range} 的版本（当前 ${violation.providerVersion ?? '未知'}）`]
          : [`提供者补齐符号：${(violation.missingSymbols ?? []).join(', ')}，或由消费者迁移到新符号`],
    }
  })
  const allSymbolMissing = result.violations.length > 0
    && result.violations.every(violation => violation.kind === 'symbol-missing')
  return {
    code: allSymbolMissing ? 'symbol-missing' : 'policy-rejected',
    summary: `requires 政策闸：${result.pluginId} 有 ${conflicts.length} 个服务约束不满足`,
    scope: 'service',
    cycles: [],
    conflicts,
  }
}
