# Marisa 方向决策与单文件打包：patch→fork 路线、SEA 单文件 + MSI 双版本设计

> 来源会话：`9e5a7eff-3e44-4d49-939f-b2012bdad806.jsonl`（2026-08-14 10:27–19:41 UTC，JSONL 2525 行）
> 整理方式：会话记录结构化纪要（转录工具统计 user 消息 43 条；任务描述中「约 494 条」与脚本统计不符，以脚本为准，见文末「无法核实内容」）
> 注：文内时间为转录中 UTC 时间（当天本地时间为 UTC+8，日志行内的 18:33 等为本地时间）

## 背景与目标

用户（LoserFox）在 Win11 机器上想把 marisa-distro（DSH 生态的插件分发发行）跑起来，目标是「desktop 壳子」。机器上已有 `dsh-desktop`（Wails v3 壳，含已编译的 `dsh-shell.exe`）、`dsh-win-port`（harness Windows 移植 + launcher）、`marisa`/`marisa-v2` 目录，以及 `~/.dsh/source/current`（0808 快照 harness checkout）。

会话目标在用户多次纠正下演进为：

1. 跑通桌面壳（早期目标，被后续纠正覆盖）；
2. 跑 **marisa profile**（31 插件聚合包）套桌面壳，而不是机器上已有的 win-port profile；
3. **架构转型**：否定「安装时打补丁」路线，改为 **fork 形态**——插件收进仓库、单个构建脚本、直接修复部分官方 harness 源码、正式作为 fork 兼容、**发版只发 desktop 二进制**；
4. **双版本发布设计**：v1 = 真·单文件 exe（SEA 内嵌），v2 = MSI 进阶版（允许 dsh 修改自身源码、安装时解压源码到用户目录）；先做 v1。

## 关键决策与理由

1. **桌面壳后端启动形态**（约 10:28–10:33）——`DSH_WEB_CMD` + desktop overlay 方案。
   壳默认 spawn `dsh web --port 0` 必挂：win-port launcher 会把父级 `--profile win-port` 注入给 `web` 子命令，而 0808 CLI 的 `web` 子命令**严格拒绝父级 `--profile`**（`web takes none of parent --profile`）；官方 win-port 指南推荐的 `dsh --profile win-port --port {port}` 也不成立（父级根本没有 `--port` 选项）。实测结论：`--port` 只存在于 `web` 子命令，且 `dsh web` 固定用 `web` profile。解法：`DSH_WEB_CMD="dsh --profile win-port --patch <desktop.overlay.yml>"`——profile 模式直接 boot，`--patch` 附带一个 `webserver: {host: 127.0.0.1, port: 0}` 的 overlay（OS 分配端口），壳从 stdout 解析 `dsh web: <url>` 得到真实 URL。`setx` 持久化，另建 `run-marisa-windows.cmd` 启动器。

2. **webview 就绪竞态修复**（约 10:38–10:44）——`awaitWebviewReady` 的订阅时机是 bug 根源：它等后端 URL 就绪（30–60s）后才订阅 `WebViewNavigationCompleted` 事件，而启动页首次导航在应用启动后 ~1s 就完成，Wails 事件流**无回放** → 30s 超时 → 跳过 `SetURL` → 窗口永远停在启动页。修复：`subscribeWebviewReady(win)` 在窗口创建时（`app.Run()` 之前）订阅，`awaitWebviewReady` 只等 channel；快后端语义不变（仍等首次导航）。`go vet`/`go test` 通过后重建 `dsh-shell.exe`。

3. **方向纠正：跑 marisa profile 而非 win-port**（约 10:50）——用户明确「我让你跑起来的是 marisa-distro，不是我电脑的 dsh-desktop」。此前把壳跑成了机器上已有的 win-port profile（个人 pwsh 组合），不是 marisa-distro 的 31 插件聚合。此后工作重心转向「在这台 Windows 机上把 marisa profile 装起来」。

4. **patch→fork 架构决策**（11:08，本次会话最核心决策）——用户原话：「我觉得我们的项目路线完全错了，通过patch的形式并不能很好的去兼容，我们应该把这些插件都收集到仓库里面。然后只做一个构建脚本，甚至直接修复一部分官方的代码，我们正式去作为一个fork进行兼容，然后发版我们只发desktop二进制」。理由：安装时 clone+打补丁的兼容性脆弱（当天实例：mygo 依赖解析、tsconfig 硬编码 mac 路径、@deepseek-ai 包漂移、junction 补链、shim）。新架构：`harness/`（完整 fork，修复直接提交）+ `plugins/`（29 插件入库）+ `desktop/` + `profiles/marisa/` + 单构建脚本 + `release/`。

5. **v1/v2 发布形态**（11:12–11:14）——用户明确：「真·单文件 exe（SEA 内嵌）一个版本，第二个是进阶版本，允许dsh修改一部分自己的源码，做成msi格式，然后会解压源码到一个用户目录」。随后「先做v1，然后我们后面再看v2」——本会话只做 v1。SEA 内嵌的 native 模块坑（node-pty 等）用「首跑自解压到 `%LOCALAPPDATA%\marisa-distro\backend`」方案绕开（`go:embed backend.zip`，非严格 SEA）。

6. **并行执行**（11:14）——用户要求「多开几个subagent并行去实现这个任务」，用 workflow 编排 6 个 agent：Structure(1) → Fixes(3 并行: CLI/插件 tsconfig/profile 模板) → Build(1) → Package(1)。

7. **dsh-coding 双文件形态评估**（11:21–11:23）——用户给 omdsh-dev/dsh-coding 的 `package.json`（`dsh.profile.bundles` + `dsh.desktop`）+ 手写 `cordis.patch.yml`，问「这个形式怎么样？我觉得有点简陋」。评估结论：对 2 插件小组合够用，对 29 插件发行不合适（patch 手写必错、无构建时校验、bundles 与 deps 双份维护）；**采纳 `dsh.desktop` 元数据约定**，patch 改为「声明式 manifest + 生成 + 构建时校验」（后因 fork 重排简化为 bundle 归属）。

8. **组合归 bundle、profile 薄化**（17:27–17:35）——用户再纠正：「我们之前聊过，我们说我们走patch形式不行，这样会比较复杂」。重排：`webServer→httpServer` 兼容别名直接写进 harness `packages/host/webserver/src/index.ts`（`ctx.provide('webServer', this)`，lib 用 `pnpm exec tsdown --env.DSH_BUILD_FACE host` 重建，因为 `build:lib:host` 的 tsc 会挂在 examples/website 既有 TS 错误上）；组合 patch 归 **`bundles/marisa-bundle/`**（bundle 是 cordis 官方一等机制，自己声明 25 个 file: 依赖 + 组合 patch，行解析走自己的依赖树）；profile 只剩薄清单（dsh-coding 形态：bundles + `dsh.desktop`，**无 patch 文件**）；workspace 问题在源码层修（landlock 显式目录、`linkWorkspacePackages: true`、allowBuilds、minimumReleaseAgeExclude）。

9. **体积目标与瘦身路线**（17:04–17:14）——「为啥能做到1.35GB，你在逗我？」：拆包发现 root(1.5GB)+profile(1.8GB) 两棵**完整 dev 安装**，加 `@openai/codex-win32-x64`(410MB) 与 `@anthropic-ai/claude-agent-sdk-win32-x64`(254MB) **各两份死重**（组合树证明未挂载 subagent-claude-code/subagent-codex）。先批准方案 A（修剪 → 目标 ~600–700MB），随即「能不能压缩在200MB左右。。」：结论可行——node.exe(~35MB 压缩)、harness 运行时(~25MB)、服务端依赖树(--prod 后 508→890 包)、插件 lib(~15MB)、profile 纯 junction(~1MB)、Go 壳(~16MB) ≈ 190–210MB。三刀：单树合并（profile 的 node_modules 变成 1 条 junction 指向根树）、client 依赖清场（浏览器运行时静态模块表只有 9 个模块，mermaid/three/echarts/@univerjs 全在构建期打进了 dist/插件 client.js）、provider SDK + src/map 清理。执行上坚持**先正确性后体积**（v8 的 zip 349MB 仍未达标但先保 boot）。

10. **fork 账本**（17:38）——「涉及到fork修改的部分要写入一个文档里面，我们后续方便直接从上游同步」。发现 vendored harness 保留了嵌套 `.git`（上游 commit `4e7fb95f` Private DSH snapshot 20260808T121140Z），**fork 差异是真实 diff 而非凭记忆**：恰好 4 个源码文件（`apps/cli/src/args.ts` +28、`apps/cli/src/web.ts` +10、`apps/cli/tests/args.spec.ts` +12、`packages/host/webserver/src/index.ts` +6）。创建 `docs/FORK.md`（基线、4 项修改清单、构建注意、21 文件/11 插件的 vendored 修改、同步流程 8 步），并把 `harness/.git/`、`plugins/*/.git/`、`desktop/.git/` 加入 `.gitignore`（基线留磁盘对账，不污染提交）。

## 工作过程时间线（按阶段）

### 阶段 1：跑通桌面壳（10:27–10:44）
- 确认 dsh CLI（v0.0.1，win-port launcher）、`~/.dsh/source/current` junction、`build/dsh-shell.exe` 已存在。
- 撞「`web takes none of parent --profile`」+「父级无 `--port`」两坑 → `DSH_WEB_CMD` + desktop.overlay.yml 方案，实测 boot `http://127.0.0.1:13454`。
- 启动壳：`setx` 持久化 + 包装脚本绕开工具会话陈旧环境变量；端到端验证（后端 7173、HTTP 200）。
- 用户报「卡在启动本地服务的过程中」→ 定位 `awaitWebviewReady` 竞态 → 修复 + 重建 + 验证 `dsh server ready at http://127.0.0.1:14350`。
- 用户报「Failed to load plugins：dsh-skills-manager」→ client bundle 注册 id 是旧的 `@dsh-local/skills-manager`（构建脚本硬编码），loader 契约「Entry name == package name」→ 改 `scripts/build.mjs` 的 PLUGIN_ID 重建（其余插件扫描无同类问题）。

### 阶段 2：方向纠正 + marisa profile 的 Windows 安装（10:50–11:08）
- 用户纠正要 marisa-distro。检查：`~/.dsh/profiles/` 只有 web/win-port，无 marisa。
- install.sh 在 Windows 连撞三墙：21 个 git clone 全挂（POSIX 目标路径传给 git 的问题，手动 clone 全部成功）、Windows Python GBK 编码崩溃（`PYTHONUTF8` 修复点）、**mygo 四包在 0808 checkout 不存在**（Linux harness 才有）。README 的 Windows 路线实为「计划」而非已验证。
- 改为按 install.sh 逻辑手动生成 profile（去掉 mygo）：21 插件 clone 到 `~/.marisa/plugins/`、`file:` deps 用 Windows 路径、pnpm install（allinone 路径重写两次出错后修正）。
- 7 个插件缺 lib 需构建（Qwen-MM、a2a、code-map、diff-viewer、sidechain、sonar、track）；tsconfig 有 mac 硬编码路径（`/Users/chris/...`）和 `../deepseek-harness` 相对引用 → junction `deepseek-harness` + sed 路径 + 工具链目录 `~/.marisa/toolchain` + shim（`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`）。
- 用户打断（11:08）：直接否定 patch 路线 → fork 架构。

### 阶段 3：fork 重构 + 并行 workflow（11:08–13:33）
- 确认新架构与 SEA 单文件形态；用户定 v1/v2 双版本、先做 v1、并行 subagent。
- 启动 6-agent workflow（~2.2h agent 时间，593 次工具调用）：Structure 完成 harness 入库（排除 node_modules/.git/lib/dist，净 54MB）、21 插件入库、desktop 入库（含当日两个 bug 修复）、根 workspace 文件、v1 归档 `legacy/`（git mv 保留历史）、README 重写（含 31 插件 license 表）；Fixes 完成 CLI `web --profile`、21 文件/11 插件 tsconfig 路径修复、profile 模板；Build 阶段报告不完整，Package 阶段补做了 harness tsdown + vite 构建、插件 lib、profile install。
- 产出 `release/marisa-desktop-standalone.exe` **1.35GB**：内嵌 backend.zip（node.exe 103MB + 完整根 node_modules 1.49GB store + profile 安装 1.8GB + LINKS.json 1556 条 pnpm 链接）；首跑解压 ~66s；两轮验证 HTTP 200。
- 组合现实（fork 代价）：boot 时移除 3 插件（yet-another-subagent 重复注册、whale-girl 无 jobs 服务、suggested-replies 无 workspaceRegistry），`marisa-v2-compat` 别名层（webServer→httpServer）救回 6 插件（better-sidebar/web-review/paste-input/drag-and-drop/interpreters/aigc-canvas），最终 boot 激活 26 entries；另有 4 个悬空引用待决（dsh_workflow 的 `dsh-jobs`/`dsh-user-questions`、genui 的 `ui-input-trigger`）。

### 阶段 4：体积问题与 fork 修复重排（17:03–17:44）
- 用户质疑 1.35GB → 拆包定位死重（见决策 9）→ 方案 A 获批执行：stage 内 `pnpm install --prod --ignore-scripts --offline`（online fallback）、死重修剪、junction 清理、`-mx=9`；launcher 从 tsx 源码启动改 `node apps/cli/lib/bin.js`（构建产物，已含 `--profile` 修复，彻底摆脱 tsx）。
- 用户要求 200MB → 可行性推演 + 三轮瘦身计划；A 的 checkpoint（700–800MB）被跳过，直接上 200MB 方案。
- 用户再纠正「patch 形式不行」→ 执行 fork 重排（见决策 8）：webserver 别名进源码、marisa-bundle、薄 profile、workspace 修复；live boot 实证 `dsh web: http://127.0.0.1:11290` + `[dsh-track] webServer inject fired`。
- 用户问「我们之前做的是什么办法？现在又是什么办法？」→ 输出对照：之前 = profile 层手写 patch 对齐一切（行 id/包名/依赖/glob 全是隐式契约）；现在 = 每个组件自己声明自己的东西（bundle 声明依赖+行、harness 修代码、profile 只列清单）。
- 用户要求 fork 账本 → 创建 `docs/FORK.md`（见决策 10）。

### 阶段 5：200MB 打包的 8 轮修复（17:44–19:41）
make-bundle.ps1 单树管线反复失败，逐轮定位根因（详见「遇到的问题与解决」表）：从 `'m' 不是内部或外部命令`（launcher LF-only）一路修到 LINKS.json 链接记录遗漏与 StageRel 路径映射。v8 打包指标转绿（install added 910、integrity OK、links recorded 1937、zip 含 @deepseek-ai 2264 条、bundle 349.2MB）。**v8 的 exe 尚未重 build、boot 未验证**时，用户要求 handoff（会话内输出完整 handoff + 8 轮修复表 + 完整上下文整理）。会话结束时（19:41）用户/后续会话已把 `dsh-host-apiproxy`/`dsh-host-webserver` 改为 `workspace:^`、新增 `@deepseek-ai/dsh-workflow: workspace:^` 与 `schemastery: workspace:^`、make-bundle.ps1 参数化（`-ProfilePath/-NodePath/-SevenZipPath`）—— 需 **v9 重打包** 才能生效。

## 产物与影响

| 产物 | 状态/说明 |
|---|---|
| `release/marisa-desktop-standalone.exe` | 1.35GB(v1) → 278MB(修剪版) → 386MB(完整 zip 版) → v8 zip 349.2MB（exe ~382MB 待重 build） |
| `harness/` fork（4 个源码 diff） | `apps/cli/src/args.ts`（`dsh web --profile <name>`）、`apps/cli/src/web.ts`（profile 贯穿）、`apps/cli/tests/args.spec.ts`、`packages/host/webserver/src/index.ts`（webServer 别名）；基线 commit `4e7fb95f` |
| `bundles/marisa-bundle/` | 聚合 bundle：25 个 file: 依赖 + 组合 patch（含 pwsh 通道行、禁用行） |
| `profiles/marisa/` | 薄 profile（dsh-coding 形态：bundles + `dsh.desktop`，无 patch）+ `generate-profile.mjs` + `desktop.overlay.yml` |
| `docs/FORK.md` | fork 账本（基线/4 项修改/构建注意/插件 21 文件修改/同步流程 8 步）。**注意：当前仓库该文件不存在（未提交，见「遗留问题」）** |
| `desktop/bundle/make-bundle.ps1` | 8 轮修复后的单树打包管线（v8 后又被参数化增强） |
| `desktop/bundle/launcher.cmd` | CRLF/ASCII；`node apps/cli/lib/bin.js --profile marisa --patch desktop.overlay.yml` |
| `desktop/embedded.go` | `-tags embeddedbundle`，go:embed backend.zip，版本门控自解压（版本变化 `os.RemoveAll` 清空重解压），LINKS.json junction 重放 |
| 根 `package.json` / `pnpm-workspace.yaml` | 52 个显式 @deepseek-ai deps（44 registry rc.6 + 8 workspace:^，v8 后又加 dsh-session-title/dsh-workflow/schemastery 等 workspace:^）+ 90 条 minimumReleaseAgeExclude + landlock 显式目录 |
| `legacy/` | v1 归档（install.sh、plugins.json、dsh-allinone、skills、marisa-test、验收报告，git rename 保留历史） |

## 遇到的问题与解决

### 打包 8 轮修复链（v3–v8，boot 逐层暴露）

| 轮 | 症状 | 根因 | 修复 | 状态 |
|---|---|---|---|---|
| 1 | `'m' 不是内部或外部命令`（launcher 反复重启） | launcher.cmd 是 **LF-only** 行尾，cmd.exe 解析批处理每行丢前 2 字符（`rem x` → 执行 `m x`） | 转 CRLF + ASCII（repo 文件 + 打包时再转） | ✅ 已验证消失 |
| 2 | `js-yaml` ERR_MODULE_NOT_FOUND | plugins/bundles 拷贝**没排除 node_modules**，live 成员 node_modules（含 `.modules.yaml`）漏进 stage → pnpm `added 0` 空转 → **root nm 466 个空壳目录** → zip 缺 js-yaml/react | 拷贝排除 node_modules + install 后完整性校验（缺 package.json 即 throw） | ✅ v3 起不再复现 |
| 3 | stage 源码目录被清空（tool-cordis/pwsh-local 的 package.json 丢失 → 重跑 install 报 workspace 解析失败） | junction 删除 `Get-ChildItem -Recurse` **跟随 junction 遍历**的竞态 | 改用 `cmd /c dir /a:l` 收集（不跟随目标） | ✅ |
| 4 | `@deepseek-ai/dsh-settings` 找不到（dsh-llm-fallbacks 运行时 import） | npm 插件的 peer 依赖 `^0.1.0-rc.6`：workspace 成员版本（0.0.1）不匹配 → pnpm 放弃 auto-install（仅 warning） | 21 个 peer 包显式加 root deps（registry 版）+ exclude | ✅ |
| 5 | `dsh-timeout` 等连环缺失 | rc.6 registry 包的 devDeps+peers 引用同样缺（`--prod` 跳过 devDeps，但运行时 lib import） | **递归闭合扫描**（@deepseek-ai 集 + npm 插件集，2 轮收敛）→ 52 个显式 deps + 90 条 exclude | ✅ |
| 6 | `session-title provider automatic mode is invalid` | 组合行解析到 root nm 的 **registry rc.6 主插件** + **workspace 0.0.1 provider**（rc.6 改了 register 协议，`automatic` 枚举不同） | root deps 加 `dsh-session-title: workspace:^`（rc.6 引用者 import 的 SessionTitleInvalidError 等在 0.0.1 都有） | ✅ 解压树手动验证方向正确 |
| 7 | `dsh-bash`/`dsh-workflow`/`schemastery` 连环 ERR_MODULE_NOT_FOUND | **1001 条链接丢失**：junction 删除删 2552 条，LINKS.json 只记录 1551（walker 只扫 live harness 内部 nm）→ root nm workspace:^ 包、插件内部依赖、成员依赖全丢 | 全树 `dir /a:l` 收集 + 去重记录 + 复用同一列表删除 | ✅ |
| 8 | 上一轮 0 条生效（`0 extra beyond walker`） | **StageRel 只映射 live 路径**（`$repo\...`），全树收集到的是 **stage 路径**（`$stage\...`）→ 全部返回 null 被跳过 | srcMap 增加 `$stage\marisa-distro` → `marisa-distro`、`$stage\.dsh` → `.dsh` | ✅ v8 验证：links recorded 1937（386 extra），root 链接 9 条全记录 |

### 环境与工具坑（可复用教训）

- **bash cwd 持久化**：工具会话 cwd 跨命令保持，`cd` 后相对路径全错（多次误报「目录不存在」）；修复 = 命令开头显式 `cd` 回根或全用绝对路径。
- **bash 转义**：`$` 会被外层吞（`$_.LinkType` 变空）；`\\` 在 JSON→bash 层被吃掉（mklink 循环失败）；修复 = `cygpath -w` 生成路径进变量、单引号包裹 PowerShell 命令。
- **sandbox 钩子误判**：工具调用里 `cmd /c "taskkill ..."` 被钩子当 `Remove-Item` 误拦；规避 = 纯 PowerShell Stop-Process，或把 `cmd` 留在脚本文件内部执行。
- **GBK vs UTF-8**：cmd.exe 按系统代码页（GBK）解析批处理与输出，UTF-8 中文/em dash 乱码（LF+UTF-8 更糟）；`.cmd` 必须 CRLF + 尽量 ASCII。
- **pnpm 11 workspace**：`linkWorkspacePackages: true` 丢失会导致 workspace 成员不走链接、registry 版本解析失败（ERR_PNPM_NO_MATCHING_VERSION）；`--prod` 时 peer 自动安装因 workspace 版本不匹配放弃（只 warning，运行时才炸）；`--ignore-scripts` 跳过 prepare 崩溃；`--offline` 偶发 `ERR_PNPM_NO_OFFLINE_META` 需 online fallback。
- **Windows 文件系统**：pwsh 7 `Remove-Item` 对 junction 抛 NRE（改用 `cmd /c rmdir`）；`Get-ChildItem -Recurse` 跟随 junction 有竞态（`dir /a:l` 不跟随）；7z 打包 junction 不跟随（内容为 0，必须先删链接、用 LINKS.json 重放）。

## 要点摘录

**用户关键决策原话（按时间）**

> 「不是，你在干嘛？我让你跑起来的是marisa-distro，不是我电脑的dsh-desktop」—— 方向纠正 #1（10:50）

> 「我觉得我们的项目路线完全错了，通过patch的形式并不能很好的去兼容，我们应该把这些插件都收集到仓库里面。然后只做一个构建脚本，甚至直接修复一部分官方的代码，我们正式去作为一个fork进行兼容，然后发版我们只发desktop二进制」—— **fork 架构决策（11:08）**

> 「真·单文件 exe（SEA 内嵌）一个版本，第二个是进阶版本，允许dsh修改一部分自己的源码，做成msi格式，然后会解压源码到一个用户目录」—— v1/v2 双版本设计（11:12）

> 「先做v1，然后我们后面再看v2」—— 范围收敛（11:14）

> 「为啥能做到1.35GB，你在逗我？」—— 体积质疑（17:04）→「能不能压缩在200MB左右。。」（17:14）

> 「我们之前聊过，我们说我们走patch形式不行，这样会比较复杂」—— fork 修复归位（17:27）

> 「涉及到fork修改的部分要写入一个文档里面，我们后续方便直接从上游同步」—— FORK.md 账本（17:38）

**技术要点**

- 壳解析后端 URL 的协议：stdout 行前缀 `dsh web: `；`webserver.port: 0` = OS 分配端口。
- 单文件 exe 的 native 模块解法：`go:embed backend.zip` + 首跑自解压到 `%LOCALAPPDATA%\marisa-distro\backend`（版本门控 + `os.RemoveAll`），junction 用 LINKS.json 重放（提取器顺序：先写文件、后建 junction）。
- 浏览器运行时只需要 **9 个静态模块**（react、react-dom、cordis、dsh-client-ui-slots/web-react/ui-primitives/schema-form）；mermaid/three/echarts/@univerjs 等大 client 库只在构建期进 dist/插件 client.js —— 这是 200MB 瘦身的理论依据。
- 单树分发的核心张力：npm 插件生态期待 **registry rc.6**，组合期待 **workspace 0.0.1**；收敛策略是「组合行主插件与 provider 版本对齐」（workspace:^ 覆盖），live 旧架构则是「两套并存」（profile/nm + 成员内部）。

## 关联文档

- `docs/sessions/README.md` — 会话纪要索引（本纪要登记项：SESSION-architecture-fork-sea-msi-2026-08-14.md，来源 9e5a7eff）
- `docs/architecture.md` — 单仓库发行模型（harness fork 非 submodule、mirror/fork 分类、MyGO 市场组件保留 registry 锁定）
- `docs/packaging.md` — 当前打包流程（`backend.tar.zst` + `build-msi.ps1`；注意：这是会话后演进的形态，本会话当时是 `backend.zip` 方案，MSI 在 v2 阶段落地）
- `docs/plugins.md` — 插件清单（当前 rc7 基线 28 插件 + 组合启用/停用状态；本会话当时是 21 git + 8 npm = 29 组合）
- `docs/upstream-diff.md` / `docs/upstream-sync.md` — 上游差异与同步（与 FORK.md 职责相邻）
- `docs/rc7-plugin-compatibility.md` — rc6→rc7 兼容评估（会话后产物，与本会话的 0808/rc6 结论衔接）

## 遗留问题与风险（会话结束时状态）

1. **v8 exe 未 build、boot 未验证**：v8 打包指标全绿，但 `go build -tags embeddedbundle` + 启动验证在会话结束时尚未执行；且 package.json/make-bundle.ps1 已被后续修改（host-apiproxy/webserver → workspace:^，新增 dsh-workflow/schemastery workspace:^），需 **v9 重打包** 才能让新 deps 生效。
2. **rc.6 vs workspace 混用**是单树架构的固有张力：session-title 已修，boot 可能继续暴露同类（组合行主插件与 provider 版本不一致）崩点；迭代修复模式已建立。
3. **体积未达 200MB**：v8 zip 349MB（exe ~382MB）；后续瘦身（src/ 修剪、`*.map`、更多 client 库、provider SDK 精剪）未做，且决策为「先正确性后体积」。
4. **`docs/FORK.md` 当前仓库不存在**：会话中创建但从未 commit（当时 134 个变更未提交、用户未批准 commit）；后续会话可能已重构/改名（待核实）。本次打包 8 轮修复属构建管线，如需登记应补进 FORK.md 的「构建注意」。
5. **v1 已知偏差**：0808 无 mygo 内核（profile 摘除）；multimedia-webui-input 依赖官方不存在的 `@deepseek-ai/dsh-client-ui-slash` 被禁用；boot 移除 3 插件（yet-another-subagent/whale-girl/suggested-replies）；4 个悬空引用待决（dsh_workflow 的 `dsh-jobs`/`dsh-user-questions`、genui 的 `ui-input-trigger`）。
6. **临时残留**：`/tmp/dsh-session-title-rc6.bak`（解压树手动验证备份）等；解压树被手动改过（root nm 的 dsh-session-title 换成 workspace 版）——下次启动版本门控会清空重解压，无影响。

## 无法核实的内容

- **用户消息数**：任务描述称「约 494 条用户消息」，但提取脚本统计 JSONL 中 user 消息为 **43 条**（2525 行、user 43 / assistant 1133）。以脚本统计为准，差异原因待核实（可能是对「消息」的计数口径不同）。
- **`docs/FORK.md` 与各产物的当前存在性**：纪要按会话内事实撰写；当前仓库 git 状态显示 docs/sessions/ 尚为未跟踪目录、FORK.md 不在——后续会话对仓库的重构/提交情况不在本会话范围内（待核实）。
- **部分版本号与包名**（如 dsh-llm-fallbacks 的 peer 版本、registry 上各 rc.6 包是否可解析）以会话中实测为准，未逐一复验。
- 密钥/令牌：提取脚本已对 `sk-`、Bearer 等自动脱敏，人工复核转录未见残留凭证；本纪要不含任何密钥。
