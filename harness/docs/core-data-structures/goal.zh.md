# 同会话目标

[English](goal.md) | 中文

事件溯源目标领域及其策略消费方共享的类型。[目标领域 Agent Note](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md)负责记录持久化与激活决策；本页记录 [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts) 中的字面形态。

## 标识与生命周期

`GoalId` 是[品牌化 id](core.md#branded-ids)。调用方通过 `GoalRef` 修改一个确切修订版本；每次获准的持久变更都会递增修订号。

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

持久阶段回答目标发生了什么。进程本地激活状态则另行回答续跑消费方能否开始另一个 Round。

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

阻塞是唯一表示「因问题而停止」的持久状态。由策略负责的阻塞原因会携带一个用于路由、稳定且采用 lower-kebab-case 的代码，以及一段供人和模型阅读的自由文本说明。

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

## 持久变更

每次变更都是持久的 `goal/change` 会话事件，其载荷要么是变更后的完整快照，要么是清除墓碑。严格折叠与持久投影只从这些事件派生生命周期状态；inbox 变更不会影响 goal 状态。

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

续跑消费方会为每个获准的用户消息轮次标注正数且连续的 Round 编号和当前修订号；只有这些获准的 `user/message` 事件会推进 `roundsStarted`。回放会拒绝非正数 Round、编号缺口、陈旧修订号、已停止阶段和超出上限。

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## 请求与通知

创建操作会区分调用方省略字段与采用部署配置值这两种情况，`create()` 会在内部解析后者。编辑是局部替换，其运行时校验器要求至少提供一个字段。每条变更通知都会携带获准的操作和确切修订号；清除操作不带 `goal`。

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## 服务行为

[`GoalService`](../../packages/goal/goal/src/index.ts) 解析创建默认值、从持久 `goal/change` 事件执行严格回放折叠、校验确切的活跃 agent 身份、以比较并设置方式执行变更，并发出 `goal/changed` 通知；监听器故障会被隔离。包 [README](../../packages/goal/goal/README.md) 负责记录可调用契约和面向模型的契约。
