# 插件清单

默认插件全部 vendored 在 `plugins/`，共 28 个。机器可读的目录、上游、基线和 mirror/fork 分类由 `maintenance/upstreams.json` 管理；profile 生成器使用的目录映射由 `profiles/marisa/plugins.json` 管理。

状态含义：

- **组合启用**：默认挂载进 Marisa 组合。
- **安装未挂载**：依赖存在，但未加入默认 bundles；用户可通过设置页显式启用。
- **兼容停用**：因 rc6 API/时序不兼容或上游发布包异常而安装但不挂载，升级 harness 或上游修复后重新评估。

## 20 个 git 插件

| 目录 | 类型 | 状态 | 说明 |
|---|---|---|---|
| `dsh_workflow` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-a2a` | mirror | 组合启用 | A2A 工具 |
| `dsh-artifact` | mirror | 组合启用 | Artifact UI |
| `dsh-code-map` | mirror | 组合启用 | 代码地图 |
| `dsh-diff-viewer` | fork | 兼容停用 | rc6 UI primitives/slot contract 不兼容，保留官方编辑/写入界面 |
| `dsh-drag-and-drop` | mirror | 组合启用 | 拖放输入 |
| `dsh-genui` | fork | 组合启用 | rc6 路径兼容 |
| `dsh-git-identity` | fork | 组合启用 | Marisa Git 身份策略 |
| `dsh-input-history` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-multimedia-webui-input` | mirror | 兼容停用 | rc6 缺少所需客户端包 |
| `dsh-paste-input` | mirror | 组合启用 | 粘贴输入 |
| `dsh-sidechain` | mirror | 组合启用 | Sidechain |
| `dsh-sonar` | mirror | 兼容停用 | rc6 Cordis 服务与 `conversation.view` slot 不兼容，等待上游修复 |
| `dsh-stickers` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-suggested-replies` | fork | 默认停用 | rc6 依赖与路径兼容 |
| `dsh-track` | fork | 兼容停用 | rc6 session-query、Context 与客户端契约不兼容 |
| `dsh-ui-progress` | fork | 组合启用 | workspace 路径兼容 |
| `dsh-vision-toolkit` | fork | 组合启用 | 默认匿名 Zen MiMo；设置页可切换免费 GLM |
| `dsh-web-ui-approval-notify` | fork | 组合启用 | rc6 测试路径兼容 |
| `whale-girl` | mirror | 默认停用 | rc6 时序不兼容 |

## 8 个 npm 快照插件

这些插件以已发布 npm 包内容 vendored 进 `plugins/`，并以 `file:` 依赖精确锁定；安装期不执行构建脚本。

| 目录 | npm 包 | 类型 | 版本 | 状态 |
|---|---|---|---|---|
| `dsh-better-sidebar` | `dsh-better-sidebar` | fork | 0.10.3 | 组合启用；移除安装期生命周期脚本 |
| `dsh-llm-fallbacks` | `dsh-llm-fallbacks` | fork | 0.1.0-alpha.1 | 兼容停用；移除安装期生命周期脚本 |
| `dsh-web-review` | `@canglongcl/dsh-web-review` | mirror | 0.1.0 | 兼容停用；发布包的 client 脚本语法损坏，等待上游修复 |
| `yet-another-subagent` | `@huanlin/dsh-plugin-yet-another-subagent` | mirror | 0.1.2 | 安装未挂载；客户端时序冲突 |
| `ya-workspace-sidebar` | `@huanlin/dsh-plugin-ya-workspace-sidebar` | mirror | 0.1.0 | 安装未挂载 |
| `interpreters` | `@huanlin/dsh-plugin-interpreters` | mirror | 0.1.0 | 安装未挂载 |
| `mineru` | `@huanlin/dsh-plugin-mineru` | mirror | 0.2.1 | 安装未挂载；需要自备 MinerU 服务 |
| `aigc-canvas` | `@huanlin/dsh-plugin-aigc-canvas` | fork | 0.1.0 | 安装未挂载；client module id 兼容补丁 |

## 市场基础设施（registry 精确锁定，不在 `plugins/`）

MyGO Core、Loader Hub、CLI 和 Web Panel 精确锁定 `0.2.0-rc.6`，是设置页里的插件市场入口。MyGO 只在用户点击安装/更新时下载额外插件；默认组合不依赖首次启动时联网拉取核心插件。

## 许可证

插件版权与许可证属于各自作者。二进制分发必须保留插件包内 LICENSE/NOTICE；已取得的额外分发授权应由维护者保存书面记录。AGPL 插件的源码与修改必须按其许可证提供。
