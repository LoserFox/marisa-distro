# session-persistence/：持久化能力家族

[English](README.md) | 中文

本家族定义持久会话数据的持久化机制、语义检查点策略以及随产品交付的存储后端。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`session-persistence/`](session-persistence/README.md) | 定义持久化服务和共享写入协调机制 | `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.md) | 应用语义持久性检查点 | 包装 `ctx.llm` 和 `ctx.tools` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.md) | 将会话持久化到 JSONL 文件 | 注册到 `ctx.sessionPersistence` |
| [`session-persistence-sqlite/`](session-persistence-sqlite/README.md) | 将会话持久化到 SQLite | 注册到 `ctx.sessionPersistence` |

[会话持久化决策](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md)记录了该家族的设计。
