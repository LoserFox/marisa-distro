# DSH 上游差异

## 基线

| 项 | 值 |
|---|---|
| DSH 兼容版本 | `0.1.0-rc.8` |
| 上游仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| 当前导入基线 | `141eb6fef83422698aef7a981029e843e8161534`（2026-08-22 换树，测试分支 feature/rc8-test） |
| 本仓库位置 | `harness/`，内容应保持上游 rc8；测试分支换树已重放 anchored-standard 预设 |

机器可读值以 `maintenance/upstreams.json` 为准。本文件记录当前 rc8 基线、已移出 harness 的发行适配，以及升级 rc 时必须验证什么。harness 源码本身不应承载 Marisa 专用修改。

## Harness 源码差异

| 文件/范围 | Marisa 修改或同步关注点 | 原因 | 上游同步动作 |
|---|---|---|---|
| rc7 上游 CLI 与 Web 树 | 当前直接使用上游 rc7 能力；Marisa 通过 launcher/profile 参数选择 `marisa` | 避免在 harness 内维护发行版专用源码分叉 | 同步时只更新上游 pin，并运行 profile/boot 验证 |
| `tsconfig.host.json`、`apps/web/package.json` | 无 Marisa 源码 patch；保持上游 rc7 的项目引用、examples/website 类型范围和 Vite 构建命令 | harness 只作为上游 rc7 基线同步，不承载发行版 workspace 适配 | 更新 submodule 时只需 checkout 上游 pin；发行构建适配放在根 workspace/profile/打包阶段 |
| `packages/host/webserver` 与 `packages/client/web` | rc7 host/client 使用同一协议树，`host.describe.canOpenPath` 由双方同源 schema 约束 | 修复旧版 host/client 不一致导致的握手重连 | 后续同步优先确认上游是否已提供等价能力，避免重复补丁 |
| `apps/cli/config/agent-presets/anchored-standard/`（2026-08-21 新增，**发行版本地增量**） | 锚定标准实验预设：`tool-bootstrap.mjs` vendored 自 `xiaobright/dsh-anchored-standard@95b98af`（MIT，SHA-256 84CF3D58…）+ `agent.cordis.yml` = rc7 standard + 锚定增量（bootstrap 行第一、Minimal persona complete、tool-bash 全平台禁用）+ `preset.yml`/`LICENSE` | 实验预设不属上游产品面；Windows 无持久 PTY bash，persistent-shell 组按平台禁用 | rc8 换树时原样重放（或按 rc8 preset 结构重新对齐）；不随上游同步删除 |

当前基线已完成 rc7 同源 host/client 同步；`canOpenPath` 缺失不应再通过手工响应字段规避。

## Harness 边界

`harness/` 当前应与 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 上游树一致。工作区中少量 `CLAUDE.md`/快照差异来自本地 agent notes 或生成物，不属于 rc7 功能 patch；`*.tsbuildinfo` 和 `.claude/skills/` 不应进入发行提交。后续应以 pinned submodule 记录该上游对象，避免把 rc7 同步误读为 Marisa 源码修改。

## 根 workspace 与依赖图

`harness/pnpm-lock.yaml` 与 `harness/pnpm-workspace.yaml` 不进入根依赖图；根 workspace 和根 lockfile 是唯一依赖图。打包阶段复制 harness 时排除其嵌套 workspace 文件，避免 pnpm 11 触发二次安装。

## 发行组合差异

- MyGO Core、Hub、CLI 和 Web Panel 以 vendored 源（`dsh-mygo/`，`0.2.0-rc.7`）经 `file:` 依赖装载，作为设置页内的插件市场与生命周期入口。
- `marisa-bundle` 将 vendored `cordis` 作为直接 `file:` 依赖，生产 bundle 不依赖开发 workspace 的 peer 解析。
- `interpreters`、`ya-workspace-sidebar`、`mineru` 和 `aigc-canvas` 已插入并完成 boot 链路验证。
- YAS 保留在 vendored 依赖中，但因与官方 `tool-subagent` 撞名暂不默认挂载；重新评估时必须先禁用官方项。
- `dsh-llm-fallbacks`、`dsh-sonar`、`dsh-track`、`dsh-diff-viewer`、`dsh-multimedia-webui-input` 和 `dsh-suggested-replies` 的 rc7 功能兼容性仍待重测，不能把历史 rc6 结论视为 rc7 结论。

插件逐项状态见 [`rc7-plugin-compatibility.md`](rc7-plugin-compatibility.md) 和 [`plugins.md`](plugins.md)。

## 删除差异的原则

上游已经提供等价能力时，应优先删除 Marisa 补丁，而不是永久维护双实现。每次 rc 同步必须逐项判断“重放、迁移或删除”，并更新本文件。
