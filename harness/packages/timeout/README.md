# timeout/ — tool-call timeout policy

English | [中文](README.zh.md)

This group applies deployment-configured deadlines to model-facing tool calls. Capabilities remain responsible for terminating their own work.

| Package | Role |
|---|---|
| [`timeout-policy/`](timeout-policy/README.md) | Enforces configured per-tool call deadlines |

The pure timing primitives live in [`util/timeout`](../util/timeout/README.md). See the [timeout-library decision](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md).
