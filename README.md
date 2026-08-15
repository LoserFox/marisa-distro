# 魔理沙整合包 v2（Marisa Distro v2）

> DSH 插件生态的 fork 发行：**harness/ + plugins/ + desktop/** 三合一单仓库 + 单构建脚本 + 单文件桌面发行。
> 命名纪念：dsh-external/marisa（插件管理器）——魔理沙 = 把 DSH 生态精选插件整合成可分发、可审计、可构建的发行形态。
> v2 起从「安装脚本发行」（v1）转向「fork 源码发行」（v2）：全部源码入库，pnpm 单 workspace 一次构建。

## 架构

```
marisa-distro/                 ← 单 pnpm workspace（pnpm-workspace.yaml）
├── harness/                   ← deepseek-harness 0808 快照 fork（vendor 自 ~/.dsh/source/current-0808）
│   ├── apps/                  ← cli / web
│   ├── packages/              ← core / host / client / …（官方 workspace 包）
│   └── vendor/                ← cordis / cosmokit / …（内置 vendor 包）
├── plugins/                   ← 21 个社区插件源码（git clone 态，随仓库分发）
├── desktop/                   ← dsh-desktop 壳（Go/Wails v3 + WebView2，含 webview_ready 修复）
├── profiles/marisa/           ← 魔理沙 profile（依赖展开 + patch）
├── package.json               ← name: marisa-distro / version: 2.0.0 / build: build.ps1
├── pnpm-workspace.yaml        ← 单 workspace：harness + plugins + 根
└── build.ps1                  ← 唯一构建入口
```

- **fork 模型**：harness 以普通目录 vendor 入库（去掉嵌套 .git / node_modules / lib / dist / tsbuildinfo / lockfile），根目录为单一 workspace；插件保留各自 `lib/` 构建产物，排除 node_modules（junction）与 .git。
- **profiles/marisa/**：魔理沙 profile 定义插件集合与依赖，`dsh --profile marisa web` 即启动魔理沙形态。

## 构建与发布

- **单构建脚本**：`npm run build` → `powershell -File build.ps1`（构建 harness + 插件 + desktop 壳）。
- **MSI**：先生成 `desktop/bundle/backend.zip`，再运行 `pwsh -NoProfile -File desktop/scripts/build-msi.ps1`。MSI 使用薄桌面壳并在安装阶段展开后端，首次启动不再自解压；脚本会缓存官方 WiX Toolset v3.14.1 便携工具，最终用户无需安装 WiX 或 .NET SDK。
- **发布模型**：单文件 desktop exe（Wails v3 + WebView2，Windows 10/11 自带 runtime）。壳内嵌 spawn `dsh web --port 0` → 解析 stdout 端口 → WebView2 加载，托盘常驻 / 开机自启 / 后端退避重启 / 退出清理进程树；产物为单一可分发 exe，无需系统浏览器。
- **desktop/ 说明**：工作树携带本地未提交修复——`webview_ready.go` / `main.go` 的 `subscribeWebviewReady`（首次导航完成信号，`app.Run` 前订阅），修复随仓库分发。

## 与 upstream 的已知偏离（fork 差异）

1. **MyGO 使用独立发布线**：0808 harness 快照不内置 MyGO；本发行从 npm 精确锁定 MyGO `0.2.0-rc.6` 的核心、Hub loader、CLI 与 Web Panel，并将其作为唯一插件市场/生命周期后端。
2. **multimedia-webui-input 禁用**：该插件依赖 `@deepseek-ai/dsh-client-ui-slash`，**官方 harness 不存在此包**（rc.5 无此依赖），无法修复，web/marisa-test 同步禁用——见 v1.2 验收报告 `legacy/docs-验收报告-20260814.md`（2026-08-14，真实 API key 全功能验收）。

## 插件清单（31 插件 + 管理内核 + 工具，全部公开可寻）

**源码态插件（21，git clone 分发）**

| 插件 | 仓库 | License |
|---|---|---|
| dsh-genui | https://github.com/dsh-external/dsh-genui | MIT |
| dsh-qwen-mm | https://github.com/dsh-external/Qwen-MM-Plugins | BSD-3-Clause |
| dsh-track | https://github.com/dsh-external/dsh-track | 未声明 |
| dsh-a2a | https://github.com/dsh-external/dsh-a2a | BSD-3-Clause |
| dsh-paste-input | https://github.com/lhh010/dsh-paste-input | MIT |
| dsh-multimedia-webui-input（禁用） | https://github.com/dsh-external/dsh-multimedia-webui-input | MIT |
| dsh-artifact | https://github.com/dsh-external/dsh-artifact | BSD-3-Clause |
| dsh-code-map | https://github.com/dsh-external/dsh-code-map | BSD-3-Clause |
| dsh-diff-viewer | https://github.com/dsh-external/dsh-diff-viewer | BSD-3-Clause |
| dsh-drag-and-drop | https://github.com/dsh-external/dsh-drag-and-drop | BSD-3-Clause |
| dsh-input-history | https://github.com/lhh010/dsh-input-history | BSD-3-Clause |
| dsh-sidechain | https://github.com/dsh-external/dsh-sidechain | BSD-3-Clause |
| dsh-stickers | https://github.com/dsh-external/dsh-stickers | BSD-3-Clause |
| dsh-suggested-replies | https://github.com/dsh-external/dsh-suggested-replies | MIT |
| dsh-ui-progress | https://github.com/lhh010/dsh-ui-progress | BSD-3-Clause |
| dsh-vision-toolkit | https://github.com/dsh-external/dsh-vision-toolkit | MIT |
| dsh-workflow | https://github.com/dsh-external/dsh_workflow | MIT |
| dsh-web-ui-notify | https://github.com/dsh-external/dsh-web-ui-approval-notify | BSD-3-Clause |
| dsh-git-identity | https://github.com/dsh-external/dsh-git-identity | 未声明 |
| dsh-sonar | https://github.com/dsh-external/dsh-sonar | MIT |
| whale-girl | https://github.com/dsh-external/whale-girl | MIT |

**npm 版插件（8）**

| 插件 | 仓库 | License |
|---|---|---|
| dsh-better-sidebar | https://github.com/omdsh-dev/DSH-better-sidebar | MIT |
| dsh-llm-fallbacks（兼容性停用） | npm 未声明；需要完整 rc6 conversationEvents/remote 事件 API | 未声明 |
| dsh-web-review | https://github.com/CanglongCl/dsh-web-review | 未声明 |
| dsh-plugin-yet-another-subagent（禁用） | npm @huanlin | AGPL-3.0 |
| dsh-plugin-ya-workspace-sidebar（默认未启用） | npm @huanlin | AGPL-3.0 |
| dsh-plugin-interpreters（默认未启用） | npm @huanlin | AGPL-3.0 |
| dsh-plugin-mineru（默认未启用） | npm @huanlin | AGPL-3.0 |
| dsh-plugin-aigc-canvas（默认未启用） | npm @huanlin | AGPL-3.0 |

**管理内核与工具**

| 组件 | 仓库 | License |
|---|---|---|
| MyGO 核心 + Hub + CLI + Web Panel（0.2.0-rc.6，按需下载插件） | https://github.com/omdsh-dev/dsh-mygo （next 分支） | MIT |
| dsh-skill-manager | https://github.com/bitterSmilezzz/dsh-skill-manager | MIT |
| cordis-host-runner / tool-cordis | deepseek-harness 内置（https://github.com/deepseek-ai/deepseek-harness） | MIT |
| dsh-allinone（v1 聚合 patch，已归档） | 本仓库 | MIT |

> 兼容性停用：multimedia-webui-input（依赖官方不存在的 client 包）和 dsh-llm-fallbacks（需要完整 rc6 客户端事件 API）。yet-another-subagent 因与 better-sidebar 的 client 时序冲突默认停用；其余标注“默认未启用”的 npm 插件已安装，可由 MyGO 显式启用。

## 协议声明

- 本发行（fork 聚合）为各插件的**独立聚合**（aggregate）。兼容性改动以可审计 patch 或 harness fork commit 保存（当前包括 client-modules 服务别名和 AIGC Canvas 0.1.1 client id 修正），便于后续提交上游；各插件版权归其各自作者，许可证以上表为准（分发时保留各包 LICENSE）。
- **AGPL-3.0 注意**（@huanlin 系 5 个插件）：源码随 npm 包完整分发（node_modules 内可达），满足 AGPL 源码提供义务；若修改这些插件并对外提供服务，需按 AGPL 开源你的修改。
- 未声明 license 的插件（track/git-identity/llm-fallbacks/web-review）：默认保留所有权利，仅作个人使用。

## legacy/（v1 归档）

v1 安装脚本发行已归档至 `legacy/`（git 历史完整保留）：`install.sh`、`plugins.json`、`dsh-allinone/`、`skills/`（mattpocock 22 + superpowers 14 预装 skill 快照）、`marisa-test/`、两份验收报告（20260813 / 20260814 v1.2）。v1 的「clone 插件 + 生成 profile + pnpm install」流程仍可参考，v2 已改为 fork 源码直发。

## 启动

```sh
pnpm install          # 根 workspace 一次安装（harness + plugins + 根）
pnpm dsh --profile marisa web --port 3080
# 浏览器打开 http://127.0.0.1:3080；或构建 desktop 壳以 WebView2 窗口运行
```
