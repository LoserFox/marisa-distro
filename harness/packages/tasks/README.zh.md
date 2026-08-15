# tasks/：后台任务能力家族

[English](README.md) | 中文

本家族为长时间运行的工具提供一套按所有者隔离的后台任务协议，用于观察、取消、等待和完成通知。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`tasks/`](tasks/README.md) | 定义任务注册表和生命周期契约 | `ctx.tasks` |
| [`tasks-local/`](tasks-local/README.md) | 实现进程本地任务注册表 | 注册到 `ctx.tasks` |
| [`tool-tasks/`](tool-tasks/README.md) | 向模型公开任务控制和完成通知 | 注册到 `ctx.tools` |

参见[后台任务运行时](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md)和[任务注册表](../../.agents/notes/implemented/architecture/2026-07-26-task-registry-seam.md)决策。
