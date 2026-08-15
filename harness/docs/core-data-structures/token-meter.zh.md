# Token 计量

[English](token-meter.md) | 中文

`@deepseek-ai/dsh-token-meter` 公开一个独立的回放快照，用于表示请求压力与按位置计算的表层定价。`logRevision` 表示生成该计量中每个字段时所消费的持久事件数量。

来源：[`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: number
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total heuristic tokens across the current surface. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

`baseline.kind === 'usage'` 表示最近一次成功的提供方调用具有相同的规范请求信封，且该调用的总量不低于其完整启发式锚点。`estimated` 表示不存在可复用的保守 usage 锚点，因此服务使用固定启发式规则对完整信封和表层定价。后续成功请求会替换早先的锚点；有符号的 `surfaceDeltaTokens` 会保留相对于匹配锚点的增长与缩减。`totalTokens` 仍表示请求与响应压力，`surfaceTokens` 则是仅针对表层的启发式总量，等于所有节点价格之和。

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: number
  /** Heuristic tokens for the exact message projected by this node. */
  readonly tokens: number
}
```

表层顺序具有权威性；替换节点的持久 seq 可能高于位置排在其后的节点。该快照不可变，不会随底层回放折叠推进而增长。
