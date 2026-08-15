# code-runtime/ — code-execution capability family

English | [中文](README.zh.md)

The code-execution capability seam (see [capability seams](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)): an abstract runtime interface for executing one model-written program against host-provided async bindings, capturing what it printed and returned. The consumer is the tool registry's [Code Mode](../core/tools/README.md) (`tools: { mode: code }` — the `run_code` tool and the SDK generated in the loaded runtime's `language`); design in the [Code Mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-code-mode.md). **Product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`code-runtime/`](code-runtime/README.md) | Code-execution seam and shared vocabulary | `ctx.codeRuntime` |
| [`code-runtime-worker/`](code-runtime-worker/README.md) | Worker-thread backend | registers `ctx.codeRuntime` |

Backends register the seam without changing its consumer. The child READMEs own language, isolation, and execution-budget details.
