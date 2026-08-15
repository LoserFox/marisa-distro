# 包

[English](README.md) | 中文

所有包都使用 `@deepseek-ai/dsh-*` scope。Cordis `Service` 子类和函数插件的贡献通过 `ctx.effect()`、`ctx.on()` 或 `ctx.waterfall()` 注册。编写规则见[包](AGENTS.md)与[根规则](../AGENTS.md#conventions)。

## 层级结构

包位于 `packages/<group>/<pkg>/`；组是容器，包名仍为 `@deepseek-ai/dsh-<pkg>`。**每个组 README 是规范的包／ctx 键映射。**

| 组 | 职责 | 发布预期 |
|---|---|---|
| [`core/`](core/README.md) | 产品 API 主干：会话、提示词、工具、agent（智能体）服务与具体循环 | 产品：稳定表面 |
| [`api/`](api/README.md) | Remote BFF 装配与 TypeRT RPC Gateway | 产品：稳定表面 |
| [`typert/`](typert/README.md) | 类型图生成、产物加载与运行时注册表 | 产品：稳定表面 |
| [`goal/`](goal/README.md) | 同会话 goal 的持久化与生命周期 | 产品：稳定表面 |
| [`feedback/`](feedback/README.md) | 人类反馈 | 产品：稳定表面 |
| [`llm/`](llm/README.md) | LLM（大语言模型）能力系列：抽象服务 + 提供方适配器 | 产品：稳定表面 |
| [`subprocess/`](subprocess/README.md) | 进程管理能力系列：spawn seam + 本地进程树实现 | 产品：稳定表面 |
| [`bash/`](bash/README.md) | Bash 能力系列：执行器 seam、本地实现、面向模型的工具 | 产品：稳定表面 |
| [`pty/`](pty/README.md) | 持久 PTY 能力系列：按所有者隔离的会话、本地实现和面向模型的工具 | 产品：稳定表面 |
| [`code-runtime/`](code-runtime/README.md) | 代码执行能力系列：面向模型所写程序的运行时 seam + worker 线程后端 | 产品：稳定表面 |
| [`sandbox/`](sandbox/README.md) | 进程限制 seam；bwrap/Landlock/Seatbelt 后端 | 产品：稳定表面 |
| [`fs/`](fs/README.md) | 文件系统能力系列：seam、本地实现、面向模型的文件工具、bash 后端发现工具 | 产品：稳定表面 |
| [`lsp/`](lsp/README.md) | LSP 能力系列：seam、通用 stdio 提供方和 `lsp` 工具 | 产品：稳定表面 |
| [`skill/`](skill/README.md) | Skill（技能）能力系列：提供方注册表、本地提供方和面向模型的目录／加载器 | 产品：稳定表面 |
| [`compact/`](compact/README.md) | 压缩（compaction）能力系列：抽象 seam + 基础后端（工具延后） | 产品：稳定表面 |
| [`context/`](context/README.md) | 模型可见请求上下文，包括 workspace 指令和时间上下文 | 产品：稳定表面 |
| [`subagent/`](subagent/README.md) | Subagent 能力系列：提供方注册表 seam 和面向模型的委托工具 | 产品：稳定表面 |
| [`tasks/`](tasks/README.md) | 通用后台任务运行时和面向模型的 `task_*` 控制工具 | 产品：稳定表面 |
| [`workflow/`](workflow/README.md) | 脚本 seam、worker 线程引擎和面向模型的 `workflow`/`ralph` 工具 | 产品：稳定表面 |
| [`web/`](web/README.md) | Web 能力系列：seam、搜索／获取提供方实现和面向模型的 Web 工具 | 产品：稳定表面 |
| [`spill/`](spill/README.md) | 溢出能力系列：存储 seam、本地实现、工具结果溢出策略 | 产品：稳定表面 |
| [`todo/`](todo/README.md) | 面向模型的 `todo_write` 工具 | 产品：稳定表面 |
| [`plan/`](plan/README.md) | Plan 协作状态，提供直接进入命令与经评审的退出 | 产品：稳定表面 |
| [`timeout/`](timeout/README.md) | 工具调用 `tools/execute` 截止时间强制执行 | 产品：稳定表面 |
| [`guard/`](guard/README.md) | 循环卫生建议性重复调用提醒 | 产品：稳定表面 |
| [`bundle/`](bundle/README.md) | 可安装的 `dsh --profile` 补丁层 | 产品：稳定表面 |
| [`cordis/`](cordis/README.md) | Cordis 运行时集成：自检、临时 Plugin、受限 repository Plugin 加载 | 产品：稳定表面 |
| [`hooks/`](hooks/README.md) | 钩子桥接 + 共享 Claude Code／Codex 协议格式库 | 产品：稳定表面 |
| [`session-persistence/`](session-persistence/README.md) | 持久化 seam + JSONL/SQLite 后端 | 产品：稳定表面 |
| [`session-projection/`](session-projection/README.md) | 投影 seam：领域折叠单元供给全量值 | 产品：稳定表面 |
| [`session-query/`](session-query/README.md) | 会话检索系列：逻辑语料库、有界读取、血缘、事件关系、语义过滤和 SQLite 全文搜索 | 产品：稳定表面 |
| [`session-title/`](session-title/README.md) | 日志支撑的会话标题：回退服务与选用 LLM 提供方 | 产品：稳定表面 |
| [`settings/`](settings/README.md) | 用户设置 seam + 文件 provider | 产品：稳定表面 |
| [`credentials/`](credentials/README.md) | 凭据引用 seam + 环境叠加 `.env` provider | 产品：稳定表面 |
| [`telemetry/`](telemetry/README.md) | 会话上报：捕获／脱敏 seam、OTel 后端 | 产品：稳定表面 |
| [`storage/`](storage/README.md) | 非会话存储中枢 + 后端 + 领域形式 | 产品：稳定表面 |
| [`workspace/`](workspace/README.md) | Workspace 实体 | 产品：稳定表面 |
| [`sdk/`](sdk/README.md) | 项目 SDK 工具 | 产品：稳定表面 |
| [`acp/`](acp/README.md) | 仅面向自动化的 Agent Client Protocol 服务器 | 产品：稳定表面 |
| [`ui/`](ui/README.md) | JSON-RPC 集成、批准／交互 seam、用户问答工具 | 产品：稳定表面 |
| [`host/`](host/README.md) | web GUI 宿主半侧：API 网关 + HTTP 路由服务器 | 产品：稳定表面 |
| [`client/`](client/README.md) | web GUI 浏览器半侧：shell、协议层、对象服务、slot、`ui-*` 插件 | 产品：稳定表面 |
| [`experimental/`](experimental/README.md) | 原型和内部插件 | 未发布 |
| [`examples/`](examples/README.md) | 演示组合包（agent-spine + CLI/ACP/JSON-RPC bin），由叶节点加载 | 支持：示例基础设施 |
| [`support/`](support/README.md) | 支持基础设施（testkit、不变式、回放、Loader 冒烟测试） | 支持：兼容性预期较低 |
| [`util/`](util/README.md) | 组间共享的低层零依赖工具（`Branded<B>`、Harness home／路径辅助函数、超时、保留策略） | 支持：小型、稳定、无 harness 依赖 |

新包加入现有组；新组更新其 README 和此表。

## 依赖

依赖图由工具生成：[docs/module-graph.md](../docs/module-graph.md)（`pnpm run gen-module-graph`，CI 中有新鲜度门禁）。

**扩展插件依赖接口，绝不依赖具体循环。** `dsh-agent-loop` 可替换；UI、钩子和工具插件使用 `dsh-agent`。包括 `dsh-agent-spine-demo` 在内的组合包可以依赖主干插件。能力拆分为接口／实现／消费方包；详见[能力 seam](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)。

包 README 覆盖用途、API、扩展点和[模型体验](../docs/cookbook/adding-a-package.md#4-write-the-package-readme)；列入模型无关[省略允许清单](../scripts/verify-package-readme-model-experience.ts)的包除外。它们还要包含 `## Known Limitations and Deferred Work`，或使用其[允许清单](../scripts/verify-package-readme-limitations.ts)。
