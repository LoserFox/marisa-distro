# ui/：面向用户和 SDK 客户端的集成接口

[English](README.md) | 中文

面向用户的通道和进程外 SDK 服务器。这些是**产品**包：由用户或 SDK 客户端直接操作的真实接口。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`commands/`](commands/README.md) | 为交互式适配器注册并分派用户命令。 | `ctx.commands` |
| [`user-approval/`](user-approval/README.md) | 协调一次性审批决策。 | `ctx.approval` |
| [`permission/`](permission/README.md) | 呈现并持久化面向用户的权限预设。 | `ctx.permission` |
| [`user-interaction/`](user-interaction/README.md) | 定义与提供方无关的用户问答 seam。 | `ctx.userInteraction` |
| [`tool-ask-user/`](tool-ask-user/README.md) | 向模型公开用户问题。 | （注册到 `ctx.tools`） |
| [`jsonrpc/`](jsonrpc/README.md) | 通过 stdio JSON-RPC 为进程外 SDK 客户端提供服务。 | （驱动 `ctx.agents`） |
| [`app-boot/`](app-boot/README.md) | 为应用启动器提供共享启动支持。 | （供各 bin 使用的库） |

这些包通过现有的 agent（智能体）和会话契约集成，而不改变循环。交互式应用提供具体的命令、审批和提问适配器；自动化使用 [`acp/`](../acp/README.md)，可运行的演示组合包位于 [`examples/`](../examples/README.md)。产品 [`dsh`](../../apps/cli/README.md) CLI（命令行界面）直接组合这些包。
