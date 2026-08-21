# RESEARCH: Computer Use 替代方案深度对比（2026-08-23）

- 状态：**调研完成**（一手来源：各项目官方 README / 仓库原文，2026-08-23 经 socks 代理直读 raw.githubusercontent.com 抓取；Codex 主结论见 `docs/RESEARCH-codex-computer-use-20260823.md`，本文档只做替代方案对比）
- 范围：browser-use、Agent TARS / UI-TARS-desktop、Microsoft OmniParser、Anthropic computer-use 参考实现、@playwright/mcp、Windows 原生零依赖方案（PowerShell/.NET UIA、pywinauto、FlaUI、SendInput/SetCursorPos）、以及开源「Windows computer use / CUA MCP」项目
- 目标场景：Marisa/DSH = Windows 桌面 Go 壳 + Node.js harness + 已有 modlens 视觉桥 + 已有 MCP client（`packages/mcp/mcp-client`，stdio + streamable-http，工具注册为 `mcp__<server>__<tool>`）+ 动态 Cordis 插件可注册工具（`harness.defineTool/registerTool`）
- 关键约束（来自主研究文档与 Marisa 定位）：**装完即用、无 Python**；新增依赖越少越好；能用 DOM/可访问性树就不上像素视觉

## 结论摘要

- **网页自动化首选 `@playwright/mcp`**（微软官方、Node ≥18、`npx` 即用、DOM/可访问性树而非像素、DSH 的 MCP client 直接消费、零核心改动、无需视觉模型）。
- **Windows 整桌面操控的最轻方案是纯 Node 的 `cgissing/windows-computer-use`**（stdio MCP、Node 18+ + 系统自带 PowerShell 5.1、零 npm 依赖、零 Python/.NET、18 个工具含 UIA 树 + 截图 + 鼠标键盘），其次是 npm + Rust NAPI 的 `zavora-ai/computer-use-mcp`（SendInput/IUIAutomation/DXGI 直调 Win32，跨平台）。
- **视觉/GUI-agent 系（UI-TARS、OmniParser、Anthropic demo）依赖最重**：本地模型权重 / GPU / Python / Docker，与「无 Python、装完即用」定位冲突，除非走其云端 API。
- **代码库已消失的注意点**：`microsoft/agent-cua`（微软开源 CUA 后端）与旧 `dotnet/FlaUI` 仓库在 2026-08 均已 404（FlaUI 迁移到 `FlaUI/FlaUI` org）；调研时不要引用已死链接。
- **可靠性排序**：可访问性树（UIA/a11y）交互 > DOM 自动化 > 像素截图 + 坐标点击；DSH 的 modlens 视觉桥应只作为 UIA 覆盖不到的兜底（游戏、自绘控件）。

---

## 1. 评估维度

| 维度 | 说明 |
|---|---|
| 依赖重量 | 安装体积、是否需 Python/Node/.NET/Go、是否需模型权重、是否需 GPU/Docker |
| 跨平台性 | macOS / Windows / Linux / 浏览器 |
| 可靠性 | DOM/a11y 语义 vs 像素坐标；是否有成熟基准（BU Bench、ScreenSpot Pro、Odysseys） |
| 与 DSH 集成难易 | 是否为 MCP server（DSH 有现成 MCP client）；是否 npm/Node 生态；是否需原生二进制 |
| 是否需要视觉模型 | 无视觉 = 纯结构交互（快、省 token）；有视觉 = 可处理任意像素 UI 但慢、贵 |

## 2. 方案详评

### 2.1 @playwright/mcp（微软官方，网页自动化）
- 一手来源：<https://github.com/microsoft/playwright-mcp>（README 2026-08 直读）
- 定位：浏览器自动化 MCP server；Playwright 官方的「给 LLM 的浏览器接口」
- 依赖清单：Node.js ≥ 18；`npx @playwright/mcp@latest`；浏览器 Chromium/Firefox/WebKit（`--browser chrome/firefox/webkit/msedge`），首次使用需下载浏览器；可选 caps：`vision`、`pdf`、`devtools`（`--caps`）；支持 CDP 连接已有浏览器实例
- 依赖重量：**轻**（一个 npm 包 + 浏览器二进制；无 Python、无模型权重、无 GPU）
- 可靠性：**高**（DOM + accessibility snapshot，`browser_snapshot` → `browser_click ref=...` 语义交互；README 明确「Playwright MCP is not a security boundary」）
- 与 DSH：**直接可用**——DSH MCP client（stdio）注册为 `mcp__playwright__*` 工具，零核心改动
- 视觉需求：**不需要**（DOM/a11y 树；`--caps=vision` 可选开截图）
- 局限：只管浏览器网页，不管桌面原生应用

### 2.2 browser-use（Python，网页自动化）
- 一手来源：<https://github.com/browser-use/browser-use>（README 2026-08 直读）
- 定位：AI 浏览器 agent（Python 库 + CLI/skill + 云端）；MIT
- 依赖清单：Python ≥ 3.11、`pip install browser-use` / `uv add browser-use`（README 注明 3.12 建议）、底层 Playwright（chromium）；LLM 走 API（自带 `ChatBrowserUse` 或任意 provider）
- 依赖重量：**中-重**（Python 环境 + Playwright + 浏览器；无本地权重但依赖 Python）
- 可靠性：高（BU Bench 100 任务；README 称 Odysseys 榜第一 87.4%）
- 与 DSH：需 Python 运行时 + 自建 agent 循环或 CLI/skill 接线；不是纯工具服务器，是「agent 框架」
- 视觉需求：不需要（DOM）；浏览器 only，管不了桌面
- 结论：与 Playwright MCP 功能重叠且更重（Python），不符合「无 Python」定位

### 2.3 Agent TARS / UI-TARS-desktop（字节跳动，GUI agent 产品）
- 一手来源：<https://github.com/bytedance/UI-TARS-desktop>（README 2026-08 直读；仓库已演化为 Agent TARS 栈）；模型论文 <https://arxiv.org/abs/2501.12326>；模型 <https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B>
- 定位：
  - **UI-TARS Desktop**：Electron 桌面应用，基于 UI-TARS 视觉语言模型的「本地 GUI operator」（本地/远程 computer & browser operator）；Apache-2.0
  - **Agent TARS**：npm CLI（`@agent-tars/cli`，Node ≥ 22，`npx` 即用），多模态 agent 栈，内核基于 MCP，可挂任意 MCP server；支持 volcengine/anthropic 等模型 API
- 依赖清单：
  - Agent TARS CLI：Node ≥ 22 + 模型 API key（无本地权重）
  - UI-TARS Desktop 本地 operator：Electron 应用 + **UI-TARS 模型权重**（7B/72B 系，本地推理需 GPU 显存；或用其 remote/云端 operator）
- 依赖重量：**重**（本地权重方案需 GPU；Agent TARS CLI 本身轻，但它是完整 agent 而非可嵌入工具服务器）
- 可靠性：高（GUI grounding 专项模型 + ScreenSpot 类基准）
- 与 DSH：Agent TARS 是独立 agent（有自己 CLI/Web UI），不是「给 DSH 用的工具集」；DSH 要用它只能当外部 agent 调用或复用其 MCP 模式
- 视觉需求：**需要**（核心就是视觉 grounding）
- 结论：产品方向与我们相反（它是另一个 harness），不符合「DSH 收编工具」思路

### 2.4 Microsoft OmniParser / OmniTool（屏幕解析 + Windows 11 VM 控制）
- 一手来源：<https://github.com/microsoft/OmniParser>（README 2026-08 直读）；论文 <https://arxiv.org/abs/2408.00203>；权重 <https://huggingface.co/microsoft/OmniParser-v2.0>；V2 博客 <https://www.microsoft.com/en-us/research/articles/omniparser-v2-turning-any-llm-into-a-computer-use-agent/>
- 定位：把 UI 截图解析成结构化元素（图标检测 + 图标描述）的**纯视觉 grounding 工具**；OmniTool = OmniParser + 动作执行，控制 Windows 11 VM（支持 OpenAI / DeepSeek-R1 / Qwen2.5VL / Anthropic CU 等 LLM）
- 依赖清单：Python 3.12（conda + pip install -r requirements.txt）、**本地权重**（icon_detect YOLOv9-E + icon_caption Florence-2 系，HuggingFace 下载）、torch 推理、GPU 推荐（CPU 可跑但慢）
- 依赖重量：**重**（Python + torch + 权重 + GPU 倾向）
- 可靠性：高（Screen Spot Pro 39.5% SOTA，Windows Agent Arena 最佳）
- 与 DSH：可作为「截图→结构化元素」的本地服务被调用，但引入 Python + torch + 权重，与「无 Python」冲突；且它只是解析层，动作执行（OmniTool）面向 VM
- 视觉需求：**需要**（其存在意义就是把像素转结构；若模型本身已多模态可直接看截图，OmniParser 的价值下降）

### 2.5 Anthropic computer-use 参考实现（demo / best-practices）
- 一手来源：<https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo>（README 直读）；<https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-best-practices>（README 直读）；官方 best-practices 指南 <https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude>
- 定位：
  - **computer-use-demo**：Docker 容器（Linux 桌面 X11 + VNC + noVNC + Streamlit）+ Python agent 循环，演示 Anthropic 定义的 computer tools（screenshot/mouse/keyboard/shell）
  - **computer-use-best-practices**：macOS 本地运行（无容器），Python 3.11+，`pyautogui` 后端 + `sandbox-exec` 沙箱；README 明言「targets macOS only」，Linux/Windows 需走 Docker 版
- 依赖清单：Python 3.11+ / Docker（镜像数 GB 级）；Anthropic API（Beta 接口）
- 依赖重量：**重**（Docker 或 Python；macOS 限定或容器化）
- 可靠性：中-高（官方参考实现，但 README 自述为「minimal, deliberately pedagogical」；生产模式看 best-practices 文档而非代码）
- 与 DSH：价值在**思路**（工具定义、截图缩放、坐标映射、prompt 缓存、沙箱 shell、轨迹记录），不在代码；Windows 无原生路径
- 视觉需求：**需要**（API 侧视觉；模型直接读截图）

### 2.6 Windows 原生零依赖方案（PowerShell/.NET / pywinauto / FlaUI / SendInput）
- 共性：全部走 Windows 内建 API，无模型权重、无 GPU

#### 2.6.1 PowerShell + .NET UIA / SendInput（零新增依赖，自研原型）
- 一手来源：Windows UI Automation API 文档 <https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32>；.NET `System.Windows.Automation`（UIAutomationClient.dll，随 .NET Framework 内置）；`SendInput`/`SetCursorPos`/`mouse_event` 为 user32.dll P/Invoke
- 依赖清单：**零新增**——Windows 自带 PowerShell 5.1+ 与 .NET Framework；`Add-Type` P/Invoke 或直接调 COM；截图可用 .NET `System.Drawing` / Graphics.CopyFromScreen
- 依赖重量：**极轻（零）**
- 可靠性：中（UIA 覆盖 Win32/WPF/WinForms/UWP 控件语义；像素输入类 SendInput 无语义，靠坐标）
- 与 DSH：可在 Cordis 插件 / Go 壳里 spawn `powershell -Command` 实现（类似 Codex 闭源实现里「Node REPL + PowerShell helper + 命名管道」的分工）；也可用 `harness.defineTool` 直接注册
- 视觉需求：不需要（UIA 树）；截图工具给 modlens 兜底

#### 2.6.2 pywinauto（Python，Windows GUI 自动化库）
- 一手来源：<https://github.com/pywinauto/pywinauto>（README 直读）；BSD 3-clause
- 依赖清单：`pip install pywinauto`；Windows 依赖 pyWin32 + comtypes；可选 Pillow（截图）
- 依赖重量：轻-中（纯 Python，无权重/GPU）
- 可靠性：中-高（backend=win32 默认 / backend=uia；mouse/keyboard 模块跨 Windows+Linux）
- 与 DSH：需要 Python 运行时 → 违反「无 Python」；若接受 Python 则集成简单（可包装成工具）
- 视觉需求：不需要

#### 2.6.3 FlaUI（.NET，UIA 封装库）
- 一手来源：<https://github.com/FlaUI/FlaUI>（README 直读；**注意旧 `dotnet/FlaUI` 仓库已 404**，org 迁移到 `FlaUI/FlaUI`，含 FlaUInspect/FlaUIRec/FlaUI.WebDriver）；NuGet `FlaUI.Core` / `FlaUI.UIA3` / `FlaUI.UIA2`
- 定位：.NET 库，封装微软 UIA（UIA2 托管版 / UIA3 COM 版），供 Win32/WinForms/WPF/UWP 自动化测试
- 依赖清单：.NET（NuGet 包；无 Python/权重）
- 依赖重量：轻（但需要 .NET 运行时或自包含发布）
- 与 DSH：不能直接给 Node 用；需包一层 MCP/JSON-RPC（见 2.7.2 FlaUI-MCP）
- 视觉需求：不需要

#### 2.6.4 原生输入 API（SendInput / SetCursorPos / mouse_event）
- 一手来源：<https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput>、<https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setcursorpos>
- 定位：最底层输入合成，任何语言可 P/Invoke（PowerShell/Node FFI/Go syscall）
- 依赖重量：**零**
- 可靠性：输入合成可靠，但**无语义**——必须配合 UIA 树/截图找坐标；焦点敏感
- 结论：作为「动作执行层」与其他观察层组合，单独不成方案

### 2.7 开源「Windows computer use / CUA MCP」实现（重点调研）

> 通用模式：**MCP server（stdio）+ 观察层（UIA 树/截图）+ 动作层（UIA invoke / SendInput）**，LLM 由 MCP client 侧提供，无需本地权重。按与 DSH 的契合度排序。

#### 2.7.1 `cgissing/windows-computer-use` —— 纯 Node.js，零依赖 ★ 首选
- 一手来源：<https://github.com/cgissing/windows-computer-use>（README 直读）
- 定位：给 Codex / 其他 MCP agent 用的 Windows 桌面自动化插件；stdio MCP server
- 依赖清单：**Node.js ≥ 18 + Windows PowerShell 5.1（系统自带）**；README 明言「The MCP server has no npm install step」；无 Python、无 .NET、无原生二进制
- 工具集（18 个）：观察（`windows_computer_use_health/snapshot/accessibility_tree/list_windows/find/element_info/activate_window`）、指针（`move/click/double_click/drag/scroll`）、键盘（`type_text/keypress`）、UIA 结构化动作（`focus/invoke/set_value`）、`wait`
- 与 DSH：`command: node <path>/mcp/server.mjs` 直接注册进 DSH MCP client；也自带 Codex plugin marketplace 元数据（`.agents/plugins/marketplace.json` + `.codex-plugin/plugin.json`）
- 风险：个人维护项目，需评审代码质量与活跃度；作用域可用 `WINDOWS_COMPUTER_USE_SCOPE` 收敛

#### 2.7.2 `shanselman/FlaUI-MCP` —— .NET 8 单文件，Playwright 式 ref 交互
- 一手来源：<https://github.com/shanselman/FlaUI-MCP>（README 直读）；MIT
- 定位：把 Playwright 的「snapshot → ref 点击」模式搬到 Windows 桌面（`windows_snapshot` → `windows_click ref="w1e5"`），作者 Scott Hanselman
- 依赖清单：Windows 10/11；**.NET 8 运行时**或**自包含 zip（`FlaUI-MCP-win-x64-*-self-contained.zip`，免运行时）**；底层 FlaUI（UIA3）
- 工具集（12 个）：`windows_launch/snapshot/click/type/send_keys/fill/get_text/screenshot/list_windows/focus/close/batch`；30 秒超时防挂死
- 可靠性：README 明确对比「a11y 树 vs 截图+视觉」：语义/精确/快/与分辨率无关，vs 慢/贵/不精确
- 与 DSH：stdio MCP；自包含 exe 免 .NET 运行时；缺点是二进制体积（估几十 MB）与需下载 release 而非 npm
- 局限：Electron 应用部分支持、游戏不支持（无 UIA）

#### 2.7.3 `QwenLM/open-computer-use` —— npm 安装，三平台 MCP
- 一手来源：<https://github.com/QwenLM/open-computer-use>（README 直读）；npm `@qwen-code/open-computer-use`；上游 fork 自 `iFurySt/open-codex-computer-use`
- 定位：MCP-based Computer Use 服务，控制 macOS/Linux/Windows；macOS 用辅助功能 API（Accessibility + Screen Recording 权限），**Windows 用 Go + PowerShell UI Automation**，Linux 用 Go + Python AT-SPI
- 依赖清单：`npm i -g @qwen-code/open-computer-use`；Windows/Linux 运行时需 Go（编译的 helper）与相应系统组件；macOS 需授权
- 工具集（9 个 Computer Use 工具）：app 状态快照（a11y 树 + 截图）、坐标动作（click/drag/scroll）、按键、坐标换算等；带 `doctor/call/snapshot` CLI 诊断
- 与 DSH：stdio MCP 直接可用；跨平台加分；Windows 侧实现是「Go helper + PowerShell」两条腿，与 Marisa 的 Go 壳同语言，可读性强
- 局限：Windows 截图不缩放下采样（README 注明仅 macOS 有尺寸/字节预算控制）

#### 2.7.4 `CursorTouch/Windows-MCP` —— 最成熟但需 Python
- 一手来源：<https://github.com/CursorTouch/Windows-MCP>（README 直读）；MIT；PyPI `windows-mcp`；已入 MCP Registry
- 定位：Windows 系统自动化 MCP server（文件/应用/UI 交互/QA）；README 称「2M+ users」（Claude Desktop 目录）
- 依赖清单：**Python 3.13+ + uv（`uvx windows-mcp serve`）**；底层 `yinkaisheng/Python-UIAutomation-for-Windows`；截图后端 dxcam→mss→pillow 自动回退
- 工具集（约 20 个）：Click/Type/Scroll/Move/Shortcut/Wait/WaitFor/DisplayInventory/Screenshot/Snapshot(use_vision)/App/PowerShell/FileSystem/Scrape/MultiSelect/MultiEdit/Clipboard/Process/Notification/Registry；stdio/SSE/streamable-http 三传输
- 成熟度：最高（安全模型、auth/allowlist/TLS/OAuth、telemetry 可关、watchdog）
- 与 DSH：**需要 Python** → 与「无 Python」冲突；但若 Marisa 接受在桌面捆绑一个嵌入式 Python 运行时，它是功能最全的 Windows 控制 MCP

#### 2.7.5 `zavora-ai/computer-use-mcp` —— npm + Rust NAPI 原生模块
- 一手来源：<https://github.com/zavora-ai/computer-use-mcp>（README 直读）；MIT；Node 18+
- 定位：高性能 MCP server + client，**Rust NAPI 原生模块进程内直调 OS API**：Windows 用 SendInput/EnumWindows/IUIAutomation/DXGI；macOS 用 CoreGraphics/AppKit/AXUIElement；Linux 用 X11/XTest + xdotool/wmctrl/scrot
- 依赖清单：`npm install computer-use-mcp`；预编译 `.node` 二进制（README：可选按平台包 + bundled binary，原生层安装失败不致命）；无 Python、无权重
- 工具集：screenshot/mouse/keyboard/clipboard/app/window 定位/filesystem/run_script；MCP 现代化（annotations、structuredContent、profiles、cancellation）
- 设计哲学（README 的优先级表）：connector/集成 > shell/filesystem > 浏览器自动化 > 桌面 computer use（最后手段）——与 DSH 思路一致
- 与 DSH：npm 生态 + MCP stdio 双契合；Rust NAPI 需随发行版带对应平台二进制（预构建有 fallback 机制）
- 风险：项目较新（v7 迭代中），原生二进制供应链需要评审

#### 2.7.6 `vitalops/opendesk` —— 多机器 computer use 框架
- 一手来源：<https://github.com/vitalops/opendesk>（README 直读）；MIT；PyPI `opendesk` + npm `@vitalops/opendesk-sdk`
- 定位：跨平台 computer use 框架（截图+Set-of-Marks、ui/mouse/keyboard/app/clipboard/ocr/learn/schedule/audit、远程机器 WebSocket + X25519+AEAD）
- 依赖清单：Python 3.10+（`pip install 'opendesk[core,mcp]'`）或 JS SDK；Windows 用 Win32 API 默认（README：Windows 无需额外权限）
- 与 DSH：Python 系与「无 Python」冲突；JS SDK 需自建 MCP/桥。远程控制（LAN + 加密配对）是其独特点，暂非 Marisa 刚需

#### 2.7.7 `microsoft/UFO`（UFO²）—— 微软 Windows GUI agent（历史+现存）
- 一手来源：<https://github.com/microsoft/UFO>（README 直读）
- 定位：Windows GUI agent，UIA/Win32/WinCOM 原生控制，配 Galaxy 多设备编排；用 LLM（API key）驱动
- 依赖清单：Python（安装脚本 + API key）
- 与 DSH：Python + 独立 agent 产品形态，参考价值 > 复用价值（UIA/WinCOM 选择、双代理架构可借鉴）

#### 2.7.8 已消失/已迁移的仓库（引用时注意）
- **`microsoft/agent-cua`（微软 AgentCUA 开源 CUA 后端）→ 2026-08-23 访问 `https://github.com/microsoft/agent-cua` 返回 404**，搜索无对应仓库；如需引用其结论只能靠二手资料或归档快照
- **`dotnet/FlaUI` → 404**；FlaUI 现位于 `https://github.com/FlaUI/FlaUI`
- 微软 WindowsAgentArena（基准，非 agent）：<https://microsoft.github.io/WindowsAgentArena/>

### 2.8 其他（完整 agent / 混合）
- **Open Interpreter**：<https://github.com/OpenInterpreter/open-interpreter>（README 直读；Apache-2.0）。2026 形态是「Codex 的 fork」（Rust 终端，`/harness` 切换 claude-code/kimi/qwen 等 harness）；Computer Use 通过 QA skill 用 `vercel-labs/agent-browser`（网页）与 `trycua/cua`（原生应用）实现。它是完整 agent 而非工具集，与 DSH 是竞争/替代关系，不在「收编」范围。
- **Windows Agent Arena**（基准）与 **ScreenSpot Pro**（grounding 基准）仅作可靠性度量参考。

## 3. 对比总表

| 方案 | 生态/运行时 | 平台 | 依赖重量 | 视觉模型需求 | 可靠性（交互层） | 与 DSH 集成 | 定位 |
|---|---|---|---|---|---|---|---|
| **@playwright/mcp** | Node ≥18, npm | 浏览器（跨平台） | 轻（npm+浏览器） | 否（DOM/a11y） | 高 | **MCP 直连，零改动** | 网页自动化 ★ |
| **cgissing/windows-computer-use** | 纯 Node 18+, 零 npm 依赖 | Windows | **极轻（零）** | 否（UIA 树+截图） | 中-高（UIA） | **MCP 直连** | Windows 桌面 ★ |
| **zavora-ai/computer-use-mcp** | Node 18+ + Rust NAPI | Win/mac/Linux | 轻（npm+预编译 .node） | 否（可截图） | 高（原生 API 直调） | MCP 直连 | 跨平台桌面 ★ |
| shanselman/FlaUI-MCP | .NET 8（自包含 exe 免运行时） | Windows | 轻-中（zip 几十 MB） | 否（UIA ref） | 高（ref 语义） | MCP 直连 | Windows 桌面 |
| QwenLM/open-computer-use | npm + Go/PowerShell helper | Win/mac/Linux | 轻-中（需 Go helper 二进制） | 否（a11y+截图） | 中-高 | MCP 直连 | 跨平台桌面 |
| CursorTouch/Windows-MCP | **Python 3.13+ / uv** | Windows 7-11 | 中（Python+依赖） | 否（可开 vision） | 高（最成熟） | MCP 直连（需 Python） | Windows 系统控制 |
| vitalops/opendesk | Python 3.10+ / JS SDK | Win/mac/Linux | 中-重 | 否（可 OCR） | 中-高 | 需桥 | 多机 computer use |
| pywinauto | Python | Windows | 轻-中 | 否 | 中-高 | 需包装 | 库 |
| FlaUI（.NET 库） | .NET | Windows | 轻 | 否 | 高 | 需包装（见 FlaUI-MCP） | 库 |
| PowerShell/.NET UIA + SendInput | 系统自带 | Windows | **零** | 否 | 中 | 子进程/插件 | 自研零依赖 ★ |
| browser-use | Python 3.11+ | 浏览器 | 中-重 | 否（DOM） | 高（基准第一） | 需 Python | 网页 agent 框架 |
| Agent TARS CLI / UI-TARS Desktop | Node ≥22 / Electron+权重 | 桌面全平台 | 重（本地需 GPU 权重；CLI 走 API） | **是** | 高（grounding 专长） | 独立 agent，非工具集 | GUI agent 产品 |
| OmniParser + OmniTool | Python 3.12 + torch + 权重 | Windows VM | 重（权重+GPU 倾向） | **是** | 高（解析 SOTA） | 需 Python 服务 | 截图解析层 |
| Anthropic computer-use-demo | Docker（Linux） | 容器 | 重（GB 级镜像） | 是 | 中-高 | 不适用 | 参考实现 |
| Anthropic computer-use-best-practices | Python 3.11+, macOS only | macOS | 中 | 是 | 中-高 | 不适用（Windows） | 生产模式参考 |

## 4. 针对 Marisa/DSH 的推荐排序

前提（已确认的 DSH 能力）：MCP client（stdio/streamable-http，工具挂为 `mcp__<server>__<tool>`）、Cordis 动态插件可 `registerTool`/`defineTool`、modlens 视觉桥（截图→文字）已集成、桌面是 Go 壳（已有 junction/P/Invoke 经验）。

### 推荐组合（按需二选一或并行推进）

1. **网页操作（先行，收益最大）→ `@playwright/mcp`**
   - 理由：微软官方维护、Node 生态、`npx` 即用；DSH MCP client 直接消费，零核心改动；DOM/a11y 语义交互远比像素点击可靠；不需要视觉模型。一条命令冒烟即可。
2. **Windows 整桌面操控（第二阶段）→ 优先 `cgissing/windows-computer-use`，备选 `zavora-ai/computer-use-mcp`**
   - 理由：前者纯 Node 零依赖（Node 18+ + 系统自带 PowerShell 5.1），18 个工具覆盖「UIA 树观察 + 指针/键盘动作 + UIA invoke/set_value」，直接作为 stdio MCP server 注册进 DSH；与 Codex 闭源实现的架构模式同构（轻量 agent 侧协议 + 原生观察/动作），但完全开源可控。
   - 后者若需跨平台（macOS/Linux 也有）或要更硬核的原生直调（SendInput/IUIAutomation/DXGI），npm + Rust NAPI 预编译二进制是次优解；需要评审原生二进制供应链。
3. **零新增依赖兜底（可选原型）→ PowerShell/.NET UIA + SendInput 自研**
   - 理由：Windows 自带能力，`Add-Type` P/Invoke 或 .NET `System.Windows.Automation`；在 Cordis 插件里 spawn `powershell` 即可注册 `desktop_snapshot/desktop_click/desktop_type` 等工具；规模可控（参考 Codex 闭源实现的「Node REPL + PowerShell helper + 命名管道」分工，Marisa 可简化为直接子进程协议）。截图交给 modlens 视觉桥兜底。
4. **不推荐**：browser-use / OmniParser / UI-TARS（Python、torch、权重、GPU、Docker 与「无 Python、装完即用」定位冲突）；CursorTouch/Windows-MCP（最成熟但需 Python 3.13+；若未来接受嵌入式 Python 运行时可升级考虑）；FlaUI-MCP（需下载 .NET 自包含 zip，略重且工具集比 windows-computer-use 少）；Agent TARS / Open Interpreter（完整 agent 产品，与 DSH 定位重叠）。

### 实施建议
- **第一步冒烟**：DSH MCP client 挂 `@playwright/mcp`（网页）+ `cgissing/windows-computer-use`（桌面），各做一次端到端工具调用。
- **安全边界**：computer use 工具拥有桌面控制权，需在 DSH 权限模型里收敛（可参考 Windows-MCP 的 `--tools` 白名单 / `--exclude-tools`、FlaUI-MCP 的 30s 超时、windows-computer-use 的 `WINDOWS_COMPUTER_USE_SCOPE=active_window` 收敛到活动窗口）。
- **视觉兜底顺序**：a11y 树（省、快）→ DOM（浏览器）→ 截图+modlens（UIA 覆盖不到的 Electron 自绘/游戏/自绘控件）。

## 5. 来源清单（均为一手，2026-08-23 直读）

- 微软 Playwright MCP：<https://github.com/microsoft/playwright-mcp>
- browser-use：<https://github.com/browser-use/browser-use>
- 字节 Agent TARS / UI-TARS-desktop：<https://github.com/bytedance/UI-TARS-desktop>；模型 <https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B>；论文 <https://arxiv.org/abs/2501.12326>
- 微软 OmniParser：<https://github.com/microsoft/OmniParser>；权重 <https://huggingface.co/microsoft/OmniParser-v2.0>
- Anthropic quickstarts：<https://github.com/anthropics/anthropic-quickstarts>（computer-use-demo / computer-use-best-practices）
- pywinauto：<https://github.com/pywinauto/pywinauto>
- FlaUI（新 org）：<https://github.com/FlaUI/FlaUI>（旧 dotnet/FlaUI 已 404）
- FlaUI-MCP：<https://github.com/shanselman/FlaUI-MCP>
- Windows Computer Use（cgissing）：<https://github.com/cgissing/windows-computer-use>
- Qwen open-computer-use：<https://github.com/QwenLM/open-computer-use>；上游 <https://github.com/iFurySt/open-codex-computer-use>
- Windows-MCP（CursorTouch）：<https://github.com/CursorTouch/Windows-MCP>
- computer-use-mcp（zavora-ai）：<https://github.com/zavora-ai/computer-use-mcp>
- opendesk：<https://github.com/vitalops/opendesk>
- microsoft/UFO：<https://github.com/microsoft/UFO>
- Open Interpreter：<https://github.com/OpenInterpreter/open-interpreter>
- Windows Agent Arena：<https://microsoft.github.io/WindowsAgentArena/>
- Win32 文档：SendInput <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput>；SetCursorPos <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setcursorpos>；UI Automation <https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32>
- Codex 仓库证据（本地克隆 openai/codex@main tarball，2026-08-23）：`codex-rs/core-plugins/src/discoverable.rs`（`"computer-use@openai-bundled"`）、`codex-rs/app-server/tests/suite/v2/plugin_list.rs`（`"computer-use@openai-api-curated"`）、`codex-rs/features/src/lib.rs`（feature key `computer_use`）、`codex-rs/app-server-protocol/src/protocol/v2/config.rs`（`ComputerUseRequirements`）——开源仓库中无 SKY_CUA 实现，仅 gate 与 requirements
- DSH 侧依据：`docs/RESEARCH-codex-computer-use-20260823.md`（MCP client `packages/mcp/mcp-client`、Cordis 工具注册、modlens 视觉桥）、`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`（MCP 图结果投影）
