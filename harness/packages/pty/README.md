# pty/ — persistent PTY capability family

English | [中文](README.zh.md)

This family provides persistent, owner-scoped pseudo-terminal sessions for interactive or stateful terminal work. It complements one-shot bash execution.

| Package | Role | ctx key |
|---|---|---|
| [`pty/`](pty/README.md) | Defines the PTY service and session lifecycle | `ctx.pty` |
| [`pty-local/`](pty-local/README.md) | Provides local persistent terminal sessions | registers on `ctx.pty` |
| [`tool-pty/`](tool-pty/README.md) | Exposes PTY session operations to the model | registers on `ctx.tools` |
| [`tool-bash-persistent/`](tool-bash-persistent/README.md) | Exposes a reusable PTY-backed bash tool | registers on `ctx.tools` |

The [persistent PTY decision](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md) records the family boundary.
