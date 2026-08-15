# Human Commands

English | [中文](commands.zh.md)

The human-command seam of [`dsh-commands`](../../packages/ui/commands). Interactive adapters use it to discover and directly execute plugin-owned commands for an exact agent without creating a model message. The [command Agent Note](../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md) owns dispatch and lifecycle rationale; the [package README](../../packages/ui/commands/README.md) owns composition and limitations.

Source: [`packages/ui/commands/src/index.ts`](../../packages/ui/commands/src/index.ts)

## Input metadata

The seam exposes one optional unstructured-input hint. Command availability follows plugin composition: every adapter consuming the registry sees every effective definition.

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
}
```

## Definition

`CommandDefinition` is the plugin-authored registration. The registry validates and freezes a detached effective definition.

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

## Invocation and result

The adapter owns cancellation and passes the exact target agent. `rawInput` begins immediately after the parsed name and retains the adapter-delivered separator and suffix. Results are direct UI outcomes, not tool results or session events.

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

`sourceEventSeq` is optional and success-only. When present, it names an earlier non-command event in the receiving session log; `command/done` persists the same reference so a client can combine the command lifecycle with that domain projection without parsing `text` or relying on adjacent rows.

## Discovery and parsing views

Adapters receive handler-free immutable descriptors after scope resolution. `parseCommand()` returns `ParsedCommand` before registry resolution; syntax-valid input can still name an unavailable command.

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
