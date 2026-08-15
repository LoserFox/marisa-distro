# context/ — 请求上下文扩展

[English](README.md) | 中文

在不定义工具的情况下添加面向模型请求上下文的产品插件。`workspace-context` 包含在默认 `dsh-agent-spine-demo` 组合包中，可通过组合包配置禁用；`time-context`、`tmux-context` 和 `session-reference` 需主动启用。

| 包 | 职责 | ctx key |
|---|---|---|
| [`session-reference/`](session-reference/README.md) | 其他会话的有界快照 | `ctx.sessionReferences` |
| [`time-context/`](time-context/README.md) | 当前时间与耗时上下文 | — |
| [`tmux-context/`](tmux-context/README.md) | tmux 位置上下文 | — |
| [`workspace-context/`](workspace-context/README.md) | workspace 指令上下文 | — |

[`workspace-context` 决策记录](../../.agents/notes/implemented/feature/2026-06-24-workspace-context.md)解释其逐 agent（智能体）／会话隔离和生命周期拆分。
