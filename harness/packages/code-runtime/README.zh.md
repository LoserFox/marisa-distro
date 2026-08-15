# code-runtime/ — 代码执行能力家族

[English](README.md) | 中文

代码执行能力 seam（参见[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)）：一个抽象运行时接口，用于对宿主提供的异步绑定执行模型编写的程序，并捕获它打印和返回的内容。消费方是工具注册表的 [Code Mode](../core/tools/README.md)（`tools: { mode: code }`，即 `run_code` 工具和按所加载运行时 `language` 生成的 SDK）；设计见 [Code Mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-code-mode.md)。这些全是**产品**包。

| 包 | 职责 | ctx key |
|---|---|---|
| [`code-runtime/`](code-runtime/README.md) | 代码执行 seam 与共享词汇 | `ctx.codeRuntime` |
| [`code-runtime-worker/`](code-runtime-worker/README.md) | Worker 线程后端 | 注册 `ctx.codeRuntime` |

后端在不改变消费方的情况下注册该 seam。子 README 负责语言、隔离和执行预算细节。
