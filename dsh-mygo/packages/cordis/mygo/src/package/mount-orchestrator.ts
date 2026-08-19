/**
 * 相位化挂载编排器（《第二轮增强》10/11 条）：phase0 收集 mixin patch 并做
 * 冲突检测，phase1 在目标模块加载前应用 transform，phase2 按拓扑序挂载普通
 * 插件。目标已加载后注册 patch → 显式报错；全过程输出确定性 trace。
 * @module @r05en1cu/dsh-mygo/src/package/mount-orchestrator
 */

import { detectPatchConflicts, deterministicPatchOrder, patchTargetKey, type DeclaredPatch } from './patch-table.ts'

export type MountPhase = 0 | 1 | 2

/** Patch registered after its target module was already loaded. */
export class PatchLateRegistrationError extends Error {
  constructor(readonly targetKey: string) {
    super(`mixin patch 注册过晚：目标模块已加载（${targetKey}）`)
    this.name = 'PatchLateRegistrationError'
  }
}

/** Deterministic phase trace (JSON byte-identical for identical inputs). */
export interface PhaseTrace {
  readonly phase0: { order: string[] }
  readonly phase1: { applied: string[] }
  readonly phase2: { mountOrder: string[] }
}

export interface Phase0Outcome {
  readonly ok: true
  readonly order: readonly string[]
  readonly trace: PhaseTrace
}

/**
 * The mount orchestrator. The v1 mixin engine is built in (no plugin
 * self-bootstrap); transform execution itself is delegated to the built-in
 * mixin engine, which this orchestrator drives by phase.
 */
export class MountOrchestrator {
  private phase: MountPhase = 0
  private readonly loadedTargets = new Set<string>()
  private readonly appliedOrder: string[] = []
  private readonly trace: PhaseTrace = { phase0: { order: [] }, phase1: { applied: [] }, phase2: { mountOrder: [] } }

  /** Phase 0: collect mixin patches; conflicts hard-block before any transform. */
  collectMixinPatches(
    patches: readonly DeclaredPatch[],
    depends: Readonly<Record<string, readonly string[]>> = {},
  ): Phase0Outcome {
    if (this.phase !== 0) throw new Error(`collectMixinPatches 只能在 phase0（当前 ${this.phase}）`)
    const conflicts = detectPatchConflicts(patches)
    if (conflicts.length > 0) {
      const lines = conflicts.map(conflict =>
        `${conflict.plugins[0]} 与 ${conflict.plugins[1]} 改写同一目标 ${conflict.targetKey}`)
      throw new Error(`mixin patch 目标冲突（${lines.join('；')}）`)
    }
    const order = deterministicPatchOrder(patches, depends)
    this.trace.phase0.order.push(...order)
    return { ok: true, order, trace: this.trace }
  }

  /** Move to phase 1: transforms are applied before any target module loads. */
  startPhase1(): void {
    if (this.phase !== 0) throw new Error(`startPhase1 只能在 phase0 后（当前 ${this.phase}）`)
    this.phase = 1
  }

  /** Register one patch for application; late registration errors loudly. */
  applyPatch(patch: DeclaredPatch): void {
    if (this.phase !== 1) throw new Error(`applyPatch 只能在 phase1（当前 ${this.phase}）`)
    const key = patchTargetKey(patch.target)
    if (this.loadedTargets.has(key)) throw new PatchLateRegistrationError(key)
    if (!this.appliedOrder.includes(`${patch.plugin}#${patch.patchId}`)) {
      this.appliedOrder.push(`${patch.plugin}#${patch.patchId}`)
      this.trace.phase1.applied.push(`${key}@${patch.plugin}`)
    }
  }

  /** Target module load event; later patch registration for this target fails. */
  markTargetLoaded(target: DeclaredPatch['target']): void {
    this.loadedTargets.add(patchTargetKey(target))
  }

  /** Move to phase 2: mount ordinary plugins in deterministic topo order. */
  startPhase2(mountOrder: readonly string[]): void {
    if (this.phase !== 1) throw new Error(`startPhase2 只能在 phase1 后（当前 ${this.phase}）`)
    this.phase = 2
    this.trace.phase2.mountOrder.push(...mountOrder)
  }

  /** Serialized deterministic trace. */
  traceJson(): string {
    return JSON.stringify(this.trace)
  }
}
