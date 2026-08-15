# Background Task Runtime

English | [中文](tasks.zh.md)

Types shared by long-running producers, `ctx.tasks`, and task control surfaces. The [runtime Agent Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) owns the design; this page records the literal shapes from [`packages/tasks/tasks/src/types.ts`](../../packages/tasks/tasks/src/types.ts).

## Ids and status

`TaskId` is a [branded id](core.md#branded-ids) generated as `<kind>-N`. Access control relies on owner authorization, not id secrecy. `TaskKind` derives from a merge-extensible map; the registry treats kinds as opaque id namespaces.

```ts type-equiv
/**
 * Producer-defined task kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */
interface TaskKindMap {
  bash: 'bash'
  subagent: 'subagent'
}
```

`TaskStatus` is `'running' | 'stopping' | 'completed' | 'killed' | 'failed'`; producer-specific facts belong in `TaskSnapshot.detail`.

## Producer contract

`TaskStart` declares identity and a starter. The runtime finishes preflight before calling `run()` and commits without a later failable step. Producers own execution resources; the runtime owns identity, access, and lifecycle state.

```ts type-equiv
/**
 * Producer declaration passed to {@link TaskService.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity and lifecycle state.
 */
interface TaskStart {
  /** Producer kind — also the id prefix (`bash`, `subagent`, …). */
  kind: TaskKind
  /** One-line model-facing label (the command; the delegation description). */
  label: string
  /**
   * Optional UTF-8 byte cap for each complete model-facing completion notice or
   * output read, including control-surface status metadata.
   */
  outputLimitBytes?: number
  /**
   * Owning live agent. Access is fenced by its session id, and agent disposal
   * cancels and awaits the task. The instance must be the one currently
   * registered under its agent id. Omitting the owner creates an unowned task,
   * open to any caller until service disposal.
   */
  owner?: Agent
  /**
   * Start the work after preflight and synchronously return its hooks. Called
   * once; a throw leaves nothing registered, and the producer must clean up any
   * partially started resources.
   */
  run(): TaskHooks
}
```

`TaskHooks.done` is the quiescence boundary. Optional `readOutput` distinguishes consuming stream tasks from final-output-only tasks.

```ts type-equiv
/** Hooks through which the runtime controls and observes producer work. */
interface TaskHooks {
  /**
   * Request termination. Must be synchronous, idempotent, and eventually settle
   * {@link done}; throws propagate. The optional reason is forwarded verbatim.
   */
  cancel(reason?: string): void
  /**
   * Resolves after the producer releases its resources, not merely when work
   * finishes. Must not reject; the runtime converts a rejection to `failed`.
   * If teardown cancellation throws, the runtime may force-fail only the
   * registry record without claiming that the work stopped.
   */
  done: Promise<TaskOutcome>
  /**
   * Consume output produced since the previous call. The producer formats
   * truncation and spill notices. Absence marks a final-output-only task; each
   * task has one consuming cursor.
   */
  readOutput?(): string
}
```

```ts type-equiv
/** Terminal result supplied by a producer through {@link TaskHooks.done}. */
interface TaskOutcome {
  /** How the task ended: finished (`completed`), cancelled (`killed`), or broke (`failed`). */
  status: 'completed' | 'killed' | 'failed'
  /** Kind-specific detail rendered into status lines ('exit code: 3', 'max-tokens'). */
  detail?: string
  /** Final output for tasks without `readOutput`; stream tasks leave it unset. */
  output?: string
}
```

## Consumer views

Snapshots are fresh read-only projections. `ownerSession` carries the shared `SessionId` used for authorization; completion listeners separately receive the exact owner object used for lifecycle cleanup. `reported` suppresses a completion notice after another surface has delivered or committed to deliver the terminal state.

```ts type-equiv
/**
 * A read-only projection of one task, safe to hand to listeners and tools —
 * a fresh object per call, never live registry state.
 */
interface TaskSnapshot {
  /** The registry-issued id (`<kind>-N`). */
  id: TaskId
  /** The producer kind the task was registered with. */
  kind: TaskKind
  /** The producer-supplied one-line label. */
  label: string
  /** Producer-owned cap for complete model-facing notices and output reads. */
  outputLimitBytes?: number
  /**
   * Owner session id used for authorization and correlation; absent for
   * unowned tasks. Completion listeners receive the exact {@link Agent}
   * separately through {@link TaskDoneListener}.
   */
  ownerSession?: SessionId
  /** Current lifecycle state. */
  status: TaskStatus
  /** Kind-specific status detail, present once the producer supplied one (usually terminal). */
  detail?: string
  /** Epoch ms when the task was registered. */
  startedAt: number
  /** Epoch ms when the task settled; absent while `running`/`stopping`. */
  finishedAt?: number
  /**
   * True when a kill, read, or wait has reported or committed to report the
   * terminal state. Completion surfaces suppress redundant notices when set.
   */
  reported: boolean
}
```

```ts type-equiv
/** Output and post-read state returned by {@link TaskService.read}. */
interface TaskRead {
  /**
   * Stream kinds: the consuming delta since the previous read. Final-output
   * kinds: empty while live, the terminal {@link TaskOutcome.output} (or
   * empty) once settled — idempotent, never consumed.
   */
  text: string
  /** The task's state at read time. */
  snapshot: TaskSnapshot
}
```

## Service behavior

The abstract [`TaskService`](../../packages/tasks/tasks/src/index.ts) seam defines atomic `start`, caller-scoped `get` and `list`, `read`, `kill`, bounded `wait`, contained `onTaskDone` listeners, and the `attachSurface` availability fence; [`LocalTaskService`](../../packages/tasks/tasks-local/src/index.ts) is the process-local implementation. Authorization compares owner sessions; owner cleanup selects the exact registered `Agent` instance. See [`dsh-tasks`](../../packages/tasks/tasks/README.md) for the seam contract, [`dsh-tasks-local`](../../packages/tasks/tasks-local/README.md) for the registry lifecycle, and [`dsh-tool-tasks`](../../packages/tasks/tool-tasks/README.md) for the model-facing surface.
