/**
 * Pure ordering derivation (#13, §9/§11): the derived dispatch order is the
 * lexicographically smallest linear extension of the reads/writes/appends
 * graph, computed per scope with Kahn's algorithm and a plugin-id min-heap.
 * The verdict is a pure function of the installed set — no install history,
 * config line order, import resolution order, or timing enters it.
 * @module @r05en1cu/dsh-mygo/src/order
 */

import type {
  DerivationResult,
  PlanState,
  PluginDeclarationInput,
  SlotKind,
} from './types.ts'

/** One producer→reader derived edge on a slot. */
export interface ScopeEdge {
  /** Producing plugin id (writer or appender). */
  readonly from: string
  /** Consuming plugin id (reader). */
  readonly to: string
  /** `'event.property'` slot the edge runs on. */
  readonly property: string
}

/** Per-scope edge sets plus the scope keys the input defines. */
export interface ScopeGraph {
  /** `'*'` for the unscoped-only scope, then one key per scoped plugin scope. */
  readonly scopes: readonly string[]
  /** Derived edges per scope; end-position bands contribute no edges. */
  readonly edges: ReadonlyMap<string, readonly ScopeEdge[]>
}

/** One plugin's declared slot touches, keyed by `'event.property'`. */
interface SlotTouches {
  readonly writes: ReadonlySet<string>
  readonly appends: ReadonlySet<string>
  readonly reads: ReadonlySet<string>
}

/** Minimal binary min-heap over string keys (§9: Kahn + min-heap). */
class StringMinHeap {
  private readonly items: string[] = []

  get size(): number {
    return this.items.length
  }

  push(value: string): void {
    const items = this.items
    items.push(value)
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if ((items[parent] as string) <= (items[index] as string)) break
      this.swap(parent, index)
      index = parent
    }
  }

  /**
   * Pop the smallest item. Callers guarantee a non-empty heap (the loop
   * conditions in topologicalOrder check `size` first).
   * @returns the smallest item.
   */
  pop(): string {
    const items = this.items
    const top = items[0] as string
    const last = items.pop() as string
    if (items.length > 0) {
      items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < items.length && (items[left] as string) < (items[smallest] as string)) smallest = left
        if (right < items.length && (items[right] as string) < (items[smallest] as string)) smallest = right
        if (smallest === index) break
        this.swap(index, smallest)
        index = smallest
      }
    }
    return top
  }

  private swap(left: number, right: number): void {
    const items = this.items
    const tmp = items[left] as string
    items[left] = items[right] as string
    items[right] = tmp
  }
}

/**
 * Build the per-scope derived edge graph of the enabled installed set
 * (§9 three verbs). End-position plugins (outermost/innermost) are placed by
 * band and contribute no edges; their reads observe the composed chain, so
 * no constraint binds their placement.
 * @param input - the validated installed set.
 * @returns scope keys and their edge sets, deterministic.
 */
export function buildScopeGraph(input: PlanState): ScopeGraph {
  const enabled = input.plugins.filter(plugin => plugin.enabled !== false)
  const scopedKeys = [...new Set(
    enabled
      .filter(plugin => plugin.scopes !== undefined && plugin.scopes.length > 0)
      .flatMap(plugin => plugin.scopes as string[]),
  )].sort()
  const scopes = ['*', ...scopedKeys]
  const edges = new Map<string, ScopeEdge[]>()
  for (const scope of scopes) {
    const members = scopeMembers(input, scope)
    // End-position bands are placed by position, not by the derived sort, so
    // only derived-position plugins contribute derived edges.
    edges.set(scope, derivedEdges(
      members.filter(plugin => plugin.permissions.position === 'derived').sort(byId),
    ))
  }
  return { scopes, edges }
}

/**
 * The enabled plugins participating in one scope (`'*'` = unscoped-only).
 * @param input - the validated installed set.
 * @param scope - scope key, or `'*'` for the unscoped-only set.
 * @returns the participating enabled plugins, sorted by id.
 */
export function scopeMembers(input: PlanState, scope: string): readonly PluginDeclarationInput[] {
  const enabled = input.plugins.filter(plugin => plugin.enabled !== false)
  return enabled
    .filter(plugin => scopeMembership(plugin, scope))
    .sort(byId)
}

/**
 * Derive one scope's complete chain order (end bands at the ends, Kahn in the
 * middle) from an explicit edge set — the restoration primitive the plan
 * uses to name displacing edges.
 * @param plugins - the scope's participating enabled plugins.
 * @param edges - derived edges for that scope.
 * @returns the complete order, or `undefined` when the scope is cyclic.
 */
export function deriveScopeOrder(
  plugins: readonly PluginDeclarationInput[],
  edges: readonly ScopeEdge[],
): readonly string[] | undefined {
  const placed = placeEndBands(plugins)
  const derived = plugins.filter(plugin => plugin.permissions.position === 'derived')
  const { order, cycle } = topologicalOrder(derived, edges)
  if (cycle !== undefined) return undefined
  return [...placed.outermost, ...(order as readonly string[]), ...placed.innermost]
}

/**
 * Derive the per-scope dispatch orders and per-plugin order-neutrality flags.
 * Cyclic scopes are absent from `orders` and reported in `cycles`.
 * @param input - the validated installed set.
 * @returns per-scope orders, neutrality flags, and detected cycles.
 */
export function deriveOrders(input: PlanState): DerivationResult {
  const graph = buildScopeGraph(input)
  const orders = new Map<string, readonly string[]>()
  const cycles: { scope: string; cycle: string[] }[] = []
  for (const scope of graph.scopes) {
    const members = scopeMembers(input, scope)
    // buildScopeGraph sets an edge list for every scope key it returns.
    const scopeEdges = graph.edges.get(scope) as readonly ScopeEdge[]
    const order = deriveScopeOrder(members, scopeEdges)
    if (order === undefined) {
      const cycle = extractCycleFrom(members, scopeEdges)
      cycles.push({ scope, cycle })
      continue
    }
    orders.set(scope, order)
  }
  return {
    orders,
    orderNeutral: computeOrderNeutral(input.plugins, input.slotKinds),
    cycles,
  }
}

/** Re-derive the cycle of a cyclic scope (deriveScopeOrder already failed). */
function extractCycleFrom(
  plugins: readonly PluginDeclarationInput[],
  edges: readonly ScopeEdge[],
): string[] {
  const derived = plugins.filter(plugin => plugin.permissions.position === 'derived')
  const { cycle } = topologicalOrder(derived, edges)
  // A cyclic scope's topologicalOrder always carries the extracted cycle.
  return cycle as string[]
}

/** True when a plugin participates in the given scope: unscoped runs everywhere. */
function scopeMembership(plugin: PluginDeclarationInput, scope: string): boolean {
  if (plugin.scopes === undefined || plugin.scopes.length === 0) return true
  return plugin.scopes.includes(scope)
}

/** End-position bands sorted by id; derived plugins are placed by the sort. */
function placeEndBands(members: readonly PluginDeclarationInput[]): {
  readonly outermost: string[]
  readonly innermost: string[]
} {
  const outermost = members
    .filter(plugin => plugin.permissions.position === 'outermost')
    .map(plugin => plugin.id)
    .sort()
  const innermost = members
    .filter(plugin => plugin.permissions.position === 'innermost')
    .map(plugin => plugin.id)
    .sort()
  return { outermost, innermost }
}

/** Build the derived edges of one scope from transform declarations (§9). */
function derivedEdges(plugins: readonly PluginDeclarationInput[]): ScopeEdge[] {
  const producers = new Map<string, string[]>()
  const readers = new Map<string, string[]>()
  for (const plugin of plugins) {
    for (const declaration of plugin.permissions.transform) {
      const touches = slotTouches(declaration)
      for (const property of touches.writes) addSlotMember(producers, property, plugin.id)
      for (const property of touches.appends) addSlotMember(producers, property, plugin.id)
      for (const property of touches.reads) addSlotMember(readers, property, plugin.id)
    }
  }
  const edges: ScopeEdge[] = []
  for (const [property, producerIds] of producers) {
    for (const reader of readers.get(property) ?? []) {
      for (const producer of producerIds) {
        if (producer === reader) continue
        edges.push({ from: producer, to: reader, property })
      }
    }
  }
  return edges.sort(byEdge)
}

/** One transform declaration's slot touches (depth-1 property names). */
function slotTouches(declaration: {
  readonly event: string
  readonly reads?: readonly string[]
  readonly writes?: readonly string[]
  readonly appends?: readonly string[]
}): SlotTouches {
  const slot = (name: string): string => `${declaration.event}.${name}`
  return {
    writes: new Set((declaration.writes ?? []).map(slot)),
    appends: new Set((declaration.appends ?? []).map(slot)),
    reads: new Set((declaration.reads ?? []).map(slot)),
  }
}

/** Kahn + min-heap over plugin ids: the lexicographically smallest linear extension. */
function topologicalOrder(
  plugins: readonly PluginDeclarationInput[],
  edges: readonly ScopeEdge[],
): { readonly order: readonly string[] | undefined; readonly cycle: string[] | undefined } {
  const ids = plugins.map(plugin => plugin.id).sort()
  if (ids.length === 0) return { order: [], cycle: undefined }
  const adjacency = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const id of ids) {
    adjacency.set(id, [])
    indegree.set(id, 0)
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue
    if (edge.from === edge.to) continue
    // Both endpoints are members (guarded above), so the lookups are defined.
    (adjacency.get(edge.from) as string[]).push(edge.to)
    indegree.set(edge.to, (indegree.get(edge.to) as number) + 1)
  }
  for (const targets of adjacency.values()) targets.sort()
  const heap = new StringMinHeap()
  for (const id of ids) {
    if (indegree.get(id) === 0) heap.push(id)
  }
  const order: string[] = []
  const remaining = new Set(ids)
  while (heap.size > 0) {
    // The loop condition guarantees a popped item exists.
    const id = heap.pop()
    order.push(id)
    remaining.delete(id)
    for (const target of adjacency.get(id) as string[]) {
      const next = (indegree.get(target) as number) - 1
      indegree.set(target, next)
      if (next === 0) heap.push(target)
    }
  }
  if (remaining.size === 0) return { order, cycle: undefined }
  return { order: undefined, cycle: extractCycle(remaining, adjacency) }
}

/**
 * Deterministic cycle extraction from a Kahn-stalled set: every remaining
 * node keeps indegree ≥ 1 and every outgoing edge lands inside the remaining
 * set (a node pointing at a removed node would have kept that target's
 * indegree above zero), so following first sorted outgoing edges must close
 * a cycle.
 */
function extractCycle(remaining: ReadonlySet<string>, adjacency: ReadonlyMap<string, string[]>): string[] {
  const start = [...remaining].sort()[0] as string
  const path: string[] = []
  const seenAt = new Map<string, number>()
  let current = start
  for (;;) {
    const at = seenAt.get(current)
    if (at !== undefined) return path.slice(at)
    seenAt.set(current, path.length)
    path.push(current)
    // Every remaining node has an outgoing edge inside the remaining set.
    const neighbors = adjacency.get(current) as string[]
    current = neighbors.find(next => remaining.has(next)) as string
  }
}

/** Per-plugin order-neutrality (§6/PO:53): intercept (any branch) or chain-ordered appends. */
function computeOrderNeutral(
  plugins: readonly PluginDeclarationInput[],
  slotKinds: ReadonlyMap<string, SlotKind> | undefined,
): Map<string, boolean> {
  const flags = new Map<string, boolean>()
  for (const plugin of plugins) {
    let neutral = plugin.permissions.intercept.length === 0
    if (neutral) {
      for (const declaration of plugin.permissions.transform) {
        for (const name of declaration.appends ?? []) {
          const slot = `${declaration.event}.${name}`
          if ((slotKinds?.get(slot) ?? 'chain-ordered') !== 'host-sorted') {
            neutral = false
            break
          }
        }
        if (!neutral) break
      }
    }
    flags.set(plugin.id, neutral)
  }
  return flags
}

function byId(left: PluginDeclarationInput, right: PluginDeclarationInput): number {
  return left.id.localeCompare(right.id)
}

function byEdge(left: ScopeEdge, right: ScopeEdge): number {
  return left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || left.property.localeCompare(right.property)
}

function addSlotMember(map: Map<string, string[]>, property: string, id: string): void {
  const list = map.get(property)
  if (list === undefined) {
    map.set(property, [id])
  } else if (!list.includes(id)) {
    list.push(id)
  }
}
