# session-projection/：会话投影能力家族

[English](README.md) | 中文

本家族向客户端载体提供从日志派生的当前逐会话状态。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`session-projection/`](session-projection/README.md) | 定义并驱动会话投影单元 | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.md) | 持久化并恢复投影检查点 | `ctx.sessionProjectionCache` |
