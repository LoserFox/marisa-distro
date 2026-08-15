# 用户命令

[English](commands.md) | 中文

[`dsh-commands`](../../packages/ui/commands) 的用户命令 seam。交互式适配器用它发现插件拥有的命令，并针对确切的 agent（智能体）直接执行这些命令，而不创建模型消息。[命令 Agent Note](../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md) 负责分发与生命周期的决策依据；[包 README](../../packages/ui/commands/README.md) 负责组合方式与限制。

来源：[`packages/ui/commands/src/index.ts`](../../packages/ui/commands/src/index.ts)

## 输入元数据

该 seam 公开一个可选的非结构化输入提示。命令的可用性由插件组合决定：每个消费注册表的适配器都会看到全部生效定义。

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
}
```

## 定义

`CommandDefinition` 是由插件编写的注册定义。注册表会验证并冻结一份与原始注册对象脱离的生效定义。

```ts type-equiv
/** Plugin-owned command registration. */
interface CommandDefinition {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
  /**
   * Whether `command/run` records `rawInput`. Defaults to true. A command
   * whose domain event owns the payload sets this false to avoid duplicating
   * that payload in the session log.
   */
  readonly recordInput?: boolean
  /** Execute against the receiving agent without sending the command to the model. */
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
}
```

## 调用与结果

取消由适配器负责，适配器会传入确切的目标 agent。`rawInput` 紧接在解析后的名称之后，并保留适配器传入的分隔符与后缀。结果会直接呈现给 UI，而不是工具结果或会话事件。

```ts type-equiv
/** Invocation passed to one registered command handler. */
interface CommandInvocation {
  /** Exact agent whose human-facing surface received the command. */
  readonly agent: Agent
  /** Exact text following the registered command name, including separator whitespace. */
  readonly rawInput: string
  /** Cancellation signal owned by the dispatching UI request. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Expected command outcome rendered directly by the dispatching UI. */
type CommandResult =
  | {
    readonly kind: 'success'
    readonly text?: string
    /** Earlier authoritative domain event that owns a richer presentation. */
    readonly sourceEventSeq?: number
  }
  | { readonly kind: 'error'; readonly text: string }
```

`sourceEventSeq` 是可选字段，且只用于成功结果。存在时，它指向接收会话日志中更早的一条非命令事件；`command/done` 会持久化同一引用，让客户端能够将命令生命周期与该领域投影合并，而无须解析 `text` 或依赖相邻行。

## 发现与解析视图

作用域解析后，适配器会获得不含处理器的不可变描述符。`parseCommand()` 在注册表解析前返回 `ParsedCommand`；语法有效的输入仍可能指向不可用的命令。

```ts type-equiv
/** Handler-free immutable command view returned to UI adapters. */
interface CommandDescriptor {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
}
```

```ts type-equiv
/** Syntactically valid slash command before registry resolution. */
interface ParsedCommand {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Exact text following the command name. */
  readonly rawInput: string
}
```
