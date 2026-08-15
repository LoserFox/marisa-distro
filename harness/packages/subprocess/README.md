# subprocess/ — subprocess capability family

English | [中文](README.zh.md)

This family runs host subprocesses behind an explicit process-lifecycle service.

| Package | Role | ctx key |
|---|---|---|
| [`subprocess/`](subprocess/README.md) | Defines subprocess launch, stream, termination, and disposal contracts | `ctx.subprocess` |
| [`subprocess-local/`](subprocess-local/README.md) | Implements local process-tree execution | registers on `ctx.subprocess` |

The service owns process lifetime; each consumer owns what the process does and which defaults apply.
