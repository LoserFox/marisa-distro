# Agent Note: 子进程 seam 转向 Node 形状，所有具备条件的 spawn 调用点一并迁入

Status: implemented

[English](2026-07-26-subprocess-consumer-migration.md) | 中文

## 问题

[子进程 seam](2026-07-26-subprocess-seam.md) 交付时恰好只为一个消费方家族塑形：批量收集的 stdout/stderr、批量 stdin、单一的升级式 `kill()`。那是有意的范围控制，其自身的 Agent Note 也把「迁移其余 spawn 调用点」记为暂缓否决项。引入该 seam 的 PR（Pull Request）上的评审推翻了这一暂缓决定：堆叠其上的后续变更应当把接口向 Node 的 API 方向重塑，并把其余运行进程之处迁到该服务上。其余各 spawn 调用点此前各自持有同一套机制中某个切片的私有副本——lsp-local 自带 detached 进程树信号发送（POSIX 进程组 + Windows taskkill + 存活轮询），subagent-subprocess 自带 dispose（资源释放）阶梯和自己的凭据清除，mcp-client、pty-local、SDK helper 与 TUI Git 探测则各自持有另一份凭据清除——而这一切既不可替换，也无法集中测试。

## 决策

这道 seam 的词汇如今已是 Node 形状，凡能接入该服务的 spawn 调用点均已迁入：

- **按流划分的 stdio 处置方式（disposition）**，位于 `SubprocessSpawnSpec` 上：`'pipe'`（原始的 `Readable`/`Writable`，供消费方自有的协议分帧使用）、`'inherit'`（诊断输出直通父进程的流），以及收集模式（collect）`{ maxBytes, spill? }`——即最初的有界尾部保留形状，只是 spill 文件改为可选，使诊断尾部（例如语言服务器的 stderr）无需落盘即可缓冲。stdin 则为 `'ignore'`、`'pipe'` 或 `{ data }`（写完即关闭的批量形式）。
- **`SubprocessOutcome` 只承载退出事实**（Node close 事件的词汇）；收集到的输出在结算后仍可经 `handle.collected` 读取（spill 文件描述符在结算边界封存），因此批量与流式调用方共用一条访问路径，也没有任何内容被复制进这份结果。
- **以进程树为范围的终止，集中在一个动词后面**：`terminate()` 拥有 SIGTERM→宽限期→SIGKILL 升级（也承接 spec 的 abort 信号，进程树消亡后为空操作）——句柄不暴露单信号的 `kill(signal?)`，因此消费方无法跳过宽限窗口；`waitForExit()` 轮询进程树存活状态（POSIX 进程组探测；Windows 上以直接子进程为界）。Windows 进程树终止（`taskkill /T`，可注入）自 lsp-local 迁入，因此每个消费方拿到的进程树语义在各平台上都正确。（最初从 `subagent-subprocess` 吸收的以 stdin EOF 打头的 dispose 阶梯，后来又移回其唯一消费方——见[阶梯归属 Agent Note](2026-07-27-dispose-ladder-to-consumer.md)。）
- **凭据清除只有一份定义**：`scrubbedParentEnv()`/`SENSITIVE_ENV_PATTERN` 定义在 seam 上，且凭据形状的名称不区分大小写地包含 `KEY`、`PASSWORD`、`SECRET` 或 `TOKEN`。无法把 spawn 本身路由到该服务的调用点——pty-local（node-pty 拥有 fork）、mcp-client（MCP SDK 拥有传输层的 spawn）与 TUI 的同步 Git 分支探测——改为导入该函数，因此即便进程所有权无法统一，环境策略仍是单一来源。SDK helper 的 `scrubEnvironment()` 默认委托给该函数，并在调用方显式传入环境时应用导出的正则；该正则因此生产消费方而保持公开。

各项迁移随这次重塑一并落地：**bash-local/bash-sandbox**（收集模式 + 批量 stdin；bash 的 `kill()` 映射到 `terminate()`，因此 `task_kill` 保有升级语义），**lsp-local**（管道化的协议流 + 无 spill 的 stderr 收集尾部；`LspConnection` 改为接收 seam 的 spawn 函数；其私有的进程树操作辅助函数已删除），**subagent-acp**（管道化的 ndjson 流 + inherit 的 stderr；spawn 失败经 `done` 的 reject 汇入同一个启动竞态；dispose 是后端自有的 `disposeAcpChild` 阶梯，经由 seam 的动词运行，携带插件所配置的宽限期）。**`dsh-subagent-subprocess` 已删除**——dispose 阶梯与凭据清除归 seam 所有；无人使用的隔离配置目录辅助函数随之消亡（其消费方本就不存在）。

挂载 lsp-local 或 subagent-acp 的组合如今都加载 `dsh-subprocess-local`（这两个插件注入 `'subprocess'`）；acp/lsp 测试 fixture（测试前置数据）补上了这一行组合配置。

## 曾考虑的替代方案

**保持只支持批量的 seam，让流式消费方继续各自为政。**这正是引入该 seam 的 Agent Note 当初的立场，评审将其否决：这样会留下三份进程树信号发送的私有副本和六份凭据清除的私有副本，而未来任何运行器（容器化执行器、远程进程宿主）都得挑选去 fork 哪一份私有副本。Node 形状的处置方式覆盖已观察到的全部三种流形状，既不拓宽结果类型，也不缓冲管道化的流。

**用单个 `stdio: 'pipe' | 'inherit' | 'collect'` 模式一次性统辖全部三条流。**否决：真实消费方按流混用模式（lsp：pipe/pipe/collect；acp：pipe/pipe/inherit；bash：data/collect/collect）。按流划分的处置方式恰好就是 Node 的形状，也免去了混用场景的第二个 spawn 调用。

**把 pty-local 与 mcp-client 的 spawn 也一并迁移。**基于所有权而非范围否决：node-pty 的 `fork()` 自行分配终端，MCP SDK 的 `StdioClientTransport` 在内部完成 spawn——这两处调用点都不归我们路由。它们采纳共享的凭据清除（那正是属于策略的部分），并在各自的 README 中说明 spawn 为何留在原地。

**迁移 test-support 启动器（acp-snapshot、loader-smoke）、SDK package-manager 运行器与 TUI Git 探测。**否决：support 各包是刻意保持轻依赖的测试基础设施，不得依赖产品 seam；SDK 向导那套附带重定向的 `stdio: 'inherit'` 语义，加上其完全脱离组合的生命周期（根本没有 cordis 上下文），使该服务并不合用；TUI 探测则是同步调用。这些生产调用点改为共享凭据清除。

## 后果

换来的是：进程树信号发送、升级、有界收集与凭据清除各自只剩一份实现，且只在 `dsh-subprocess-local` 的测试套件中测试一次（其中包括 lsp-local 的私有副本从未有过的、以注入平台方式实现的 Windows 覆盖）；lsp-local 与 subagent-acp 卸下了自己的进程管道，其子进程如今像 bash 的一样，在插件重载后存活、随组合拆除而终止；一个完整的包（`dsh-subagent-subprocess`）就此消失。seam README 中「只有一个消费方家族」的限制说明也随之退役。

代价是：这道 seam 变宽了（stdio 模式从一种变为三种、生命周期接口面从一个动词扩展为 terminate/waitForExit/dispose 这一组），未来的后端因此要实现更宽的接口面；lsp-local/subagent-acp 的各组合如今都多出 subprocess 这一行组合配置；`SubprocessOutcome` 也不再承载输出，这是仍未发布的堆叠变更内部的一次破坏性形状变更（依照预发布立场，PR2 那一层被就地更新，而非加 shim）。pty-local/mcp-client/SDK/TUI/test-support 的 spawn 因所有权归属或执行形状留在该服务之外，以凭据清除作为共底线，且为显式环境的生产消费方有意保持该正则导出。
