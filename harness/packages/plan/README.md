# plan/ — plan collaboration state

English | [中文](README.zh.md)

Plan mode is logged, per-agent collaboration state rather than a generic mode registry or capability seam.

| Package | Role | ctx key |
|---|---|---|
| [`plan-mode/`](plan-mode/README.md) | Owns plan-mode state, guidance, commands, and review flow | `ctx.planMode` |

The [plan-specific collaboration state](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md) decision records the family design.
