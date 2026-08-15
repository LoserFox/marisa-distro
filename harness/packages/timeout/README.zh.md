# timeout/：工具调用超时策略

[English](README.md) | 中文

本分组将部署配置的截止时间应用于面向模型的工具调用。各项能力仍负责终止自身工作。

| 包 | 职责 |
|---|---|
| [`timeout-policy/`](timeout-policy/README.md) | 强制执行配置的逐工具调用截止时间 |

纯计时原语位于 [`util/timeout`](../util/timeout/README.md)。参见[超时库决策](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)。
