# 会话持久化

[English](persistence.md) | 中文

事件日志的**持久性 seam**。[session.md](session.md) 描述了内存中的 `Session`：仅追加的 `SessionEvent` 日志即为真源。本页描述如何使该日志持久化：抽象的 `SessionPersistence` 服务、它的后端、flush 检查点、崩溃恢复，以及随日志一同存储的元数据头。日志承载的事件词汇在生成的[持久化日志事件目录](../persistence-catalog.md)中逐项列举。

该 seam 是典型的[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)：一个抽象服务（[dsh-session-persistence](../../packages/session-persistence/session-persistence)，`ctx.sessionPersistence`）在现有 `SessionEvent` 上定义 locate/create/append、可复用的 Session 准备流程、逻辑 load/inspect、物理后缀读取，以及轻量的 list/snapshot 观察——**没有平行的持久化事件类型**——以及两个实现同一契约的可互换后端。见 [session-persistence Agent Note](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md)。

## flush 检查点

`session/event` 是一个*同步*通知；持久化插件会将事件复制到逐会话控制器，而不阻塞生产方。第一个待处理事件会开启固定批处理窗口，后续事件会加入但不会重置截止时间。窗口到期后会启动一个持久化批次；该次写入期间接纳的事件会获得自己的截止时间，并形成后续批次。`session/flush` 会取消等待并排空至完全停稳，因此循环仍将其用作在领取下一个普通轮次之前的顺序与错误观察检查点。后台写入被拒绝时会保留对应事件并暂停自动重试；新事件会开启新的固定窗口，而显式 flush 会立即重试，并通过 `agent/error` 和 logger 报告失败，绝不会把失败记录成已关闭轮次之后的会话事件。dispose（资源释放）会执行同样的最终排空。配置的最大值只限制有意的批处理等待，不限制事件循环调度或后端完成持久化的延迟（[决策](../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md)）。

## 崩溃恢复保留被中断的轮次

后端重新加载一个在轮次中途崩溃的日志时，会发现一个已打开的 `turn/start` 却没有 `turn/end`。它**不会**截断日志：在长周期任务中，单个轮次可能非常庞大（许多步骤、大量工具输出），而这些事件在崩溃前已被持久追加。后端改为用一个合成的 `turn/end { reason: { kind: 'interrupted' } }` 关闭这个遗留轮次，在不改变其前后任何独立事件的情况下配平被中断的执行。`interrupted` 是唯一一个不由循环发出的 `TurnEndReason`（见 [session.md](session.md#why-a-turn-ended-turnendreasonmap)）。

修复仅适用于冷会话。对于活跃 id，`SessionPersistence.load(id)` 会等待权威内存快照完成持久化，并且只在日志平衡时返回；若活跃轮次仍未闭合，则拒绝操作，而不是添加合成的中断边界。HMR 会接管活跃前缀，而不会关闭其中正在进行的轮次。

`SessionPersistence.inspect(id)` 会构造一个不可变的逻辑 Session，但不发布它，也不写入恢复内容。冷检查会在内存中配平中断的 turn，同时保持撕裂的物理尾部不变；检查已经实时存在的 Session 则借用其当前不可变快照，因此可能包含打开的 turn。使用协调器的实现会在有界 LRU 中保留这个精确的冷未发布 Session，因此重复历史读取与后续 `prepare(id)` 可复用同一次读取、解压、验证、冻结及 Session 构造。`prepare(id)` 会预留该 Session、提交待处理修复并返回可 dispose 的发布句柄；`load(id)` 使用相同机制提交修复，但不会发布 Session。该生命周期由 [Session 准备阶段决策](../../.agents/notes/implemented/architecture/2026-08-05-session-preparation.md)定义。

## `SessionLocation`——可选的逐会话产物目标

`SessionPersistence.locate(meta)` 会同步解析一个归后端所有的独立产物，而不会读取、创建或 flush 它。JSONL 返回其项目/会话目录内 transcript（文本记录）的绝对路径；SQLite 因各会话共享一个数据库而返回 `undefined`。因此，返回的路径可能指向尚不存在、或还不包含当前尚未 flush 的轮次；它是位置提示，不是授权或新鲜度保证。

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. The path is an
 * absolute target path and can name an artifact that has not materialized yet.
 * Consumers must treat it as a location hint, never as an authorization token.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

## `SessionHeader`：日志旁的元数据

每个会话的元数据与事件日志**分开**存储：格式版本、cwd、血统与 seed 边界是存储层关注点而非对话事件，因此不进入 `SessionEventMap`，也不会到达 `deriveMessages()`。header 通过 `session.header` 附加到 `Session` 上。

源码：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * On-disk format version, stamped from {@link SESSION_FORMAT_VERSION} when the
   * session is created. A persistence backend rejects any other version on load
   * (no migration — see the constant).
   */
  readonly version: number
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * How many leading events were inherited through a seed. Persisting this
   * boundary lets resume and replay distinguish parent history from child work.
   */
  readonly seedLength?: number
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
}
```

## `CreateSessionOptions`：seed 与元数据

通过 store 创建 `Session` 时会接收 `seed`（初始回放或 fork 历史）与 `meta`（store 折叠进 `SessionHeader` 的存储层字段）。store 填充 `version`/`id` 并为 `createdAt` 提供默认值；调用方可以提供已校验的绝对 `cwd`、`parentSession` 谱系、`seedLength` 种子边界、可选的粗粒度 `origin`、`delegationDepth` 以及已有的 `createdAt`。`origin: 'subagent'` 让产品导航能够隐藏重复的 child 行；它不证明描述符有效，也不证明 child 可以恢复。

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Storage metadata read once before publication. `seedLength` is explicit
   * because a resumed seed contains the full stored log, not only its inherited prefix.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
  }
}
```

因此，回放/fork 的调用方式为 `ctx.sessions.create(id, { seed: seedEvents })`；将一个*持久化*会话恢复为活跃 agent 的调用方式为 `ctx.agents.resume({ resumeSessionId })`。

## 准备与恢复所有权

`SessionStore.prepare()` 接收普通创建选项，或通过 `RestoredSessionOptions` 转移所有权的新鲜持久化对象图。恢复分支会直接验证并冻结转移来的 header 与事件，因此调用方不得保留可变别名。`SessionPreparation` 随后持有该精确的未发布 Session，直至发布或回滚；dispose 是同步且幂等的。持久化检查只暴露 `SessionInspection`，即从同一个已准备 Session 借用的不可变逻辑视图。

```ts type-equiv
/**
 * Fresh storage values transferred to {@link SessionStore.prepare} without a
 * second serialization copy. Callers retain no mutable aliases.
 */
interface RestoredSessionOptions {
  /** Fresh detached storage events to validate and freeze in place. */
  readonly seed: SessionEvent[]
  /** Fresh detached storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Select the persistence ownership-transfer path. */
  readonly seedSource: 'persistence'
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly seedSource?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

```ts type-equiv
/** Immutable logical session prepared from persistence or a live owner. */
interface SessionInspection {
  /** Validated immutable session metadata. */
  readonly meta: SessionHeader
  /** Validated contiguous logical event log. */
  readonly events: readonly SessionEvent[]
}
```

## 轻量源修订号

派生状态的消费方会在加载完整事件日志之前比较一个低开销的不透明修订号。其表示由持久化后端拥有，并随 append 或会修改数据的 load 修复以事务方式改变；调用方仅比较修订号是否相等。

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/** Lightweight immutable source identity returned without loading a full log. */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one materialized session. */
  header: SessionHeader
  /** Opaque source-qualified token that changes whenever this stored log changes. */
  revision: SessionPersistenceRevision
}
```

## 后端

两者都实现同一个抽象 `SessionPersistence`（在 `SessionEvent` 上执行 locate/create/append/prepare/load/inspect/readFrom/list/listSnapshots，观察方法可选支持取消），并通过 `runPersistenceContract`，证明该 seam 确实与后端无关：

- **[dsh-session-persistence-jsonl](../../packages/session-persistence/session-persistence-jsonl)**——每个会话一份仅追加的逻辑 JSONL 日志，默认存储为带 checksum 的连续 Zstandard frame，也可配置为原始行；支持崩溃安全的原子写入、被中断轮次的恢复以及读取/回放路径。
- **[dsh-session-persistence-sqlite](../../packages/session-persistence/session-persistence-sqlite)**：基于 `node:sqlite`，每个 `SessionEvent` 一行。行结构 `(session_id, seq, type, time, data, source_event_seqs, surface_op)` 与事件 1:1 映射（包含可选的 surface 元数据），因此没有需要保持同步的并行持久化 schema。
