# DSH 上游差异

## 基线

| 项 | 值 |
|---|---|
| DSH 兼容版本 | `0.1.0-rc.6` |
| 上游仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| 当前导入基线 | `4e7fb95f`（2026-08-08 快照） |
| 本仓库位置 | `harness/`，由主仓库直接维护 |

机器可读值以 `maintenance/upstreams.json` 为准。本文件解释为什么存在差异，以及升级 rc 时必须重放什么。

## Harness 源码差异

| 文件 | Marisa 修改 | 原因 | 上游同步动作 |
|---|---|---|---|
| `apps/cli/src/args.ts` | `dsh web` 新增 `--profile <name>`，配置 dump 和帮助文本使用所选 profile | 桌面发行版需要启动 `marisa` 而不是硬编码 `web` profile | 重放并运行 CLI 参数测试 |
| `apps/cli/src/web.ts` | `WebFlags` 贯穿 profile，错误信息显示所选 profile | 与 CLI 参数契约一致 | 重放并执行 web 启动测试 |
| `apps/cli/tests/args.spec.ts` | 覆盖默认 profile、自定义 profile 和 dump | 防止 rc 同步时静默退回硬编码 | 保留或迁移到上游等价测试 |
| `packages/host/webserver/src/index.ts` | 把同一 HTTP 服务额外提供为旧名 `webServer` | 兼容仍注入旧服务名的插件 | 上游提供正式兼容层后删除 |
| `packages/client/web/src/platform.ts`、`seed.ts` | scoped Cordis 名称映射到相同实例 | rc6 registry client bundle 与 workspace Web 壳的模块名不同 | 上游统一模块表后删除 |
| `packages/client/ui-tool/src/client/apply.ts` | 保持官方 edit/write toolview 注册 | `dsh-diff-viewer` 当前兼容停用，不能留下空的独占 slot | 上游兼容后重新评估替换 UI |
| `tsconfig.host.json`、`apps/web/package.json` | 发行 host 检查排除 examples 与 VitePress，仅保留运行时 `website/docs.ts`；Vite 使用 runner 加载配置 | Windows 发行构建不应依赖示例和文档站工具，受限环境也不应由 esbuild 扫描 workspace 之外 | 上游拆分发行类型检查且默认 config loader 不再越界后删除 |

`harness/pnpm-lock.yaml` 与 `harness/pnpm-workspace.yaml` 不进入 vendored 源码；根 workspace 和根 lockfile 是唯一依赖图。

## 发行组合差异

- MyGO Core、Hub、CLI 和 Web Panel 精确锁定 `0.2.0-rc.6`，作为设置页内的插件市场与生命周期入口。
- Windows 使用 PowerShell 通道；Linux/macOS 实验桌面壳暂时继承用户环境中的 `dsh`。
- `marisa-bundle` 将 vendored `cordis` 作为直接 file 依赖：`tool-cordis` 在生产 bundle
  中直接导入它，不能只依赖开发 workspace 的 peer 解析。
- `multimedia-webui-input`、`dsh-llm-fallbacks`、`yet-another-subagent`、`dsh-diff-viewer`、`dsh-sonar` 和 `dsh-track` 因 rc6 API/时序不兼容而默认停用。

## 删除差异的原则

上游已经提供等价能力时，应优先删除 Marisa 补丁，而不是永久维护双实现。每次 rc 同步 PR 必须逐项判断“重放、迁移或删除”，并更新本文件。
| `tsconfig.host.json` | 从 include 移除 `examples/*/src`、`examples/*/start.ts`、`examples/*/tests`、`website/**`,仅保留 `website/docs.ts`(被 `scripts/project-doc-site.spec.ts` 引用,纯类型无外部依赖) | fork 精简删除了 `packages/workspace` 与 `packages/session-persistence` 组,遗留的 examples 快照测试与 website 站点无法通过 tsc;examples/website 不是发行构建目标 | 若上游恢复完整包结构,重放时逐项移回 include |
