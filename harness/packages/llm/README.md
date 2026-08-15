# llm/ — LLM capability family

English | [中文](README.zh.md)

The LLM seam and its provider adapters. The interface package (`llm`) owns the abstract service, the content-block vocabulary, and the stream-chunk assembler; the adapters are concrete implementations that register on `ctx.llm`. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`llm/`](llm/README.md) | LLM service and shared streaming vocabulary | `ctx.llm` |
| [`token-meter/`](token-meter/README.md) | Replay-aware token measurement | `ctx.tokenMeter` |
| [`llm-retry/`](llm-retry/README.md) | Provider-scoped retry policy | listens to `agent/request-error` |
| [`llm-deepseek/`](llm-deepseek/README.md) | Direct DeepSeek adapter | registers on `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.md) | Multi-provider pi-ai adapter | registers on `ctx.llm` |

Adapters register provider routes on the seam; retry and token measurement remain separate consumers. The child READMEs own routing, metadata, replay, and provider-wire details; the [LLM architecture decisions](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md) own the rationale.
