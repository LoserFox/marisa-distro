# ui/ — human and SDK-client integration surfaces

English | [中文](README.zh.md)

Human-facing channels and the out-of-process SDK server. These are **product** packages: real interfaces that a person or SDK client drives.

| Package | Role | ctx key |
|---|---|---|
| [`commands/`](commands/README.md) | Registers and dispatches human commands for interactive adapters. | `ctx.commands` |
| [`user-approval/`](user-approval/README.md) | Coordinates one-shot approval decisions. | `ctx.approval` |
| [`permission/`](permission/README.md) | Presents and persists user-facing permission presets. | `ctx.permission` |
| [`user-interaction/`](user-interaction/README.md) | Defines the provider-neutral human question/answer seam. | `ctx.userInteraction` |
| [`tool-ask-user/`](tool-ask-user/README.md) | Exposes human questions to the model. | (registers on `ctx.tools`) |
| [`jsonrpc/`](jsonrpc/README.md) | Serves out-of-process SDK clients over stdio JSON-RPC. | (drives `ctx.agents`) |
| [`app-boot/`](app-boot/README.md) | Provides shared boot support for application launchers. | (library for the bins) |

These packages integrate through existing agent and session contracts rather than changing the loop. Interactive applications provide the concrete command, approval, and question adapters; automation uses [`acp/`](../acp/README.md), and runnable demo bundles live under [`examples/`](../examples/README.md). The product [`dsh`](../../apps/cli/README.md) CLI composes these packages directly.
