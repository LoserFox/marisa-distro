/**
 * 加载挂载序（《收敛任务》不变量 3）：挂载顺序 MUST 等于所接受依赖图的拓扑序，
 * 被依赖者先完成初始化。环 MUST 拒绝。
 * @module @r05en1cu/dsh-mygo/src/package/mount-order
 */

export interface MountEdge {
  readonly from: string
  readonly to: string
}

export type MountOrderResult =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly cycle: readonly string[] }

/**
 * Deterministic Kahn topological order (same as resolver's, exported for
 * load). Edge `from → to` means `from depends on to`; dependencies are
 * emitted before dependents (internally reversed to `to → from`).
 */
export function computeMountOrder(
  ids: readonly string[],
  edges: readonly MountEdge[],
): MountOrderResult {
  const idSet = new Set(ids)
  const out: string[] = []
  const indegree = new Map<string, number>()
  for (const id of ids) indegree.set(id, 0)
  const adjacency = new Map<string, string[]>()
  for (const id of ids) adjacency.set(id, [])
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue
    adjacency.get(edge.to)?.push(edge.from)
    indegree.set(edge.from, (indegree.get(edge.from) ?? 0) + 1)
  }
  const heap = [...ids].filter(id => (indegree.get(id) ?? 0) === 0).sort()
  while (heap.length > 0) {
    const id = heap.shift() as string
    out.push(id)
    for (const dependent of (adjacency.get(id) ?? []).sort()) {
      const next = (indegree.get(dependent) ?? 1) - 1
      indegree.set(dependent, next)
      if (next === 0) {
        heap.push(dependent)
        heap.sort()
      }
    }
  }
  if (out.length === ids.length) return { ok: true, order: out }
  const remaining = ids.filter(id => !out.includes(id))
  return { ok: false, cycle: [...remaining, remaining[0] as string] }
}
