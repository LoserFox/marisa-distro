# fs/ - filesystem capability family

English | [中文](README.zh.md)

The filesystem capability family: provider seam, interchangeable backends, policy, and model-facing tools. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`fs/`](fs/README.md) | Filesystem provider seam and policy-event vocabulary | `ctx.fs` |
| [`fs-local/`](fs-local/README.md) | Local-filesystem backend | registers `ctx.fs` |
| [`fs-sandbox/`](fs-sandbox/README.md) | Sandbox-enforcing backend | registers `ctx.fs` |
| [`fs-policy/`](fs-policy/README.md) | Observed-state and mutation policy | `fs/*` listeners |
| [`tool-fs/`](tool-fs/README.md) | Model-facing file tools | registers on `ctx.tools` |
| [`tool-fs-search/`](tool-fs-search/README.md) | Process-backed discovery tools | registers on `ctx.tools` |
| [`tool-str-replace-editor/`](tool-str-replace-editor/README.md) | Model-facing string-replacement editor | registers on `ctx.tools` |

Backends replace one another behind `ctx.fs`; policy and tools consume the seam independently. Discovery remains process-backed instead of expanding the provider contract. Child READMEs own containment, mutation, schema, and timeout details.
