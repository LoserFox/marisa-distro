# 持久 PTY 会话

[English](pty.md) | 中文

PTY 后端、`ctx.pty` 与面向模型的消费方共享的类型。[持久 PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md) 负责记录决策依据；本页记录来自 [`packages/pty/pty/src/types.ts`](../../packages/pty/pty/src/types.ts) 的跨包词汇。

## 标识与就绪

`PtySessionId` 是由服务铸造的品牌化 id。可选名称是拥有者本地的显示元数据；授权比较的是拥有该会话的确切 `Agent`，而不是名称或猜测的 id。

`PtyWaitReason` 说明一次发送为何返回。它与 `PtySessionStatus` 无关：一次发送可能因静默或超时而返回，但顶层 shell 仍然存活；`session_exit` 表示该 shell 已退出，而不是某个任意的前台子进程已退出。

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

## 后端与活跃会话

后端负责启动某种已注册类型的会话并检测其就绪状态。`PtyService` 只在初始化成功后才发布返回的会话，随后负责 id 授权与清理。无法清理部分启动资源时，后端会以 `PtyBackendCleanupError` 拒绝启动；这样，资源释放流程既能保留清理失败，也不会用它替换调用方的取消原因。后端会话拥有终端状态，并负责让已捕获的资源完全停稳。

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

## 发送与保留输出

一个活跃会话同时只接受一个活动发送。该操作向通用后台任务提供读取后即推进的输出游标，并向前台调用方提供最终结果。`PtyReadResult` 则为有界的会话 scrollback 单独分页。

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

## 归属与持久性

`PtyService` 会将一项等待完成的清理附加到确切的拥有者作用域，拒绝其他拥有者的操作，并让会话在后端或工具插件重载期间保持存活。PTY 状态与原始字节仍局限在进程内。模型输入与有界返回输出通过现有 `tool/call`、`tool/result` 和任务结果路径持久保存，而不是重复记录 PTY 会话事件。
