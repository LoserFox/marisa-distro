# Agent Note: `dsh run` 负责一次性 headless 执行

Status: implemented

[English](2026-08-08-dsh-run-headless-command.md) | 中文

## 问题

产品启动器过去把可选任务文本挂在通用 profile 启动命令上：`dsh --profile headless "task"`。于是，同一种 argv 形态会表示常驻 profile 或一次性运行，具体含义取决于组合完成后才发现的配置行。解析器的 `ProfileInvocation` 携带可选任务状态，帮助信息把 profile 的实现细节呈现为用户命令，自定义 profile 也只能通过同一个过载的根命令接收任务。

解析器中已经没有原来的 `dsh -p` 写法，因此恢复该写法或加入特殊检测，会给预发布接口增加兼容机制。另一个应用文件提案也使用 `run` 动词，使同一个顶层命令同时归属两个互不兼容的功能。

## 决策

一次性执行采用明确语法：

```text
dsh run [--profile <name>] [--patch <path>...] <task...>
```

`--profile` 默认为 `headless`，同时保留对自定义一次性组合的支持。`--patch` 可重复使用，并沿用既有 overlay 层的位置。Commander 用空格拼接可变数量的任务参数，并在启动前拒绝缺失或空白任务。

[profile 插件组合包决策](../architecture/2026-08-05-profile-plugin-bundles.md)负责该语法所选择的组合。

`RunInvocation` 是单独的 `DshInvocation` 成员。通用 profile 调用不再携带任务文本，其根命令也不接受位置参数。两条分派路径都调用已有的深层 `runProfile` 模块：`profile` 省略 `task`，`run` 则提供该字段。实现中没有只负责转发的浅层 `run.ts` 模块，也没有面向旧写法的别名、警告或自定义检测器；旧写法会按普通 Commander 语法失败。缺少 `headless-runner` 的一次性 profile 仍会触发既有的组合行检查；如果启动的 profile 包含该行却未提供任务，错误会指向 `dsh run --profile <name> "<task>"`。

`run` 动词只负责一次性任务执行。应用文件启动必须选择其他命令名；如果让两个顶层含义由位置参数形态决定，就会重新引入本命令消除的歧义。

运行器面向用户的契约保持不变：创建新的持久化会话，在 stderr 打印浏览器观察 URL，在 stdout 打印最终 assistant 文本，将完成／未完成映射为退出状态，并执行有界的信号关闭。产品级无密钥验收用例发现，进程内 mux 消费方可能落后于同进程的 `agent/status: idle` 通知，在读到最终帧之前就生成输出。idle 通知现在会捕获权威的会话最终事件序号，运行器则等待有序 mux 到达该边界（或流结束），再生成文本和退出原因。这一机制在不增加 wire 字段或定时延迟的前提下，落实了既有的 idle-to-idle 契约。

## 考虑过的替代方案

- **把任务文本保留在 `dsh --profile` 上。** 不予采纳：profile 启动和一次性执行仍共用同一套语法，其含义取决于较晚发生的组合检查。
- **保留 `dsh -p` 或位置参数 profile 形式作为别名。** 不予采纳：根据预发布立场，这些兼容分支会比本应退役的接口存续更久。
- **要求在 `run` 下必须指定 `--profile headless`。** 不予采纳：已交付的一次性接口应采用最短的规范写法，同时用可选的 `--profile` 保留插件定义的一次性组合。
- **把 `dsh run` 交给应用文件启动，并为 headless 选择另一个动词。** 不予采纳：`run` 描述的是通过 harness 执行任务；若归应用文件所有，产品的主要一次性命令会更不直接，并与自定义一次性 profile 冲突。
- **新增 `apps/cli/src/run.ts`。** 不予采纳：它只会转发到 `runProfile`，拆分命令归属，却没有隐藏任何复杂度。

## 后果

这是一次有意为之的 CLI（命令行界面）破坏性变更。文档、帮助信息、解析器测试、构建后二进制验收、PTY 关闭覆盖和组装应用的无密钥快照都使用 `dsh run`。现有自定义一次性 profile 可继续通过 `--profile` 工作；常驻 profile 和配置 dump 保留既有的根命令语法。与之竞争的应用文件命令必须单独改名并 rebase，不得共享或重载 `run`。
