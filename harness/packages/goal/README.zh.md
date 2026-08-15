# goal/：持久化的同会话目标

[English](README.md) | 中文

goal 家族负责持久目标状态，与消费该状态的面向模型工具和续行策略相互独立。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`goal/`](goal/README.md) | 目标状态与生命周期 | `ctx.goals` |
| [`goal-session/`](goal-session/README.md) | 同会话目标续行 | 无 |
| [`tool-goal/`](tool-goal/README.md) | 面向模型的目标工具 | 无 |
| [`command-goal/`](command-goal/README.md) | 面向用户的目标命令 | 无 |

目标状态是其所属会话日志的一部分。消费方依赖 `dsh-goal`，而不是具体的 agent loop（智能体循环）；续行行为由基于公开 agent seam 的独立插件负责。
