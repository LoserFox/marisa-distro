# Codex Computer Use 迁移到 DSH 的可行性调研

日期：2026-08-23
状态：**调研完成，未动手**（结论：Codex computer use 为闭源实现，无法直接迁移；推荐按架构模式自建最小依赖方案，或走 Playwright MCP 路线）
来源基线：`openai/codex` 仓库 head `e482cc66aeeedcb9f333a1f5a0a554eb5aea4b36`（2026-08-21 本地浅克隆核实）+ GitHub issue #25507/#28493 全文 + 各替代项目官方 README（2026-08-23 抓取）。

## 结论摘要

1. **Codex computer use 在开源仓库里不存在实现**——`openai/codex`（Apache-2.0）中只有三样东西：requirements-only 的 `ComputerUse` feature 开关、`allow_locked_computer_use` 配置项、以及一个 marketplace 插件 id `computer-use@openai-bundled`。真实实现是闭源 Codex Desktop App 从 OpenAI 后端下载的插件包。
2. **闭源插件包结构已由 issue 诊断确证**：`~/.codex/plugins/cache/openai-bundled/computer-use/<版本>/` 内含 `node_modules/@oai/sky`（JS 运行时，公共 npm 404 不存在）、`bin/windows/codex-computer-use.exe`（原生助手）、`computer-use-client.mjs`；Windows 侧通过命名管道 `\\.\pipe\codex-computer-use-*` + 环境变量 `SKY_CUA_NATIVE_PIPE_DIRECTORY` 注入一个打包的 Node 运行时（`cua_node`），模型侧暴露 `computer` 工具命名空间（Responses API 保留命名空间）。
3. **依赖远非最小，且不可移植**：需要闭源桌面 App + OpenAI 账号/后端 + 服务端 feature gate + 每平台原生 exe + 管道注入。且 Windows 端实际故障频发（#25507、#28493 及 5 个重复 issue：Windows 上「后端活着但模型拿不到工具」「管道未注入」是常态）。
4. **迁移结论：代码不可迁移，架构模式可复制**。值得复制的模式只有一条：`JS 运行时 + 原生 helper + 命名管道` 的进程间桥。DSH 已有更省的替代拼图：工具注册（Cordis 动态插件 `harness.defineTool/registerTool`）、MCP client（可消费现成 computer-use MCP server）、modlens 视觉桥（截图→文字，已集成）。
5. **更优雅的替代**：多数真实需求（网页操作）用 **Playwright MCP**（官方、Node、DSH MCP client 直接消费，零核心改动）；整桌面操控用 **Windows 内建能力**（PowerShell/.NET：屏幕截图 + SendKeys + UIA）或一个自研 ~100-300KB 原生 helper，视觉复用 modlens——全部零新增重量级依赖。Python 系（browser-use/OmniParser）与独立 GUI agent 产品（TARS）不符合 Marisa「装完即用、无 Python」定位。

## 一、一手来源与方法

- `openai/codex` 仓库本地浅克隆（`--depth 1 --filter=blob:none`，head e482cc66），以下文件路径均出自该克隆。
- GitHub issues 全文抓取（正文 + 评论区诊断数据）：
  - [issue #25507](https://github.com/openai/codex/issues/25507)「Windows Computer Use unavailable: nativePipe missing and SKY_CUA_NATIVE_PIPE_DIRECTORY not injected」
  - [issue #28493](https://github.com/openai/codex/issues/28493)「Windows Computer Use backend works, but computer tool is not exposed to model」
  - 重复 issue：#25391、#26929、#28275、#27907、#28481。
- npm registry 直查 `@oai/sky`：404 Not Found（未公开）。
- 替代方案官方 README：browser-use、bytedance/UI-TARS-desktop、microsoft/OmniParser、microsoft/playwright-mcp、anthropics/anthropic-quickstarts（computer-use-demo）。

## 二、开源仓库中 computer use 的全部痕迹（逐文件核实）

| 位置 | 内容 | 含义 |
|---|---|---|
| `codex-rs/features/src/lib.rs:241` | `ComputerUse` feature 枚举项，注释「Requirements-only gate: this should be set from requirements, not user config」 | 开关由 OpenAI requirements（托管/企业配置）下发，用户侧不可开 |
| `codex-rs/app-server-protocol/src/protocol/v2/config.rs:401,468-469` | `computer_use: Option<ComputerUseRequirements>`，`allow_locked_computer_use: Option<bool>` | 唯一配置面：是否允许锁屏继续用（macOS 场景） |
| `codex-rs/core-plugins/src/discoverable.rs:47` | `"computer-use@openai-bundled"` 在工具建议发现白名单 | 插件由 openai-bundled marketplace 分发 |
| `codex-rs/core-plugins/src/lib.rs:41` | `OPENAI_BUNDLED_MARKETPLACE_NAME = "openai-bundled"`；`remote_bundle.rs` 实现后端下发 bundle 下载（带体积上限） | 分发链路走 OpenAI 后端，不随仓库分发 |
| `codex-rs/app-server/README.md:1834` | Responses API 保留命名空间列表含 `computer` | 模型侧工具为 `computer` 命名空间 |
| `codex-rs/core/tests/suite/code_mode.rs:4318` | 集成测试文本「capture a computer-use screenshot」 | 测试存在，实现不在仓库 |

结论：开源部分只含开关与分发壳，实现本体（截图、输入注入、应用枚举、审批）全部在闭源桌面 App 及其后端分发的插件包内。

## 三、闭源实现本质（issue 诊断数据还原）

1. **分发**：Codex Desktop 从 OpenAI 后端下载插件包到 `~/.codex/plugins/cache/openai-bundled/computer-use/<版本>/`，版本号与桌面 App 构建版本绑定（如 `26.527.31326`、`26.601.20914`），config.toml 中 `computer-use@openai-bundled` 启用。
2. **包内容**（issue #25507 用户实测路径）：
   - `node_modules/@oai/sky` —— OpenAI 内部 computer-use 运行时库（`@oai` 为 OpenAI 内部 npm scope，公共 registry 404）；
   - `bin/windows/codex-computer-use.exe` —— Windows 原生 helper；
   - `computer-use-client.mjs`、skill 文件、plugin manifest。
3. **进程桥**：Windows 上 helper 暴露命名管道 `\\.\pipe\codex-computer-use-*`；桌面 App 通过环境变量 `SKY_CUA_NATIVE_PIPE_DIRECTORY` 与 `nodeRepl.nativePipe` 把管道注入打包的 Node REPL 运行时（`cua_node`）。失败时 bootstrap 报「Computer Use native pipe path is unavailable」。
4. **模型侧**：`computer` 工具命名空间随 Responses API 请求下发；issue #28493 实测工具列表 14 个工具中无 `computer`，同时 `@oai/sky` 的 `list_apps()/list_windows()` 可直连——即「后端活着、工具没暴露」。
5. **审批**：「Computer Use requires app approval but elicitations are unavailable」——应用级启动/操控需 elicitation（App 内交互审批），不可在普通 REPL 里绕过。
6. **macOS 侧**：`allow_locked_computer_use` requirements 表明支持锁屏继续执行（权限模型与 Windows 不同）；实现同样不在开源仓库。

## 四、迁移可行性评估

### 4.1 直接迁移：不可行
- 实现闭源（桌面 App + 后端分发插件 + `@oai/sky` + exe），没有可搬运的源码；
- 即使把插件包从已安装的桌面 App 里抠出来，也依赖 OpenAI 后端 feature gate、账号鉴权、elicitation 审批通道，无法在 DSH 中独立运行；
- Apache-2.0 只覆盖开源仓库部分，闭源组件无许可。

### 4.2 迁移架构模式：可行且推荐
Codex 的模式一句话：**工具命名空间 + 原生 helper 进程 + 命名管道注入 JS 运行时**。DSH 对应拼图已基本齐备：

| 需要的能力 | Codex 怎么做 | DSH 现状 | 差距 |
|---|---|---|---|
| 工具暴露给模型 | `computer` 命名空间（Responses API） | `ctx.tools.register` / Cordis 动态插件 `harness.defineTool` + `registerTool`（`packages/extensions/cordis-host-runner`） | 无，直接可用 |
| 外部工具服务器 | 闭源插件（MCP 格式） | `packages/mcp/mcp-client`：stdio + streamable-http，工具注册为 `mcp__<server>__<tool>` | 无，直接可用 |
| 屏幕理解（截图→文字） | `@oai/sky` 内建 | **modlens_read_image 已集成**（本会话即带此工具；方案见 `RESEARCH-modlens-vision-switch-20260822.md`） | 无 |
| 屏幕截图 | helper exe | 无；可用 PowerShell/.NET（`System.Drawing` + `Graphics.CopyFromScreen`）零依赖实现，或桌面 Go 壳内建 | 需实现 |
| 鼠标/键盘注入 | helper exe（命名管道） | 无；`SetCursorPos`/`mouse_event`/`SendKeys` 均为 Windows 内建 API，PowerShell 或小型 helper 可达 | 需实现 |
| 应用/窗口枚举 | `@oai/sky` list_apps | 无；UIA（COM，系统内建）或 Win32 API 可达 | 需实现 |
| 操作审批 | elicitation | `packages/interaction`（approval/interaction 能力）已有 | 无，直接可用 |

### 4.3 依赖最小化评估
- **Codex 方案不是最小依赖**：闭源 App + 账号 + 服务端 gate + 每平台原生二进制 + 管道注入胶水，且 Windows 侧易碎（见第三节故障清单）。
- **DSH 自建最小方案**：Windows 上可做到**零新增 npm 依赖、零原生二进制**——PowerShell/.NET 内建 API 完成截图与输入（[SendKeys](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput)、[UIA](https://learn.microsoft.com/windows/win32/winauto/entry-uiauto-win32) 均为系统自带）；视觉复用 modlens；审批复用 interaction 包。若追求输入可靠性，可复制 Codex 的「小型 helper + 命名管道」模式，但 helper 为自研 ~100-300KB 单 exe（Marisa 桌面 Go 壳可内嵌，免 UAC——参照 `desktop/junction_windows.go` 的免提权经验）。
- **macOS 侧**（若未来考虑）：`osascript` System Events + `screencapture` 同样是系统内建零依赖。

## 五、替代方案对比（一手来源）

| 方案 | 依赖重量 | 覆盖范围 | 可靠性 | 与 DSH 集成 |
|---|---|---|---|---|
| [@playwright/mcp](https://github.com/microsoft/playwright-mcp)（微软官方） | Node ≥18，`npx` 即用 | 浏览器/网页（DOM 级，非像素） | 高（DOM 语义 + 可访问性树，远胜像素点击） | **DSH MCP client 直接消费，零核心改动** |
| [browser-use](https://github.com/browser-use/browser-use) | Python ≥3.11 + Playwright | 浏览器 | 高 | 需 Python 运行时，与 Marisa「无 Python」立场冲突 |
| [TARS / UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)（字节） | Rust 桌面 App + 专用视觉模型 | 整桌面/浏览器 | 中高 | 独立产品，非库；模型/安装重，不嵌入 |
| [OmniParser](https://github.com/microsoft/OmniParser)（微软） | Python + conda + HF 模型权重（YOLO 检测 + Florence 描述） | 屏幕解析组件（配合任意视觉模型） | 中 | 太重；且仅是「看懂屏幕」的一环，仍需注入端 |
| [anthropics/anthropic-quickstarts computer-use-demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) | Docker + X11/VNC（Linux 容器）；best-practices 版原生 macOS | 整桌面（协议：截图→模型→坐标） | 中 | 协议设计可借鉴（截图缩放/坐标缩放），Windows 无官方实现 |
| Windows 内建 PowerShell/.NET（UIA + SendInput） | **零安装**（系统自带） | 整桌面 | 中（脚本化实现易碎，需打磨） | 动态 Cordis 插件注册工具即可 |

## 六、迁移到 DSH 的建议

1. **先定场景再选路**：
   - 网页类自动化（表单、点单、测试、抓取）→ **Playwright MCP**：官方维护、DSH 的 MCP client 现成，浏览器 DOM 比像素点击可靠一个数量级，且不需要视觉模型。这是「更优雅」的主要答案。
   - 整桌面操控（本地 App、安装向导、系统设置）→ 按 Codex 架构模式自建：Cordis 动态插件注册 `computer` 系列工具（screenshot / list_apps / click / type / key），Windows 实现先以 PowerShell/.NET 内建 API 起步（零依赖），截图走 modlens 视觉；若实测输入注入不稳，再升级为自研小 helper + 命名管道（复刻 Codex 桥模式，但自持源码）。
2. **不引入**：browser-use（Python）、OmniParser（Python+权重）、TARS（独立产品+模型下载）——与 Marisa「普通桌面用户装完即用、无 Python」的发行版立场冲突（同 `RESEARCH-modlens-vision-switch-20260822.md` 的用户定案）。
3. **权限面**：computer use 属于「新增进程/输入注入/屏幕外发」能力，按仓库约定须在 PR 中写明权限影响；审批复用 `packages/interaction`，不要自造 elicitation。
4. **安全默认**：屏幕截图默认经 modlens 外发前需用户知情（Marisa 已有匿名视觉端点的数据外发明示先例）。
5. 若后续推进，建议先做「浏览器路线」的最小验证（Playwright MCP + DSH MCP client 冒烟），再做「桌面路线」的 PowerShell 原型，两者互不依赖。

## 附：关键来源

- 仓库：https://github.com/openai/codex （Apache-2.0，head e482cc66，2026-08-21）
- [issue #25507 Windows Computer Use unavailable: nativePipe missing and SKY_CUA_NATIVE_PIPE_DIRECTORY not injected](https://github.com/openai/codex/issues/25507)
- [issue #28493 Windows Computer Use backend works, but computer tool is not exposed to model](https://github.com/openai/codex/issues/28493)
- npm `@oai/sky`：https://registry.npmjs.org/@oai%2Fsky → 404
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) ｜ [browser-use](https://github.com/browser-use/browser-use) ｜ [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) ｜ [OmniParser](https://github.com/microsoft/OmniParser) ｜ [Anthropic computer-use-demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo)
- 本仓关联：`docs/RESEARCH-modlens-vision-switch-20260822.md`（视觉桥，已定稿）
