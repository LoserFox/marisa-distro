# Workflow

English | [中文](workflow.zh.md)

The workflow seam — an agent running a model-written orchestration SCRIPT that fans out subagents. Like [subagent](subagent.md) it is **one optional capability**, not part of the agent-loop spine, so its vocabulary lives here rather than in [core.md](core.md). Unlike the subagent registry it takes the bash shape: ONE engine implementation per context provides `ctx.workflows`; there is no named-provider registry (a second engine is a plugin swap, not a co-resident).

Interface: [dsh-workflow](../../packages/workflow/workflow) (`ctx.workflows` + the vocabulary below). The implementation is [dsh-workflow-workerthread](../../packages/workflow/workflow-workerthread) (a `node:worker_threads` engine — one worker per run, the script's vm context inside it); the model-facing consumer is [dsh-tool-workflow](../../packages/workflow/tool-workflow). The proposal and rationale: [the dynamic-workflows Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md).

Source: [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts)

## The start request

What a caller asks for when starting a run. The ordinary workflow tool builds this from the model's `{ script, meta, args }` call plus the calling agent; specialized consumers may also select one engine-wide `subagentProvider` and lower `maxTotalAgents` for the run, but the script cannot observe or replace either policy. `meta` and `args` are plain JSON DATA (the engine shape-validates `meta` and rejects loud BEFORE anything runs — no script text is ever evaluated to obtain it). `parent` is REQUIRED — every child the script spawns is attributed to it (cwd, lineage, and depth flow through the [subagent seam](subagent.md)).

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

## The workflow's identity: `WorkflowMeta`

The identity block carried as data on the start request (the tool's `meta` parameter; the field vocabulary matches the Claude Code dynamic-workflows meta block). `phases` is progress vocabulary only: `phase()` calls match titles for observers; no execution structure is implied.

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

## The terminal result: `WorkflowResult`

The outcome of one run, resolved by `WorkflowRun.result`. `value` is the script's materialized return value — plain host-realm JSON data (`null` when the script returned nothing) — meaningful only for `completed`. `stopReason` is a CLOSED union (engine-owned; consumers may exhaust it): `completed` | `cancelled` | `error`. A non-`completed` reason carries the failure in `error`, and the consumer maps it to an `isError` tool result rather than reporting partial output as success.

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

## A live run: `WorkflowRun`

The handle the consumer holds while a script executes. The consumer awaits `result`, may `cancel` mid-flight, and MUST `dispose` on every path. `result` does NOT reject — a script failure resolves with `stopReason: 'error'` — and once the run is cancelled it SETTLES within the engine's bounded grace even if the script itself never settles (the engine force-settles `cancelled`; the worker-thread engine then terminates the script's worker), so a consumer awaiting `result` is never wedged past a cancellation. `dispose()` = cancel + that bounded settle + child quiescence; it never hangs on a stuck script.

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

## Failure discipline: `WorkflowError.fatal`

Hook misuse inside a script — bad arguments, unknown/deferred `agent()` options, a schema outside the [structured-output subset](../../packages/core/tools/README.md), a tripped cap, a seam start failure, cancellation — throws a `WorkflowError` with `fatal: true`. The `parallel()`/`pipeline()` combinators RE-THROW fatal errors instead of mapping the item to `null`: a typo'd option must kill the script loudly, never dissolve into something that reads as an ordinary child failure. The per-item `null` is reserved for child-run failures (a non-`completed` stop reason) and ordinary in-stage script errors.

## Events

The `workflow/*` events (`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — see the [events catalog](../cordis-catalog/events.md)) are **observe-only** emits carrying DATA SNAPSHOTS: every payload starts with `WorkflowRunInfo` (id + meta), never the live `WorkflowRun`, so a subscriber cannot gain `cancel`/`dispose`, and `workflow/end` deliberately omits the result value (a listener observing outcomes must not receive a mutable alias of the caller's result). Every emit is per-listener contained — a throwing subscriber is logged, never propagated, and cannot starve the listeners registered after it — and every listener receives its own payload clone, so mutating it corrupts neither the engine nor other listeners; the containment mirrors `subagent/start`/`subagent/end`.
