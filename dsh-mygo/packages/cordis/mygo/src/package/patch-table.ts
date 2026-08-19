/**
 * mixin patch 目标冲突表（《第二轮增强》11 条）：key = module#filePath#symbol；
 * 冲突硬阻断；应用顺序 = 拓扑序优先 + id 字典序兜底（确定性）。
 * @module @r05en1cu/dsh-mygo/src/package/patch-table
 */

import { computeMountOrder, type MountEdge } from './mount-order.ts'

/** One declared patch with its owning plugin. */
export interface DeclaredPatch {
  readonly plugin: string
  readonly patchId: string
  readonly target: {
    readonly module: string
    readonly filePath?: string
    readonly symbol: string
  }
}

/** Canonical conflict key. */
export function patchTargetKey(target: DeclaredPatch['target']): string {
  return `${target.module}#${target.filePath ?? '*'}#${target.symbol}`
}

export interface PatchConflict {
  readonly targetKey: string
  readonly plugins: readonly [string, string]
}

/** Detect multiple plugins rewriting the same host symbol/node. */
export function detectPatchConflicts(patches: readonly DeclaredPatch[]): readonly PatchConflict[] {
  const byKey = new Map<string, string[]>()
  for (const patch of patches) {
    const key = patchTargetKey(patch.target)
    const list = byKey.get(key) ?? []
    if (!list.includes(patch.plugin)) list.push(patch.plugin)
    byKey.set(key, list)
  }
  const conflicts: PatchConflict[] = []
  for (const [key, plugins] of byKey) {
    if (plugins.length < 2) continue
    conflicts.push({ targetKey: key, plugins: [plugins[0] as string, plugins[1] as string] })
  }
  return conflicts.sort((a, b) => (a.targetKey < b.targetKey ? -1 : a.targetKey > b.targetKey ? 1 : 0))
}

/**
 * Deterministic patch application order: depends 拓扑序优先，同层按插件 id
 * 字典序兜底。输入相同 → 输出字节级一致。
 */
export function deterministicPatchOrder(
  patches: readonly DeclaredPatch[],
  depends: Readonly<Record<string, readonly string[]>> = {},
): readonly string[] {
  const ids = [...new Set(patches.map(patch => patch.plugin))].sort()
  const edges: MountEdge[] = []
  for (const id of ids) {
    for (const target of depends[id] ?? []) {
      if (ids.includes(target)) edges.push({ from: id, to: target })
    }
  }
  const result = computeMountOrder(ids, edges)
  return result.ok ? result.order : ids
}
