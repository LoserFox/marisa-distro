# 会话

[English](session.md) | 中文

[dsh-session](../../packages/core/session) 的内存事件溯源模型。`Session` 是一份由类型化 `SessionEvent` 组成的**仅追加日志**，是 agent（智能体）完整交互历史的唯一真源。LLM（大语言模型）消息历史从日志*派生*而来，从不单独存储；回放即从同一组事件重新派生。日志如何实现**持久化**（持久化 seam、后端、崩溃恢复）是兄弟文档 [persistence.md](persistence.md) 的关注点。

源码：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

## `SessionEventMap`：事件词汇

仅追加的事件类型。可通过声明合并扩展：插件通过 declaration merging 声明额外的事件类型。例如[压缩（compaction） seam](compaction.md) 添加了 `compact/start` / `compact/summary` / `compact/end`，`@deepseek-ai/dsh-hook-protocol` 添加了仅记录日志的 `hook/invoked` / `hook/result` 溯源事件，用于钩子桥接。与 `compact/*` 一样，这些都不是 `SurfaceEventType`（没有 `surfaceOp`）。生成的[持久化日志事件目录](../persistence-catalog.md)列举了所有成员（核心与合并扩展的），包含其 payload、surface 标记与声明位置。

```ts type-equiv
/** A user-role specialization of the one shared message representation. */
interface UserMessage extends Message {
  readonly role: 'user'
}
```

```ts type-equiv
/**
 * The merge-extensible, append-only source of truth for an agent interaction.
 * Message history is derived from this log. Every event is lossless JSON and
 * sequence numbers stay contiguous, including raw chunks, so persistence can
 * store the canonical log verbatim.
 */
interface SessionEventMap {
  /**
   * Opens turn `turn` before the loop claims queued input or runs pre-step.
   * Rejection, empty input, cancellation, or failure may close it with no
   * step; otherwise the following identified `user/message` event or batch
   * records the messages entering the step.
   */
  'turn/start': { turn: number }
  /**
   * Closes turn `turn` with the {@link TurnEndReason} that ended it. A turn
   * with no entered step has no `step/start` or `step/end`. The loop does not await a
   * flush at turn boundaries: `dsh-session-checkpoint-policy` owns the
   * per-request durability checkpoint, and consumers that read storage after
   * `whenIdle()` flush themselves. Success commits the turn; rejection is
   * reported live and does not prevent later work.
   */
  'turn/end': { turn: number; reason: TurnEndReason }
  /** Opens step `step` of turn `turn` — one model call plus the tool executions it requested. */
  'step/start': { turn: number; step: number }
  /** Closes step `step` of turn `turn`. */
  'step/end': { turn: number; step: number }
  /**
   * A user-role message on the model-visible surface: a direct human prompt
   * (the queued message claimed for this turn), a synthetic `agent.inject()`
   * context (file-change notices, subdir AGENTS.md, skill content, cron
   * notifications, …), or an entered goal continuation round. All three
   * project their `content` verbatim; `source` tells them apart.
   */
  'user/message': UserMessage
  /** Raw stream chunk — token-level replay fidelity. */
  'assistant/chunk': { turn: number; step: number; chunk: StreamChunk }
  /**
   * Assembled assistant message for one step (derived history uses this).
   * Carries the step's `usage` when the adapter reported token accounting, so
   * the model output and its accounting travel together (there is no separate
   * usage record). `usage` is absent when the adapter reported none.
   */
  'assistant/message': { turn: number; step: number; message: AssistantMessage; usage?: TokenUsage }
  /**
   * The model requested one tool invocation: `name` with the raw `arguments`
   * JSON string exactly as the model produced it (unparsed). `callId` pairs the
   * call with its `tool/result`.
   */
  'tool/call': { turn: number; step: number; callId: CallId; name: string; arguments: string }
  /**
   * A completed tool call's model-facing result, optional internal failure
   * identity, and optional tool-private `meta` presentation payload. `meta` is
   * opaque to the core (the producing tool owns its shape and reads it back in
   * `presentResult`) but MUST be JSON-serializable: `Session.append`
   * runtime-validates all event data with `isJsonValue`, so a non-serializable
   * `meta` is rejected at the source, and the durable log reproduces the
   * identical card on replay. Absent
   * unless the tool attaches one (e.g. `dsh-tool-fs` carries its result-time
   * contextual diff here).
   */
  'tool/result': {
    turn: number
    step: number
    message: ToolResultMessage
    error?: { name: string; code: string }
    meta?: JsonValue
  }
  /** Whole-list snapshot; latest write wins on replay. Log-only UI state; never derived history. */
  'todo/write': { todos: TodoItem[] }
  /**
   * Full header for the next request, appended inside its step before dispatch.
   * It is log-only; the latest snapshot reconstructs the request header.
   */
  'request/header': { header: EpochHeader; reason: RequestHeaderReason }
  /**
   * Route metadata for the next request, logged only when the route or capacity
   * changes. It does not participate in request reconstruction or header equality.
   */
  'request/context': RequestContext
  /**
   * Marks the end of a constructor seed. Events before it have smaller seq
   * values and came from the seed (resume, fork, or replay); this lifecycle
   * produced none of them. This log-only event is the durable projection of
   * {@link Session.firstLiveSeq}. Its payload is empty — position and `time`
   * carry the meaning.
   *
   * Locate the LAST one in stored history. A seed already ending in one is not
   * re-marked, so reopening an untouched session does not grow its log per
   * pickup and the event need not be at the current `firstLiveSeq`.
   *
   * `Session`'s constructor is the only legitimate writer. The invariant
   * companion deliberately constrains nothing here, so a plugin appending one
   * would silently classify every live bracket before it as seed history.
   *
   * An owner of a standalone open/close bracket (`compact/start` …
   * `compact/end`) reads it because seed history and live work are otherwise
   * byte-identical: an unmatched opening marker before this event belongs to
   * an ended lifecycle, whatever ended it. NOT a liveness signal about other
   * writers — a concurrently live session holds its own boundary elsewhere,
   * so tolerating concurrent writers needs a signal beyond the log.
   */
  'session/end-seed': Record<string, never>
}
```

`UserMessage` 是普通提示词、注入上下文、steering（中途引导）与实时收件箱事件共享的带标识且冻结的 user-role 值。事件包装层只会增加事件本地的位置或结果事实；条目待处理期间，loop 只额外附加驱动器自有的路由状态。

### `TodoItem`：一条待办项

这是 `todo/write` 事件全量列表快照中的单元。它有意保持精简：一行 `content` 加一个三态 `status`（没有 id、优先级或 `activeForm`）；列表在每次写入时整体替换，因此条目无需稳定标识。见 [todo_write Agent Note](../../.agents/notes/implemented/feature/2026-06-29-todo-write-tool.md)。

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * {@link SessionEventMap} event's whole-list snapshot.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

<a id="the-request-header-event-requestheader"></a>

### 请求头事件：`request/header`

请求信封（即 `EpochHeader`：调用配置 + 适配器默认值来源 + 渲染后的系统提示词 + 已组装的工具 schema）会作为会话状态写入日志，因此每个对话请求都是日志的纯函数（见可重建性 Agent Note）。带有 reason `'initial'` 或 `'resume'` 的完整 `request/header` 快照记录每个 agent loop 实例的边界；之后请求发生变化时，系统会以 reason `'change'` 记录另一份完整快照。`foldRequestHeader(events)` 通过选择最新快照重建请求头。该事件不是 `SurfaceEventType`，不产生 LLM 消息。

```ts type-equiv
/**
 * Logged request state outside derived history: call config, system prompt, and
 * tools. The latest full `request/header` snapshot reconstructs it; canonical
 * empty optional fields are absent.
 */
interface EpochHeader {
  /** The conversation's call configuration (provider, model, reasoning effort, and sampling scalars). */
  config: LlmCallConfig
  /** Effective config fields materialized from the exact adapter rather than proposed by a caller. */
  adapterDefaults?: LlmCallConfigAdapterDefaults
  /** Rendered system prompt text; absent for a system-less request. */
  system?: string
  /** Assembled tool schemas; absent for a tool-less request. */
  tools?: ToolSchema[]
}
```

规范形式：空系统提示词和空工具列表都表示为字段缺失，与请求构建方式一致。包含已移除的 `request/header-delta` 事件或完整快照原因为 `fallback` 的旧版 v0 日志，会在 seed、append 和持久化加载边界被拒绝，而不会以不完整方式回放。

### 路由容量事件：`request/context`

请求所解析到的路由的上下文元数据是独立的已记录状态，在同一步骤内紧随 `request/header` 追加，且仅在提供方、模型或容量与上一条记录不同时追加。它保持在 `EpochHeader` 之外，因为该类型是由 `headerEquals` 逐字段比较的重建契约：容量描述的是路由，不是请求输入，把它折叠进去会让一次容量变化被登记为请求信封的 `change`，也会把适配器元数据拉进 loop 的重建不变式。与 `request/header` 一样，它不是 `SurfaceEventType`，也不产生 LLM 消息。`session.requestContext()` 以增量方式归并最新一条记录。适配器不公布容量的路由会以缺失 `contextWindow` 的形式记录，因此新记录可以清除较早路由的容量。

```ts type-equiv
/** Registration-bound metadata for one resolved model route. */
interface RequestContext {
  /** Registered provider route the metadata belongs to. */
  provider: string
  /** Provider-owned model id the metadata belongs to. */
  model: string
  /** Maximum combined request and response context in tokens, when advertised. */
  contextWindow?: number
}
```

## `SessionEvent<T>`：一条日志条目

基于 `type` 的真正可辨识联合（而非独立的 `type`/`data` 联合），因此 `switch (event.type)` 能直接收窄 `event.data`，无需类型断言。`seq` 是日志中的单调递增位置（`seq = log.length`）；`time` 为 epoch 毫秒。

```ts type-equiv
/**
 * One immutable entry in the session log.
 *
 * A proper discriminated union over `type` (not independent `type`/`data`
 * unions), so `switch (event.type)` narrows `event.data` without casts.
 *
 * The {@link sourceEventSeqs} and {@link surfaceOp} fields are conditional:
 * they only exist on {@link SurfaceEventType} variants (`user/message`,
 * `assistant/message`, `tool/result`).
 * Non-surface events (boundary markers, chunks, usage, errors) never carry
 * surface metadata — the compiler enforces this at `Session.append()`
 * call sites.
 */
type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    /** Monotonic sequence number within the session. */
    seq: number
    /** Unix epoch milliseconds. */
    time: number
    data: SessionEventMap[K]
  } & (K extends SurfaceEventType ? {
    /**
     * Seq numbers of events that are provenance sources of this event
     * (e.g. the `assistant/chunk` seqs that built an `assistant/message`,
     * or the surface nodes shadowed by a compaction replace node). An
     * `assistant/message` may carry a present empty array for a known empty
     * provider stream; omission means unrecorded provenance.
     */
    sourceEventSeqs?: number[]
    /** How this event entered the surface; absent for non-surface events. */
    surfaceOp?: SurfaceOp
  } : object)
}[T]
```

`SessionEventType = keyof SessionEventMap`。由于 `SessionEventMap` 可通过合并扩展，对 `SessionEvent` 的 switch 语句禁止使用 `assertNever`：插件添加的变体是合法的未知值；处理已知 case 后在 `default` 中放行。

对于 `assistant/message`，存在的 `sourceEventSeqs: []` 表示提供方流已知且完整地为空；字段缺失则表示旧格式或其他未记录溯源信息的情况。agent loop 会为每次成功的模型调用写入该字段；其他 surface 事件只要包含该字段，其列表就必须非空。

## Surface 类型

三种产生消息的类型（`SurfaceEventType`：`user/message`、`assistant/message`、`tool/result`）携带 surface 元数据，用来声明它们如何加入有序的派生 surface。见 [session surface Agent Note](../../.agents/notes/implemented/architecture/2026-06-18-session-surface.md)。

### `SurfaceEventType`：事件类型中产生消息的子集

```ts type-equiv
/**
 * The subset of {@link SessionEventType} values whose events produce LLM
 * messages and are eligible to appear on the ordered surface. Only these
 * event types may carry {@link SurfaceOp} and {@link SessionEvent.sourceEventSeqs}.
 */
type SurfaceEventType =
  | 'user/message'
  | 'assistant/message'
  | 'tool/result'
```

### `SurfaceOp`：事件如何进入 surface

```ts type-equiv
/**
 * How a session event entered the ordered surface. Only valid on
 * {@link SurfaceEventType} events.
 *
 * - `'append'`: added to the tail — normal path for user/assistant/tool
 *   messages.
 * - `{ op: 'replace', start, end }`: replaces surface nodes from `start`
 *   (inclusive) through `end` (inclusive) with this node. Both must exist as
 *   surface nodes in the current surface. `start === end` replaces a single
 *   node. The node's {@link SessionEvent.sourceEventSeqs} must include every
 *   shadowed surface node. Used by compaction and possible other manipulations.
 */
type SurfaceOp =
  | 'append'
  | { op: 'replace'; start: number; end: number }
```

`'append'` 是常规的尾部追加路径。`replace` 会遮蔽从 `start` 到 `end`（含两端）的 surface 条目（两者都必须是有效的 surface seq；`start === end` 时仅替换单个条目），并在原位置插入新事件。

### `SurfaceIntent`：`session.append()` 的参数

```ts type-equiv
/**
 * Surface placement and provenance for {@link Session.append}. Required on
 * message-producing events and forbidden on log-only events.
 */
interface SurfaceIntent {
  surfaceOp: SurfaceOp
  /**
   * Complete known provenance source set. `assistant/message` may use a
   * present empty array for a known empty provider stream; omission means its
   * provenance was not recorded. Other surface events require a non-empty set
   * when this field is present.
   */
  sourceEventSeqs?: number[]
}
```

对 `SurfaceEventType` 事件必填：每个产生消息的事件都必须声明它如何加入 surface（派生模型历史的唯一来源）。面向人类的记录（transcript）是另一个投影，读取的是日志中追加来源的事件，因为 surface 会有意遮蔽替换所概括的范围（见 [dsh-session](../../packages/core/session/README.md) 的 `isAppendSurfaceEvent`）。非 surface 类型在编译期拒绝此参数。

此处适用相同的溯源区分：只有 `assistant/message` 可以携带存在但为空的 `sourceEventSeqs`；省略该字段并不表示其源流为空。

### `SessionSurface`：实时只读 surface 投影

`Session.surface` 返回会话稳定的 `SessionSurface` 视图。同一个增量管理器在提交前校验追加候选事件，并根据已提交事件推进该投影；调用方可以观察成员关系和替换代次，但不能调用校验。

`SurfaceManager(log, baseSeq?)` 也可以折叠一个连续的已加载窗口，其第一个事件的绝对序号为 `baseSeq`。每个事件在该绝对序号空间中仍保持连续；如果替换跨过窗口头部，由于其声明的范围并不存在，该替换会失败。

```ts type-equiv
/** Readonly live projection of the message-producing session events. */
interface SessionSurface {
  /** Current surface event sequences in model-visible order. */
  readonly nodes: readonly number[]
  /** Monotonic count of committed positional replacements. */
  readonly replaceGeneration: number
}
```

### `SurfaceFoldReplacement` 与 `SurfaceFoldResult`：完整的 surface 回放

`foldSurface(events)` 返回一份独立的当前事件 seq 列表，以及每个声明的替换范围实际遮蔽的 seq。实时管理器复用同一套状态转换，但不保留替换历史。每提交一次替换，其 `replaceGeneration` 就递增一次，使增量消费方能够区分纯尾部增长与重写。

```ts type-equiv
/** One replacement operation observed while folding a session surface. */
interface SurfaceFoldReplacement {
  /** Seq of the event that replaced the prior surface range. */
  seq: number
  /** Declared inclusive start seq of the replaced surface range. */
  start: number
  /** Declared inclusive end seq of the replaced surface range. */
  end: number
  /** Actual surface entries removed by the operation, in surface order. */
  shadowedSeqs: number[]
}
```

```ts type-equiv
/** Complete result of replaying the surface operations in a session log. */
interface SurfaceFoldResult {
  /** Current surface event sequences in model-visible order. */
  nodes: number[]
  /** Replacement operations in event order. */
  replacements: SurfaceFoldReplacement[]
}
```

## `Session` 公共 API

去除方法体的声明与源码中的普通类保持同步，覆盖其脱离态工厂、状态访问器、追加边界和历史投影。存储操作仍由生成的 [`ctx.sessions` 服务目录](../cordis-catalog/services.md#ctxsessions--sessionstore)记录。

```ts public-api
/**
 * An event-sourced session: an append-only log of {@link SessionEvent}s.
 *
 * Plain class (not a Service) — create live instances via
 * `ctx.sessions.create()` and detached instances via {@link create}.
 * Seeding with an existing event log replays/forks a session.
 * @typert object
 */
declare class Session {
  /** The ordered surface over this session's event log. */
  get surface(): SessionSurface;
  /**
   * Detached, deep-frozen creation metadata (format version, cwd, lineage,
   * seed boundary). Supplied by the store via `ctx.sessions.create()`. When a
   * `Session` is created without a store-owned header, a minimal header is
   * synthesized (stamped with the current {@link SESSION_FORMAT_VERSION}) so
   * `session.header` is always present. Kept out of the event log — it is a
   * storage concern, not replayable conversation state.
   */
  readonly header: SessionHeader;
  /** The session identity, derived from its durable header's single copy. */
  get id(): SessionId;
  /**
   * The first seq appended IN THIS PROCESS: the length of the constructor
   * seed (0 without one). Events with smaller seq values entered through
   * construction — replay, fork, or resume — and were never published on the
   * `session/event` firehose (constructor seeds do not emit), so consumers
   * that replay the log as a publication substitute (telemetry adoption)
   * start here. Distinct from `header.seedLength`, the DURABLE fork-lineage
   * boundary: a resumed session's constructor seed is its full stored log,
   * while its header keeps the original fork value — this field is the
   * in-process construction fact.
   *
   * Not persisted itself: a seeded session projects it into the log as the
   * `session/end-seed` event, which is what a consumer reading STORED history
   * reads. Locate the LAST such event, not necessarily one at this seq — a
   * seed already ending in one is not re-marked, so reopening an untouched
   * session leaves that event at a smaller seq than `firstLiveSeq`. Prefer
   * this field in-process: it is exact before the marker reaches storage.
   *
   * When this lifecycle appends the marker, it occupies this seq before the
   * store attaches and therefore does not publish either. Otherwise this seq
   * holds an ordinary published write.
   */
  readonly firstLiveSeq: number;
  /**
   * Create a detached session by validating and snapshotting borrowed seed
   * events and storage metadata.
   * @param id - session identity.
   * @param seed - optional borrowed replay or fork events.
   * @param header - optional borrowed storage metadata.
   * @returns a detached session.
   */
  static create(id: SessionId, seed?: readonly SessionEvent[], header?: SessionHeader): Session;
  /**
   * Restore a detached session by taking ownership of fresh persistence values.
   * Storage shape, event envelopes, sequence continuity, surface transitions,
   * and header fields are validated before the graphs are frozen in place.
   * @param id - restored session identity.
   * @param seed - fresh detached events whose ownership is transferred.
   * @param header - fresh detached metadata whose ownership is transferred.
   * @returns a restored detached session.
   */
  static fromRestore(id: SessionId, seed: readonly SessionEvent[], header: SessionHeader): Session;
  /**
   * An immutable snapshot of the append-only event log. The snapshot is reused
   * until the next append; a previously returned array does not grow later.
   * Events and their nested data are deep-frozen at acceptance, so neither a
   * cast nor ordinary JavaScript can rewrite durable history.
   */
  get events(): readonly SessionEvent[];
  /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
  get seq(): number;
  /**
   * Append one typed event to the log and synchronously notify observers via
   * the store-owned, module-private publication hooks. The hot path never blocks
   * on I/O — persistence plugins buffer asynchronously. Once the event enters
   * the log, the append is committed: observer failures are logged and
   * contained per listener, so they do not change the return value or prevent
   * later listeners from observing the same accepted event.
   *
   * @param type - The event type (key of {@link SessionEventMap}).
   * @param data - The event payload; must be JSON-serializable.
   * @param opts - Surface metadata: `surfaceOp` controls how the event enters
   *   the ordered surface; `sourceEventSeqs` records provenance (the seq
   *   numbers of events this one derives from). REQUIRED for
   *   {@link SurfaceEventType} events (every message-producing event must
   *   declare how it joins the surface, the sole source of derived model
   *   history) and
   *   rejected by the compiler for non-surface types like `turn/start` or
   *   `assistant/chunk`.
   * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
   *   `data` that entered the log, so reading `event.data` back sees the logged
   *   value, never the caller's still-mutable input.
   * @throws if `data` or surface metadata is not losslessly JSON-serializable
   *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
   *   circular reference, sparse array, or an exotic object such as
   *   Map/Set/Date/class instance), or when the candidate violates the
   *   canonical surface contract (marker shape and eligibility, unique
   *   earlier provenance, positional replacement validity, and complete
   *   shadowed-node coverage). One recursive pass reads, validates, and
   *   copies each nested value once, so a stateful getter cannot supply one value
   *   to validation and another to storage. The event log is the durable source
   *   of truth, so a bad event fails at the append site rather than later during
   *   a backend flush. A synchronous internal dispatch validation failure or an
   *   append reentered while this acceptance/publication boundary is open also
   *   rejects before the log changes.
   */
  append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent] : []
  ): SessionEvent<T>;
  /**
   * The {@link EpochHeader} in force after the log's last header event — the
   * header the NEXT request will be compared against — or undefined before
   * the first `request/header` snapshot. The live, incrementally-maintained
   * form of `foldRequestHeader(session.events)`: each header event is folded
   * once, when first seen, so a per-step read costs O(new events).
   * @returns the folded header, or undefined when no header event exists yet.
   */
  requestHeader(): EpochHeader | undefined;
  /**
   * Return the latest resolved route metadata, or `undefined` before the first
   * `request/context` event. Each event is folded once.
   * @returns the latest immutable route metadata.
   */
  requestContext(): RequestContext | undefined;
  /**
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent, and a compaction `replace` deletes the
   * shadowed nodes from the derivation. The projection rules are
   * {@link deriveEventMessage}, folded per node.
   *
   * CACHED: each surface node is projected exactly once, when first seen — a
   * call costs O(new nodes), and a surface rewrite (a `replace`;
   * {@link SessionSurface.replaceGeneration}) rebuilds. The returned array is
   * a fresh snapshot per call (later appends never grow an array a caller
   * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
   * Their content reuses the already frozen durable event data, so the cache
   * needs no second deep clone and consumers still cannot mutate the log.
   * @returns a fresh array of the shared, frozen derived history.
   */
  deriveMessages(): Message[];
  /**
   * Instance face of the pure per-node `deriveEventMessage` export from
   * `surface.ts`.
   * @param event - the event to project.
   * @returns the derived message, or null when the event produces none.
   */
  deriveEventMessage(event: SessionEvent): Message | null;
}
```

## 派生历史：`deriveMessages()` 与 `deriveEventMessage()`

`Session.deriveMessages()` 将事件日志投影为模型看到的 `Message[]`。它是缓存的（每个 surface 节点在首次出现时投影一次；surface 重写触发重建）且冻结的（每次调用返回一个新数组，引用共享的深冻结消息，因此通过投影修改已记录的历史在类型上不可表达）。`deriveEventMessage(event)` 是折叠所应用的逐节点纯函数，公开暴露以便外部重建器和开发不变式检查能以完全相同的规则投影日志前缀，不会与缓存产生分歧。投影规则：

- `user/message` → 一条携带确切 `content` 的 user 消息；可选 envelope 仅作为日志中的展示元数据保留。
- `assistant/message` → 一条 assistant 消息，包含事件的提供方/模型溯源信息和可选的适配器私有回放状态。原始 `assistant/chunk` 事件属于回放/UI 数据，在派生时会被**跳过**（组装后的消息才是权威）。**内容为空的** `assistant/message` 也会跳过：因 max-tokens 而截断且无内容的步骤仍会记录一条 `assistant/message` 以承载用量和溯源信息，但无内容的 assistant 轮次不得进入提供方 transcript（文本记录）。
- `tool/result` → 一条携带 `tool-result` 块的 user 消息。
- `user/message`（注入上下文，即非 `user` 来源）→ 按时间顺序在相应位置生成一条 user-role 消息，并原样承载其 `content`；溯源信息与领域数据都在其类型化的 source 中。

其余所有事件（`turn/*`、`step/*`、插件所有的 `llm/retry`）均为结构信息，不会投影为消息。token 记账读取每个步骤的 `assistant/chunk { type: 'usage' }` 记录；如果没有用量分片，则将 `assistant/message.usage` 作为已提交步骤的后备。失败的模型请求尝试没有 assistant 消息，因此其用量分片是持久化的记账记录。由于这一尚未发布的格式有意不提供兼容性承诺，seed/load 校验会拒绝缺少提供方和模型的请求头，以及缺少提供方/模型溯源信息的 assistant 消息，而不会猜测历史数据应走的提供方路由。

## 活跃会话 fork API

`ctx.sessions.create(id, { seed, meta })` 是底层的回放/fork 原语。对于普通的活跃会话 fork，`SessionStore` 暴露一个策略 API：

- `fork(source, boundary?, childSessionId?)` 接受一个活跃的 `Session` 对象或活跃的 `SessionId`，选取到 `boundary` seq（含）为止的源事件（默认为当前最后一个事件），要求所选前缀结束时没有开放轮次，然后创建一个活跃的子会话，包含深克隆的种子事件和子会话元数据（`parentSession`、`seedLength` 及继承的 `cwd`）。

显式 `boundary` 允许调用者从任意稳定的轮次间位置 fork，包括之前的 `turn/end` 或更晚的独立纯日志事件，即使源会话有更新的事件或正在进行的轮次。API 拒绝结束于开放轮次内的前缀，而不是静默截断。更广泛的执行关系健全性检查留在既有的 `dsh-invariants` 插件和持久化修复路径中，不在 `fork()` 中重复。`dsh-subagent-fork` 保留其已完成前缀截断逻辑，因为工具调用时的委托通常在父轮次仍然打开时启动；普通的会话分支应显式指定请求的 boundary。

<a id="why-a-turn-ended-turnendreasonmap"></a>

## 轮次的结束原因：`TurnEndReasonMap`

`turn/start` 没有 trigger 字段。返回 enter 的 pre-step 所产生的 `user/message` 批次记录进入轮次的内容，`llm/retry` 记录请求恢复，idle 注入则保持待处理，直到唤醒交付抵达后续 pre-step。实时轮次会保留停止驱动器的类型化 [`AgentCancelCause`](core.md#the-agent-handle)；只有在导入受支持的粗粒度取消记录且记录未保存调用方时，持久化才使用额外的 `{ kind: 'legacy' }` 原因。

```ts type-equiv
/** Durable cancellation cause, including imports whose original coarse record carried no cause. */
type TurnEndCancelCause = AgentCancelCause | { readonly kind: 'legacy' }
```

```ts type-equiv
/**
 * Why a turn ended. Merge-extensible sum type.
 */
interface TurnEndReasonMap {
  completed: { kind: 'completed' }
  /** A cancellation request interrupted the live turn. */
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause }

  blocked: { kind: 'blocked' }
  /**
   * The turn failed. `error` is always a structured failure: the `LlmError`
   * facts verbatim, or `{ message: errorChain(error), code: 'UNKNOWN' }`
   * flattened from any other error.
   */
  error: { kind: 'error'; error: LlmFailure }
  /** At least one step reached its output-token ceiling, even if a plugin continued the turn. */
  'max-tokens': { kind: 'max-tokens' }
  /**
   * A persistence backend closed a crash-orphaned turn on reload. The loop never
   * emits this marker, and the events recorded before the crash remain intact.
   */
  interrupted: { kind: 'interrupted' }
}
```

`max-tokens` 与模型调用中同名的 `FinishReason` 对应：只要轮次内有任何步骤以 `max-tokens` 结束，整个轮次就以 `max-tokens` 而不是 `completed` 结束（即使之后继续执行，截断事实仍优先），让消费方能够区分正常停止和截断停止。取消和错误仍是不同的结果。`interrupted` 是唯一不会由任何 loop 发出的原因：它由崩溃恢复合成（见 [persistence.md](persistence.md)）。该 map 可通过合并扩展。

## 执行封闭与独立事件

一个轮次包围一次模型循环执行，而不是整个会话日志。AgentLoop 只会从轮次内返回 enter 的 pre-step 批次记录注入的 `user/message` 事件；插件所属的纯日志事件仍可出现在 `turn/end` 与下一个 `turn/start` 之间，占用事件 seq 但不递增轮次编号。持久化会将每个连续且已接受的事件纳入有界持久化批次，而崩溃修复只关闭确实仍处于开放状态的尾部轮次。需要即时持久性屏障的生产方会显式等待 `ctx.sessions.flush(session)`。

可选的 `dsh-session/invariant` 配套插件会强制核心拥有的关系：轮次与步骤编号、执行事件封闭，以及同一步骤内的工具调用／结果配对。可合并扩展事件的关系由声明它的插件拥有，因此核心不会仅因没有开放轮次就拒绝未知事件。见[独立事件决策](../../.agents/notes/implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.md)。

## 种子结束边界：`session/end-seed`

带种子的会话（恢复、fork 或回放）紧接构造种子之后追加这个仅日志事件，作为自己的第一次实时写入。在它之前的事件具有更小的 seq，且来自种子。它是 `firstLiveSeq` 的持久投影：该字段为持有对象的消费方回答本生命周期的写入从哪里开始，该事件则为只持有存储字节的消费方回答同一问题。payload 为空，因此位置与 `time` 承载全部含义，且不产生任何消息。`Session` 的构造函数是唯一合法的写入方。

显式传入的空种子会在 seq 0 写入 `session/end-seed`，从而把从空日志恢复的会话与全新会话区分开来。种子本身已以 `session/end-seed` 结尾时不会重复标记，因此重新打开一个未被改动的会话不会每次拾起都增长日志。应定位存储历史中的最后一条 `session/end-seed`，而不是假定 `firstLiveSeq` 处一定有一条：在一次没有产生工作的拾起之后，该事件的 seq 会小于下一个生命周期的 `firstLiveSeq`。

它之所以必要，是因为种子历史与实时工作在字节层面完全相同，这会让任何拥有独立开／闭括号的插件失效：一个未配对的 `compact/start`，无论写入方是在压缩中途崩溃、还是此刻正在压缩，读起来都一样。在 `session/end-seed` 之前的开启标记来自构造种子，并且属于一个已结束的生命周期，无论结束原因为何（崩溃、进程接替，或从仍在运行的父会话 fork 出来），因此其所有方可以视之为已死。这只覆盖*本*会话继承的括号：另一个并发存活的会话可能在同一段历史上持有开放括号，而它自己的边界在别处，因此容忍并发写入方还需要日志之外的存活信号。核心写入该边界但不从中读取任何内容——括号的词汇表仍归其所属插件，这也正是崩溃修复只关闭轮次／步骤／工具边界而从不处理 `compact/*` 的原因。

活动排序通过 `lastActivityTime(events)` 排除该边界：接手会话不算工作，而惰性恢复意味着浏览就会写入一个，因此按日志尾部排序的恢复选择器或会话列表会把每个打开过的会话顶到最前。

## 插件贡献的仅日志事件

插件可以通过 declaration merging 添加额外的 `SessionEventMap` 类型。这些是**仅日志**事件：不是 `SurfaceEventType`（不携带 `surfaceOp`，不参与派生历史）。事件所有方决定它们属于一个开放的执行轮次，还是可以独立位于轮次之间，并在自己的不变量配套插件中强制所需关系。完整的逐事件枚举（核心与插件贡献的，含 payload 与溯源信息）见生成的[持久化日志事件目录](../persistence-catalog.md)；压缩 seam 的 `compact/*` 语义在 [compaction.md](compaction.md) 中讨论。

钩子桥接层的 `hook/invoked` / `hook/result` 溯源对（来自 `@deepseek-ai/dsh-hook-protocol`）通过 `handlerId` 关联。`UserPromptSubmit`、`PreToolUse`、`PostToolUse` 与 `Stop` 在 loop 已打开的轮次内触发，因此其 `hook/*` 记录天然位于轮次之内。`SessionStart` 不生成 `hook/*` 记录，因为它在轮次 1 之前运行；其上下文会在 inbox 中保持待处理，直到唤醒交付打开一个轮次（见[钩子桥接 Agent Note](../../.agents/notes/implemented/feature/2026-06-30-hook-bridges.md)）。

## 持久性契约

持久化后端依赖的契约如下：持久日志无损保存每个事件，**包括** `assistant/chunk`；`seq` 必须连续，因此不能从规范日志中过滤分片。后端可以为事件批次选择自己的存储编码，只要 `load` 返回与追加时完全一致的事件即可（JSONL 后端默认启用的打包分片行就是此类编码；见 [persistence.md](persistence.md)）。所有 `event.data` 都必须可序列化为 JSON；`Session.append` 会从源头强制这一要求（遇到不可序列化数据时抛出），因此错误事件绝不会进入日志，`session.events` 始终与后端可持久化的内容一致。新增会携带不可序列化数据、破坏核心执行嵌套或违反事件所有方声明关系的事件类型，都会构成磁盘格式的破坏性变更。

消费此契约的后端见 [persistence.md](persistence.md)。
