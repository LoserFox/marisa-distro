# 核心数据结构

[English](core.md) | 中文

本目录编目 DeepSeek Harness 的**数据结构**：每个核心类型代表什么、它的字面形状，以及完整细节在哪里。它与 [architecture.md](../architecture.md) 互补——后者描述*行为*（服务映射、会话/轮次/步骤生命周期、事件分类体系）；本页描述行为所操作的*词汇*。

## 什么算"核心"

harness 是一个微内核：一个极小的核心加上众多插件。大多数类型属于某一个插件或某一项能力。但有少数类型构成**主干**——agent loop（智能体循环）及其事件在*每一个*轮次中使用的语言，无论加载了哪些可选插件。这些就是"核心"。

精确地说，一个数据结构是**核心**的，当且仅当满足以下条件之一：

1. 它流经 agent loop 主干——循环在每个轮次中持有、派生、流式输出或记录它（`Message`、`StreamChunk`、`SessionEvent`、`Agent` 句柄本身），与当前加载了哪些插件无关；**或者**
2. 它是插件作者面向某条流水线编写的代表性类型——`ToolDefinition`（每个工具*是什么*）。

其他一切都记录在**子页面**上，而非本页。划线的规则是：*你编写、持有或接收的类型是核心；为它提供类型推导、渲染或持久化的机制是子页面细节*。因此 `ToolDefinition` 是核心，但为它提供类型推导的 `ValueSchemaSpec`/`ParameterSchemaSpec` 机制、为它提供渲染意图的 `ToolCallView`/`ToolResultView` 词汇，以及存储事件日志的 `SessionPersistence` seam 都不是——它们分别在下列子页面中。

| 子页面 | 负责内容 |
|---|---|
| [llm-streaming.md](llm-streaming.md) | `StreamChunk` 协议格式（wire format）+ 适配器契约（adapter contract）、`BlockAssembler`、`LlmAdapter` seam |
| [token-meter.md](token-meter.md) | 不可变的标量与位置回放度量，附带已消费日志修订号 |
| [scope.md](scope.md) | 作用域注册标识、dispatch 载体，以及拥有的 `Scope` 上下文 |
| [typert.md](typert.md) | Remote 调用 descriptor、lookup/Context 声明、TypeRT 注册表，以及 Host Gateway/Client API seam |
| [goal.md](goal.md) | 持久 goal 标识、生命周期快照、激活、变更记录与 Round 归属 |
| [commands.md](commands.md) | 人类命令 seam：定义、适配器发现、直接调用、结果与解析视图 |
| [session.md](session.md) | 完整的 `SessionEventMap` 变体目录、`TurnTrigger`/`TurnEndReason`、`deriveMessages()`、执行封闭与独立事件 |
| [persistence.md](persistence.md) | 持久性 seam：`SessionPersistence`、JSONL + SQLite 后端、`session/flush`、崩溃恢复、`SessionHeader` |
| [settings.md](settings.md) | 用户设置 seam：`SettingsNamespace` 注册、分层解析（默认值 → 组合 `base` → 用户文档）、owner scope、热提交 |
| [credentials.md](credentials.md) | 凭据 seam：配置中的 `CredentialRef` 引用（绝不含值）、按操作解析、对 UI 安全的 `CredentialInfo`、provider 来源层 |
| [session-query.md](session-query.md) | 逻辑记录、有界精确事件读取、关系追踪、语义筛选器/文档与全文检索结果页 |
| [session-title.md](session-title.md) | 持久标题快照、来源 provenance 与异步提供方契约 |
| [system-prompt.md](system-prompt.md) | 逐次组装的上下文、工具提供方结果、提示词段落与协作式组装 |
| [tools.md](tools.md) | `ToolDefinition` 完整字段、schema DSL、`ToolExecution`/`ToolResult`、工具展示 UI 类型，以及受保护的执行流水线 |
| [user-interaction.md](user-interaction.md) | UI 支持的人工问答 seam：`AskUserQuestionRequest`、answer/options 词汇、提供方 API、错误分类体系 |
| [approval.md](approval.md) | 一次性用户审批 seam：`ApprovalRequest`、`ApprovalOutcome`、逐会话策略、审计与 answerer 契约 |
| [bash.md](bash.md) | bash 执行器 seam：`BashExecRequest`/`Spec`、`BashRunResult`、后台 `BashProcess` 句柄 |
| [subprocess.md](subprocess.md) | 子进程 seam：完全显式的 `SubprocessSpawnSpec`、基于偏移的输出读取器、不含分类的 `SubprocessOutcome`，以及受管 `DSH_*` 环境词汇 |
| [pty.md](pty.md) | 持久化终端 ID、后端/会话契约、发送就绪状态、有界读取与 owner 可见快照 |
| [sandbox.md](sandbox.md) | 每会话策略解析与进程约束 seam：文件效果模式、执行/提供方策略、`ConfinedArgv`、强制执行与故障关闭错误 |
| [code-runtime.md](code-runtime.md) | 代码执行 seam：`CodeRunRequest`/`Result`、绑定命名空间、捕获日志、`CodeRunFailure` 分类体系 |
| [filesystem.md](filesystem.md) | 文件系统 seam：`FsTarget`、读/写/编辑结果、观测到的文件状态、`FsErrorCode` |
| [lsp.md](lsp.md) | LSP 导航 seam：`LspQueryRequest`/`Result`、`LspProvider`/`Service`、四种操作、`LspError` |
| [skills.md](skills.md) | skill（技能）服务：发现优先级、`SkillSummary`/`SkillDefinition`、会话前缀目录、面向模型的 `skill` 加载 |
| [compaction.md](compaction.md) | 压缩（compaction）seam：`compact/*` 会话事件、`CompactionResult`、`CompactService` 接口 |
| [subagent.md](subagent.md) | subagent seam：命名提供方注册表、`SubagentStartRequest`/`Result`/`Run`、启动时与运行时能力拆分 |
| [web.md](web.md) | Web 访问 seam：`WebSearchRequest`/`Result`、`WebFetchRequest`/`Result`、`WebFetchBody`、提供方可用性、`WebError` |
| [spill.md](spill.md) | spill 存储 seam：`SaveTextSpill`、`SpillOwner`/`SpillSource`、`SpillRef`、品牌类型 `SpillLocator` |
| [workflow.md](workflow.md) | 工作流 seam：`WorkflowStartRequest`、`WorkflowMeta`、`WorkflowRun`/`Result`、`workflow/*` 事件载荷、`WorkflowError` 致命性 |

> 这些页面上的类型声明及其 JSDoc 与源码等价，并由 `pnpm run verify-type-equiv` 检查漂移（见 [development.md](../development.md#documenting-types-verbatim-ts-type-equiv)）。普通块保留完整声明；`public-api` 块保留去除实现体的公开 class 声明。Cordis 服务使用生成的[服务目录](../cordis-catalog/services.md)。

<a id="the-map--derived-union-pattern"></a>

## `…Map → derived-union` 模式

harness 中几乎所有可扩展的和类型都遵循同一形状：一个以判别标签为键的接口（`…Map`），联合类型由 `keyof` 派生。插件通过**声明合并**添加变体——无需修改拥有该类型的包（package）。

```ts ignore-check
// The pattern, schematically:
interface ThingMap {
  'a': { kind: 'a'; /* … */ }
  'b': { kind: 'b'; /* … */ }
}
type ThingKind = keyof ThingMap          // 'a' | 'b'
type Thing = ThingMap[keyof ThingMap]    // the discriminated union

// A plugin extends it without touching the source package:
declare module '@deepseek-ai/dsh-llm' {
  interface ThingMap {
    'c': { kind: 'c'; /* … */ }
  }
}
```

五个规范 map 使用此模式；插件作者扩展它们：

| Map | 包 | 派生 | 目录 |
|---|---|---|---|
| `ContentBlockMap` | dsh-llm | `ContentBlock` | [下文](#content-blocks-and-messages) |
| `MessageSourceMap` | dsh-llm | `MessageSource` | [下文](#content-blocks-and-messages) |
| `FinishReasonMap` | dsh-llm | `FinishReason` | [下文](#the-model-request-and-result) |
| `TurnEndReasonMap` | dsh-session | `TurnEndReason` | [session.md](session.md) |
| `SessionEventMap` | dsh-session | `SessionEvent` | [session.md](session.md) |

消费方最常 `switch` 的两个大型判别联合类型是：**`StreamChunk`**（流式协议）和 **`SessionEvent`**（日志条目）。按仓库约定，对标签做 `switch`——不要链式 `if`——这样每个分支都能窄化类型，拼错的标签会编译失败。

<a id="branded-ids"></a>

## 品牌化 ID

跨越包边界的 ID 都经过**品牌化**——结构上是字符串，但在类型层面不可互换（不能把 `SessionId` 传给需要 `CallId` 的位置）。每种类型通过各自的工厂构造；比较、日志记录和 JSON 行为与普通字符串相同。

`Branded<B>` 原语位于独立的纯类型包 [dsh-brand](../../packages/util/brand) 中（没有运行时代码，也不依赖 Harness 包），因此任何包都能品牌化其拥有的 id，而无需依赖无关的能力包。

源码：[`packages/util/brand/src/index.ts`](../../packages/util/brand/src/index.ts)

```ts type-equiv
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & { readonly [BRAND]: B }
```

两个核心 ID 是 `CallId`（关联工具调用及其结果；dsh-llm）和 `SessionId`（活跃 agent 与持久会话共享的标识；dsh-session）。能力包也会品牌化各自的 id，例如 [tasks.md](tasks.md) 中的 `TaskId`。

<a id="content-blocks-and-messages"></a>

## 内容块与消息

一段对话由 `Message` 组成；一条消息是一个类型化**内容块**的数组。块的联合类型从 `ContentBlockMap` 派生。

源码：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

各块接口（完整字段见源码）：`TextBlock`（`text`）、`ReasoningBlock`（thinking，区别于可见文本）、`ToolCallBlock`（`id: CallId`、`name`、原始 JSON `arguments`）、`ToolResultBlock`（`toolCallId`、嵌套 `content: ContentBlock[]`、`isError?`）。`ContentBlock = ContentBlockMap[ContentBlockType]`。核心集仅限于每条交付路径都尊重的块——多模态内容（图像、音频等）没有核心块类型；需要的功能通过可合并扩展的 map 添加，同时提供适配器/UI/压缩支持。

源码：[`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

`Message` 是一个带标识且不可变的角色／来源／内容值。模型产生的 assistant 消息会在其来源中携带提供方／模型所有权与可选的适配器私有回放元数据：

```ts type-equiv
/** Provider ownership and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmService` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required producer provenance. */
  readonly source: MessageSource
}
```

消息来源本身也是一个可合并扩展的和类型：

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

溯源与形态是相互独立的两根轴。`kind` 回答「由谁产生」；生产方可选混入的 `form` 回答「这是何种形态的信息」，因此多个生产方可以共用一种呈现，一个生产方在一次会话中也可以发出多种形态。该词汇表是语义的，逐个取值增长；未声明或无法识别的取值是有文档的默认，按不透明内容呈现：

```ts type-equiv
/**
 * What SHAPE of information a producer-supplied context carries, declared by
 * the producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form (three snapshot producers today), and one producer
 * may emit more than one form over a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source shapes that carry one.
 *
 * Discriminated by `form` so a producer cannot declare a shape without the
 * facts that shape is presented from: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

## 流式输出

适配器发出原始**分片**协议；循环记录分片（回放保真度），同时将同一批分片送入 `BlockAssembler` 以重建块和消息。`StreamChunk` 是基于 `type` 的封闭判别联合——`block-start`、`text-delta`、`reasoning-delta`、`tool-call-delta`、`block-end`、`usage`、`finish`。

完整联合类型、适配器契约（usage-before-finish、原始 JSON 工具参数、两条认可的错误路径）和 `BlockAssembler` 在 **[llm-streaming.md](llm-streaming.md)** 中。

<a id="the-model-request-and-result"></a>

## 模型请求

一次模型调用是一个完全组装好的 `GenerateOptions`。适配器以原始 `StreamChunk` 流作答；消费方用 `BlockAssembler` 组装它（见 [llm-streaming.md](llm-streaming.md)）。

源码：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

提供方与模型发现使用小型、提供方无关的描述符。模型目录仅供参考：路由仍以已注册提供方为键，适配器也可以接受未列出的模型 id。

注册适配器会返回一个句柄：既是释放器，也带有原子的路由替换——路由集合由用户配置决定的插件正需要它。

```ts type-equiv
/**
 * What {@link LlmService.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

适配器插件还会通过 `registerConfigurableProviders()` 声明哪些路由*可以*运行，并指明每条路由的用户设置分节，使配置界面能在任何路由注册之前就呈现休眠的提供方。

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
}
```

界面正在起草的提供方既没有路由也没有 catalog，因此询问被单独描述：请求携带用户正在编辑的草稿，回复是界面可以采纳的候选，而不是它必须服务的 catalog。

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
  /** Caller cancellation; implementations must settle promptly after it aborts. */
  signal?: AbortSignal
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

对正确性敏感的元数据与参考目录分开解析，并归服务该确切路由的适配器所有。上下文容量、适配器调用默认值和推理选项共用同一个确切模型结果，消费方因而无需重复执行权威模型解析。

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

推理强度是另一项针对确切路由的能力。核心为标识符添加品牌类型，但不枚举其值；有序集合、展示名称和可选的部署默认值均由各适配器持有。

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them (after
   * the `system` slot). A loop-built request assembles them as
   * the derived history (dsh-agent-loop); a hand-built one-shot passes any list.
   */
  messages: Message[]
  /** System prompt text (adapters map to the provider's system slot). */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for listener routing. Adapters ignore
   * it; replay uses it to keep concurrent parent and child cursors independent.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

模型响应为何停止由可合并扩展的原因表示。提供方终态失败携带流式契约的 [`LlmFailure`](llm-streaming.md#llmfailure)：

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`。`TokenUsage`（逐调用计量，含不相交的缓存字段）详见 [llm-streaming.md](llm-streaming.md)。

`GenerateOptions.tools` 携带 `ToolSchema`——工具的 JSON Schema 描述，发送给模型。它声明在 dsh-llm（而非 dsh-tools）中，正是因为它是循环每一步组装请求的一部分：

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

面向模型的 `ToolSchema` 是协议格式；产出它的已注册 `ToolDefinition`（schema + `execute`）在 [tools.md](tools.md) 中。

### 请求信封：`LlmCallConfig` 与记录的 header

循环从已记录状态构建每个请求。`EpochHeader` 通过完整的 `request/header` 快照记录调用配置、适配器默认值来源、渲染后的提示词以及权威返回工具顺序（由 `toolOrder` 配置；未配置时按字典序）。结合派生历史，请求便可由会话日志重建。见 [session.md](session.md#the-request-header-event-requestheader) 与[可重建性 Agent Note（agent 决策记录）](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md)。

`agent/request` 接收冻结的调用配置种子，并可返回替代值以切换提供方、模型、推理强度或采样参数。waterfall 开始前，循环会移除标记为适配器默认值的值，使确切模型准备过程填入所选路由的当前值；未带标记的显式设置仍保留在提议中。waterfall 结束后，准备过程会在轮次信号控制下拒绝显式指定但不受支持的推理强度 ID（不自动调整），并记录生效配置及其来源。准备完成的调用直至分派完成始终持有同一项适配器注册。到达 `llm/stream` 的请求会被深度冻结，因此变更会抛异常；请求还携带进程本地循环标识，使观察者不会把单独记录的冻结辅助调用误认成对话请求。

在协议格式上，循环构建的请求先读取 `system` 槽位（渲染后的提示词组装），再读取派生历史——边界快照，其尾部在轮次首步是最新的 `user/message`，在后续步骤是上一步的工具结果。开发不变式针对每个循环构建的请求精确重算此等式。

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## 会话

`Session` 是一份类型化 `SessionEvent` 的**仅追加日志**——唯一的真源。LLM（大语言模型）消息历史从日志*派生*（`deriveMessages()`），而非单独存储。事件词汇从 `SessionEventMap` 派生：

源码：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

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

会话事件变体、`deriveMessages()` 投影规则、`TurnEndReason` 词汇以及执行封闭和独立事件规则都在 **[session.md](session.md)** 中。日志如何持久化——`SessionPersistence` seam、JSONL/SQLite 后端、`session/flush` 检查点、崩溃恢复与 `SessionHeader`——则在 **[persistence.md](persistence.md)** 中。

<a id="the-agent-handle"></a>

## Agent 句柄

`Agent` 是每个插件（UI、钩子、orchestrator）面向编程的 surface。具体实现为 dsh-agent-loop 包内部细节；循环外没有任何组件依赖它。

源码：[`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** One of the two ordered pending-message lists owned by an agent. */
type InboxTarget = 'next-turn' | 'next-step'
```

每个待处理入队项就是其 `UserMessage`；`MessageId` 是唯一标识。`Inbox.append`、`prepend`、`replace`、`remove`、`clear`、`splice` 与 `claim` 会记录规范化的持久 `agent/inbox/spliced` 变更，并拒绝重复的待处理 id。`replace(messageId, newMessage)` 与 `remove(messageId)` 通过 `MessageId` 跨两份列表定位待处理消息；替换可以改变标识，并先将旧消息作为 discarded 发布，再将新消息作为 inserted 发布。普通删除和 `clear()` 都表示取消。`claim(target)` 通过无 outcome 的纯删除 splice 移除拟进入步骤的批次——全部 `next-step` 输入，外加轮次边界上的一条 `next-turn` 消息——且不发出 discarded 通知；循环另行逐条发出 claimed 通知。UI 投影等整体队列消费方通过持久 splice 重建 `nextTurn` 与 `nextStep`，而跟踪单条消息的消费方使用精确的 `agent/inbox/inserted`、`claimed` 与 `discarded` 通知。

```ts type-equiv
/** Options for {@link Agent.cancel}. */
interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. The
   * active turn is still aborted, but un-started and pending work survives for a
   * later turn and no canceled inbox splice is logged.
   */
  keepInbox?: boolean | undefined
}
```

```ts type-equiv
/** Why an active agent driver was cancelled. */
type AgentCancelCause =
  | { readonly kind: 'user' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'hook'; readonly reason: string }
  | { readonly kind: 'disposed' }
```

`Agent` 是覆盖公开活跃 agent 契约的接口。它的统一 `send` 方法直接公开目标与唤醒路由；`followup`、`steer` 和 `inject` 是固定预设别名。

```ts type-equiv
/** Public live-agent handle. */
interface Agent {
  /** The single identity shared with {@link session}. */
  readonly id: SessionId
  /** The provider route and model this agent's requests use. */
  readonly options: AgentOptions
  /** The live session this agent drives; its log is the durable source of truth. */
  readonly session: Session
  /** The agent-owned projection of durable pending work. */
  readonly inbox: Inbox
  /** The current lifecycle state, mirrored on every `agent/status` transition. */
  readonly status: AgentStatus
  /** Agent-scoped context; its contributions are agent-local, unwind on disposal, and reject registration afterward. */
  readonly ctx: Context

  /**
   * Clear queued and steering work — unless `keepInbox` — and abort the active
   * turn or between-turn task. The first cause wins for that activity. With no
   * active activity, cancellation is a no-op and does not arm later work.
   * @param cause - the stable caller intent carried by the active operation signal.
   * @param options - cancellation options; `keepInbox` preserves pending work.
   */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /**
   * Resolve after the current whole-agent activity reaches quiescence. This
   * follows replacement work started before the observed driver retires,
   * but does not identify the settlement of any particular message.
   * @returns fulfillment after no active driver or maintenance task remains.
   */
  whenIdle(): Promise<void>

  /**
   * Run one non-turn maintenance task from the true idle phase. The task starts
   * synchronously after claiming that phase; later waking input remains in the
   * inbox until the task settles, while public status stays `idle`.
   * `whenIdle()` follows both the task and any waking work released behind it.
   * @param task - operation whose fulfillment or rejection is preserved, with a signal aborted by {@link cancel}.
   * @throws synchronously when turn-driving or another maintenance task already owns the agent.
   * @returns the task promise.
   */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * Route identified input to an inbox boundary and optionally wake the driver.
   * Waking input submitted after active cancellation is queued for the next turn.
   * @param message - identified content and its producer provenance.
   * @param target - the preferred next-turn or next-step inbox boundary.
   * @param wakeup - whether delivery may wake the driver.
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /**
   * Queue an ordinary follow-up turn and wake the driver. The item becomes the
   * sole ordinary message of its own turn.
   * @param message - identified prompt content and its producer provenance.
   */
  followup(message: UserMessage): void

  /**
   * Submit steering for the nearest step. An idle driver starts a turn;
   * a running driver consumes it at its next step boundary.
   * A rejected step leaves steering parked in the inbox until the next
   * wake; cancellation or disposal may discard pending steering.
   * @param message - identified steering content and its producer provenance.
   */
  steer(message: UserMessage): void

  /**
   * Queue model-facing context for the next pre-step without waking the
   * driver. A running driver claims it at the nearest later step boundary;
   * idle drivers leave it pending until follow-up or steering
   * wakes them. It may miss a request whose pre-step already claimed its
   * batch. Cancellation or disposal may discard pending context.
   * @param message - identified injected context and its producer provenance.
   */
  inject(message: UserMessage): void
}
```

`AgentStatus` 为 `'idle' | 'running'`，`SessionId` 是品牌类型。dispose（资源释放）会把 agent 从注册表移除并发出 `agent/disposed`；它不是一个终态 status 值。`running` 描述整个驱动器的排空区间，可能跨越连续的排队轮次；它不能证明某个轮次仍然打开。`followup()` 不返回 handle：其 `MessageId` 标识持久 inbox 的插入、领取与丢弃事实，而不标识之后的助手输出或轮次结束。`whenIdle()` 观察整个 agent，因此只有显式拥有从回执到 idle 这一完整区间的调用方才能将其称为一次运行（[决策](../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md)）。`AgentOptions` 可合并扩展：core 声明 `provider?`、`model?` 与 `maxTokens?`（在 `agent/request` 后，分发要求 provider 与 model 都存在）。提供 `maxTokens` 时，它必须是正安全整数，并限制每次对话模型请求的输出；省略时，系统会在写入请求 header 前填入确切模型的适配器默认值，否则提供方行为保持不变。Persona 归 `dsh-system-prompt` 所有：agent 作用域的 `deployment:persona` 可以遮蔽全局默认值。

cause 是由 TypeScript 强制约束的同进程输入。活跃的取消持有者会将它复制到仅运行时的 `AbortSignal.reason`；signal 不授予协作监听器任何分类权限。持久 `turn/end` 保留粗粒度 `{ kind: 'aborted' }` 结果；若需记录请求 provenance，应使用单独的持久事件，而不是让终态结果承担额外含义。

[事件分类](../architecture.md#event)拥有 `agent/*` 生命周期、检查点与 waterfall（瀑布式事件）契约。轮次和步骤边界是持久会话事件，而不是 agent emit。

## 发起 Agent

`ctx.agents` 携带的进程本地 initiator 就是上面的确切 `Agent`，不是单独的 frame 或复制的标识。环境中存在该值既不能证明存活，也不代表授权；其生命周期与边界规则由 [initiator 作用域决策](../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md)规定。

## 拦截决策

pre-step 决策使用与持久 user-role 输入相同、带标识的 `UserMessage` 形状。进入步骤的批次具有权威性，并保留每条消息的标识与 provenance。钩子桥接层把其原生决策字段映射到这一类型化结果上。

源码：[`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

`agent/pre-step` 接收一个 payload，携带独占的已领取批次（`messages`）、拟进入步骤的坐标（`turn`、`step`）与当前轮次的取消 `signal`。首次提案在已打开的轮次内、任何步骤开始前运行；工具 continuation 可以在步骤之间提交空的已领取批次：

它返回 `PreStepDecision`。reject 不会打开步骤。enter 提供在 `step/start` 后追加的完整消息批次；最终决策省略的已领取消息保持已删除，而领取后插入的输入仍留待后续处理：

```ts type-equiv
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[] }
```

`agent/request-error` 在失败的模型步骤关闭之后、其轮次关闭之前运行。listener 可以在失败轮次的 signal 仍然存活时修复持久状态或 await 策略工作。处理该错误的 listener 返回 `{ kind: 'retry' }` 且不调用 `next()`；默认的 `undefined` 会让失败保持终态。

```ts type-equiv
/** Action returned by a listener that owns model-request recovery. */
type RequestErrorAction = { kind: 'retry' } | undefined
```

`agent/pre-step` 是请求推导前唯一的串行边界。`agent/turn-stopping` 在轮次没有工具或 steering（中途引导）后续时运行，先于最后一次 steering 排空。

`agent/session-start` 携带 `SessionStartSource`（会话生命周期为何开始；桥接层据此匹配其 SessionStart）：

```ts type-equiv
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

## `ToolDefinition`

唯一属于核心的流水线编写类型：每个已注册工具*是什么*——一个面向模型的 `ToolSchema` 加上一个 `execute` 函数，以及可选的最终内容回调与 UI 回调。工具作者很少手动构造它（`defineTool` DSL 会用类型化参数构建），但它是注册表持有、循环分发所经过的契约。

其完整字段、`defineTool`/`ValueSchemaSpec`/`ParameterSchemaSpec` 类型化 schema DSL、`ToolExecution`/`ToolExecutionResult` waterfall 形状，以及工具展示 UI 词汇在 **[tools.md](tools.md)** 中。
