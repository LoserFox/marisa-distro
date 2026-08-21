# RESEARCH：Fisfzy/dsh-ego-browser（DSH 浏览器自动化插件）调研

> 调研日期：2026-08-23（本机时区）
> 调查基线：`Fisfzy/dsh-ego-browser` master 分支（浅克隆 + 补全历史后共 83 个提交，HEAD = `09b6fb3`，2026-08-21）
> 调查方式：GitHub API / raw.githubusercontent（经本地代理 socks5://127.0.0.1:10808）、全量代码通读、上游仓库对照、web_search
> 声明：本调研全部结论基于一手来源（仓库代码、README/CHANGELOG/PATCHES、GitHub API 数据、上游 ego-lite 仓库）；凡涉及行为推断处均已标注为「代码审查结论」而非实测。

---

## 1. 概述

`Fisfzy/dsh-ego-browser` 是一个把 **ego-lite 浏览器**（CitroLabs 出品的「给 AI Agent 用的 Chromium」）接入 DeepSeek Harness（DSH）的插件：以 **32 个结构化 `ego_*` 工具**（文本语义快照、语义定位点击、表单填充、截图、CDP 控制、任务空间隔离等）驱动浏览器，并带一套「实时观察窗前端口」（SSE 推流 + 监控窗鼠标直操），agent 操作网页/甚至操作 DSH 自身时用户都能实时看到并接管。插件包**内置（vendored）ego 运行时**（`runtime/`，MIT），声称 Linux + Chrome「开箱即用」——无需克隆官方仓库、无需手动构建。

本调研按任务要求覆盖：仓库概况、架构与技术细节、与上游 ego-lite 的关系、质量评估、安全与权限视角、marisa-distro 适配性评估，并应委托方补充调查 **WebGL 游戏支持评估**一节。

---

## 2. 仓库概况

### 2.1 元数据（GitHub API，2026-08-23 抓取）

| 项目 | 值 |
|---|---|
| 仓库 | https://github.com/Fisfzy/dsh-ego-browser |
| 描述 | DSH（DeepSeek Harness）插件：把 ego-lite 浏览器（AI Agent 专用的 Chromium）接入 HARNESS，提供 13 个结构化 `ego_*` 工具（文本语义快照、语义定位点击、表单填充、截图、CDP 控制、任务空间隔离等），内置 ego 运行时，Linux + Chrome 开箱即用，无需克隆官方仓库或手动构建 |
| 创建时间 | 2026-08-07T08:13:54Z |
| 最近推送 | 2026-08-21T10:30:35Z（updated_at 2026-08-21T13:37:59Z） |
| Star / Fork / Open Issues | 30 / 3 / 5 |
| 语言 | JavaScript（仓库主导语言；当前源码已迁至 TypeScript，见 §4.2） |
| 默认分支 | master |
| License（API） | **null**（仓库内无 LICENSE 文件，见 §2.3） |
| topics | agent-browser, browser-automation, dsh-plugin, dshx, ego-lite |
| size | 912 KB |
| 提交数 | 83（2026-08-07 ~ 2026-08-21，活跃开发期约两周） |
| 主要贡献者（git shortlog） | HuanLinOTO 29、toma hane 29、Fisfzy（仓库主）25 |
| tags | v0.5.0 / v0.6.0 / v0.6.1 / v0.7.0（无 v0.8.0 tag，但 package.json 已是 0.8.0） |
| CI | **无**（仓库内无 `.github/` 目录，无 GitHub Actions 配置） |

来源：[GitHub API /repos/Fisfzy/dsh-ego-browser](https://api.github.com/repos/Fisfzy/dsh-ego-browser)、仓库 `package.json`、`git log`。

### 2.2 README 全文要点（15878 字节，2026-08-23 抓取）

README（`README.md`，抓自 master）核心内容：

- **定位**：把 CitroLabs/ego-lite 接进 DeepSeek Harness，提供 32 个结构化 `ego_*` 工具 + 实时观察窗前端口；自评「看得见（实时推流）+ 控得住（监控窗直接驱动同一个 agent 浏览器）」。
- **与同类插件对比**：README 点名对比 `Da1dr1em/dsh-ego-browser`（声称对方只有 3 个工具 run/help/status、后台黑盒、仅 Windows 预览宿主）。声明基于「可核实的代码事实」。
- **相对 ego-lite 本体的增量**：观察窗前端口（SSE 推流 + 标签条 + 历史抽屉 + 监控窗直操）、开箱即用 + 跨平台自足（`resolveEgoEnv` 自动探测 Chrome/Edge/Brave，root/无显示器兜底）、健壮性层（冷启动重试、worker 单实例守卫、卸载 fire-and-forget）、运维工具（`ego_doctor`/`ego_captcha`/`ego_auth_flush`/`ego_http`）、self-observation（agent 操作 DSH 自身界面也可见可接手）。
- **诚实声明**：不声称媲美官方 macOS App 的内核级快照；Linux 快照用 CDP `DOMSnapshot` 重建语义树，复杂 iframe/画布场景可能降级。
- **版本亮点**：v0.7.0 状态灯/内存修复；v0.6.1 卸载不阻塞 + worker 单实例守卫；v0.6.0 工程收敛（lib/ 唯一源）；v0.5.0 SSE 推流 + 监控窗直操；v0.4.0 Windows 适配。
- **前置条件**：Node ≥ 22；任意 Chrome/Chromium/Brave/Edge（自动发现或 `EGO_LINUX_CHROME` 指定）；DSH + dshx；带图形界面的 DSH Web（观察窗）。
- **安装**：`dshx install ego-browser <tarball 或 git URL>`。
- **已知限制（诚实说明）**：Windows 插件层已适配但底层 ego-lite 宿主是非 Windows 官方支持的社区移植，复杂多步流程稳定性弱于 macOS；DSH peer 包不全在公共 npm registry（普通 pnpm install 可能解析 `@deepseek-ai/*` peer 失败）；快照非 macOS 内核级；Linux 宿主是未合并的社区 PR，跨 CLI 调用可能丢 tab/空间状态；登录态仅优雅关闭时落盘。
- **许可**：声称「插件本体 MIT」，内置运行时嵌入 ego-lite 的 MIT 代码，可选下载的 FFmpeg 构建涉及 GPL-3.0-or-later 义务。

来源：`README.md`（master）。

> ⚠️ **README 与 GitHub API 描述不一致**：API description 说「13 个结构化 `ego_*` 工具」，而当前 README 与代码都是 **32 个**。任务描述中的「13 个工具」对应的是**最初 vendoring 提交（a77dee4，2026-08-07）时的工具数**（git show a77dee4:lib/index.js 实测恰好 13 个：`ego_cdp/ego_cli/ego_click/ego_fill/ego_js/ego_navigate/ego_page_info/ego_screenshot/ego_snapshot/ego_space_close/ego_space_open/ego_status/ego_wait`），此后在 8-14 起两轮补强（`8a901c9`、`7be854f`、`78ec545`）扩到 32 个。**当前代码实际是 32 个工具**，本报告按 32 为准，并在涉及处标注 13→32 的演进。

### 2.3 License 状态（重要风险点）

- GitHub API `license: null`；仓库根目录**没有 LICENSE 文件**（contents API + 本地克隆递归查找均确认无任何 `LICENSE*` 文件）。
- 但 `package.json` 声明 `"license": "MIT"`（v0.8.0），README 声称「插件本体 MIT」，`THIRD_PARTY_NOTICES.md` 全文附了上游 MIT 许可文本。
- **风险**：声明与物理文件不一致。对使用者/再分发者（如 marisa 打包）而言，仓库缺少明确的许可证文件意味着「看似 MIT、实则没有可引用的许可文本」，法律上存在模糊地带；再分发前应**联系作者补 LICENSE 文件或取得书面授权**。另外 README 顶部明言「仓库保持维护状态，不发布到 npm / 公共 registry；如需转载请注明出处，**不要创建用于分发的公开 fork / 镜像**」——这与 marisa「将插件纳入发行版」的诉求存在潜在冲突，需作者确认。

来源：GitHub API `license: null`；仓库根 contents 列表（无 LICENSE）；`package.json` L74；`README.md` L8-10、L165-167；`THIRD_PARTY_NOTICES.md`。

---

## 3. 架构与技术细节

### 3.1 顶层结构（master HEAD）

```
dsh-ego-browser/
  package.json            # @dsh-external/ego-browser v0.8.0
  cordis.patch.yml        # DSH 组合层插入声明（bundle patch）
  src/                    # TypeScript 源码（2026-08-21 PR #14 迁移，295586e）
    index.ts              #   插件入口 + 32 个 ego_* 工具注册（权威）
    client/index.ts       #   观察窗前端（SSE/视频/交互）
    worker/ego-cast-worker.ts  # 观察窗 worker（独立 Node 进程）
    gateway.ts / settings.ts / config.ts / cast-server.ts / ffmpeg-*.ts / captcha.ts / help.ts / types.ts / util.ts
  lib/                    # 构建产物（预提交入库）：index.js（host 插件）、client.js（前端）
  bin/                    # ego-cast-worker.mjs（worker bundle）、ego-chrome-wrapper.sh（--no-sandbox 包装器）
  runtime/                # vendored ego-lite 运行时（只读参照）
    ego-browser/dist/out/index.js   # 上游共享 harness 单文件构建（ego-browser-v2）
    ego-linux/            # Linux CDP host（上游 PR #234 移植）+ 本地补丁
    skills/ego-browser/   # agent skill 包（与上游 main 逐字节一致）
  docs/                   # ARCH.md + plans/*.md 设计文档
  tests/                  # 15 个 vitest 测试文件
  CHANGELOG.md / THIRD_PARTY_NOTICES.md / README.md
```

来源：本地克隆目录树；`docs/ARCH.md`；`package.json`。

### 3.2 package.json（依赖、bin、脚本）

```jsonc
{
  "name": "@dsh-external/ego-browser",
  "version": "0.8.0",
  "private": true,
  "type": "module",
  "main": "./lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "files": ["lib/", "bin/", "runtime/", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings-plugins"] }
  },
  "scripts": { "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.client.json",
               "test": "vitest run", "build": "tsdown -c tsdown.config.ts" },
  "dependencies": { "@deepseek-ai/schemastery": "link:../dsh/vendor/schemastery" },
  "peerDependencies": {
    "@deepseek-ai/dsh-client-locale": "0.1.0-rc.8",
    "@deepseek-ai/dsh-client-runtime": "0.1.0-rc.8",
    "@deepseek-ai/dsh-client-ui-settings-plugins": "0.1.0-rc.8",
    "@deepseek-ai/dsh-client-ui-slots": "0.1.0-rc.8",
    "@deepseek-ai/dsh-settings": "0.1.0-rc.8",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.8",
    "react": "^18.2.0", "schemastery": "^3.18.0"
  },
  "peerDependenciesMeta": { /* 全部 optional: true */ },
  "engines": { "node": ">=22" },
  "license": "MIT"
}
```

要点：

- **运行时依赖极少**：`dependencies` 只有 1 项且是 `link:../dsh/vendor/schemastery`（编译期解析用；运行时由 harness 解析 `@deepseek-ai/dsh-tools` 等 peer）。**零外部 npm 运行时依赖**（FFmpeg、ws 等都在 devDependencies 或运行时按需下载）。
- **peerDependencies 全部 pin 到 `0.1.0-rc.8`**——即 DSH rc.8 世代（与 marisa 当前 rc.8 基线吻合，见 §8）。
- 无 bin 字段（不发布 npm）；`main` 指向预构建的 `lib/index.js`。
- `dsh.bundle.patch` + `cordis.patch.yml`：以「组合层插入」方式声明插件（见 §3.4）。

来源：`package.json`（master）；`tsdown.config.ts`。

### 3.3 插件入口与 32 个 `ego_*` 工具

**入口（src/index.ts）**：

- `export const name = 'ego-browser'`；`export const inject = ['tools', 'subprocess', 'webServer']`（host 服务注入：工具注册、子进程、HTTP 服务）。
- `export const Config = ConfigSchema`（schemastery schema，供组合层校验与 `ctx.settings.register()`）。
- `apply(ctx, config)`：安装 settings bridge → 解析配置（live getter 读 GUI 改动）→ 注册 4 组工具 → 注册观察窗 host 路由与 settings HTTP gateway → 注册优雅卸载（`ctx.effect` 里 fire-and-forget 执行 `ego-browser --stop`，**刻意不 await**，防 DSH 重启卡死）。

**工具注册机制**：用 `@deepseek-ai/dsh-tools` 的 `defineTool({name, description, parameters, output, timeoutMs, execute, presentCall})`，经 `ctx.tools.register(tool)` 注册，并用 `ctx.effect(() => dispose)` 绑定 Cordis 生命周期（插件卸载自动注销）。所有工具经 `withEgoLock` 全插件互斥锁串行化，统一 `@@DSH_RESULT@@` 哨兵行解析，`withWarmupRetry` 只对 CDP 瞬态冷启动失败重试。

**执行引擎（runEgoScript）**：每个工具把参数拼成一段 JS 脚本，经 `ctx.subprocess.spawn({ argv: [process.execPath, cfg.egoBin, 'nodejs', ...extraCliArgs], stdin: {data: script}, stdout/stderr: {maxBytes...}, graceMs })` **喂给 vendored CLI 的 stdin** 运行；CLI 内 `globalThis.ego` 是 Linux 移植版的 CDP shim（`runtime/ego-linux/src/shim.mjs`），驱动共享 Chromium。每个 heredoc 是独立短命 Node 进程，浏览器本体（常驻 Chrome 单例）跨调用持久。

**32 个工具清单**（src/index.ts 实测 `name: 'ego_...'` 唯一计数 = 32，分类与 README 一致）：

| 类别 | 工具 |
|---|---|
| 任务空间 | `ego_space_open` `ego_space_close` `ego_status` |
| 页面读取 | `ego_snapshot`（语义树） `ego_page_info` `ego_read_element` |
| 导航/等待 | `ego_navigate`（复用 tab） `ego_wait` `ego_wait_for_selector` `ego_wait_for_url` `ego_wait_for_response` |
| 交互 | `ego_click` `ego_fill` `ego_hover` `ego_drag` `ego_select` `ego_check` `ego_key` `ego_scroll` |
| 执行/调试 | `ego_js`（页面求值） `ego_cdp`（原始 CDP） `ego_cli`（任意 heredoc） `ego_script`（多步脚本） |
| 输出 | `ego_screenshot` `ego_download` `ego_upload` |
| 会话/安全 | `ego_auth_flush`（登录落盘） `ego_captcha` `ego_dialog` |
| 元工具 | `ego_help` `ego_doctor` `ego_http` |

各能力实现要点（对照代码）：

- **文本语义快照**：`ego_snapshot` 通过 harness 的 `page.snapshot()`（Linux 用 CDP `DOMSnapshot` 重建语义树，annotated `[ref=N, loc=...]`）返回全页语义树文本。
- **语义定位点击/填充**：`ego_click`/`ego_fill` 支持 CSS selector、`xpath=...`、`loc=...`、`ref=@N`、视口坐标；经 harness `page.locator(...).click()/.fill()` 或 `page.mouse.click(x,y)`。
- **CDP 控制**：`ego_cdp` 直接 `cdp(method, params)`；`ego_js` 走 `page.evaluate`；`ego_cli`/`ego_script` 是**任意 heredoc**（完整 facades：page/browser/taskSpaces/site/fetch + 原始 cdp）。
- **任务空间隔离**：harness `taskSpaces.useOrCreate` + Linux 移植版 `createSeededContext()`（`Target.createBrowserContext` 创建隔离 context，再用 `Storage.getCookies({})` → `Storage.setCookies({browserContextId, cookies})` **从默认 context 播种 Cookie**，实现「隔离 + 继承登录态」）。
- **截图**：`ego_screenshot` 保存 PNG 并返回文件路径（供视觉工具读取）。
- **HTTP**：`ego_http` 默认走 `fetch.browser`（页面浏览器上下文，跨域受 CORS 限制），`mode: server` 走 Node 侧 `fetch.server`（Windows runtime 会触发 libuv 崩溃，故默认 browser 模式）。
- **登录落盘**：`ego_auth_flush` 强制把浏览器 Cookie journal 写入磁盘 profile（Chrome 只在优雅关闭时落盘，此工具主动推进）。

来源：`src/index.ts`（apply/defineEgoTool/runEgoScript/各工具定义）；`src/types.ts`；`runtime/ego-linux/src/shim.mjs`、`task-spaces.mjs`；`docs/ARCH.md`。

### 3.4 如何注册进 HARNESS（DSH 插件 API 用法）

| DSH 能力 | 用法（对应代码） |
|---|---|
| 组合层声明 | `cordis.patch.yml`：`- insert: { id: ego-browser, name: '@dsh-external/ego-browser' }`，经 `package.json` 的 `dsh.bundle.patch` 挂到 profile 组合层；所有 Config 字段可选，默认值在 `lib/index.js` 计算 |
| 服务注入 | `inject: ['tools', 'subprocess', 'webServer']`；`ctx.get('betterSidebar')` 机会性探测（sidebar 非硬依赖） |
| 工具注册 | `ctx.tools.register(defineTool(...))` + `ctx.effect(() => dispose)` |
| 子进程 | `ctx.subprocess.spawn(...)`（dsh-subprocess 服务）驱动 vendored CLI 与观察窗 worker |
| HTTP 路由 | `ctx.webServer.register({kind:'prefix', path:'/ego/api', handler})`（settings gateway）；`initCastServer` 注册 `/api/ego/spaces|stream|health|close|flush|input|video`（观察窗 host 桥，仅当有 webServer 时注册，headless 安全 no-op） |
| 设置 | `ctx.inject(['settings'])` + `ctx.settings.register(SETTINGS_NAMESPACE, Config, {base: entry})`；bridge 模式（source()/onChange()）做跨 fiber 共享 scope |
| 事件 | 前端 `ctx.on('connection/reset', ...)` 刷新设置 |
| 前端注入 | `dsh.client.inject` 声明 4 个 client peer；`lib/client.js` 以 `window.__ModuleLoader__.load({id, factory})` 打包，经 `ctx.slots.inject('settings.plugin.item', ...)` 注册设置卡，`ctx.locale.register` 注册中英词典，`ctx.get('betterSidebar')` 可用时注册 sidebar Tab 否则挂浮动观察窗 |
| 生命周期 | 全程 `ctx.effect(...)` 注册/注销；卸载 fire-and-forget `--stop` |

来源：`src/index.ts` L37-748；`src/gateway.ts`；`src/settings.ts`；`src/cast-server.ts`；`lib/client.js`（apply/mountFloatingWatch/mountSidebarTab）；`cordis.patch.yml`；`package.json` dsh 字段。

### 3.5 「内置 ego 运行时」是什么

- `runtime/` 目录整体 vendored 自 [CitroLabs/ego-lite](https://github.com/CitroLabs/ego-lite)（MIT），首次 vendoring 提交 `a77dee4`（2026-08-07）。包含三块（`THIRD_PARTY_NOTICES.md`）：
  1. `runtime/ego-browser/dist/out/index.js` —— 上游共享 harness 单文件构建（npm 包名 `ego-browser-v2`，v0.1.0，见上游 `package/ego-browser/package.json`）。这就是「ego-browser CLI」本体：读 stdin heredoc、预载 page/browser/taskSpaces/site/fetch/cdp facades 执行。
  2. `runtime/ego-linux/` —— **Linux CDP host**（上游 PR #234 的 `package/ego-linux` 移植，作者 NagyViktor）+ 本地代理补丁。它把 `globalThis.ego` 实现为对「普通 Chromium」的 CDP shim（15 个方法 + 2 回调，逐方法实现或显式降级），替代 macOS App 的原生绑定。**该 PR 尚未合并进上游 main**（本调研实测上游 main 无 `package/ego-linux` 路径）。
  3. `runtime/skills/ego-browser/` —— agent skill 包（v1.2.6，2026-07-20；本调研逐字节对比：与上游 main 的 SKILL.md 完全一致）。
- **本地改动有记录**（`runtime/PATCHES.md`，相对 vendored 基线）：cursor.mjs 品牌 Claude→DeepSeek；chrome.mjs Windows 支持（`isAbsolute`/`where`）+ `--no-startup-window` 单窗修复 + `EGO_LINUX_EXTRA_ARGS` 用户自定义 Chrome 参数（`CHROME_BLOCKED` 拉黑 `--user-data-dir/--remote-debugging-port/--headless/--proxy-server` 等控制面标志）；paths.mjs Windows `%LOCALAPPDATA%\ego-lite-linux`。
- **没有上游同步机制**：runtime 是「只读参照」，靠 `PATCHES.md` 人工记录改动；README/文档提示跟进上游时重点 diff cursor.mjs。无 CI 自动同步。

来源：`THIRD_PARTY_NOTICES.md`；`runtime/PATCHES.md`；`runtime/ego-linux/bin/ego-browser.mjs`（头部注释）；上游 raw 文件对照（2026-08-23 抓取）；GitHub PR #234 页面（HTTP 200，标题 "feat(install): run on Linux..."）。

### 3.6 「Linux + Chrome 开箱即用」的具体机制

- **不下载 Chromium**：README 与代码均确认——运行时**自动发现系统已装的 Chrome/Chromium/Brave/Edge**（`BINARY_CANDIDATES`：google-chrome/chromium/brave-browser/microsoft-edge 等，`EGO_LINUX_CHROME` 可显式指定；Windows 下 `where` 替代 `which`）。**没有任何 Chromium 下载逻辑**（grep 全仓：仅 FFmpeg 有 managed download）。
- **依赖系统组件**：必须已有 Chrome/Chromium 系浏览器（Windows 可用 Edge）；Node ≥ 22；观察窗 CDP 后端零额外依赖，FFmpeg 后端按需下载（`~/.dsh/cache/ego-browser/ffmpeg/`，固定 BtbN release + SHA-256 校验，GPL）。
- **无构建步骤**：`lib/`、`bin/` 是**预构建入库**的产物（tsdown 三 bundle），`dshx install` 直接可用；`npm run build` 是开发时语法校验/重打包，用户侧不需要。README「无需克隆官方仓库或手动构建」**属实**（运行时已 vendored + 产物已入库）。
- **root / 无显示器兜底**：`bin/ego-chrome-wrapper.sh` 随包自带 `--no-sandbox` wrapper；`resolveEgoEnv` 探测 root（POSIX）时自动把 `EGO_LINUX_CHROME` 指向 wrapper；无 DISPLAY 时自动 `EGO_LINUX_HEADLESS=1`（Chrome `--headless=new`）。
- **Windows 差异**：不注入 wrapper（Windows Chrome 无 sandbox 门槛），直接传二进制路径。

来源：`runtime/ego-linux/src/chrome.mjs`（BINARY_CANDIDATES/LAUNCH_FLAGS/launch/resolveBinary/which）；`bin/ego-chrome-wrapper.sh`；`src/index.ts` resolveEgoEnv；README「前置条件/安装/已知限制」。

---

## 4. 与上游 ego-lite 的关系

### 4.1 上游 ego-lite 概况（2026-08-23 抓取）

- **CitroLabs/ego-lite**：README 自述 "The fastest browser for AI agents to run browser automation"；核心卖点「agent 在你自己的浏览器里并行干活——任务在自己的 Space 隔离，你的 tab 不被打扰，agent 能拿到你的真实登录态」；官方 macOS App 版（下载 dmg），**Windows/Linux 在 roadmap 上**；skill 安装方式 `npx skills add citrolabs/ego-lite`；MIT。
- **AnonymXXX/ego-lite**：README 与 CitroLabs 逐字节相同（同一份内容）；从措辞看是镜像/改名副本，并非独立分支——「自称 the fastest browser... sharing your logged-in browser state」的说法与 CitroLabs 主仓库一致。
- **Linux 支持状态**：官方 main 无 `package/ego-linux`；Linux 移植是 **PR #234**（未合并）。`dsh-ego-browser` 正是把这份未合并的社区移植（+ 官方共享 harness + skill）整体 vendored 进来，并在其上叠加 DSH 工具层与观察窗。

来源：上游 `README.md`（CitroLabs 与 AnonymXXX raw 对照，逐字节相同）；raw 路径探测（main 下 `package/ego-linux` 404、`package/ego-browser` 200、`skills/ego-browser` 200）；GitHub PR #234 页面。

### 4.2 本插件与上游的代码/版本关系

| 组件 | 来源 | 版本/基线 | 本地改动 |
|---|---|---|---|
| `runtime/ego-browser/dist/out/index.js` | 上游 `package/ego-browser` 构建产物 | 上游 npm 名 `ego-browser-v2` v0.1.0 | 无（vendored 原样） |
| `runtime/ego-linux/*` | 上游 PR #234（未合并） | 无独立版本号 | 有：Windows 支持、单窗修复、自定义 Chrome 参数、品牌（`PATCHES.md` 全记录） |
| `runtime/skills/ego-browser/*` | 上游 `skills/ego-browser` | SKILL.md metadata v1.2.6 (2026-07-20) | 无（本调研与上游 main 逐字节一致） |
| 插件自身 `src/`+`lib/`+`bin/` | Fisfzy/dsh-ego-browser 自研 | v0.8.0 | — |

- **是否为 vendored**：是。`THIRD_PARTY_NOTICES.md` 明示 "This plugin **vendors** (embeds)..."，首次引入提交 `a77dee4`。
- **版本号对齐**：上游 harness 无显式版本号（构建产物），skill 为 v1.2.6；插件自身版本独立演进（v0.2.0→v0.8.0，CHANGELOG 完整记录）。
- **上游同步机制**：**无自动化机制**（无 submodule、无 CI 同步、无 vendor 脚本）；靠人工 vendoring + `PATCHES.md` 记录本地改动，文档建议「跟进上游时重点 diff」。风险：上游 PR #234 若更新/合并，本地补丁需手工合并；上游 harness 更新也需人工重新 vendoring。

来源：`THIRD_PARTY_NOTICES.md`；`runtime/PATCHES.md`；上游 raw 对照（2026-08-23）；`git log --oneline --all` 中无任何 sync/vendor 脚本提交。

---

## 5. 质量评估

### 5.1 代码组织

- **工程结构清晰**：v0.6.0 起确立「lib/ 唯一源、build=语法校验」；2026-08-21 PR #14 又迁回 TypeScript（src/ 权威 → tsdown 三 bundle 入库 lib/、bin/）。有 `docs/ARCH.md` 架构与维护指南、`docs/plans/*.md` 设计文档（双画面管线、FFmpeg 安装、自定义 CLI 参数等 7 份）、CHANGELOG（Keep a Changelog 格式）。
- **测试**：15 个 vitest 文件（capture-cdp/ffmpeg/manager/platform、cast-server、config、env、ffmpeg-installation/manifest/probe、mp4-fragments、settings、sanity 等），覆盖观察窗与配置管线；但**工具层（index.ts 的 32 个工具）与 gateway 没有测试**。无 CI 跑测试。
- **依赖成熟度**：运行时零外部依赖（仅 link 的 schemastery 编译期用），peer 全部 pin rc.8；devDeps 标准（tsdown/vitest/ws/jsdom）。但 `dependencies` 里的 `link:../dsh/vendor/schemastery` 是**对 DSH checkout 的路径依赖**——非该仓库形态下解析会失败（普通 `pnpm install` 在仓库外不可复现，README 已声明 DSH profile 安装应提供 peer）。
- **规模**：912KB；src/index.ts 约 86KB（工具定义大文件但内部注释分区清晰）。

### 5.2 明显问题（代码审查结论）

1. **README/API 描述的工具数过时**（13 vs 实际 32）。
2. **gateway 的 `ALLOWED_KEYS` 缺少 `egoCliArgs`/`chromeArgs`**（`src/gateway.ts` L35-39）：设置网关 `/ego/api/set` 无法持久化这两个字段——这正是 open PR #13 指出的「master 也缺」的 bug，尚未修复。
3. **文档与运行时 selector 语法不一致**（issue #5）：工具 description 教 `ref=@N`，而 vendored runtime `parseRef()` 只认 `@N` 或 `ref=N`；`ref=@N` 组合形式既不匹配也非 CSS，会抛 `ElementResolutionError`。**至今未修**（本调研在 master src/index.ts 5 处仍见 `ref=@N` 字样）。
4. **未合并的社区运行时**：底层是上游 PR #234（未合并），README 自己承认「跨 CLI 调用间可能丢 tab/空间状态」；任务空间用文件共享状态（`task-spaces.json`），多 agent 并发有竞态（代码内有 `pinnedSpaceId` 缓解但非根治）。
5. **FFmpeg 后端复杂度高**：gfxcapture/HWND 匹配/h264_mf D3D11 探测等大量平台特化逻辑，Windows 录制路径脆弱（CHANGELOG 记录了多次修复）；FFmpeg 下载依赖 GitHub 可达性与镜像配置。
6. **无 CI、工具层无测试**。
7. **CHANGELOG 版本日期混乱**（v0.6.0-v0.4.0 标 2026-04，但仓库 2026-08 才建）——小瑕疵，不影响功能。

### 5.3 Open Issues / PR 内容概要（GitHub API，2026-08-23）

open issues 共 5 个（其中 4 个实为 PR，1 个纯 issue）：

| # | 类型 | 标题 | 提出者 | 状态/内容概要 |
|---|---|---|---|---|
| 1 | PR | feat(ego-linux): persist task-space cookies across browser restarts — flush space cookies back to the default context | huantian233 | **未合并**。任务空间用 incognito BrowserContext，Cookie 只在内存，重启即登出；`/api/flush` 与 `ego_auth_flush` 实为无效（`Network.getAllCookies` 拿不到空间 Cookie）。方案：`/api/flush` 时读 `task-spaces.json` 的 `browserContextId`，用 `Storage.getCookies({browserContextId})` 取、`Storage.setCookies` 写回默认 context。带验证数据（Chrome for Testing 152：41 cookies、35 持久化）。注：本调研确认 master 的 worker 里**没有**该 flush 逻辑，仍待合并 |
| 2 | PR | feat(ego-linux): strip headless fingerprints — user-agent and automation-controlled flags | huantian233 | **未合并**。Linux headless 下 UA 含 `HeadlessChrome/`、`navigator.webdriver=true`，高风控站（豆包/抖音实测）直接拒 agent。方案：`LAUNCH_FLAGS` 加 `--user-agent=Chrome/152...` + `--disable-blink-features=AutomationControlled`，bot.sannysoft.com 验证通过。注：本调研确认 master 的 chrome.mjs **尚无**这两个 flag，仍待合并 |
| 3 | PR | fix: two defects breaking plugin load in strict-schema harnesses (ego_select.value missing type; spaceParam out of scope) | huantian233 | **未合并**。缺陷 A：`ego_select.value` 参数缺 `type` → `JsonSchemaError`；缺陷 B：`registerHelpAndDoctor` 引用作用域外的 `spaceParam` → `ReferenceError` 导致整插件 apply 失败。注：本调研确认 **master 已通过其他途径修复**（src/index.ts 现在 `const spaceParam` 是模块级 L915、`ego_select.value` 有 `type:'json'` L1497），PR 本体可能已过时 |
| 5 | Issue | Docs: tool descriptions claim `ref=@N` selector syntax, which is rejected at runtime | zhouweibin-ui | **未修复**（见 §5.2-3），给出了 5 处受影响位置与最小修复建议 |
| 13 | PR（owner） | feat: Windows stability test — local fixes (rc.8 dual-compat + gateway fix) | Fisfzy | **未合并**（仓库主的 Windows 稳定性整合 PR，2026-08-21 创建）。内容：侧边栏旧前端 UI 恢复、liveImg callback ref 修复、`/api/ego/nav`/`/api/ego/frameable` 路由恢复、`/api/nav` handler 恢复（新版 Chrome 移除 `Page.goBack/goForward`，改 `Runtime.evaluate history.back()/forward()`）、runtime `hasDisplay` 恢复；rc.8 双兼容 selector（web-react 被移除后回退内联 use-sync-external-store 实现）；gateway `ALLOWED_KEYS` 补 `egoCliArgs/chromeArgs`（master 也缺，同 §5.2-2）。Windows 验收清单：dshx install、CDP worker、ego 运行时 tab 渲染、配置持久化、DSH 崩溃/重启稳定性。另注明「底层 ego-lite 建议作为独立安装/运行时考虑，跨平台稳定性待 macOS 等测试」 |

另：已合并 PR 中值得注意的有 #11（适配 DSH rc.8：web-react→ui-renderer 重命名、keyed slot registration）、#12（自定义 CLI/Chrome 参数）、#14（JS→TS 迁移）。

来源：GitHub API `/issues?state=open`（5 项，含 PR）；master 代码对照（§5.2）。

### 5.4 README 声称核实

| 声称 | 核实结果 |
|---|---|
| 「无需克隆官方仓库或手动构建」 | ✅ 属实：runtime 已 vendored、lib/bin 预构建入库，dshx install 即可用 |
| 「Linux + Chrome 开箱即用」 | ✅ 基本属实：自动探测系统 Chrome、root/headless 兜底；**前提是系统已装 Chrome/Chromium/Brave/Edge**（不下载 Chromium） |
| 「32 个结构化工具」 | ✅ 代码实测 32 个（API description 的「13」已过时） |
| 「监控窗直接操作真实浏览器」 | ✅ cast worker + `/api/ego/input` 回传 CDP Input 事件（点击/拖拽/滚动/键盘） |
| 「登录态落盘持久化 ego_auth_flush」 | ⚠️ 部分属实：`ego_auth_flush` 存在且推 Cookie journal 落盘；但**任务空间 Cookie 的反向回流（写回默认 context）仍未合并**（PR #1），空间内登录态在 `--stop` 后的持久性仍依赖优雅关闭路径 |
| 「观察窗 CDP JPEG / FFmpeg H.264 双后端」 | ✅ 属实（v0.8.0 双管线）；FFmpeg 为按需下载（GPL，需用户选择） |
| 「不发布到 npm / 不要公开 fork 镜像」 | ✅ 属实（package.json `private: true`，README 明言）——对 marisa 打包有约束含义 |

---

## 6. 安全与权限视角

审查视角：以「插件新增网络/进程/文件写入/密钥/模型访问能力需写明权限影响」为纲。以下为**代码审查结论**，非渗透实测。

### 6.1 能力清单

| 能力维度 | 具体能力 | 对应代码 |
|---|---|---|
| 进程 | 常驻 Chrome 单例（spawn detached）+ 每次工具调用 spawn 短命 Node CLI 进程 + 观察窗 worker 进程；root/CI 下经 `--no-sandbox` wrapper 启动 Chrome（**Chrome 沙箱被禁用**） | `chrome.mjs launch()`、`ego-chrome-wrapper.sh`、`runEgoScript`、`cast-server.ts` |
| 网络 | agent 浏览器任意访问网络（以用户登录态）；`ego_http` 可发任意 HTTP（browser 或 server 模式）；FFmpeg 按需下载（GitHub → `~/.dsh/cache`，SHA-256 校验）；`EGO_LINUX_PROXY` 代理注入 | `ego_http`、`ffmpeg-installation.ts`、`chrome.mjs EGO_LINUX_PROXY` |
| 文件写入 | 下载捕获（`ego_download` 可写任意 `savePath`）；截图写 PNG；FFmpeg 托管缓存写入；Cookie journal 落盘 profile；`ego_upload` 把本地文件塞进 `<input type=file>`（文件读取+上传方向） | `ego_download`、`ego_screenshot`、`ego_auth_flush`、`ego_upload` |
| 密钥/凭据 | **默认继承用户 Chrome 登录态**（任务空间播种默认 context Cookie）；`--import-chrome-profile` 可把用户真实 Chrome profile（含 cookies/登录）拷进 agent profile；`ego_auth_flush` 把登录 Cookie 落盘持久化 | `task-spaces.mjs createSeededContext`、`ego-browser.mjs --import-chrome-profile`、`ego_auth_flush` |
| 模型访问 | 无直接模型能力；但 `ego_snapshot` 会把整页文本（含敏感页面内容）喂给 LLM 上下文；截图文件路径可供视觉工具读取 | `ego_snapshot`、`ego_screenshot` |
| 代码执行 | `ego_js` 页面任意 JS；`ego_cdp` 原始 CDP（可驱动任意浏览器能力）；`ego_cli`/`ego_script` **任意 Node heredoc**（facades + 原始 cdp，且运行在与浏览器同权限的 Node 进程） | 各工具定义 |

### 6.2 风险点

1. **CDP 端口暴露**：Chrome 以 `--remote-debugging-port=0`（随机端口）启动，**默认绑定 127.0.0.1 loopback**（无 `--remote-debugging-address`），端口写进 profile 目录 `DevToolsActivePort` 与 `browser.json`。任何**本机进程**（含被攻破的普通程序）若能读到端口文件即可无鉴权连接 WebSocket CDP 端点，获得对 agent 浏览器的完全控制（含 Cookie）。`--remote-allow-origins=*` 进一步放宽了 WebSocket Origin 校验——不过 Node 客户端本身不发 Origin，这是兼容性所需；本机攻击面仍是主要关注点。
2. **evaluate 任意 JS / 任意 heredoc**：`ego_js`/`ego_cdp`/`ego_cli`/`ego_script` 是**无沙箱的 RCE 级工具**（页面域与 Node 域）。LLM 若被 prompt injection 诱导（访问恶意页面 → 页面注入指令），理论上可借这些工具执行任意动作（读本机文件 `ego_upload` 的上传方向、发任意请求 `ego_http`、写文件 `ego_download`）。这是浏览器自动化插件固有的攻击面，插件**未做任何 prompt-injection 隔离**。
3. **凭据面**：agent 浏览器默认就是「已登录用户」——若 DSH 会话被投毒，等于把用户全部 Web 登录态交给模型调度。`ego_auth_flush` 落盘使登录态持久化，扩大暴露窗口；`--import-chrome-profile` 直接把真实 profile 复制进来（Linux 路径）。
4. **用户数据目录**：`%LOCALAPPDATA%\ego-lite-linux`（Windows）或 `~/.local/share|state/ego-lite-linux`（Linux）存放 profile（含 Cookie SQLite）与状态文件；与 DSH_HOME 分离，卸载插件不会清理（卸载只发 `--stop`）。
5. **网络出口**：agent 浏览器可访问内网/云元数据端点（`ego_http` server 模式尤其——Node 侧 fetch 无浏览器同源约束）。若 DSH 宿主处于办公网/云环境，浏览器流量等同于用户本机流量。
6. **FFmpeg 供应链**：托管下载固定 BtbN release + SHA-256 校验 + `githubMirror` 可替换下载基址（README 提供 gh-proxy 用法）；校验存在但需注意镜像可达性与发布者可信度；GPL 义务需在分发时遵守。
7. **settings HTTP gateway**（`/ego/api/get|set`）：**无鉴权**，仅靠同源检查（Origin/Content-Type 校验）——任何能向 DSH webServer 发同源请求的页面（如 DSH 自身 XSS、或本机同源脚本）可改 `chromePath` 等配置；`set` 有 ALLOWED_KEYS 白名单（§5.2-2 还漏了两个键）。风险等级：中（依赖宿主 webServer 暴露面）。
8. **本地改动记录了代理注入**（`EGO_LINUX_PROXY` → `--proxy-server` + 旁路列表），代理可观测/篡改 agent 流量——属于用户显式配置，风险自担。
9. **`--no-sandbox` wrapper**：root/Docker/CI 下 Chrome 沙箱禁用，若渲染进程被攻破可直接打宿主。桌面普通用户路径不触发（非 root 不用 wrapper）。

**权限影响小结（供 PR 审查模板）**：本插件新增——进程（常驻 Chrome + 子进程）、网络（浏览器流量 + 任意 HTTP 工具 + 下载）、文件写入（profile/截图/下载/缓存）、凭据（继承登录态 + 落盘 + 可选导入真实 profile）、代码执行（页面 JS + 原始 CDP + 任意 Node heredoc）。属于**高权限浏览器自动化插件**，引入/升级均需按此清单写明权限影响。

来源：`chrome.mjs`（LAUNCH_FLAGS/launch/stopBrowser）；`paths.mjs`；`gateway.ts`；`index.ts` 各工具；`THIRD_PARTY_NOTICES.md`；`CHANGELOG.md` 相关条目。

---

## 7. WebGL 游戏支持评估（补充调查项）

> 本节约结论为**代码审查结论 + 通用 Chrome 行为推断**，未经真实游戏实测（委托方主会话已核实的代码证据直接引用）。

### 7.1 事实依据（代码审查）

1. `runtime/ego-linux/src/chrome.mjs` 的 `LAUNCH_FLAGS` 与 `launch()`：**没有任何 GPU 相关 flag**（无 `--disable-gpu`/`--use-gl`/`--enable-unsafe-swiftshader`/ANGLE 指定），只有 `--headless=new`（无显示器时）、`--force-device-scale-factor=1`、`--window-size=1280,900`。用户 `chromeArgs` 设置可透传自定义参数（经 `EGO_LINUX_EXTRA_ARGS`），且 `CHROME_BLOCKED` 黑名单**不拦截 GPU 参数**（只拦 user-data-dir/remote-debugging-port/headless/proxy 等控制面标志）。
2. 观察窗 CDP 后端用 `Page.startScreencast` JPEG（默认 20 FPS），走合成器帧，**WebGL canvas 内容能进画面**；`docs/plans/2026-08-17-dual-capture-pipeline-design.md` 明确写过「视频或 canvas 若 Chromium screencast 本身仍无法产生帧，交由 FFmpeg 后端解决」（FFmpeg 后端捕获真实窗口/显示源）。
3. `ego_snapshot` 是 **DOM 语义树**，对 canvas 游戏基本无感知；`runtime/skills/ego-browser/SKILL.md` 明确 canvas 类应用走 **visual workflow**（`captureScreenshot` + 坐标点击，如 `click({selector:'canvas#stage', x:12, y:8})`）。

### 7.2 分场景结论

| 场景 | 预期表现 | 说明 |
|---|---|---|
| **headed（有显示器）** | WebGL 应正常（跟随系统 Chrome 的 GPU 策略：硬件 GPU → ANGLE → 软件回退按 Chrome 默认） | 启动参数不干预 GPU；`--force-device-scale-factor=1` 只影响 DPR 布局，不伤 WebGL 渲染 |
| **headless / Docker** | WebGL 大概率**不可用或退化为无** | Chrome 137+ 已移除 SwiftShader WebGL 自动回退，headless 下无 GPU 时需 `--enable-unsafe-swiftshader` 显式开启软件 WebGL。本插件默认不带该 flag，但**可通过设置卡 `chromeArgs` 手动加**（黑名单不挡） |
| **agent 感知层** | 快照是 DOM 树 → canvas 游戏基本「看不见」；只能靠 `ego_screenshot` + 坐标点击（visual workflow） | 动作类/实时对战游戏对 agent 不现实（帧率、延迟、反应）；**回合制/点击类/UI 简单类可行** |
| **观察窗直播** | CDP JPEG 20 FPS ≈「看直播」级别；FFmpeg 后端可更高帧率/画质 | 对人工观察足够，对需要高频视觉反馈的 agent 任务会受帧率限制 |

### 7.3 建议（若未来要支持 WebGL 游戏类任务）

- headless 部署显式加 `chromeArgs: --enable-unsafe-swiftshader`（并知晓性能代价）；或直接用 headed 模式。
- agent 侧仅面向「截图+坐标点击」可完成的游戏（回合制、卡牌、点击放置、静态 UI 游戏），并配合 `ego_script` 多步脚本。
- 若需高帧率视觉反馈，启用 FFmpeg 后端并调高 FPS/画质档位（`ffmpegFps` 最高 30，码率 500-20000 kbps）。

来源：`runtime/ego-linux/src/chrome.mjs`；`src/config.ts`（chromeArgs/EGO_LINUX_EXTRA_ARGS 链路）；`docs/plans/2026-08-17-dual-capture-pipeline-design.md`；`runtime/skills/ego-browser/SKILL.md`；`src/worker/capture-cdp.ts`（Page.startScreencast）。

---

## 8. marisa-distro 适配性评估

背景：marisa 基线为 DSH rc8（`origin/main 578bf32e` 的 rc.8 树），目标平台 Windows 桌面；上游 DSH 已发 0.1.1-rc.1/rc.2（marisa 换树同步进行中）。

### 8.1 Windows 上能否运行

- **能，但有保留**。插件自身 v0.4.0 起有 Windows 适配（`paths.mjs` 用 `%LOCALAPPDATA%\ego-lite-linux`；`chrome.mjs` 用 `where`/`isAbsolute`；不注入 POSIX wrapper），README 也明确「Windows 插件层已做 v0.4.0 适配」。但：
  - 底层是**未合并的社区 Linux 移植**（PR #234）在 Windows 上的二次运行，README 自认「复杂多步流程稳定性可能弱于 macOS」；
  - **仓库主自己的 Windows 稳定性整合 PR #13 至今未合并**（2026-08-21 创建），其验收清单（dshx install、CDP worker、ego 运行时 tab 渲染、配置持久化、DSH 崩溃/重启稳定性）在 master 上**未完成**；master 还缺 PR #13 的几处修复（nav 路由、hasDisplay、gateway 缺键）；
  - **系统需已装 Chrome/Edge**（Windows 11 自带 Edge，可作为 `microsoft-edge` 候选自动发现——加分项）。
- **缺什么**：master 上缺 PR #1（空间 Cookie 持久化回流）、#2（headless 指纹）、#13（Windows 稳定性修复集）；这些 PR 未合并前，Windows 体验会打折。

### 8.2 DSH 版本兼容性

- peerDependencies **全部 pin `0.1.0-rc.8`**，与 marisa 当前 rc.8 基线**精确吻合**；PR #11 已针对 rc.8 做过适配（web-react→ui-renderer 重命名、keyed slot registration）。
- **对 0.1.1-rc.x 的兼容性未知**：marisa 正向上游 0.1.1-rc.1/rc.2 换树（见 MEMORY 与 `docs/RESEARCH-0.1.1-rc1-migration-20260822.md`），该插件 peer 仍 pin rc.8，且 rc.8→rc.1 涉及 credentials/authorization 子系统、client 包重命名等变化，**需要实测或等作者跟进**（PR #13 的「rc.8 双兼容 selector」说明作者在主动跟 rc.8 客户端面，0.1.1 未提及）。
- 依赖 `link:../dsh/vendor/schemastery` 是开发期路径链接，运行时由 profile 提供 peer——安装到 marisa profile 时应验证 peer 解析（README 已提示「DSH profile 安装应提供这些 peer」）。

### 8.3 引入成本与方式

- **包体**：~900KB（含 vendored runtime；不含 FFmpeg，按需下载）。
- **引入方式选项**：
  1. `dshx install ego-browser <tarball/git URL>`（README 官方路径；tarball 或 git URL 均可）；
  2. 纳入 marisa 发行版 profile（需处理 `private: true` + 「不要公开 fork/镜像」的约束——**建议联系作者取得再分发授权**，或仅以 git URL 形式随发行版安装而非 vendored 入库）；
  3. 自建 fork 维护（违反 README 意愿，不推荐）。
- **验证成本**：Windows 冒烟（工具调用、观察窗、登录态、卸载/重启）需人工验证；FFmpeg 后端为可选路径。
- **权限审查要点**（按 AGENTS.md「新增网络/进程/文件写入/密钥/模型访问能力需写明权限影响」）：§6.1 能力清单 + §6.2 风险点全文，重点：CDP loopback 暴露、任意 JS/heredoc 无沙箱、登录态继承与落盘、`--no-sandbox` wrapper、settings gateway 无鉴权。

### 8.4 结论与建议（值得引入吗）

- **价值**：marisa（Windows 桌面 + rc.8 基线）与它的 peer 版本精确匹配；浏览器自动化 + 实时观察窗 + 登录态共享是该插件生态里完成度较高的一份，32 个工具与双后端观察窗超出同类插件；若 marisa 用户需要「让 agent 操作真实网页/带登录态站点」，这是目前最顺手的选项。
- **但**：① Windows 稳定性尚未由作者验收（PR #13 未合并）；② 底层是未合并社区移植；③ 许可文件缺失 + 作者「不要公开 fork/镜像」的声明与发行版打包冲突；④ 高权限能力面需严肃审查；⑤ 0.1.1-rc.x 兼容性未知。
- **建议**：
  1. **短期（评估期）**：以 `dshx install` git URL 方式在 Windows staging profile 装 master，跑 PR #13 的验收清单（工具调用/观察窗/登录态/重启），并复测 §5.2 已知缺陷（gateway 缺键、ref=@N 文档）的实际影响；
  2. **跟进**：盯 PR #13/#1/#2 合并情况；若 3 个月未合并，考虑作者维护意愿信号；
  3. **引入前必备**：向作者确认（a）LICENSE 文件补齐/授权再分发，（b）「不要公开 fork/镜像」对 marisa 打包的边界；补齐 docs/plugins/<id>.md 权限影响说明与测试证据（AGENTS.md 对 fork 插件的要求）；
  4. **换树至 0.1.1-rc.x 后再评估**：当前 marisa 换树进行中，peer rc.8 pin 与 rc.1/rc.2 的兼容性需在换树完成后实测，或让作者发版对齐；
  5. 引入后默认 CDP 后端（零外部依赖），FFmpeg 后端作为可选并提示 GPL 义务。

---

## 9. 结论与建议（汇总）

1. **仓库处于快速迭代早期**：2026-08-07 建仓、两周 83 提交、v0.8.0；工程纪律良好（ARCH/设计文档/CHANGELOG/PATCHES 齐备、构建产物入库、运行时零外部依赖），但**无 CI、无 LICENSE 文件、API 描述与代码脱节（13→32 工具）**。
2. **架构核心**：DSH 插件以 `ctx.subprocess` 把参数拼成 JS heredoc 喂给 vendored ego CLI（内部是 CDP shim 驱动的系统 Chrome），`ctx.tools.register` + `ctx.webServer` + 前端 slots 注册观察窗；「开箱即用」属实（runtime vendored + 产物预构建 + Chrome 自动发现），但**不下载 Chromium，需要系统已有 Chrome/Edge**。
3. **与上游关系**：runtime 完整 vendored 自 CitroLabs/ego-lite（MIT），Linux 部分来自**未合并的社区 PR #234**，无自动化同步机制；skill 与上游 main 逐字节一致；本地改动有 PATCHES.md 全记录。
4. **质量**：亮点是文档与代码组织；短板是 5 个 open items 里有 4 个 PR 未合并（其中 Windows 稳定性、空间 Cookie 持久化、headless 指纹对 Windows/Linux 体验都关键）、工具层无测试、gateway 缺键与 ref=@N 文档 bug 未修。
5. **安全**：高权限浏览器自动化插件——CDP loopback 无鉴权暴露、任意 JS/CDP/heredoc 无沙箱、默认继承用户 Web 登录态并可落盘、`--no-sandbox` wrapper（root 场景）、settings gateway 无鉴权；引入必须按 AGENTS.md 写明权限影响。
6. **marisa 适配**：Windows 可跑但作者自己的稳定性 PR 未合并；peer rc.8 与 marisa 当前基线吻合但换树 0.1.1-rc.x 后需复测；许可缺失与「不要公开 fork/镜像」声明是打包前置障碍；**建议评估期采用 git URL 安装 + 盯 PR 合并 + 先取得作者授权再谈纳入发行版**。

---

## 附录 A：来源清单

- GitHub API：`https://api.github.com/repos/Fisfzy/dsh-ego-browser`（元数据）、`/issues?state=open`（open items，2026-08-23 经代理抓取）
- 仓库代码（本地克隆 `%TEMP%\dsh-ego-browser-research`，HEAD `09b6fb3`）：`README.md`、`CHANGELOG.md`、`THIRD_PARTY_NOTICES.md`、`package.json`、`cordis.patch.yml`、`docs/ARCH.md`、`docs/plans/*.md`、`src/*.ts`、`src/client/index.ts`、`src/worker/*.ts`、`lib/index.js`、`lib/client.js`、`bin/ego-cast-worker.mjs`、`bin/ego-chrome-wrapper.sh`、`runtime/PATCHES.md`、`runtime/ego-linux/**`、`runtime/ego-browser/dist/out/index.js`、`runtime/skills/ego-browser/SKILL.md`、`tests/*`
- 上游：`https://raw.githubusercontent.com/CitroLabs/ego-lite/main/README.md`、`main/package/ego-browser/package.json`、`main/skills/ego-browser/SKILL.md`（2026-08-23 抓取）；`https://raw.githubusercontent.com/AnonymXXX/ego-lite/main/README.md`；`https://github.com/CitroLabs/ego-lite/pull/234`（PR #234 页面，HTTP 200）
- Git 历史：`git log --all`（83 commits，2026-08-07~08-21）、`git show a77dee4:lib/index.js`（初始 13 工具验证）、`git shortlog -sn`

## 附录 B：本次调研的「13 vs 32 工具」说明

任务描述基于仓库 API description 的「13 个工具」——那对应 2026-08-07 初始 vendoring 版本（实测 13 个）。当前 master 为 32 个（README 与代码一致）。本报告凡涉及工具能力均以 32 为准。
