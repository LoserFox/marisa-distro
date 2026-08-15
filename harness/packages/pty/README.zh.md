# pty/：持久 PTY 能力家族

[English](README.md) | 中文

本家族为交互式或有状态的终端工作提供持久且限定所有者范围的伪终端会话，是单次 bash 执行的补充。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`pty/`](pty/README.md) | 定义 PTY 服务和会话生命周期 | `ctx.pty` |
| [`pty-local/`](pty-local/README.md) | 提供本地持久终端会话 | 注册到 `ctx.pty` |
| [`tool-pty/`](tool-pty/README.md) | 向模型公开 PTY 会话操作 | 注册到 `ctx.tools` |
| [`tool-bash-persistent/`](tool-bash-persistent/README.md) | 公开可复用的 PTY 后端 bash 工具 | 注册到 `ctx.tools` |

[持久 PTY 决策](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md)记录了该家族的边界。
