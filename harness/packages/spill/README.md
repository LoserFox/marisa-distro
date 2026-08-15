# spill/ — tool-output spill capability family

English | [中文](README.zh.md)

This family persists oversized tool output and replaces the inline result with a bounded preview and retrieval locator.

| Package | Role | ctx key |
|---|---|---|
| [`spill/`](spill/README.md) | Defines spill storage | `ctx.spillStore` |
| [`spill-local/`](spill-local/README.md) | Stores spilled text in session-scoped local files | registers on `ctx.spillStore` |
| [`spill-policy/`](spill-policy/README.md) | Applies the post-execution spill policy | listens on `ctx.tools` |

See the [tool-output spill decision](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md) for the boundary between storage, retention, and tool-owned output handling.
