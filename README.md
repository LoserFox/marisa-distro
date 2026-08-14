# 魔理沙整合包（Marisa Distro）

> DSH 插件生态的一键整合发行：29 插件聚合包 + 一键安装脚本 + profile 直装。
> 命名纪念：dsh-external/marisa（插件管理器）——魔理沙 = 把 DSH 生态精选插件整合成可分发、可审计、带管理内核的发行形态。

## ✅ v1.1 状态（2026-08-13 晚）

**29 依赖整合包完全跑通：HTTP 200，56 boot entries，19 个 client 插件 + 7 host 侧插件。**

5 个曾被剔除插件全部修复回归：**dsh-track**（tsconfig mac 路径→harness、@deepseek-ai 链接重建）、**dsh-sonar**（缺 ui-conversation 链接 + clientModuleHost guard——web profile 禁用 HMR 时跳过 host 注册）、**dsh-sidechain**（cordis 迁移 4 文件 + 链接重建）、**dsh-diff-viewer**（链接修复）、**dsh-a2a**（tsconfig 重写 + cordis 迁移 5 文件）

mygo 管理器已挂载（config.profile: web 已补），pack 打包模式需临时禁用 web-startup。

## ✅ v1 状态（2026-08-13）

**`dsh web` 启动成功（HTTP 200），16 个 client 插件 + host 侧全部挂载，`window.__DSH_BOOT__` 清单 53 entries 验证通过。**

## 安装

### 方式 A：一键脚本（推荐）

```sh
git clone https://github.com/LoserFox/marisa-distro
cd marisa-distro
./install.sh --harness <deepseek-harness源码路径> [--profile marisa] [--skip-verify]
```

脚本会：clone 21 个源码插件 → 生成 profile（dependencies 展开 30 依赖）→ pnpm install → 启动验证。

### 方式 B：profile 直装

```sh
dsh plugin --profile marisa add link:/path/to/marisa-distro/dsh-allinone
```

## 构成

| 组件 | 说明 |
|---|---|
| `dsh-allinone/` | 聚合包：29 依赖 + 27 insert 行的 cordis.patch.yml |
| `install.sh` | 一键安装（clone 插件 + 生成 profile + install + 验证） |
| `plugins.json` | 插件权威清单（21 git 源码 + 8 npm 版） |

### 插件清单（31 + 管理内核 + 工具，全部公开可寻）

**源码态插件（20，git clone 分发）**

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
| dsh-llm-fallbacks | npm 未声明 | 未声明 |
| dsh-web-review | https://github.com/CanglongCl/dsh-web-review | 未声明 |
| dsh-plugin-yet-another-subagent（禁用） | npm @huanlin | AGPL-3.0 |
| dsh-plugin-ya-workspace-sidebar | npm @huanlin | AGPL-3.0 |
| dsh-plugin-interpreters | npm @huanlin | AGPL-3.0 |
| dsh-plugin-mineru | npm @huanlin | AGPL-3.0 |
| dsh-plugin-aigc-canvas | npm @huanlin | AGPL-3.0 |

**管理内核与工具**

| 组件 | 仓库 | License |
|---|---|---|
| mygo 管理器（0.2.0-rc.0 七包） | https://github.com/dsh-external/dsh-mygo （next 分支） | MIT |
| dsh-skill-manager | https://github.com/bitterSmilezzz/dsh-skill-manager | MIT |
| cordis-host-runner / tool-cordis | deepseek-harness 内置（https://github.com/deepseek-ai/deepseek-harness） | MIT |
| dsh-allinone（本包聚合 patch） | 本仓库 | MIT |

> 禁用的 2 个：multimedia-webui-input（依赖官方不存在的 client 包）、yet-another-subagent（与 better-sidebar client 时序冲突）。

## 协议声明

- 本发行（聚合包）为各插件的**独立聚合**（aggregate），不改动任何上游插件源码；各插件版权归其各自作者，许可证以上表为准（分发时保留各包 LICENSE）。
- **AGPL-3.0 注意**（@huanlin 系 5 个插件）：源码随 npm 包完整分发（node_modules 内可达），满足 AGPL 源码提供义务；若修改这些插件并对外提供服务，需按 AGPL 开源你的修改。
- 未声明 license 的插件（track/git-identity/llm-fallbacks/web-review）：默认保留所有权利，仅作个人使用。

## 待办

- [ ] mygo pack 离线打包：CLI 已激活，卡 pluginManager 服务链（peer 服务 storage/invariants 未配齐）；打包模式需临时禁用 web-startup
- [ ] install.sh 启动验证的 deps-status-check 超时问题（首次启动触发 harness pnpm install，需预稳定）
- [ ] desktop Windows 打包（需 Windows 主机）
- [ ] dsh-auth 登录实现

## 理论背景

Cordis 论文中文翻译：`/root/research/reports/cordis-paper-zh.md`（《时空可组合性的编程范式》——DSH/Cordis 的形式化基础：可逆效应、反应式余效应、动态组合演算）

## 🎯 mygo 管理内核状态（2026-08-14 升级 0.2.0-rc.0）

**完全重构版（next 分支）已升级**：@r05en1cu scope 七包（mygo/mygo-cli/mygo-api/mygo-ext-panel/mygo-ext-fabric/mygo-loader-hub/mygo-loader-profile），npm 公开版 rc6 兼容。
- 新 CLI：install/uninstall/enable/disable/instances/adopt/clone/hub（dsh-hub 市场）/config
- 新能力：pack 离线分发链路、pnpm 双门槛一键放行、热重载状态保持、bundle 解析预检、fabric 去重互斥
- 官方登记已知限制：web profile 严格参数解析（魔理沙已用 .argument 补丁修复）
- 构建适配（harness 内）：devDeps 改 workspace:^ + zod 装 harness 根 + 包内 @deepseek-ai 链接



**全链路激活**：
- pluginManager 服务 ✅（storage → storage-json → storage-domain → mygo 注入链完整）
- CLI 路由 ✅（`dsh --profile mygo mygo <pack|restore|init>`）
- pack/restore/init 命令链 ✅（pack 报"插件集为空"= 生态现状：当前仅 mygo-cli 有 dsh.mygo manifest，31 个社区插件均为 cordis/bundle 协议，mygo 新协议生态未跟进——非 bug）

**官方缺陷修复（本地 fork）**：web-startup 的 commander 不接受多余参数 → `dsh --profile web mygo pack` 必挂（docs 声称可用）→ 已加 `.argument('[args...]')` 透传（src/startup.ts + lib/startup.js）

**离线分发现状**：魔理沙的 31 插件分发 = install.sh（file: 源码 + 构建 + 链接修复 + 启动验证），不依赖 mygo pack

## 🖥️ Desktop 壳（Windows 路线）

**dsh-desktop 纯壳**（Go/Wails v3 + WebView2，dsh-external/dsh-desktop）：
- 壳 = 唯一 exe（~数 MB），spawn `dsh web --port 0` → 解析 stdout 端口 → WebView2 内嵌加载（无系统浏览器）
- 托盘常驻 / 开机自启 / 后端退避重启 / 退出清理进程树
- **魔理沙集成**：默认 `dsh web` 即指向魔理沙 profile（web）；自定义：
  `DSH_WEB_CMD="dsh --profile marisa web --port {port}"`
- Windows 使用：`install-windows.ps1`（dsh-win-port）装 dsh → 下载 `dsh-desktop-windows-amd64.zip` → 设置 DSH_WEB_CMD（可选）→ 运行 dsh-shell.exe
- Linux 构建已验证（本机 go build 通过，16.7MB；需 gtk4/webkitgtk-6.0/gstreamer devel）

## 📚 预装 Skill 包（36 个）

安装时自动复制到 `~/.dsh/skills/`（skill-local 发现目录，`/skills` 命令与 `skill_manage` 工具可见）：

| 包 | 数量 | 来源仓库 |
|---|---|---|
| **mattpocock** | 22 | https://github.com/mattpocock/skills （Matt Pocock 工程技能集：tdd/code-review/grilling/wayfinder 等） |
| **superpowers** | 14 | https://github.com/obra/superpowers （Jesse Vincent 的 agentic 技能框架：brainstorming/systematic-debugging/writing-plans 等） |

> 均为上游仓库的 SKILL.md 目录快照（本地改动零）；升级 = 重新 clone 上游后替换 `skills/<包名>/`。


## 🪟 Windows 端测试（2026-08-14 路线）

### 方式 A：Web 直跑（最快）

```powershell
# 1. 前置：Node 22+ / pnpm 11+ / Git（choco install nodejs git 或官网安装）
git clone https://github.com/deepseek-ai/deepseek-harness
git clone https://github.com/LoserFox/marisa-distro

# 2. 装插件依赖（marisa-distro/install.sh 是 bash——Windows 用 Git Bash 跑，
#    或手动：把 install.sh 生成的 ~/.dsh/profiles/marisa/ 结构建好）
#    Git Bash 里：
#    ./install.sh --harness <harness路径> --profile marisa --skip-verify

# 3. 启动（Node 直跑，无需 Docker）
cd deepseek-harness
pnpm dsh --profile marisa web --port 3080
# 浏览器打开 http://127.0.0.1:3080
```

### 方式 B：Desktop 壳（dsh-desktop，Windows 原生窗口）

- 壳 = Wails v3 + WebView2（Win10/11 自带 WebView2 runtime）
- 壳默认执行 `dsh web`（= `--profile web`），魔理沙集成 = `DSH_WEB_CMD="dsh --profile marisa web --port {port}"`
- Windows 构建：在 Windows 主机上 `wails build`（需 Go 1.22+），产出 exe（Linux 侧已验证 16.7MB 构建 + go test 全过，Windows 同架构待主机验证）

### 已知 Windows 差异

- `install.sh` 的 bash 脚本需 Git Bash/WSL（或按 install.sh 步骤手动：plugins.json → profile/package.json → pnpm install）
- node-pty（终端功能）Windows 需 MSVC 构建工具链（npm rebuild node-pty），失败仅终端面板不可用
- 路径用 `/` 或 `\` 统一（Git Bash 下用 `/`）
