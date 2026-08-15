# Session References

English | [中文](session-reference.zh.md)

Structured cross-session reference requests and prepared message contexts. The [package contract](../../packages/context/session-reference) owns canonical URIs, current-surface projection, tag-safe JSON and byte retention, stable errors, and the untrusted model prompt. Host adapters use these types instead of passing their UI mention syntax into the agent core.

Source: [`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## Inputs and candidates

`SessionReferenceInput` is the host-independent selection. The id is authoritative; the label is display metadata carried into the snapshot.

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate` is host-facing discovery output. Its label uses the latest session title when present, while filtering still searches only session id and cwd and never transcript text.

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

## Prepared messages

Preparation preserves readable current-message content and returns at most one aggregated context.

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## Errors

`SessionReferenceError.code` separates invalid configuration or input, self-reference, count limits, source-read failure, budget failure, and cancellation. Host protocols map these codes to their own error envelopes without inspecting prompt bytes.

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
