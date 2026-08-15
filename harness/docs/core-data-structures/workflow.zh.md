# 工作流

[English](workflow.md) | 中文

工作流 seam 允许 agent（智能体）运行由模型编写的编排脚本，并由该脚本扇出 subagent。与 [subagent](subagent.md) 一样，它是**一项可选能力**，不属于 agent loop（智能体循环）主干，因此其词汇定义在此处而非 [core.md](core.md)。与 subagent 注册表不同，它采用 bash 形态：每个上下文只有一个引擎实现提供 `ctx.workflows`；没有命名提供方注册表（第二个引擎是插件替换，而非共存）。

接口：[dsh-workflow](../../packages/workflow/workflow)（`ctx.workflows` + 下文词汇）。实现是 [dsh-workflow-workerthread](../../packages/workflow/workflow-workerthread)（一个 `node:worker_threads` 引擎——每个 run 一个 worker，脚本的 vm 上下文位于其中）；面向模型的消费方是 [dsh-tool-workflow](../../packages/workflow/tool-workflow)。提案与设计理由见 [dynamic-workflows Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md)。

源码：[`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts)

## 启动请求

本节定义调用方启动一次运行时提交的请求。普通工作流工具会根据模型的 `{ script, meta, args }` 调用和发起调用的 agent 构建该请求；专用消费方还可以为本次运行选择引擎级 `subagentProvider`，并将 `maxTotalAgents` 调低，但脚本无法观察或替换这两项策略。`meta` 与 `args` 是普通 JSON 数据；引擎会校验 `meta` 的形状，并在任何工作开始前大声拒绝无效数据。引擎绝不会通过对脚本文本求值来获取它们。`parent` 是必填字段——脚本生成的每个子 agent 都归属于它（cwd、谱系与深度通过 [subagent seam](subagent.md) 流转）。

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON DATA by the seam contract (the tool builds both from the model's
 * schema-validated call; the engine validates `meta`'s shape and rejects loud
 * before anything runs) — an engine never evaluates script text to obtain
 * them. `parent` is REQUIRED — every `agent()` the script spawns is
 * attributed to it (cwd, lineage, depth flow through the subagent seam).
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /**
   * Optional engine-wide child-provider override for this run. The workflow
   * script cannot observe or replace it; omission uses the engine's configured
   * provider.
   */
  subagentProvider?: string
  /**
   * Optional per-run total-child ceiling. Implementations reject values above
   * their deployment ceiling before publishing the run.
   */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted (the tool's `exec.signal`). */
  signal?: AbortSignal
}
```

## 工作流的身份标识：`WorkflowMeta`

作为数据附在启动请求上的身份块（工具的 `meta` 参数；字段词汇与 Claude Code 动态工作流的 meta 块一致）。`phases` 仅用于进度展示：`phase()` 调用与标题匹配，供观察者使用；不暗示任何执行结构。

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## 终态结果：`WorkflowResult`

`WorkflowRun.result` 会兑现为一次运行的结果。`value` 是脚本的物化返回值——纯宿主域 JSON 数据（脚本无返回值时为 `null`）——仅在 `completed` 时有意义。`stopReason` 是封闭联合类型（引擎所有；消费方可穷举）：`completed` | `cancelled` | `error`。非 `completed` 的原因在 `error` 中携带失败信息，消费方将其映射为 `isError` 工具结果，而非把部分输出当作成功上报。

```ts type-equiv
/**
 * The outcome of one run, resolved by {@link WorkflowRun.result}. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## 活跃运行：`WorkflowRun`

脚本执行期间消费方持有的句柄。消费方会等待 `result`，可以在运行期间调用 `cancel`，并且必须在每条路径上调用 `dispose`（资源释放）。`result` 不会被拒绝：脚本失败会兑现为 `stopReason: 'error'`。运行被取消后，即使脚本本身永不结算，结果也会在引擎规定的有界宽限期内结算；引擎会强制将其结算为 `cancelled`，随后 worker-thread 引擎会终止脚本所在的 worker。因此，等待 `result` 的消费方不会在取消后无限期挂起。`dispose()` 会执行取消、等待有界结算并等待子 agent 完全停稳，不会因脚本卡死而挂起。

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects and settles within the
 * engine's cancellation grace; failures resolve through `stopReason`. Consumers
 * may cancel and must call idempotent `dispose()` on every path to await bounded
 * script settlement and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block (available before the body runs). */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run: children abort, pending hooks reject, the script dies at its next await (or is force-settled at the grace). */
  cancel(reason?: string): void
  /** Cancel + bounded-grace settle; safe to call on every path (idempotent). */
  dispose(): Promise<void>
}
```

## 失败纪律：`WorkflowError.fatal`

脚本内部的钩子误用：错误参数、未知或延迟的 `agent()` 选项、超出[结构化输出子集](../../packages/core/tools/README.md)的 schema、触发的上限、seam 启动失败、取消，都会抛出 `fatal: true` 的 `WorkflowError`。`parallel()`/`pipeline()` 组合器对 fatal 错误直接重新抛出，而非将该项映射为 `null`：一个拼写错误的选项必须让脚本大声失败，绝不能消融为看似普通子 agent 失败的结果。逐项的 `null` 保留给子运行失败（非 `completed` 的 stop reason）和阶段内的普通脚本错误。

## 事件

`workflow/*` 事件（`workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end`、`workflow/end`，见[事件目录](../cordis-catalog/events.md)）是**仅供观察**的 emit，携带数据快照：每个 payload 以 `WorkflowRunInfo`（id + meta）开头，而非活跃的 `WorkflowRun`，因此订阅者无法获得 `cancel`/`dispose`；`workflow/end` 刻意省略 result value（观察结果的监听器不得收到调用方 result 的可变别名）。每次 emit 对每个监听器隔离：抛出异常的订阅者被记录日志但不传播，不会饿死在它之后注册的监听器；每个监听器收到自己的 payload 克隆，因此修改它既不会损坏引擎也不会影响其他监听器。这种隔离方式与 `subagent/start`/`subagent/end` 一致。
