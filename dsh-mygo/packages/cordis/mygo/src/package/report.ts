/**
 * Structured verification/governance failure reports（CD-1 统一后）：
 * `code` 直接取自 `@r05en1cu/dsh-mygo-api` 的 PluginErrorCode 闭表
 * （组 7 报告码 + 组 1 manifest-invalid 等），不再有独立的报告码表。
 * 求解体系退役（2026-08-13）：lockfile-mismatch / dependency-cycle /
 * dispose-timeout 随 dsh.lock/v1 与求解器删除；`generation` 字段零调用方
 * 一并删除；报告侧原 `manifest-invalid`（安装期 bundles 声明问题）改名
 * `bundle-invalid`，与 mount 期 `manifest-invalid` 消歧。
 * @module @r05en1cu/dsh-mygo/src/package/report
 */

import type { PluginErrorCode } from '@r05en1cu/dsh-mygo-api'

/** One unsatisfied constraint edge. */
export interface ConstraintRef {
  readonly kind: 'entry' | 'pin' | 'requires' | 'symbol' | 'pack'
  readonly target: string
  readonly range: string
}

/** One candidate version and every reason it was rejected. */
export interface CandidateRejection {
  readonly version: string
  readonly rejected: readonly string[]
}

/** One failed plugin's conflict entry. */
export interface ConflictEntry {
  /** Breakpoint node: the plugin whose candidate set failed. */
  readonly plugin: string
  /** The primary unsatisfied constraint (first in deterministic order). */
  readonly constraint: ConstraintRef
  /** Full dependency path from a requested root to the breakpoint. */
  readonly chain: readonly string[]
  /** Every candidate and all observed rejection reasons. */
  readonly candidates: readonly CandidateRejection[]
  /** Suggested upgrade/downgrade actions. */
  readonly actions: readonly string[]
}

/** A detected dependency cycle. */
export interface CycleEntry {
  readonly cycle: readonly string[]
}

/**
 * Full structured failure report. `code` 取自 PluginErrorCode（当前生产者：
 * resolve-failed / bundle-invalid / symbol-missing / policy-rejected /
 * pack-invalid / pack-hash-mismatch）。
 */
export interface ResolutionReport {
  readonly code: PluginErrorCode
  readonly summary: string
  /** 报告作用域：包级（默认 package）或服务级政策闸（requires，B6）。 */
  readonly scope?: 'package' | 'service' | 'pack'
  readonly cycles: readonly CycleEntry[]
  readonly conflicts: readonly ConflictEntry[]
}

/** 服务级报告（requires 政策闸产物；scope 固定 "service"）。 */
export interface ServiceResolutionReport extends Omit<ResolutionReport, 'conflicts' | 'scope'> {
  readonly scope: 'service'
  readonly conflicts: readonly ServiceConflictEntry[]
}

/** 服务级违例（requires 政策闸；scope: "service"，design-r3 §4.6）。 */
export interface ServiceConflictEntry {
  readonly service: string
  readonly constraint: ConstraintRef
  readonly chain: readonly string[]
  /** 候选集（B19 观测记录：提供者 id + 版本 + 状态）。 */
  readonly candidates: readonly {
    readonly plugin: string
    readonly version?: string
    readonly state?: string
  }[]
  readonly actions: readonly string[]
}
