# fs/ - 文件系统能力家族

[English](README.md) | 中文

文件系统能力家族：提供方 seam、可互换后端、策略和面向模型工具。这些全是**产品**包。

| 包 | 职责 | ctx key |
|---|---|---|
| [`fs/`](fs/README.md) | 文件系统提供方 seam 和策略事件词汇 | `ctx.fs` |
| [`fs-local/`](fs-local/README.md) | 本地文件系统后端 | 注册 `ctx.fs` |
| [`fs-sandbox/`](fs-sandbox/README.md) | 强制执行沙箱的后端 | 注册 `ctx.fs` |
| [`fs-policy/`](fs-policy/README.md) | 已观察状态和修改策略 | `fs/*` 监听器 |
| [`tool-fs/`](tool-fs/README.md) | 面向模型的文件工具 | 注册到 `ctx.tools` |
| [`tool-fs-search/`](tool-fs-search/README.md) | 基于进程的发现工具 | 注册到 `ctx.tools` |
| [`tool-str-replace-editor/`](tool-str-replace-editor/README.md) | 面向模型的字符串替换编辑器 | 注册到 `ctx.tools` |

后端可在 `ctx.fs` 后互相替换；策略和工具独立消费该 seam。发现功能仍由进程提供，不扩展提供方契约。子 README 负责围堵、修改、schema 和超时细节。
