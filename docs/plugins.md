# 插件清单

默认插件全部 vendored 在 `plugins/`，共 30 个。机器可读的目录、上游、基线和 mirror/fork 分类由 `maintenance/upstreams.json` 管理；profile 生成器使用的目录映射由 `profiles/marisa/plugins.json` 管理。

状态基线：DSH `0.1.0-rc.7`，upstream commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（2026-08-18）。完整的逐项证据和下一步见 [rc7 插件兼容评估清单](rc7-plugin-compatibility.md)。

状态含义：

- **组合启用**：默认挂载进 Marisa 组合，并通过 boot 链路验证。
- **安装未挂载**：依赖存在，但未加入默认 bundles；用户可通过设置页显式启用。
- **rc7 待重测**：沿用历史停用策略，但尚无足够 rc7 证据，不把 rc6 结论当作 rc7 结论。
- **兼容停用**：当前有明确的 rc7 阻断或发布包问题，需修复后再挂载。

## 22 个 git 插件

| 目录 | 类型 | 状态 | 说明 |
|---|---|---|---|
| `dsh_workflow` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-a2a` | mirror | 组合启用 | A2A 工具 |
| `dsh-artifact` | mirror | 组合启用 | Artifact UI |
| `dsh-auto-resume` | fork | 组合启用 | 本地第一方：中断后发送按钮原位变播放，点击发「继续」；见 [plugins/dsh-auto-resume.md](plugins/dsh-auto-resume.md) |
| `dsh-code-map` | mirror | 组合启用 | 代码地图 |
| `dsh-diff-viewer` | fork | rc7 待重测 | 历史 UI primitives/slot 结论尚未在 rc7 复核，保留官方编辑/写入界面 |
| `dsh-drag-and-drop` | mirror | 组合启用 | 拖放输入 |
| `dsh-genui` | fork | 组合启用 | rc6 路径兼容 |
| `dsh-git-identity` | fork | 组合启用 | Marisa Git 身份策略 |
| `dsh-input-history` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-multimedia-webui-input` | mirror | rc7 待重测 | 历史客户端包缺口尚未在 rc7 复核 |
| `dsh-paste-input` | mirror | 组合启用 | 粘贴输入 |
| `dsh-sidechain` | fork | 组合启用 | Sidechain；深色模式适配补丁（--ds-* → --dsw-alias-* 映射，见 [plugins/dsh-sidechain.md](plugins/dsh-sidechain.md)） |
| `dsh-sonar` | mirror | rc7 待重测 | 历史 Cordis 服务与 `conversation.view` slot 结论尚未在 rc7 复核 |
| `dsh-stickers` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-suggested-replies` | fork | rc7 待重测 | 历史依赖与路径结论尚未在 rc7 复核 |
| `dsh-track` | fork | rc7 待重测 | 历史 session-query、Context 与客户端契约结论尚未在 rc7 复核 |
| `dsh-ui-progress` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-update-check` | fork | 组合启用 | 本地第一方：检查更新（仅检查+通知，按钮深链 Release 资产） |
| `dsh-vision-toolkit` | fork | 组合启用 | 默认匿名 Zen MiMo；设置页可切换免费 GLM |
| `dsh-web-ui-approval-notify` | fork | 组合启用 | rc6 测试路径兼容 |
| `whale-girl` | mirror | rc7 待重测 | 沿用历史停用策略，尚无 rc7 证据 |

## 8 个 npm 快照插件

这些插件以已发布 npm 包内容 vendored 进 `plugins/`，并以 `file:` 依赖精确锁定；安装期不执行构建脚本。

| 目录 | npm 包 | 类型 | 版本 | 状态 |
|---|---|---|---|---|
| `dsh-bash-terminal` | `dsh-bash-terminal` | fork | 0.3.14 | 组合启用；一个 shell 工具四种 Windows 终端（powershell/msys2/gitbash/wsl），设置页默认后端 + 按调用切换；fork 增量见 [plugins/dsh-bash-terminal.md](plugins/dsh-bash-terminal.md) |
| `dsh-better-sidebar` | `dsh-better-sidebar` | fork | 0.14.0 | 组合启用；rc8 peers，web-react/schema-form 死包依赖已由上游移除 |
| `dsh-llm-fallbacks` | `dsh-llm-fallbacks` | fork | 0.3.2 | rc7 待重测；当前停用并移除安装期生命周期脚本 |
| `dsh-web-review` | `@canglongcl/dsh-web-review` | mirror | 0.3.0 | 兼容停用；client 脚本修复待重测 |
| `yet-another-subagent` | `@huanlin/dsh-plugin-yet-another-subagent` | mirror | 0.1.2 | 安装未挂载；需先禁用官方 `tool-subagent` |
| `ya-workspace-sidebar` | `@huanlin/dsh-plugin-ya-workspace-sidebar` | fork | 0.3.1 | 组合启用；devDeps 改写 workspace:^（fork 差异见 [plugins/ya-workspace-sidebar.md](plugins/ya-workspace-sidebar.md)） |
| `interpreters` | `@huanlin/dsh-plugin-interpreters` | mirror | 0.2.1 | 组合启用；keyed 修复后完成 boot 链路验证 |
| `mnemon` | `dsh-mnemon` | mirror | 0.2.13 | 组合启用；三层记忆系统（runtime memory / documents / memory spaces），Go 引擎二进制 v0.2.3 随包；workspace 存储 + local-only 数据边界 + 只读远程面 |

## 市场基础设施（vendored 源，不在 `plugins/`）

MyGO Core、Loader Hub、CLI 和 Web Panel 以 vendored 源（`dsh-mygo/`，omdsh-dev/dsh-mygo@next 的 `0.2.0-rc.7`）经 `file:` 依赖装载，是设置页里的插件市场入口。MyGO 只在用户点击安装/更新时下载额外插件；默认组合不依赖首次启动时联网拉取核心插件。fork 治理记录（vendored 基线 + 本地修改清单 + 上游 PR）见 [plugins/dsh-mygo.md](plugins/dsh-mygo.md)。

## 许可证

插件版权与许可证属于各自作者。二进制分发必须保留插件包内 LICENSE/NOTICE；已取得的额外分发授权应由维护者保存书面记录。AGPL 插件的源码与修改必须按其许可证提供。
