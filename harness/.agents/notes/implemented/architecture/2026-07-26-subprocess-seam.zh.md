# Agent Note: 子进程服务是 bash 执行器之下的独立 seam（`dsh-subprocess` / `dsh-subprocess-local`）

Status: implemented

[English](2026-07-26-subprocess-seam.md) | 中文

## 问题

`dsh-bash-local` 原先把两项因不同原因而变化的能力捆绑在一起：*运行一条 bash 命令*（命令默认值补全、超时分类、对模型友好的终端环境、bash 工具所渲染的 stdout/stderr 合并）与*运行并管理一个子进程*（detached 进程组、附带 spill 文件的有界尾部保留输出、凭据清除与 `DSH_*` 合并次序、SIGTERM→宽限期→SIGKILL 升级、先终止再等待退出的 dispose（资源释放））。进程这一半（`run.ts`）约占整个包的一半，却没有属于自己的 seam：未来的非 shell 运行器（直接执行 argv 的执行器、worker supervisor）将不得不重新实现这套机制，或者探入 bash 内部；而共享的 `DSH_*`/`CollectedOutput` 词汇则存放在一个名字承诺 shell 语义的包里。这种捆绑还把后台进程的存续期系在执行器的 fiber 上：重载 bash 执行器会杀死每一个存活的后台进程。这一点不同于同级的[任务注册表](2026-07-26-task-registry-seam.md)：后者的注册存续期刻意长于生产方 fiber。

## 决策

新的 `subprocess/` 能力家族拥有「运行并管理一个进程」；bash 家族保留「运行一条 bash 命令」，并成为前者的消费方：

- **`@deepseek-ai/dsh-subprocess`（接口）**——拥有 `ctx.subprocess` 的抽象 `SubprocessService`（仅一个方法：`spawn(spec): SubprocessHandle`），以及共享词汇：完全显式的 `SubprocessSpawnSpec`（argv、cwd、按流划分的 stdio 处置方式（disposition）、宽限期，一律不设默认值；随部署变化的旋钮依照 `dsh-bash` 的 request/spec 模板与无隐藏默认值规则，留在调用方 seam 的配置里）、携带基于偏移量的非消费式读取器的 `SubprocessHandle`、刻意不含超时/取消分类的 `SubprocessOutcome`，以及共享的凭据清除与 `DSH_ENV_PREFIX`/`DshEnvironment`/`CollectedOutput` 类型。`argv` 绝不经过 shell 解释。（[消费方迁移 Agent Note](2026-07-26-subprocess-consumer-migration.md) 其后将 stdio 与终止词汇拓宽为 Node 形状。）
- **`@deepseek-ai/dsh-subprocess-local`（实现）**——`LocalSubprocessService`，构建在原 `run.ts` 管道（现为 `spawn.ts`）之上：detached 进程组、带私有有界 spill 文件的尾部保留截断、清除之后合并显式 env 的凭据清除、进程组 kill 升级，以及会终止每个仍在运行的受管进程并等待其退出的 dispose。该实现没有任何配置；每项限制都随 spec 到达。终端相关的 `ENV_OVERRIDES`（`TERM=dumb` 等）并未迁移：那是 bash 工具的呈现策略，留在 `dsh-bash-local` 里，经普通 env 通道合并。
- **`dsh-bash-local`（消费方）**——`inject: ['subprocess']`；把每个解析后的 `BashExecSpec` 映射为一个 `SubprocessSpawnSpec`（`['bash', '-c', command]`），并保留自身配置、`resolve()` 默认值补全、基于融合 deadline 的 `timedOut`/`aborted` 分类、带 `[stderr]` 标记的后台读取合并及其消费游标，以及 `onProcessDone` 子类钩子。`dsh-bash-sandbox` 除了重新声明继承来的 inject 之外没有变化；它仍在命令字符串层面做包装，并重新进入继承的 spawn 路径。
- **`dsh-bash`（seam）**——把迁走的词汇从 `dsh-subprocess` 重导出，因此没有任何 bash 消费方需要改动导入；`BashExecRequest`/`BashExecSpec`/`BashProcess` 与沙箱事实仍归 bash 所有。

如今，每个加载 bash 执行器的组合都同时加载 `@deepseek-ai/dsh-subprocess-local`：CLI（命令行界面）、各示例、Python 捆绑运行时、create-sdk 的 bash 功能资源，以及各内联测试配置。

后台进程的存续期从执行器移到了子进程服务：执行器不再保有存活进程集合，于是重载执行器后，后台工作会继续运行且仍可读取，而组合拆除（服务的 dispose）仍是先终止再等待退出的边界。一条行为 seam 随之挪动：后台 spawn 失败不再能在管道内部被缓冲成伪造的 stderr（对一个从未真正运行的进程，服务会 reject `done`，且不缓冲任何内容），因此执行器把 `spawn failed: …` 提示注入恰好一个 `readOutput()` 增量。

## 曾考虑的替代方案

**把进程管道留在 `dsh-bash-local` 里（维持现状）。**否决的理由与[任务注册表拆分](2026-07-26-task-registry-seam.md)得以落地的理由相同：这条边界既稳定，也早已记录在代码里（`run.ts` 的模块文档曾写明「this layer reacts to an abort signal; the executor owns deadlines and classifies causes」），而若继续将它保持私有，未来每个非 shell 运行器就只能要么 fork 这套机制，要么为非 bash 工作去依赖一个以 bash 命名的包。这组堆叠变更对用户可见的动因正是这一拆分。

**在同一变更中把仓库其余 spawn 调用点（lsp-local、pty-local、subagent-subprocess、sdk package-manager、test-support 各启动器）迁到 `ctx.subprocess` 上。**在本 PR（Pull Request）的规模下，作为带有真实设计风险的范围蔓延否决。这些调用点在流与生命周期上的需求存在实质差异：node-pty 所有权（pty）、长生命周期 stdio 上的 LSP 分帧加进程树终止回退（lsp）、以 stdin EOF 打头的 dispose 阶梯和完全不缓冲输出（subagent 传输层）。把它们强行纳入一个按有界批量输出塑形的句柄之下，要么会让这道 seam 膨胀，要么会让句柄与消费方错配。依照「接口围绕当前消费方塑形」的规则，该 seam 当时在其唯一真实的消费方家族上得到验证后交付。评审随后恰恰要求以堆叠 PR 的形式完成这项后续工作；[消费方迁移 Agent Note](2026-07-26-subprocess-consumer-migration.md) 记录了向 Node 形状的重塑，以及哪些调用点迁入（哪些因所有权归属而留在原地）。

**改把 `run_in_background`/任务语义放进进程 seam。**否决：那条边界已经存在。`ctx.tasks` 拥有 id、所有权与通知，bash 工具则把 `BashProcess` 适配成任务钩子。进程 seam 位于 bash 执行器*之下*，而不是与任务注册表并列。

**把 `ENV_OVERRIDES`（TERM=dumb、PAGER=cat 等）移入子进程服务。**否决：通用子进程服务不得把终端呈现策略强加给非终端消费方；对环境中凭据形态名称与 `DSH_*` 名称的清除是安全与身份不变式，予以保留，但终端友好性是 bash 工具自己的选择，经 spec 的显式 env 表达，而调用方自己的条目依旧优先。

## 后果

换来的是：「运行并管理一个进程」成为一项具备标准三包形态的可替换能力（消费方起步就有两个：`bash-local`、`bash-sandbox`）；容器化或远程进程后端可以直接接入，而不触碰 bash 语义；共享的 `DSH_*`/输出词汇有了一个不带 shell 含义的归属；后台进程也能在执行器重载后存活，与任务注册表的存续期模型一致。spawn 管道测试套件整体迁至 `dsh-subprocess-local`（现以 argv 为基础，外加 argv 校验与服务生命周期/dispose 套件）；执行器测试套件如今以真实服务为基准，固定 bash 自有的各层行为（分类、合并、spawn 失败提示、归服务所有的存续期）。

代价是：多出一对包，而且凡加载 bash 执行器之处都多一行组合配置。若某次启动加载了执行器却没有加载子进程服务，`ctx.bash` 会因等待 `ctx.subprocess` 而保持挂起（标准的服务缺失行为）。迁移词汇的重导出让 `dsh-bash` 的导入继续可用，但也意味着两个包如今命名同一批类型；进程 seam 是所有者，bash seam 则记录这层重导出。spawn 失败提示经由读取路径变为单次交付，而旧管道曾把它保留在 stderr 缓冲区里，供重复的 `readFrom(0)` 读取；这一点可以接受，因为 bash 的后台读取路径本就是消费游标，该提示能到达唯一存在的那个读取方。
