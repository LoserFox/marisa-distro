# SDK 包

[English](README.md) | 中文

本分组包含 Harness 项目的开发者工具，以及从另一个进程驱动 Harness 运行时的客户端栈。

| 包 | 职责 |
|---|---|
| [`helper/`](helper/README.md) | 提供共享的项目编辑领域 |
| [`scripts/`](scripts/README.md) | 提供 `dsh-sdk` 项目命令 |
| [`create-sdk/`](create-sdk/README.md) | 创建新的 SDK 项目 |
| [`sdk-protocol/`](sdk-protocol/README.md) | 定义 SDK 运行时协议格式 |
| [`sdk-client/`](sdk-client/README.md) | 通过 TypeScript 客户端 API 驱动 Harness 运行时 |
| [`telemetry/`](telemetry/README.md) | 提供启动器遥测、同意和脱敏原语 |

`@deepseek-ai/create-sdk` 遵循 npm 的 scoped initializer 命名约定；其他包遵循仓库的 `@deepseek-ai/dsh-*` 约定。参见[开发者项目工作流](../../.agents/notes/proposed/feature/2026-07-14-sdk-developer-projects.md)、[项目编辑架构](../../.agents/notes/proposed/architecture/2026-07-15-sdk-project-editing-architecture.md)和 [TypeScript SDK 设计](../../.agents/notes/implemented/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md)。
