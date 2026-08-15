# lsp/ - LSP 能力家族

[English](README.md) | 中文

语言服务器能力 seam：抽象 LSP 接口、通用 stdio 提供方和面向模型的 `lsp` 工具。这些全是**产品**包。

| 包 | 职责 | ctx key |
|---|---|---|
| [`lsp/`](lsp/README.md) | LSP 提供方 seam 和共享词汇 | `ctx.lsp` |
| [`lsp-local/`](lsp-local/README.md) | 本地 stdio 语言服务器后端 | 在 `ctx.lsp` 上注册提供方 |
| [`tool-lsp/`](tool-lsp/README.md) | 面向模型的语义导航工具 | 注册到 `ctx.tools` |

提供方注册语义能力；工具负责面向模型的契约。子 README 记录操作、协议和呈现细节，[LSP 能力 seam Agent Note](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md)负责设计原理。
