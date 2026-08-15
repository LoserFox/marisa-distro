# lsp/ - LSP capability family

English | [中文](README.zh.md)

The language-server capability seam: an abstract LSP interface, a generic stdio provider, and the model-facing `lsp` tool. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`lsp/`](lsp/README.md) | LSP provider seam and shared vocabulary | `ctx.lsp` |
| [`lsp-local/`](lsp-local/README.md) | Local stdio language-server backend | registers providers on `ctx.lsp` |
| [`tool-lsp/`](tool-lsp/README.md) | Model-facing semantic-navigation tool | registers on `ctx.tools` |

Providers register semantic capabilities; the tool owns the model-facing contract. The child READMEs document operation, protocol, and presentation details, while the [LSP capability-seam Agent Note](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md) owns the rationale.
