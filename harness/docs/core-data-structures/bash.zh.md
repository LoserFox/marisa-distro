# Bash 执行器

[English](bash.md) | 中文

bash 执行 seam 分为接口（[dsh-bash](../../packages/bash/bash)，`ctx.bash`）、实现（[dsh-bash-local](../../packages/bash/bash-local) 与 [dsh-bash-sandbox](../../packages/bash/bash-sandbox)）和消费方（[dsh-tool-bash](../../packages/bash/tool-bash)，即 `bash` schema）。通用后台任务的 task id、所有权与控制位于 [tasks.md](tasks.md)；本 seam 返回一个不含任务概念的进程句柄。原始进程组机制位于[进程管理器 seam](subprocess.md)之后。

源码：[`packages/bash/bash/src/types.ts`](../../packages/bash/bash/src/types.ts)

## 受管 shell 环境命名空间

`DSH_*` 变量是归 Harness 所有的子进程事实。面向模型的 bash 工具通过 `ctx.bashEnv` 收集它们，再经由 `BashExecRequest.dshEnv` 传递；进程管理器在合并当前快照之前会移除继承而来的 `DSH_*` 名称。`DshEnvironmentKey`／`DshEnvironment` 词汇归[进程管理器 seam](subprocess.md)所有，由 `dsh-bash` 重导出。

## 请求与规格：`resolve()` 拆分

该 seam 将**面向模型/插件的请求**（`workdir`/`timeoutMs`/`stdoutMaxBytes` 可选，由配置或请求策略补全）与执行器实际使用的**完全解析后的 spec**（这些字段均为必填）分开。工具层在二者之间调用 `ctx.bash.resolve(request)`——这具体落实了仓库的「包 seam 上显式优于隐式」规则：`BashExecSpec` 的读者不必猜测工作目录或输出预算来自何处。

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link BashExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link BashExecSpec}.
 */
interface BashExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link BashExecutor.resolve} fills and caps the
 * required fields; {@link BashExecutor.start} ignores `timeoutMs` because
 * background processes have no executor timeout.
 */
interface BashExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /**
   * Resolved foreground stdout capture budget in bytes. `run()` uses it for
   * stdout; background tasks and stderr keep the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link BashExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` 和 `env` 是受信任的进程内插件输入，不由 `dsh-tool-bash` 暴露。本地执行器会先清除环境中的凭据，再合并调用方显式提供的 env。见 [bash-stdin-env Agent Note](../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-surface.md)。

`stdoutMaxBytes` 同样仅供受信任插件使用。它让前台消费方能在有界解析预算内请求完整 stdout，而不会改变 stderr、后台任务或面向模型的 bash 工具的常规输出上限。

## 前台运行：`BashRunResult`

一次已完成（或被终止）的前台运行的结果。正交的结果**独立报告**：一个进程可以同时超时并以退出码 0 退出（因为它捕获了信号），因此 `timedOut`、`aborted`、`signal` 和 `exitCode` 各自独立为一个字段；调用方永远不会把一次被提前中断的运行误读为正常成功。

```ts type-equiv
/** The outcome of one completed (or killed) foreground run. */
interface BashRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: BashSandboxInfo
}
```

每个流是一个 `CollectedOutput`：（可能被截断的）文本加恢复信息；截断时，`text` 是**尾部**，完整流溢出到一个私有文件。该形状归[进程管理器 seam](subprocess.md)所有，由 `dsh-bash` 重导出。

## 文件沙箱：`BashSandboxInfo`

使用沙箱的执行器通过 `BashExecutor.sandboxMode` 暴露其已配置的模式回退值。工具层请求 [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.md)，把每个调用会话的持久 `sandbox/mode` 覆盖值与不可变 cwd 解析为 `BashExecRequest.sandboxPolicy`；经用户批准、严格更宽松的调用只替换模式。模式/root/enforcement 词汇归 [`@deepseek-ai/dsh-sandbox` 沙箱 seam](sandbox.md) 所有；模式仅管辖文件效果。

沙箱化运行会报告其模式、保守的拒绝分类与强制执行完整度。`runnerFailed` 标记命令运行前沙箱 runner 已失败；前台执行会抛出 `SANDBOX_UNAVAILABLE`，而已结束的后台进程只能通过其事实通道报告。

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface BashSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

最后一项补全了这套词汇：当受限模式没有可用后端时，`ctx.sandbox` 提供方会抛出、执行器会传播由[沙箱 seam](sandbox.md)所有的 `SANDBOX_UNAVAILABLE` 错误码。选定的 runner 拒绝其 profile 时会触达同一个故障关闭的前台错误；已结束的后台任务则记录 `runnerFailed`。模型会在结果中收到拒绝/runner 事实，仅当拒绝标记指出生效模式时才得知该模式，并可通过 `sandbox_permissions` 加 `justification` 请求一次性、严格更宽松的重试；执行任何操作前，`ctx.approval` 必须批准该次确切调用。完整的策略与切换设计见[沙箱 Agent Note](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md)。

## 后台进程：`BashProcess`

`start()` 返回不含 id 或所有者的句柄。`dsh-tool-bash` 将它适配为 `ctx.tasks.start()` 钩子；随后由通用运行时拥有任务标识与生命周期。`done` 在进程关闭时完成且绝不被拒绝；进程结束后仍可读取，并且沙箱事实会在 `done` 完成前写入。

```ts type-equiv
/**
 * A background process handle returned by {@link BashExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface BashProcess {
  /** Process lifecycle state (settled exactly once). */
  status: BashProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /** Resolves when the underlying process closes (never rejects — a spawn failure settles as `killed` with the error on stderr). */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: BashSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): BashProcessRead
  /**
   * Kill the process group. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` 返回增量内容与 spill 恢复信息：

```ts type-equiv
/** One incremental {@link BashProcess.readOutput} read. */
interface BashProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## 服务

`BashExecutor` 拥有 `resolve`、前台 `run`、后台进程 `start` 以及 `sandboxMode` 能力事实。`dsh-bash-local` 拥有命令默认值补全、超时/中止分类、终端环境以及后台读取合并；进程组、有界收集器、spill 文件、凭据清除与 dispose（资源释放）后完全停稳归[进程管理器](subprocess.md)所有。`dsh-tool-bash` 拥有面向模型的渲染，并将后台句柄适配到[通用任务运行时](tasks.md)。`dsh-bash` 拥有 shell 工具共享的退出状态契约：导出的 `parseExitStatus`/`ParsedExitStatus` 是 `dsh-tool-bash` 的 `renderResult` 与 `dsh-tool-pwsh` 的 `renderPwshResult` 所追加的 `[exit code: N]` / `[killed by signal: X]` 标记的逆解析，两个工具的 `presentResult` 都用它把渲染文本拆分为 terminal 卡的输出正文与退出状态 pill。
