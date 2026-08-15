# LLM（大语言模型）流式输出

[English](llm-streaming.md) | 中文

[dsh-llm](../../packages/llm/llm) 的协议格式（wire format）级流式输出词汇。[core.md](core.md) 介绍了 `StreamChunk`、`Message` 与 `ContentBlock`；本页拥有完整的分片协议、每个适配器必须遵守的适配器契约（adapter contract），以及共享的 assembler。

源码：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

## `StreamChunk`：原始协议

一个流式响应交错包含多种类型的块（文本、推理（reasoning）、多个工具调用）。`index` 将每个 delta 关联到其所属块；`block-end` 携带完整组装好的 `ContentBlock`，消费方无需自行重新组装 delta。这是一个**封闭的**可辨识联合类型：对 `type` 的 `switch` 以 `assertNever` 结尾，因此新增变体会在每个必须处理它的消费方处触发编译错误。

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmService.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Adapter-private lossless-JSON state for replaying a successful response. */
    replayState?: unknown
  }
```

## `LlmFailure`

每个抛出的失败或最终适配器的带内失败都会规范化为一种可序列化、提供方无关的 payload。`providerRetryAfterMs` 是经校验、由提供方请求的正数延迟，而不是重试决策；`ProviderRequestId` 是用于诊断的不透明品牌字符串。

```ts type-equiv
/** Serializable provider-boundary facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status observed at the provider boundary, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## 适配器契约

每个适配器必须遵守以下规则，每个消费方可以依赖它们：

- **`usage` 在 `finish` 之前，`finish` 之后不再有任何分片。** 将两者都推迟到提供方的流结束标记，这样尾部的 usage-only 分片就不会违反顺序。
- **工具调用的 `arguments` 全程保持原始 JSON 字符串。** 部分片段通过 `argumentsDelta` 流式传输；如果提供方返回的是已解析的对象，适配器在 `block-end` 时重新序列化为字符串。
- **两条受支持的错误路径，一种事实形状。** 失败可以从 `stream()` 抛出（传输/协议错误），**或者**以 `finish {kind:'error'|'aborted', failure}` 结束流（无法在流中途抛异常的适配器用它表示提供方带内错误）。`LlmError.failure` 携带同一个 `LlmFailure`。最终适配器边界保留被抛出的确切 `Error` 对象，并将不可变事实以及实际服务注册所对应的不可变重试策略关联到该调用；agent loop（智能体循环）关闭失败步骤，再把错误、事实、不可变的先前已重试失败事实、实际服务策略和轮次信号提供给 `agent/request-error`。处理该错误的 listener 在其 await 的修复完成后返回 `{ kind: 'retry' }`；若未恢复，结构化失败会成为轮次错误，并且该次尝试不会提交正常 assistant 消息或工具副作用。
- **一次适配器调用就是一次提供方尝试。** 适配器禁用库重试。agent 层恢复会打开另一个持久、带编号的轮次；直接调用 `ctx.llm.stream()` 的调用方仍然只尝试一次。
- **提供方停顿在传输层受到时限约束。** 两个已交付的远程适配器都暴露正数且有限的 `streamIdleTimeoutMs`，默认五分钟。watchdog 只在 iterator `next()` 尚未完成时启动，整个请求使用同一个稳定 signal，把自身到期映射为 `TIMEOUT`，并把更早发生的调用方中止保留为 `ABORTED`。
- **上下文溢出只有一个规范 code。** 两个 DeepSeek 适配器都通过 `isContextWindowExceededError()` 对提供方的显式细节分类并暴露 `CONTEXT_WINDOW_EXCEEDED`，无论失败以抛出的 HTTP `LlmError` 还是带内 finish error 到达。消费方按 code 路由，绝不依赖提供方文本。
- **空 completion 是可重试错误，而不是静默的成功结果。** 两个适配器都把没有携带任何内容块的终止性 `stop` 结束映射为携带规范 `EMPTY_RESPONSE` code 的 `finish {kind:'error'}`，`dsh-llm-retry` 默认会重试它；详见[空模型响应可重试](../../.agents/notes/implemented/bug-fix/2026-07-24-empty-model-response-is-retryable.md)。
- **每个提供方 HTTP 请求都携带应用归属头。** 适配器发送下文的 `attributionHeaders()`，即 `User-Agent` 基线。
- **回放状态归适配器所有。** 成功的 `finish` 可以携带重建提供方原生响应所需的无损 JSON 状态。循环会将其与组装后的 assistant 消息一起存储。后续请求中，仅当历史提供方与目标提供方当前注册到完全相同的适配器实例时，`LlmService` 才会传递该状态。该适配器负责校验状态并拥有所有跨模型或跨提供方转换；其他适配器只会收到提供方无关的内容与 provenance，不会收到私有状态。

两个彼此独立的实现遵循该契约：`dsh-llm-deepseek` 使用直接 fetch，并通过 `eventsource-parser` 进行 SSE（Server-Sent Events）分帧；`dsh-llm-pi-ai` 则通过 `@earendil-works/pi-ai` 提供通用多提供方适配器。两者都会把取消与空闲 watchdog 传递至提供方请求。

## `ResolvedRetryPolicy`

提供方配置会在路由注册前解析为不可变的可辨识联合。normal mode 携带 `mode: 'normal'`、有限的 `maxRetries`、`retryableCodes`，以及必填的 `initialDelayMs`、`maxDelayMs` 与 `jitterRatio`；always mode 携带 `mode: 'always'` 和相同的必填退避字段，但没有有限上限。`LlmService.providerRetryPolicy(provider)` 返回当前注册的值，并在适配器省略策略时提供 normal 默认值；调用进入最终适配器边界后，`llmRetryPolicyOf(stream)` 返回为其提供服务的确切注册所捕获的值，因此之后释放或替换路由都无法改变进行中失败的恢复策略。可选输入形状由[生成的配置目录](../config-catalog.md)规定。

## `AppIdentity`：应用归属

每个适配器都会向提供方发送的静态公开应用标识（[`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)）。`attributionHeaders(identity?)` 只把它映射到标准 `User-Agent` header；该契约有意不支持 OpenRouter 特有的应用归属 header。默认 `APP_IDENTITY` 从包 manifest（元数据清单）获取版本；每个字段都是公开产品事实——不含 secret、路径、会话 id 或逐用户标识，且任何逐请求信息都不得影响这些值。设计理由见[强制 `User-Agent` 归属](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md)。

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Public home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

## `TokenUsage`

逐调用 token 记账。各计数**互不重叠**：`inputTokens` 只包含未缓存输入；缓存输入单独报告，计费输入是三者之和。若提供方把缓存命中折入单一提示词总数（如 DeepSeek 的 `prompt_tokens`），适配器会再将其扣除。`reasoningTokens` 存在时只是信息性细节，已经包含在 `outputTokens` 中；汇总时不得重复相加。

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

## `BlockAssembler`

`BlockAssembler`（[`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)）是唯一的共享实现，负责把 `StreamChunk` 流折叠回 `ContentBlock`、usage、结束原因与回放状态。循环在记录原始分片的同时，把同一批分片送入 assembler，再将组装后的 assistant 内容连同其提供方/模型 provenance 一起存储。需要组装结果、又不想重新实现 fold 的消费方使用它。

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /** Adapter-private replay state from the terminal finish chunk, if any. */
  get replayState(): unknown;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'dsh-llm/assembler' }): Message;
}
```

## seam

`LlmAdapter` 是提供方 seam：创建子类、实现 `stream()`，再用 `ctx.llm.registerAdapter(providers, adapter)` 注册一个适配器实例。`GenerateOptions.provider` 选择已注册适配器；`GenerateOptions.model` 会传给该适配器，无需在生命周期启动时注册。重复提供方路由会原子失败。可选的 `providerRetryPolicy()` 会按路由捕获并填入 normal 默认值，`providerInfo()` 与异步 `listModels()` 方法则为 `LlmService.listProviders()` / `listModels()` 提供分离的 selector 元数据。该目录仅供参考，不是请求白名单：适配器仍是权威，并可接受未列出的模型 id。单次异步 `resolveModel()` 查询返回确切模型身份，以及可选的对正确性敏感的上下文容量、适配器配置的 `defaultMaxTokens`、由模型持有的有序推理强度 ID 和部署默认值；字段缺失表示元数据不可用或保留提供方持有的行为，而不表示目录成员关系无效。解析器会接收可选的取消信号，并且必须在信号中止后迅速完成结算。`LlmService.resolveModelInfo()` 会校验聚合结果并返回分离值。在最终适配器边界，`resolveCallConfig()` 仅在 `maxTokens` 缺失时填入输出默认值，并校验和填入推理强度，因此直接调用也无法绕过任何一项已配置行为；直接分派会在等待解析前捕获一项适配器注册。agent loop 则使用 `prepareCall()`，使模型解析、请求头持久记录和分派全程使用同一项注册，保留来自同一次查询的分离上下文元数据，并报告适配器填入的配置字段。适配器查找发生在 `llm/stream` waterfall（瀑布式事件）的终端 continuation，因此 listener 可以在查找前短路调用，或路由一个可变的一次性请求。AgentLoop 在外层 waterfall 返回流句柄时观察到一次请求尝试；这个有限边界不能证明惰性终端适配器已构造完成或开始提供方 I/O。`block-start` / `block-end` 的 `index` 关联与 assembler 共同意味着适配器只需 emit 格式正确的分片——块重组不是每个适配器各自的问题。消费方 surface（`ctx.llm.stream()`）与 `llm/stream` waterfall 见 [architecture.md § 内容块与流式传输](../architecture.md#content-blocks-and-streaming-dsh-llm)。

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove that at the wire or library header-hook boundary. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters intentionally exercise this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType`（`index` 关联块所携带的键集合）派生自 `ContentBlockMap`：

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

块接口详见 [core.md § Content blocks and messages](core.md#content-blocks-and-messages)。
