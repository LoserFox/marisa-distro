# 会话引用

[English](session-reference.md) | 中文

结构化的跨会话引用请求与准备后的消息上下文。[包契约](../../packages/context/session-reference) 负责规范 URI、当前表层投影、标签安全的 JSON 与字节保留、稳定错误和不可信的模型提示词。宿主适配器使用这些类型，而不会把各自 UI 的提及语法传入 agent（智能体）核心。

来源：[`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## 输入与候选项

`SessionReferenceInput` 是与宿主无关的选择。id 具有权威性；label 是随快照携带的显示元数据。

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate` 是面向宿主的发现输出。存在最新会话标题时，它的 label 使用该标题；筛选仍只搜索 session id 和 cwd，绝不搜索 transcript（文本记录）。

```ts type-equiv
/** One host-facing candidate from exact session metadata. */
interface SessionReferenceCandidate {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Latest log-backed title, falling back to the opaque session id. */
  label: string
  /** Source session working directory, when recorded. */
  cwd?: string
  /** Source session creation time in Unix epoch milliseconds. */
  createdAt: number
}
```

## 准备后的消息

准备过程保留可读的当前消息内容，并最多返回一个聚合上下文。

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## 错误

`SessionReferenceError.code` 区分无效配置或输入、自引用、数量限制、源读取失败、预算失败和取消。宿主协议会把这些 code 映射到各自的错误封装，无需检查提示词字节。

```ts type-equiv
/** Stable failure codes exposed to host adapters. */
type SessionReferenceErrorCode =
  | 'SESSION_REFERENCE_INVALID_CONFIG'
  | 'SESSION_REFERENCE_INVALID_REFERENCE'
  | 'SESSION_REFERENCE_SELF_REFERENCE'
  | 'SESSION_REFERENCE_TOO_MANY'
  | 'SESSION_REFERENCE_READ_FAILED'
  | 'SESSION_REFERENCE_BUDGET_EXCEEDED'
  | 'SESSION_REFERENCE_CANCELLED'
```
