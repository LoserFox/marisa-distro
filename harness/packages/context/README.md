# context/ — request-context extensions

English | [中文](README.zh.md)

Product plugins that add model-visible request context without defining a tool. `workspace-context` is included by the default `dsh-agent-spine-demo` bundle and can be disabled through bundle config; `time-context`, `tmux-context`, and `session-reference` are opt-in.

| Package | Role | ctx key |
|---|---|---|
| [`session-reference/`](session-reference/README.md) | Bounded snapshots of other sessions | `ctx.sessionReferences` |
| [`time-context/`](time-context/README.md) | Current-time and elapsed-time context | — |
| [`tmux-context/`](tmux-context/README.md) | tmux location context | — |
| [`workspace-context/`](workspace-context/README.md) | Workspace-instruction context | — |

The [`workspace-context` decision record](../../.agents/notes/implemented/feature/2026-06-24-workspace-context.md) explains its per-agent/session isolation and lifecycle split.
