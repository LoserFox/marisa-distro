# llm/ — LLM 能力家族

[English](README.md) | 中文

LLM（大语言模型）seam 及其提供方适配器。接口包（`llm`）负责抽象服务、内容块词汇和流式分片组装器；适配器是注册到 `ctx.llm` 的具体实现。这些全是**产品**包。

| 包 | 职责 | ctx key |
|---|---|---|
| [`llm/`](llm/README.md) | LLM 服务和共享流式词汇 | `ctx.llm` |
| [`token-meter/`](token-meter/README.md) | 可感知回放的 token 测量 | `ctx.tokenMeter` |
| [`llm-retry/`](llm-retry/README.md) | 提供方作用域的重试策略 | 监听 `agent/request-error` |
| [`llm-deepseek/`](llm-deepseek/README.md) | 直接 DeepSeek 适配器 | 注册到 `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.md) | 多提供方 pi-ai 适配器 | 注册到 `ctx.llm` |

适配器在 seam 上注册提供方路由；重试与 token 测量仍是独立消费方。子 README 负责路由、元数据、回放和提供方协议细节；[LLM 架构决策](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md)负责设计原理。
