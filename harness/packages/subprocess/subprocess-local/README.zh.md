# @deepseek-ai/dsh-subprocess-local

[English](README.md) | 中文

[`@deepseek-ai/dsh-subprocess`](../subprocess/README.md) seam 的本地实现：`LocalSubprocessService` 将每个 spec 的 argv spawn 为 detached 进程树，依照 spec 中按流划分的 stdio 处置方式（disposition）完成接线（原始管道、inherit、附带可选 spill 文件的有界尾部保留收集），并以进程树为范围发送信号，按 SIGTERM→SIGKILL 逐级升级。该实现没有任何配置：每项处置方式、限制与目录都随 spawn spec 传入，因此随部署变化的可调参数留在各调用方 seam 的配置里（[`dsh-bash-local`](../../bash/bash-local/README.md)、[`dsh-lsp-local`](../../lsp/lsp-local/README.md)、[`dsh-subagent-acp`](../../subagent/subagent-acp/README.md)）。

## 行为（以及设计来源）

- **以适合平台的方式发送信号的 detached 进程树**：POSIX 子进程使用 `detached` spawn（拥有独立进程组），信号以负 pgid 发送并以直接子进程作为回退；Windows 通过 `taskkill /PID <pid> /T /F` 终止进程树。`terminate()`（句柄唯一的终止操作）先发送 SIGTERM，经过 spec 的宽限期后再发送 SIGKILL（沿用 OpenCode 的升级策略；流水线与子 shell 会随父进程一起结束），进程树消亡后为空操作；`waitForExit()` 轮询整棵进程树的存活状态，使消费方的拆卸能确认真正的完全停稳。组长进程退出后，仍然打开的管道也只获得同样有界的排空宽限期，因此存活的后代进程无法无限期地拖住结果不结算。系统会容忍 ESRCH；重新指定父进程并脱离该组的 daemon 仍可能存活，这与所调研工具的局限相同。
- **按流划分的处置方式**：`'pipe'` 把原始流原样交给调用方（协议分帧仍归消费方所有）；`'inherit'` 直通父进程的描述符；收集模式（collect）在输出超过上限后于内存中保留尾部（错误与结果通常聚集在末尾，沿用 pi/OpenCode 的理由），并在配置了 spill 上限时把完整流追加到一个私有临时文件；省略 `spill` 则只保留用于诊断的尾部。某条流大于 spill 上限时，会丢弃已不完整的 spill，仅返回带截断标记的尾部；spill 文件描述符在结算时封存，最终关闭失败时则不公布路径，以免声称存在不完整的文件。spill 文件权限为 `0600`、名称随机，位于按需创建、权限为 `0700` 的每进程目录之下。
- **凭据清除 + 显式合并**：以 `process.env` 为基础，移除形似凭据的变量（`*KEY*`／`*PASSWORD*`／`*SECRET*`／`*TOKEN*`）和所有环境中已有的 `DSH_*` 名称；spec 的显式 `env` 在该清除之后合并且不做命名空间校验，因此有意提供的凭据或当前 `DSH_*` 事实会胜出，而陈旧的嵌套 harness 身份无法从环境中隐式漏入。提供的 stdin 会被写入后关闭；否则 fd 0 指向 `/dev/null`。参见 [stdin/env Agent Note](../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-surface.md)与[受管环境 Agent Note](../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md)。
- **基于偏移量的读取**：收集模式的读取器按完整流的字节坐标返回增量；服务自身从不持有游标，因此消费方自有的游标（bash 的后台读取路径）与完整流重读可以共存，结算前后皆然。
- **先终止再等待退出的 dispose（资源释放）**：服务保留存活句柄，只为让自身的 dispose 能对每个仍在运行的进程树执行升级并等待其退出；已结算与 spawn 失败的句柄在结算时即离开存活集合。

## 模型体验

通过消费方 seam 间接影响（目前是 `dsh-tool-bash` 背后的 bash 执行器家族）；进程输出与生命周期面向模型的全部渲染归消费方所有。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与暂缓事项

- **Windows 进程树支持仅为尽力而为**：终止经由 `taskkill /PID <pid> /T /F` 完成，所有结果都被就地吸收，不向外抛出（进程树已不存在、竞态、二进制缺失），存活探测则回退到直接子进程边界。
- **凭据清除依赖名称启发式规则**：只匹配 `*KEY*`／`*PASSWORD*`／`*SECRET*`／`*TOKEN*`；名称不同的 secret（例如 `*PASSPHRASE*`）会继续传递，对误删变量引入白名单属于已记录的后续工作。
- **不会删除已完成的 spill 文件**：有界的完整输出恢复文件（以及每个进程的私有 spill 目录）会在 OS tmpdir 下累积，直到外部机制进行清理；超大的不完整 spill 会被丢弃并立即尝试删除，但清理失败可能留下一个有界文件。

原始进程处理位于 `src/spawn.ts`；`src/index.ts` 负责服务接线。
