# session-projection/ — session projection capability family

English | [中文](README.zh.md)

This family serves current, log-derived per-session state to client carriers.

| Package | Role | ctx key |
|---|---|---|
| [`session-projection/`](session-projection/README.md) | Defines and drives session projection units | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.md) | Persists and restores projection checkpoints | `ctx.sessionProjectionCache` |
