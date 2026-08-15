# session-title/：日志支持的会话标题能力族

[English](README.md) | 中文

该包族从会话日志派生持久会话标题，并支持可选的模型后端 provider。

| 包 | 职责 | ctx key |
|---|---|---|
| [`session-title/`](session-title/README.md) | 负责标题状态、回退行为、provider 注册与刷新 | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.md) | 提供共享的模型标题生成能力 | — |
| [`session-title-first-message-llm/`](session-title-first-message-llm/README.md) | 根据第一条合格的人类消息生成会话标题 | 注册到 `ctx.sessionTitle` |
| [`session-title-all-messages-llm/`](session-title-all-messages-llm/README.md) | 根据所有合格的人类消息生成会话标题 | 注册到 `ctx.sessionTitle` |

部署可注册一个模型后端 provider；未注册时，服务仍提供确定性回退。
