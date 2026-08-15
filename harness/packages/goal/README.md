# goal/ — persisted same-session goals

English | [中文](README.zh.md)

The goal family owns durable objective state independently of the model-facing tools and continuation policy that consume it.

| Package | Role | ctx key |
|---|---|---|
| [`goal/`](goal/README.md) | Goal state and lifecycle | `ctx.goals` |
| [`goal-session/`](goal-session/README.md) | Same-session goal continuation | — |
| [`tool-goal/`](tool-goal/README.md) | Model-facing goal tools | — |
| [`command-goal/`](command-goal/README.md) | Human-facing goal command | — |

Goal state is part of the owning session log. Consumers depend on `dsh-goal`, not on the concrete agent loop; continuation behavior belongs in a separate plugin on the public agent seams.
