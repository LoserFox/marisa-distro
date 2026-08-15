# core/ — 产品 API 主干

[English](README.md) | 中文

构成 harness 默认控制主干的会话日志、系统提示词组装、工具注册表、agent（智能体）词汇和具体循环。这些是**产品**包，即插件和消费方构建所依赖的稳定 surface。

| 包 | 职责 | ctx key |
|---|---|---|
| [`scope/`](scope/README.md) | 作用域上下文注册原语 | 库，不使用 ctx key |
| [`session/`](session/README.md) | 事件溯源会话日志和内存存储 | `ctx.sessions` |
| [`system-prompt/`](system-prompt/README.md) | 提示词和工具 schema 组装注册表 | `ctx.systemPrompt` |
| [`tools/`](tools/README.md) | 作用域工具注册表和执行流水线 | `ctx.tools` |
| [`agent/`](agent/README.md) | Agent 接口、注册表和事件词汇 | `ctx.agents` |
| [`agent-loop/`](agent-loop/README.md) | 默认具体 agent 驱动器 | `ctx.agentLoop` |

`scope` 提供共享作用域原语。`agent` 负责公开 seam，`agent-loop` 是其默认实现；扩展插件依赖该 seam，从而保持驱动器可替换。

可运行组合属于 [`examples/agent-spine-demo`](../examples/agent-spine-demo/README.md)；该分组只负责可替换的主干组件。
