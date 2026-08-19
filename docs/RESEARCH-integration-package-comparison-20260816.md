# EAC、SnowSalt 与 Marisa 整合方案对比

> 调研时间：2026-08-16（Asia/Shanghai）  
> 对比对象：
> [Deepseek-Harness-EAC](https://github.com/zouyuxuan122/Deepseek-Harness-EAC)、
> [deepseek-harness-snowsalt](https://github.com/KYZHXL/deepseek-harness-snowsalt)、
> [Marisa DSH](https://github.com/omdsh-dev/marisa-distro)  
> 快照：EAC `74e3b464`，SnowSalt `878d4e97`，Marisa 已发布版本 `bdc76fb2`（v0.1.1）

## 结论

不存在所有维度都最好的方案，但若目标是“可长期维护、可审计、可持续跟进 DSH 上游的社区发行版”，**Marisa 当前方案整体最好，不应改以 EAC 或 SnowSalt 为基础**。

- **EAC 是当前最成熟的终端用户整合包**：Windows 安装版和便携版约 168 MB，带内置 Node、托盘、无边框窗口、崩溃恢复、客户端与 DSH 双更新、皮肤和配套插件；Linux 也已有原生包。它在“下载后立即使用”和桌面细节上领先 Marisa。[README](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md) [v3.0.1 Release](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/tag/v3.0.1)
- **SnowSalt 是有价值的产品原型，不是合适的发行基础**：它直接在 Harness 整仓中加入 ChatGPT/Codex 风格 UI、供应商预设、插件市场、Skills 管理和 Persona 页面，交互方向值得借鉴；但仓库以一个无上游历史的全量导入提交起步，随后删除上游 CI，且 Git 树没有 README 所称的 `desktop/` 与 `plugin-manager/`。这使上游同步、构建溯源和桌面复现明显弱于另外两者。[首次导入提交](https://github.com/KYZHXL/deepseek-harness-snowsalt/commit/963a54983cb3f7d79c885e2ed8058da055adecae) [删除 CI 提交](https://github.com/KYZHXL/deepseek-harness-snowsalt/commit/f0a6d1f0b7ac8f68b31b7771d2094e0db4a06e8f) [README](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/README.zh.md)
- **Marisa 是三者中发行治理最完整的方案**：Harness、桌面壳、28 个 vendored 插件、上游基线和差异账本位于同一 tag；mirror/fork 有不同同步规则；CI 检查锁文件、仓库边界、Harness CLI 和两种桌面 bundle；Release 必须由维护者确认真实窗口和 MSI 安装/启动/卸载后手工触发，并生成 `SHA256SUMS.txt`。[架构](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/architecture.md) [CI](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/ci.yml) [Release workflow](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/release.yml)

简化判断：

| 目标 | 最合适的方案 |
|---|---|
| 普通用户今天下载即用、体积较小、桌面功能丰富 | **EAC** |
| 快速试验 Web UI、Skills/Persona 管理交互 | **SnowSalt** |
| 做长期维护、可审计、可复现的 DSH 发行版 | **Marisa** |

## 核心架构差异

| 维度 | EAC | SnowSalt | Marisa |
|---|---|---|---|
| Harness 来源 | 把 npm 发布的 `@deepseek-ai/dsh@0.1.0-rc.6` 作为 Electron 应用依赖；README 称“内核零改动” | 复制完整 Harness 源码后直接修改 UI、Host API、bundle 和 workspace | 导入 Harness fork，明确记录上游 commit、DSH 版本与每项本地差异 |
| 桌面壳 | Electron；内置独立 Node/npm；启动 `dsh web` 后加载回环地址 | Release 有 Electron 安装器，但桌面源码不在 Git 树；安装器还需要外部后端 | Go/Wails；Windows standalone 内嵌 backend，MSI 安装时展开同一 backend |
| 产品扩展 | 桌面壳在启动时把配套插件、皮肤和 agent presets 写入用户 profile | 新增 Harness workspace packages，并扩展 API proxy | 默认插件 vendored；MyGO 市场按用户操作下载更多插件；产品补丁与上游源码差异分账 |
| 依赖图 | `dsh-desktop/package-lock.json`；配套记忆插件还直接提交依赖树 | 上游式 pnpm workspace 和 lockfile | 根 `pnpm-lock.yaml` 是唯一依赖图；禁止嵌套 lockfile/workspace 参与构建 |

EAC 的“外围封装”降低了修改官方 Harness 的成本，但把兼容逻辑转移到了桌面壳：profile 修复、插件同步、patch 修复、更新 overlay、内置 runtime 和配套插件闭包都由 Electron 侧承担。[桌面包清单](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/package.json) [打包配置](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/electron-builder.yml) [主进程](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/main.js)

SnowSalt 口号是 “Everything is a Plugin”，新增功能也确实按 workspace package 拆分；但它同时修改 Host API、客户端连接、现有 UI 包、bundle 清单和 TypeScript 配置，因此在版本控制层面仍是一个大面积 Harness fork，不是可以独立升级的外置插件集合。[Web bundle](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/bundle/web-app/package.json) [API proxy](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api-proxy.ts)

Marisa 也维护 Harness fork，但把代价显式化：`maintenance/upstreams.json` 固定基线，`docs/upstream-diff.md` 逐项记录修改、原因和删除条件；插件分成不得手改的 mirror 与有差异账本的 fork。[上游清单](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/maintenance/upstreams.json) [Harness 差异](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/upstream-diff.md)

## 桌面与 UI

### EAC

EAC 的桌面产品完成度最高：无边框窗口、自绘标题栏、系统托盘、稳定端口、后端 watchdog、渲染恢复、会话完成通知、便携模式、文件 diff/回退、会话内终端、十套皮肤和右侧栏均在当前源码或 README 中有对应实现。[功能与架构说明](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md) [恢复逻辑](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/renderer-recovery.js)

代价是桌面壳承担了很多业务逻辑，并通过 preload 向 Web UI 暴露窗口、余额、服务重启、文件回退和打开路径等 IPC。虽然 Electron `BrowserWindow` 使用了 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，IPC 表面仍需持续安全审计。[窗口配置](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/main.js#L575) [preload](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/preload.js)

### SnowSalt

SnowSalt 对 Web 产品面的改造最直接：重做对话区、输入条、侧边栏和欢迎页，并把模型供应商预设、Persona、Skills 与插件市场加入设置页。[README 功能清单](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/README.zh.md) [供应商预设](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/client/ui-settings-models/src/client/provider-presets.ts) [Skills UI](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/client/ui-settings-skills/src/client/SkillsSection.tsx)

但桌面部分不可由当前 Git 树复现：README 的目录结构列出 `desktop/` 和 `plugin-manager/`，实际 tree 不包含二者；同一 README 也说明安装版需要把源码仓库放在安装目录旁，或设置 `DSH_BACKEND_DIR`。Release 后来上传了 1.31 GB 的 portable zip，但仍没有与它对应的桌面构建源码和 CI。[仓库 tree](https://github.com/KYZHXL/deepseek-harness-snowsalt/tree/878d4e97d718c6b46dd298a5556f0939b26680c3) [v0.1.0-salt Release](https://github.com/KYZHXL/deepseek-harness-snowsalt/releases/tag/v0.1.0-salt)

### Marisa

Marisa 的 Wails 壳有原生窗口、托盘、后端进程组守护、异常退避重启、installed/embedded 两种 bundle 模式；它比 EAC 的桌面功能少，但壳层职责更窄。[桌面主程序](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/desktop/main.go) [桌面说明](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/desktop/README.zh.md)

当前明显短板是 Windows 产物约 382–388 MB，约为 EAC 的 2.3 倍；Linux/macOS 只是依赖系统 DSH 的实验壳，而 EAC 已给出 Linux x64 的 pacman/deb/rpm/AppImage 自包含包。[Marisa v0.1.1](https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1) [EAC Linux Release](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/tag/v3.0.1-linux)

## 插件、Skills 与 Persona

| 能力 | EAC | SnowSalt | Marisa |
|---|---|---|---|
| 默认扩展 | 十套皮肤、配套插件、社区插件、agent presets | 基本继承完整 Harness，并新增 UI/Host packages | 28 个 vendored 插件，状态分为启用、安装未挂载、兼容停用 |
| 市场 | `dsh-webui-market`，读取社区目录并安装/卸载 | 硬编码 5 个官方条目，通过 `pnpm dsh plugin` 操作 web profile | MyGO Core/Hub/CLI/Web Panel 精确锁定，用户点击后下载 |
| Skills | 可从 Codex/Claude Code 迁移；随 preset 分发技能 | 列出 `~/.dsh/skills`，切换模型/用户调用，删除 skill | 使用 DSH skills 与选定插件；目前没有等价的可视化管理页 |
| Persona | `soul.md` 插件和可视化编辑 | 直接读写用户全局 instructions/`AGENTS.md` | 依赖 DSH/profile 约定；没有 SnowSalt 的独立 Persona 页 |

SnowSalt 的管理边界设计值得借鉴：Skills API 只允许管理用户根 `~/.dsh/skills`，不允许 UI 修改项目或 bundled skills；请求按 skill name 寻址，更新 frontmatter，删除时移除用户 skill 文件/目录。[Skills API 契约](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api/skills.ts) [实现](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api-proxy.ts#L1164)

它的插件市场也避免浏览器提交任意命令，只接受硬编码 id；但 Host 最终会启动 `pnpm dsh plugin add/remove/update`，因此仍然具有联网、执行包管理器、写 profile 和运行第三方安装逻辑的供应链权限。[市场契约](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api/plugin-market.ts) [命令执行](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api-proxy.ts#L1334)

Marisa 在扩展数量和来源审计上更强。每个 git 插件记录完整 commit，每个 npm 快照记录版本；fork 必须有差异文档，mirror 禁止本地功能修改；npm 快照不得保留安装生命周期脚本。[插件清单](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/plugins.md) [维护 schema](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/maintenance/README.md)

EAC 的功能面最大，但第三方闭包最难审：HEAD 共跟踪 2,859 个文件，其中 2,469 个位于 `dsh-tdai-memory/node_modules`。这能确保某个插件自包含运行，却显著增加源码审查、许可证清点和升级 diff 的噪声。[插件目录](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/tree/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/assets/plugins/dsh-tdai-memory)

## 更新与上游同步

### EAC：用户更新体验最好，上游兼容治理较弱

EAC 有两条独立更新链：

1. DSH 更新通过内置 npm 把新版本装入用户数据目录的 staging，再原子切换为 overlay，失败保留旧版本并支持回退。[DSH updater](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/updater.js)
2. 客户端从 GitHub/Gitee Release 下载新 exe，退出后用脚本替换便携版或运行安装器；支持断点续传和失败恢复。[客户端 updater](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/client-updater.js)

问题在于 DSH overlay 追随 npm 最新版，没有 Marisa 式“候选 PR → 重放差异 → 全组合验证 → 发布”的兼容闸门。EAC 的配套插件、profile heal 和 patch 逻辑与特定 DSH 行为耦合；自动更新虽然方便，也更容易把未经整包验证的新内核交给用户。

### SnowSalt：没有可见的同步方案

SnowSalt 只有 4 个提交。首提交一次性导入完整树，没有保留上游 Git ancestry 或记录上游 baseline；随后又因 token 权限删除全部上游 workflow。仓库保留了 Dependabot 配置，但没有同步脚本、差异账本、CI 或 release build workflow。[提交历史](https://github.com/KYZHXL/deepseek-harness-snowsalt/commits/deepseek-harness-salt/) [删除 workflow](https://github.com/KYZHXL/deepseek-harness-snowsalt/commit/f0a6d1f0b7ac8f68b31b7771d2094e0db4a06e8f)

这不是说代码本身不能合并上游，而是当前仓库没有提供可审查、可重复的合并路径。对快速原型可以接受，对持续发行风险最高。

### Marisa：维护流程最好，用户更新体验最弱

Marisa 每日检查 Harness、git 插件和 npm 快照。mirror 可以生成源码替换候选；fork 与 npm 快照只生成候选元数据，要求人工重放差异和验证。机器人只建 PR，不直接合并或发布。[同步说明](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/upstream-sync.md) [同步 workflow](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/upstream-sync.yml)

不过，截至调研时最近一次定时同步并未完整跑通：部分候选分支成功生成，但 GitHub Actions 没有获准创建 PR，另有若干镜像同步和 lockfile 刷新 job 失败。也就是说，Marisa 的同步治理设计领先，但自动化当前仍需修复后才能兑现完整闭环。[失败的定时同步](https://github.com/omdsh-dev/marisa-distro/actions/runs/31925650390)

缺点是应用目前没有自更新，用户需要自行下载新 Release；这是 EAC 最值得移植的体验，但必须保留 Marisa 的验证通道与签名/摘要要求。

## 安装、发布和产物

| 项 | EAC | SnowSalt | Marisa |
|---|---|---|---|
| Windows 安装 | NSIS Setup，约 167.9 MB | Setup，约 99.6 MB，但文档要求外部后端 | MSI，约 387.7 MB，自包含 |
| Windows 便携 | 单 exe，约 167.7 MB | portable zip，约 1.31 GB | standalone exe，约 382.2 MB |
| Linux | x64 pacman/deb/rpm/AppImage，自包含 Node/npm | 未提供 | x64 实验壳，依赖系统 DSH/GTK/WebKit |
| macOS | 未提供 | 未提供 | Apple Silicon 实验壳，未签名、未公证 |
| 校验 | GitHub asset API 有 digest；README 未提供独立校验文件 | GitHub asset API 有 digest；README 未提供独立校验文件 | Release 同时提供 `SHA256SUMS.txt` |

产物大小来自各项目当前 Release 的 GitHub asset 元数据：[EAC v3.0.1](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/tag/v3.0.1)、[SnowSalt v0.1.0-salt](https://github.com/KYZHXL/deepseek-harness-snowsalt/releases/tag/v0.1.0-salt)、[Marisa v0.1.1](https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.1)。

EAC 还明确要求 Windows 使用纯英文路径，否则可能发生 Chromium 渲染崩溃；这是开箱体验中的实际限制。[安装说明](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md)

## 测试与 CI

### EAC

- `npm test` 运行桌面端 Node 测试；v3.0.1 Release 声称 141 项通过，覆盖 updater、bundle 完整性、renderer recovery、profile heal、安装器和插件等场景。[测试脚本](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/package.json) [测试目录](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/tree/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/test) [Release 证据](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/tag/v3.0.1)
- 当前 `main` Git tree 没有 `.github/workflows/`。GitHub 仍列出一条来自 `linux` 分支的 Linux 打包 workflow，它在 pacman 与 deb/rpm/AppImage job 中运行测试，但没有 Windows 构建/安装 CI。[linux 分支 workflow](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/38522a21b2cd7a9b4532464b0369691c74531dc8/.github/workflows/build-arch-pacman.yml)

### SnowSalt

- 保留了上游庞大的测试和静态检查脚本，并为新增 Skills 页面添加了客户端测试；Host fetch 测试也覆盖新增管理 RPC 的传输形状。[Skills 测试](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/client/ui-settings-skills/tests/skills-section.client.spec.tsx) [Host transport 测试](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/tests/fetch-carrier.spec.ts)
- 没有 CI workflow；插件市场、Persona、供应商预设和桌面安装器也没有可见的专项发布门禁。源码中存在测试不等于这些测试在提交或 Release 前实际运行。

### Marisa

- Windows CI 在 push/PR 上执行 frozen install、仓库/profile 契约、Harness CLI 测试、installedbundle/embeddedbundle Go 测试和 PR 边界检查。[CI workflow](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/ci.yml)
- Release workflow 从已存在 tag 构建，校验 tag 未移动，要求人工勾选真实桌面与 MSI 验收，Windows 失败则禁止发布；实验平台失败不阻断 Windows。[Release workflow](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/release.yml)
- 当前不足是 CI 仍主要验证后端与构建契约，真实窗口和安装/卸载依赖人工声明，不是自动化 GUI/MSI 测试。

## 安全、权限与供应链

### EAC

优点：Web backend 默认只绑定 `127.0.0.1`；Electron renderer 隔离配置正确；DSH npm 更新通过 staging/overlay，失败不破坏 bundled copy。[README 架构图](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md) [窗口配置](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/main.js#L575)

主要风险：

- 客户端 updater 下载后会执行 exe，只检查文件至少 64 MB；如果 Release 声明大小与实际不同，只记录日志后继续。代码没有读取 GitHub asset `digest`，也没有签名或本地 SHA256 验证。[下载校验](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/client-updater.js#L354)
- 更新源可由环境变量换成自定义 API，进一步提高了下载源被误配时的风险。[更新端点](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/client-updater.js#L54)
- 配套插件会读取凭据、调用 DeepSeek 余额 API、执行终端、写文件、安装插件、访问视觉模型和长期记忆服务；功能强，也意味着权限面最大。[配套插件说明](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/dsh-desktop/README.md)

### SnowSalt

插件市场请求不是任意 shell 字符串，而是服务端 id 白名单，这是正确方向。但市场仍调用 pnpm 并写 web profile；Skills 页面可以改写和递归删除用户 skills；Persona 页面可以覆盖全局 instructions。它们都应在 UI 中明确展示权限影响，并要求危险操作确认。[市场实现](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api-proxy.ts#L1257) [Skills 实现](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/host/apiproxy/src/api-proxy.ts#L1206) [Persona store](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/packages/client/ui-settings-persona/src/client/store.ts)

最大供应链问题不是某一行危险代码，而是 Release 桌面产物无法从仓库源码和 workflow 对应复现。

### Marisa

Marisa 当前未签名，这是三者共同面对但 Marisa 明确披露的问题；Release 生成独立 SHA256 文件，工作流固定 tag commit，且普通 push/定时任务无发布权限。[签名现状](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/signing.md) [Release workflow](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/.github/workflows/release.yml)

仓库规则还要求任何插件新增网络、进程、文件写入、密钥或模型访问能力时披露权限影响；npm 快照禁止安装生命周期脚本。三者中只有 Marisa 把这类要求写成统一发行政策并用 repository tests/PR boundaries 部分执行。[贡献规则](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/AGENTS.md) [仓库验证器](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/scripts/verify-repository.mjs)

## 许可证

| 项目 | 观察 |
|---|---|
| EAC | README 宣称 MIT 并链接根 `LICENSE`，但当前 commit 根目录没有该文件，GitHub API 也未识别仓库许可证；内置 `maid-atelier` 皮肤标为 CC BY-NC-SA 4.0，禁止商业使用，所以整包不能简单概括为全部 MIT |
| SnowSalt | 根 `LICENSE` 为 MIT，并保留上游 `THIRD_PARTY_NOTICES.md`；Release 另附 source zip |
| Marisa | 自有代码根 `LICENSE` 为 MIT；文档明确 vendored 组件继续服从各自许可证，要求保留 LICENSE/NOTICE 和满足 AGPL 源码义务 |

来源：[EAC README/许可表](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/74e3b4645177d650362971f4a557b6d380ff9755/README.md)、[EAC 根 tree](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/tree/74e3b4645177d650362971f4a557b6d380ff9755)、[SnowSalt LICENSE](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/LICENSE)、[SnowSalt notices](https://github.com/KYZHXL/deepseek-harness-snowsalt/blob/878d4e97d718c6b46dd298a5556f0939b26680c3/THIRD_PARTY_NOTICES.md)、[Marisa LICENSE](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/LICENSE)、[Marisa 插件许可证规则](https://github.com/omdsh-dev/marisa-distro/blob/bdc76fb269faf7e87c88c1c3c11cf30ccaa8bf32/docs/plugins.md#%E8%AE%B8%E5%8F%AF%E8%AF%81)。

## 活跃度

三者都在 2026-08-13 至 08-14 才创建，样本不足以判断长期维护能力。截至调研时：

| 项目 | 提交 | Release | 贡献者 | Stars / Forks | 说明 |
|---|---:|---:|---:|---:|---|
| EAC | 17 | 8 | 2（GitHub contributors API 默认只列 1 位；另有 Linux PR 作者） | 489 / 11 | 两天内快速迭代，已有真实 issue 驱动的修复，但速度也带来 v2/v3 安装与更新回归 |
| SnowSalt | 4 | 1 | 1 | 26 / 0 | 首次导入后约 43 分钟停止代码提交，后续仅 README；尚不能证明持续同步能力 |
| Marisa | 34 | 1 | 1 | 1 / 0 | 治理与 CI 建设密集，用户采用度远低于 EAC |

来源为各仓库的一手提交与 Release 页面：[EAC commits](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/commits/main/) / [releases](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases)，[SnowSalt commits](https://github.com/KYZHXL/deepseek-harness-snowsalt/commits/deepseek-harness-salt/) / [release](https://github.com/KYZHXL/deepseek-harness-snowsalt/releases)，[Marisa commits](https://github.com/omdsh-dev/marisa-distro/commits/main/) / [release](https://github.com/omdsh-dev/marisa-distro/releases)。Stars 是受关注度，不是质量、测试或安全证据。

## 建议 Marisa 吸收什么

### 优先吸收

1. **EAC 的桌面恢复与更新 UX**：托盘更新入口、下载进度、断点续传、失败回滚、启动失败后的恢复页都值得采用；实现时必须验证 release digest/SHA256，未来接入代码签名，并只更新到 Marisa 已发布、已验收的 tag，不能直接追 npm 最新 Harness。
2. **SnowSalt 的 Skills 管理边界**：只管理用户 skill root，项目/bundled skills 只读；模型调用、用户调用开关和删除确认都适合作为独立插件或上游 PR，而不是继续扩大 Harness fork。
3. **SnowSalt 的供应商预设与 Persona 交互**：把“常见模型配置”和“全局 instructions”变成可见表单；优先通过现有设置服务/插件 slot 实现。
4. **EAC 的包体与 Linux 经验**：分析其 npm 发布闭包为何能做到约 168 MB，并评估 Marisa backend 中冗余源码、构建产物和跨平台依赖；Linux 可借鉴 electron-builder 的多格式流水线，但不能宣称支持，直到完成真实窗口和安装验收。
5. **EAC 的用户功能清单**：终端、文件 diff/回退、通知、可恢复启动页比继续堆叠装饰性皮肤更能提高生产力，应按权限和稳定性逐项评估。

### 不应照搬

- 不提交插件自己的 `node_modules`；继续使用根 lockfile、发布产物快照和许可证清单。
- 不让应用把 DSH 自动更新到未经 Marisa 组合验证的 npm 最新版。
- 不采用 SnowSalt 的“无 ancestry 全量导入 + 删除 CI”仓库模型。
- 不把桌面安装器与实际构建源码分离发布。
- 不在没有 digest/签名验证时自动下载并执行更新 exe。
- 不把 CC BY-NC-SA 等非商业资源混进标称 MIT 的默认整包而缺少顶层许可证说明。

## 最终判断

**Marisa 的方向是对的，但产品完成度暂时落后 EAC。** 应继续以 Marisa 的单仓库、固定基线、mirror/fork、候选 PR、CI 和人工 Release 闸门作为底座；下一阶段重点不是换底座，而是把 EAC 的桌面恢复/更新体验与 SnowSalt 的 Skills/Persona/供应商 UI 以可插拔、可测试、权限可见的方式吸收进来。

如果只面向今天的 Windows 普通用户推荐成品，EAC 更有吸引力；如果维护者要承担未来多个 DSH rc、插件许可证、安全更新和可复现发布，Marisa 明显更稳；SnowSalt 当前更适合作为 UI 设计与实现参考。
