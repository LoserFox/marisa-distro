# Persistent PTY Sessions

English | [中文](pty.zh.md)

Types shared by PTY backends, `ctx.pty`, and the model-facing consumer. The [persistent PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md) owns the rationale; this page records the cross-package vocabulary from [`packages/pty/pty/src/types.ts`](../../packages/pty/pty/src/types.ts).

## Identity and readiness

`PtySessionId` is a service-minted branded id. Optional names are owner-local display metadata; authorization compares the exact owning `Agent`, not a name or guessed id.

`PtyWaitReason` says why one send returned. It is independent from `PtySessionStatus`: silence or timeout may return while the top-level shell remains alive, while `session_exit` means that shell exited rather than an arbitrary foreground child.

```ts type-equiv
/** Why one interactive send returned control to its caller. */
type PtyWaitReason = 'stdin_read' | 'inferred_idle' | 'timeout' | 'session_exit'
```

```ts type-equiv
/** Top-level PTY process status, independent of a send's wait reason. */
type PtySessionStatus =
  | { kind: 'running' }
  | { kind: 'exited'; exitCode: number | null; signal: NodeJS.Signals | null }
```

## Backend and live session

A backend owns how one registered type starts and detects readiness. `PtyService` publishes the returned session only after setup succeeds, then owns id authorization and cleanup. A backend that cannot clean partial startup resources rejects with `PtyBackendCleanupError`, allowing disposal to retain the cleanup failure without replacing the caller's cancellation reason. A backend session owns terminal state and captured-resource quiescence.

```ts type-equiv
/** Replaceable provider for one PTY session type. */
interface PtyBackend {
  /** Stable type selected by {@link PtySpawnRequest.type}. */
  readonly type: string
  /** Create an unpublished session or reject after cleaning partial resources; cleanup failure uses {@link PtyBackendCleanupError}. */
  spawn(spec: PtyBackendSpawnSpec): Promise<PtyBackendSession>
}
```

```ts type-equiv
/** Backend-owned live session retained by {@link PtyService}. */
interface PtyBackendSession {
  /** Initial bounded terminal output returned from `terminal_open`. */
  readonly motd: string
  /** Top-level process id when one exists. */
  readonly pid?: number
  /** Start one exclusive send operation. */
  startSend(request: PtySendRequest): PtySendOperation
  /** Read one bounded page from retained scrollback. */
  read(request: PtyReadRequest): PtyReadResult
  /** Signal the verified foreground process group. */
  signal(signal: PtySignal): Promise<PtySignalResult>
  /** Observe top-level process status. */
  status(): PtySessionStatus
  /** Idempotently close the captured owned process tree and await quiescence. */
  close(reason: string): Promise<void>
}
```

## Send and retained output

One live session accepts one active send. Its operation exposes a consuming output cursor for generic background tasks and one terminal result for a foreground caller. `PtyReadResult` separately pages the bounded session scrollback.

```ts type-equiv
/** Live backend-owned send; exactly one may be active per PTY session. */
interface PtySendOperation {
  /** Resolves after readiness, timeout, cancellation, or top-level process exit. */
  done: Promise<PtySendResult>
  /** Consume output produced since the prior call. */
  readOutput(): PtySendRead
  /** Request `SIGINT`; returns false after the operation settled. */
  cancel(): boolean
}
```

```ts type-equiv
/** Settled result for one foreground or background send. */
interface PtySendResult {
  /** Bounded rendered terminal delta remaining at settlement. */
  viewport: string
  /** Why the wait returned; this does not imply arbitrary child-process exit. */
  waitReason: PtyWaitReason
  /** Top-level session status observed at settlement. */
  sessionStatus: PtySessionStatus
  /** Whether output was dropped from the operation or retained scrollback. */
  truncated: boolean
}
```

## Ownership and durability

`PtyService` attaches one awaited cleanup to the exact owner scope, rejects foreign operations, and keeps sessions alive across backend or tool-plugin reload. PTY state and raw bytes remain process-local. Model input and bounded returned output are durable through the existing `tool/call`, `tool/result`, and task-result paths rather than duplicate PTY session events.
