# acp/：Agent Client Protocol 自动化

[English](README.md) | 中文

ACP（Agent Client Protocol）组将 harness 中的 agent（智能体）公开给程序化客户端。它是互操作传输层，而非展示层或人机交互层。

| 包 | 职责 |
|---|---|
| [`acp/`](acp/README.md) | 仅面向自动化的 ACP 服务器。 |

与之匹配的进程外 subagent 客户端仍位于 [`subagent/subagent-acp`](../subagent/subagent-acp/README.md)，因为它实现 subagent 提供方接口；任意 ACP 客户端都可以按照同一服务器契约驱动该服务器。
