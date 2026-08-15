# session-title/ — log-backed session-title capability family

English | [中文](README.zh.md)

This family derives durable session titles from the session log, with an optional model-backed provider.

| Package | Role | ctx key |
|---|---|---|
| [`session-title/`](session-title/README.md) | Owns title state, fallback behavior, provider registration, and refresh | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.md) | Provides shared model-backed title generation | — |
| [`session-title-first-message-llm/`](session-title-first-message-llm/README.md) | Titles a session from its first eligible human message | registers on `ctx.sessionTitle` |
| [`session-title-all-messages-llm/`](session-title-all-messages-llm/README.md) | Titles a session from all eligible human messages | registers on `ctx.sessionTitle` |

Deployments may register one model-backed provider; the service retains a deterministic fallback when none is present.
