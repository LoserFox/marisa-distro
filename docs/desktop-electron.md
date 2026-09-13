# desktop-electron：Electron 壳迁移文档

> 2026-08-31，基于 `anywhere-labs/dsh-plugin-desktop`（Electron 43）架构思路，
> 将 `desktop/`（Wails v3 beta.10 Go 壳）的运行时逻辑完整移植为 Electron 壳。
> 分支：`desktop-electron`，基线 `omdsh/main` @ 4aa96256。

## 为什么换壳

2026-08-27 对比报告（`references/desktop-architecture-wails-vs-electron.md`）结论：
Wails 路线 60% 精力花在重新造 Electron 免费提供的东西（junction/tar/原子升级/rescue），
且壳在 harness 之外，无法像 anywhere 那样以 Cordis 插件身份参与插件生命周期。

## 已移植（stage 1：纯壳替换）

| Wails (Go) | Electron (TS) | 说明 |
|---|---|---|
| command.go | command.ts | 命令行解析 + DSH_WEB_CMD 覆盖 |
| paths.go + logging.go 目录 | paths.ts | 目录布局 1:1（%LOCALAPPDATA%\marisa-distro） |
| logging.go | logging.ts | 启动日志/轮转/硬链接入口/retention/后端 tee |
| server_unix.go + server_windows.go | process-tree.ts + launcher.ts | tree-kill（taskkill /T 阶梯 / POSIX 进程组） |
| scanBackendStdout | backend-stdout.ts | ready-line 扫描 + URL 发布 |
| exitFailureClass | backend-stdout.ts | 失败计数判定（stableRunTime） |
| rescue_state.go | rescue-state.ts | 3 阶段状态机持久化 |
| supervise() | supervisor.ts | 3 阶段状态机（normal→minimal→rescue） |
| extract_tar.go + embedded.go | extract.ts | tar.zst 解包 + staging 原子发布 + LINKS.json 重放 |
| rescue_server.go + rescue.go + rescue_bundles.go | rescue-server.ts | 急救控制端点（API 形状 1:1） |
| toast_bridge.go | ❌ 未移植 | Electron 原生 Notification 可直接替代，stage 2 |
| update_guard.go + update_migrate.go | ❌ 未移植 | mergeDshData 逻辑复杂，stage 2 移植 |
| installed.go（MSI） | ❌ 未移植 | electron-builder NSIS 替代，需重写 prepare 逻辑 |
| 页面健康监控 | ❌ 不移植 | 上游已因 90s 误触发移除（b6db5b36），等重做 |

## 未移植（stage 2 待做）

- **install-WAL 事务**：急救页的 bundle 禁用/启用在 Go 版有 WAL 保护，Electron 版
  目前只做 package.json 快照备份，无回滚链
- **mergeDshData**：升级自动迁移用户数据（update_migrate.go 208 行），规则复杂
  （profile package.json 合并、file: 路径校验、junction 跳过），需单独移植
- **MSI 安装链**：installedbundle 形态的 --prepare-installed-backend /
  --remove-installed-backend，需改用 NSIS 自定义 action
- **toast bridge**：Electron 原生 Notification API 可直接替代 Wails 通知服务，
  但需写回环 HTTP 端点接收后端插件的 MARISA_TOAST_PORT 转发
- **桌面通知权限注入**：Wails 版用 JS 注入 requestPermission，Electron 用
  `Notification.requestPermission()` 原生 API 即可

## 恢复模式（2026-08-31 二期：anywhere dsh-plugin-desktop 移植）

按 anywhere-labs/dsh-plugin-desktop @ e71a9ef（v2.0.4，2026-08-30）移植其
startup recovery 架构，替换/补充原 rescue 流程：

1. **失败分级路由**（startup-failure-routing.ts）：app 未就绪 → stderr-only
   退出；就绪 → 恢复窗。不看错误文本，只看就绪状态（决策表可单测）。
2. **启动阶段跟踪**：electron-ready → backend-extract → backend-boot →
   backend-ready，失败时带阶段进恢复窗。
3. **崩溃证据**（crash-evidence.ts）：desktop-run.json run 标记（原子写 +
   ownerId 防抢占），非正常退出残留标记 → 下次启动记录日志。
4. **恢复窗**（recovery-window.ts + res/recovery.html）：专用 sandbox 窗
   （零 IPC/零网络、独立 partition、deny window-open/webview），状态经
   base64url query 传入，动作经 `marisa-recovery://` scheme 导航拦截。
   Tab：插件（禁用/启用）/ 备份·重解包 / 诊断（日志尾部）。
5. **两阶段操作**（recovery-controller.ts）：preview（不透明
   `prev_<43位>` ID + 5min TTL + 单次使用）→ 原生确认框 → execute 主进程
   再校验。bundle 名过 `^[a-z0-9...]$` 防路径注入。
6. **重启语义**：恢复动作完成后「重启应用」= `app.relaunch()` 整体重启，
   不做 in-place 恢复。
7. 托盘新增「恢复模式…」主动入口。

保留：原 Go 壳 rescue.html 流程作为后端侧 fallback（supervisor 的
enterRescue 钩子不变），两层互补：rescue = 后端无法启动时的壳内页面；
recovery window = 主进程级恢复 + 插件管理。rescue-server.ts 计划下版删除。

## 三期移植（2026-08-31）：通知系统 / 亚克力玻璃 / 引导向导

继续按 anywhere dsh-plugin-desktop @ e71a9ef 源码移植：

1. **窗口材质**（window-material.ts）：NT 22621+ 门控 + fail-closed
   （mica/acrylic 在老 build 自动回退 off）；acrylic 上游已移除（原生窗口
   行为问题），marisa 恢复为显式实验选项并在向导页标注风险；macOS 走
   vibrancy sidebar，Windows 走 titleBarOverlay + backgroundMaterial，
   Linux 恒 off。透明材质时主窗注入 36px 拖拽条 + body 透明化 CSS。
2. **设置持久化**（desktop-settings.ts）：desktop-settings.json 于
   %LOCALAPPDATA%\marisa-distro\（backend 树外，重解包不丢）；per-field
   默认值 + 损坏 fail-closed。
3. **通知系统**（notifications.ts）：壳侧 = 复用 Wails 壳已定的
   MARISA_TOAST_PORT loopback 协议接后端 dsh-web-ui-notify 的通知意图 +
   anywhere 的 Electron Notification click-to-focus 模式；四开关决策表
   （回合/任务 × 完成/失败）在壳侧再过滤一次。anywhere 的 Cordis 侧决策
   插件（session/event turn 跟踪 + jobs.onJobDone）依赖 harness 进程内缝线
   （packages/core/session rc.2 均有对应事件），未来做进程内插件时可直接
   按 notifications.ts 决策表实现。
4. **引导向导**（setup-wizard-*）：一次性首启向导（settings.setupComplete
   门控），sandbox 渲染、零 IPC、base64url state 进、`marisa-setup://`
   严格 action 解析出（exact-keys + 枚举 + 8KB 上限，anywhere 同款 closed-
 world schema）；close ≠ skip（quit 直接退出应用）；Windows ready-to-show
   竞态按上游注释处理（win32 直接可见创建）。页面提供平台裁剪的材料选项
   （22621 以下禁用并提示）+ 通知五开关（总开关联动）。

### 打包体积实测（Linux x64，2026-08-31）

**壳（Electron）**：

| 产物 | 体积 |
| --- | --- |
| linux-unpacked 目录 | 270 MB（Electron 本体 213 MB + Chromium 资源 38 MB + 动态库 16 MB + locales 1.6 MB + app.asar 0.2 MB） |
| deb 安装包（xz maximum，locales 裁剪至 en/zh-CN/zh-TW） | **88 MB**（未裁剪时 96 MB） |
| 对照：Wails/WebView2 Go 壳（windows/amd64, installedbundle tag） | 20 MB（单文件，WebView2 系统组件复用） |

**后端 payload（backend.tar.zst，两壳共用同一份，Linux 无法运行
make-bundle.ps1，以下为按脚本 stage 语义复算）**：

make-bundle.ps1 的真实 stage 语义（2026-08-18 后端体积审查已做过一轮）：
`assets/source`/`wechat-submission`/docs/promo 全部 prune，dsh-stickers
runtime PNG 经 convert-stickers-webp.mjs 转 WebP（~4:1）后才进包，
agent-SDK 原生二进制/client-only 浏览器库/平台不符二进制全部裁掉，
.ignored_* 开发工具链与成员内重复依赖删除。

| 构成 | stage 体积 |
| --- | --- |
| harness 源码树（b150a551 = 0.1.1-rc.2，lib/dist 产物随树） | 48.7 MB |
| plugins 28 个（source/wechat/docs prune 后 + stickers WebP 转换） | 86.1 MB（原树 157.8 MB） |
| dsh-mygo（vendored） | 4.0 MB |
| mnemon.exe | 14 MB |
| node.exe | **0 —— 复用 Electron**（见下） |
| **stage 合计** | **~153 MB** → tar.zst 估 **52-61 MB** |

**node.exe 复用 Electron（anywhere 架构核心之一，已落地 a359becb）**：
desktop-electron/src/electron-node.ts 移植 anywhere
desktop-runtime-environment.ts 的 RunAsNode 半区：clear-env.mjs 预载
（防孙进程继承 RunAsNode）、node/pnpm shim（cmd/sh 双形态）、PATH 幂等
前插。main.ts 在 materializeBackend 后安装，quit dispose。launcher.cmd
双模：node.exe 在则照旧，缺省 fallback 到 `..\..\marisa-dsh.exe
--import clear-env.mjs`。make-bundle.ps1 `-RuntimeMode electron` 不拷
node.exe。Linux 真机双向验证 clear-env 语义（带 preload 孙进程 env 已
清/不带则继承），Electron 43.5 内嵌 Node 24.19.0 满足 engines 门。

**完整发行版总体积（Windows 安装包）**：
- Electron 壳路线：88 MB（壳，内含 Node 运行时）+ ~55 MB（backend.tar.zst）≈ **NSIS 安装包 ~140-150 MB**
- Wails 壳路线：20 MB 壳必须自带 node.exe（WebView2 路线没有 Electron 可复用）≈ 20 + 80-90 MB（payload 含 node.exe）≈ **~120-130 MB**
- 即：Electron 壳贵 68 MB 的 Chromium，但省掉独立 node.exe ~25 MB（压缩后），净差缩到 ~30-40 MB；后端 payload 大头是 28 插件的 runtime 资产与 harness 产物，与壳选型无关。
- 注意：backend.tar.zst 真实数字只能在 Windows 主机跑 make-bundle.ps1 得出（脚本内含 pnpm install + junction + prune），上表为 Linux 侧按脚本语义复算。

### 关于"直接用 dsh-plugin-desktop 插件"的查证结论

- npm 只有 0.0.1（纯占位）与 2.0.0（pin 0.1.0-rc.6 线 96 包）；repo HEAD
  2.0.4 已 pin 0.1.2-alpha.1。历史上 pin 0.1.1-rc.2（fe81811, 2026-08-25,
  在 v2.0.3/v2.0.4 tag 内）——与魔理沙 harness pin 同线，npm 未发布该版本。
- npm 2.0.0 的 96 个 @deepseek-ai/dsh-* 依赖中 94 个可在 rc.2 线解析，
  缺 2 个：dsh-client-schema-form（rc7 并入别处）、dsh-client-web-react
  （rc8 并入 dsh-client-web）——但缺的就是 client inject 链成员，装上即
  ClientPackageCompositionError。
- 它是整个桌面（95 源文件，接管 profile/市场/更新），非独立急救插件；
  急救/通知/材质/向导都缝在它的 main 进程里，拆不出来。
- 结论：源码按模块抄（现状方案），版本对齐等 anywhere 恢复 rc 线 pin 或
  魔理沙升级 alpha 线后再评估整包接入。

## 关键设计差异

| 维度 | Wails 壳 | Electron 壳 |
|---|---|---|
| 渲染 | WebView2（系统组件） | Chromium（自带） |
| 后端 | 同一套 tar.zst + launcher.cmd | 同一套，零修改 |
| 进程清理 | taskkill /T 阶梯 + 进程组 | 同（process-tree.ts 移植） |
| 孤儿防护 | 无（main 收口） | reaper 子进程（ELECTRON_RUN_AS_NODE） |
| 沙箱 | 无显式沙箱 | sandbox + contextIsolation + 无 preload |
| 急救页 | 同一份 rescue.html | 同一份 rescue.html（res/ 目录） |
| 日志路径 | %LOCALAPPDATA%\marisa-distro\logs | 同（paths.ts 1:1） |
| rescue-state.json | 同 | 同（rescue-state.ts 1:1） |

## 构建与验收（2026-09-13，Windows 真机）

### 可复现构建入口

```
pwsh desktop-electron/scripts/make-installer.ps1            # 四段：profile → payload → shell → package
pwsh desktop-electron/scripts/make-installer.ps1 -SkipProfile -SkipPayload   # 只重打包壳
```

四段各自可跳过，每段自查：

| 段 | 动作 | 自查 |
| --- | --- | --- |
| 0 profile | `profiles/marisa/generate-profile.mjs` → `profiles/marisa/runtime` | 断言 `package.json` 生成 |
| 1 payload | `desktop/bundle/make-bundle.ps1 -RuntimeMode electron -OutPath desktop-electron/bundle/` | 断言载荷**不含** `node.exe` |
| 2 shell | `vitest run` + `tsc -p tsconfig.build.json` | 测试与类型全绿 |
| 3 package | `electron-builder --win` | — |
| 4 verify | `scripts/verify-packaged-deps.mjs` | 断言 asar 内 `lib/*.js` 的裸导入都能在 asar 的 `node_modules` 里解析到 |

第 0 段对齐 `scripts/build-release-windows.ps1`：载荷必须从仓库内 runtime profile
出，不能用维护者的 `~/.dsh/profiles/marisa`，否则会把个人已装插件泄漏进发行包。

验收辅助：`scripts/capture-window.ps1`（按标题截顶层窗口为 PNG；AGENTS.md 要求
真实窗口渲染证据，而不是后端 HTTP 200）。

### 实测结果（Windows x64，Electron 43.5 / Node 24.19）

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | ✅ 零错误 |
| `npx vitest run` | ✅ **71/71** 全绿（8 个测试文件） |
| 载荷 | ✅ 98.5 MB / 40062 条目（95 个 harness 包 `lib` 产物 + 2779 条 workspace 链接），确认不含 `node.exe` |
| 安装包 | ✅ NSIS 190.2 MB、portable 189.9 MB |
| asar 内容 | ✅ 含 `\bundle\backend.tar.zst` 与 `node_modules\tar-stream` |
| 安装形态判定 | ✅ 真机日志 `electron shell starting (embedded=true)` |
| **NSIS 安装** | ✅ 退出码 0；装到指定目录；开始菜单快捷方式生成 |
| **NSIS 卸载** | ✅ 退出码 0；安装目录与开始菜单条目**无残留** |
| 内嵌载荷解包 | ✅ 40061 条目解出、2779 条链接重放、`VERSION` 最后落盘（可重复：第二次启动 `backend up to date` 后链接重放不再失败） |
| Electron-as-Node | ✅ 真机确认后端以 `Node.js v24.19.0`（Electron 内嵌 Node）执行到插件树加载器 |
| **窗口渲染 + 后端就绪** | ❌ **未达成**：后端插件树加载失败，三级状态机按设计降级到急救页（详见下） |

### ✅ 完整验收达成（2026-09-13，根因修复后）

补齐最后两个缺陷后，Electron 路线在 Windows 真机上**完整跑通**：

```
dsh web: http://127.0.0.1:4965
dsh server ready at http://127.0.0.1:4965/
[whale-balance] NO_KEY 未配置 DEEPSEEK_API_KEY     <- 插件已加载
```

CDP 证实窗口落在**后端 URL**（`title='DSH Local Build' url=http://127.0.0.1:4965/`），
不是急救页；后端 HTTP 200（19017 字节）；退出后无任何孤儿进程
（Marisa DSH / node / reaper 均为 0）；卸载后安装目录已清除。
窗口截图存证：`scripts/capture-window.ps1` 抓到 1919x1202 的窗口 PNG。

补齐的两个缺陷（本轮）：

8. **裸包名 entry 在仓库根解析不到** → `make-bundle.ps1` 在 staged `pnpm install`
   之后、记录 LINKS.json 之前，把 bundle patch 里用到的裸 entry 包名在 staged 根
   `node_modules` 下补链接（幂等；本次扫到 160 条裸 specifier、补 4 条链接，
   载荷链接数 2779 → 2783）。**效果：`plugin tree failed to load` 的失败条目从
   34 个降到 5 个。**
9. **`--expose-internals` 缺失**（`launcher.cmd`）→ `apps/cli` 在插件树 settle 后
   会装 HMR 服务，`vendor/hmr` 没有该标志就抛
   `--expose-internals is required for HMR service`；harness 里没有任何地方设置它，
   必须由持有 Node 调用的 launcher 传入。**效果：极简模式首次出现后端就绪行
   `dsh web: http://127.0.0.1:3232`。**
10. 另需补该 worktree 未构建的产物：`dsh-mygo/packages/**`（8 个）与
   `plugins/dsh-sidechain`。它们的缺失让错误停在 `lib/index.js` 而非包名上。

### 曾经的阻塞记录（保留，供追溯）

<details>
<summary>2026-09-13 早期：插件树加载失败（已解决，上方为修复记录）</summary>

真机上后端进程确实起来了（Electron-as-Node 生效），但在 profile 启动期报
`dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)`。
逐条 `ERR_MODULE_NOT_FOUND` 指向两类包：

1. `@r05en1cu/dsh-mygo*`（4 个）与 `@dsh-external/dsh-sidechain` —— 该 worktree 里
   **产物未构建**（`dsh-mygo/packages/**/lib/index.js` 缺失、`plugins/dsh-sidechain/lib` 缺失）。
2. `@deepseek-ai/dsh-file-reference-local`、`dsh-client-ui-renderer`、
   `dsh-client-ui-brand-official`、`dsh-client-ui-reference` —— 包**存在且 `lib/index.js`
   已构建**，但只在 `harness/packages/bundle/web-app/node_modules/` 下有链接，
   加载器从 `harness/vendor/loader/` 向上解析够不到；该位置在**用户现网安装里同样
   不存在**（逐级核验过 `vendor/loader/lib/node_modules` → `harness/node_modules` →
   `node_modules` 五级，两种安装全为 false）。
   载荷里这四个包**一条都没有**：它们是 junction，被 make-bundle 删除后靠
   `LINKS.json` 重放，而 live worktree 从未创建过这些链接，清单里自然也没有。

### 关键上下文：现网安装本身也是坏的

排查上述失败时对照了用户现网可用的安装，结论推翻了"Wails 路线是好的"这一前提：

- 真实可用形态是 **MSI 安装形态**，后端在 `%LOCALAPPDATA%\Marisa DSH\backend\`，
  **不是** `%LOCALAPPDATA%\marisa-distro\backend\`（后者是另一棵更旧的树，本轮早期
  误把它当基线，浪费了一轮对比）。
- 直接运行该 MSI 的 `launcher.cmd`，今天仍然失败：
  `dsh: profile "marisa" does not exist`，因为
  `backend\.dsh\profiles\marisa\package.json` **不存在**。
  `%LOCALAPPDATA%\marisa-distro\logs` 下 **8 份**日志都有同样的两行，
  而**没有任何一份日志出现过后端就绪行 `dsh web:`**。
  这正是 `update_migrate.go` 注释里记录的 2026-08-25 事故形态：
  「手动恢复还会带回损坏的 profile 文件（0 字节 package.json 使 marisa profile
  无法启动，桌面壳降级到无插件的最小模式）」。
- 对照之下，**Electron 内嵌形态反而更健康**：它每个版本从载荷重建 `.dsh`，
  `profiles/marisa/package.json` 是齐的（`release/_stage/.dsh/profiles/marisa/package.json`
  存在）。也就是说，本轮的 Electron 构建是这台机器上**第一个把 marisa profile
  推进到插件树加载阶段**的配置——Wails/现网连这一步都到不了。

因此本项未达成的原因**不在 Electron 壳**：打包安装形态下 marisa profile 能否
启动，是两条壳共用的、且早于本轮存在的问题。

### 已定位根因：裸包名 entry 在仓库根解析不到（2026-09-13，已实证）

继续排查后根因已确认，且**在 live dev 树上用一份全新生成的 profile 复现了完全
相同的报错**——所以它既不是 Electron 问题，也不是打包问题，而是**仓库级缺陷**：

1. `harness/packages/bundle/*/cordis.patch.yml` 用**裸包名**声明 loader entry，
   例如 `name: '@deepseek-ai/dsh-file-reference-local'`。
2. `apps/cli` 的 `runProfile` 调用
   `boot(NAME, rootConfig, patches, prepare)` —— **只传 4 个参数，
   `bareModuleBaseUrl`（第 5 个）没有传**（`apps/cli/lib/profile-boot-*.js:247`）。
   于是 `mountRootInclude` 走的是普通 `Include`
   （`packages/boot/app-boot/src/index.ts:492-504`）：只有传了 `bareModuleBaseUrl`
   才会装上 `HostResolvedRootInclude`，把裸包名按"安装宿主基准"解析。
3. 普通 `Include` 对裸导入执行 `import(name)`，按 Node 语义从
   `harness/vendor/loader/lib/index.js` **自身位置向上找 `node_modules`**
   （`vendor/loader/lib/index.js:260-273`）。
4. 这些包只存在于**声明它们的 bundle 自己的 `node_modules`**
   （如 `harness/packages/bundle/web-app/node_modules/…`），而 pnpm 的隔离布局
   只在仓库根 `node_modules` 放**根依赖**的链接。上游的 npm 分发包是扁平
   hoist 布局（所有包都在根），所以这条回退路径在他们那里成立；marisa 的
   pnpm 布局不满足这个隐含前提。

**实证**：三个 worktree（`marisa-distro` / `marisa-release-wt` / `marisa-electron-wt`）
的根 `node_modules/@deepseek-ai` 均为 235 项，**都缺这 4 个包**；在 root 补上这 4 条
junction 后重跑，`@deepseek-ai/*` 这一整类 `ERR_MODULE_NOT_FOUND` **全部消失**，
只剩我合成测试环境未跑 profile `pnpm install` 造成的插件类报错（它们相对
profile 目录解析，属测试环境不完整，非缺陷）。

这也解释了为什么现网安装从来没起来过：`%LOCALAPPDATA%\marisa-distro\logs` 下
**8 份**日志都停在同一条链路上，且没有任何一份出现过后端就绪行 `dsh web:`。

**修复方向**（两条，推荐第一条）：

- **发行版侧**：`make-bundle.ps1` 在 staged `pnpm install` 之后、记录 LINKS.json
  之前，把每个 bundle patch 里用到的裸 entry 包名在 staged 根 `node_modules`
  下补上链接（幂等）。这是对上游"npm 扁平 hoist"隐含前提的发行版适配，
  改动留在本仓库内。
- **上游侧**：`apps/cli` 的 `runProfile` 传第 5 个参数 `bareModuleBaseUrl`
  （app-boot 已为此准备好 `HostResolvedRootInclude`）。属 harness 改动，
  按 AGENTS.md 只能走 `overlays/harness/` 或反馈上游；且该文件是带 hash 的
  构建产物，overlay 锚点脆弱。

</details>

### 附带发现：本机存在两份损坏的 profile 清单

- `%LOCALAPPDATA%\Marisa DSH\backend\.dsh\profiles\marisa\package.json` —— **缺失**
- `%USERPROFILE%\.dsh\profiles\marisa\package.json` —— **0 字节**

两者都会让 profile 启动失败（前者报 `profile "marisa" does not exist`，后者报
`SyntaxError: Unexpected end of JSON input`）。这正是 `update_migrate.go` 注释里
记录的 2026-08-25 事故形态。本轮已用一份全新生成的 profile 绕开它们做实验，
未改动这两份文件。

结论：这属于**发行流水线的准备度问题**，不是 Electron 壳的代码缺陷。正确的下一步不是继续
手工拼载荷，而是让 Electron 路线走完整的发行流水线：

```
pwsh scripts/build-release-windows.ps1   # 或抽出其 step 2–4，改成同时产 electron 路线
```

该脚本目前只产 Wails MSI（`desktop/scripts/build-msi.ps1`），**没有任何 Electron 分支**，
`release.yml` 同样零 electron 引用 —— 这是 Electron 路线尚未「完整」的最后一块。

### 本轮修复的七个缺陷（commit `aee5a3ea` / `53fb6dc5` / `bf2922d8`）

按发现顺序，每条都单独能让应用"装得上但起不来"，且都能逃过 tsc/vitest/`--dir`：

1. 载荷没进安装包；且 `isEmbedded` 判定对内嵌形态恒为假 → `materializeBackend()` 永不执行（新增 `src/install-form.ts`）
2. `electron-builder.yml` 的 `files` 缺 `bundle/**`
3. `tar-stream` 被放在 `devDependencies` → 产物零 `node_modules`，启动即 `ERR_MODULE_NOT_FOUND`（新增 `scripts/verify-packaged-deps.mjs` 门禁）
4. 壳与 `launcher.cmd` 从未接线（shim 装在 `appLogDir()/runtime/private`，launcher 找 `<backend>\private` 与 `marisa-dsh.exe`）
5. `launcher.cmd` 从不设置 `ELECTRON_RUN_AS_NODE=1` → 壳以 GUI 实例启动、撞单实例锁、~80ms 退出
6. `recreateLinks` 用 `existsSync` 判断链接存在性（会跟随链接）→ 悬空 junction 被当成缺失，重放失败；Go 壳用 `os.Lstat`（`embedded.go:263`）
7. `make-bundle.ps1` 缓存键不含 `RuntimeMode` → 两种模式载荷互相污染；`-OutPath` 参数路径按进程 cwd 而非仓库根解析

### 用户数据保护（本轮已加安全网，合并逻辑仍缺）

`ensureBackend` 在版本变化时执行 `rmSync(dest, { recursive: true, force: true })`
整树替换。Wails 壳在这条路径上有两层保护——`update_migrate.go:mergeDshData`
（把旧 `.dsh` 用户数据合并进新树）与备份区，其文件头记录着 **2026-08-25 v0.1.10
数据丢失事故**；Electron 移植两层都没有，即**每次版本升级都会直接抹掉
`%LOCALAPPDATA%\marisa-distro\backend\.dsh` 里的凭据、会话、设置**。

本轮补上**第一步：备份安全网**（与 Go 壳自身演进顺序一致——它也是先有
「备份 → 整树替换」，再补 `mergeDshData`）：

- `ensureBackend` 新增 `backupRoot`；在 `rmSync(dest)` **之前**把 `dest/.dsh`
  快照到 `<backupRoot>/dsh-<ISO 时间戳>`，`main.ts` 传 `backupsRootDir()`
  （即 `%LOCALAPPDATA%\marisa-distro\backups`，与 Wails 壳同址）。
- **失败安全**：备份抛错时 `rmSync(dest)` 还没执行，旧 backend 原样保留、
  下次启动重试——对齐 Go 的「失败安全：任一步失败返回错误，调用方保留旧
  backend（不删、不切换）」。5 例单测覆盖：无 `.dsh` 时不动、快照内容正确、
  拒绝覆盖同名快照、版本变化时先备份、备份失败时旧树与 `VERSION` 均未被碰。
- junction 以链接形式复制（`dereference: false`），不会顺着链接走进 pnpm store。

**仍然缺**：把快照合并回新树的 `mergeDshData` 语义（规则复杂：junction 跳过、
`profiles/web` 不迁移、`profiles/marisa` 的 `package.json` 以新 bundle 列表为准
但保留用户 `file:` 依赖、bundle 自带 yml 总是用新的、其余一律以旧为准）。
在此之前，升级后用户**需要从 `backups/dsh-*` 手工恢复**——这正是 2026-08-25
事故的形态，只是这次数据至少还在。此项应在 Electron 路线进入发行流水线前完成。

### 环境备注（与本分支无关，但会影响本机构建）

本机 PATH 上的 `pnpm` 是 DSH Desktop 包装器，它把 Electron-as-node 的 `node.cmd`
前置进 PATH；该 shim 的 `clear-env.mjs` 会删掉 `ELECTRON_RUN_AS_NODE`，
导致 `tsx` 的 respawn 子进程被当作 GUI 应用启动并以 `4294967295` 退出。后果是
`pnpm --filter @deepseek-ai/dsh-root run build`（harness 的 `tsx scripts/build.ts` 入口）
在本机必失败，而 `build.ps1:167` 失败后会**静默降级到 `build:web` 并把 `harness-build`
记为 OK**，把问题掩盖到发布校验阶段。
绕过：`build:lib`（tsc+tsdown）与 `build:web`（vite）都不含 tsx，可分别直接运行；
或用真 node 的 pnpm（`%APPDATA%\npm\pnpm.cmd`）。
`harness/.dsh-build/client-build-environment.json` 因此不会产出——它**无运行时消费者**
（读取者只有 `apps/web/tests/built-boot.snapshot.ts`、`apps/web/tests/hmr-live.e2e.ts`、
`scripts/release/families.ts`），缺它不影响已装应用运行。

### 历史验证状态（2026-08-31，仅 Linux 侧）

- `npx tsc --noEmit` ✅ 零错误
- `npx vitest run` ✅ 31/31 全绿（命令行/ready-line/退避/状态机/LINKS 解析/提取管线）
- `electron-builder --dir` ✅ asar 结构完整，lib/main.js 入口存在
- **Windows 真机 + MSI 安装/启动/卸载验证：❌ 未完成（需 Windows 主机）**

## 文件结构

```
desktop-electron/
├── package.json          # 独立包，不进 pnpm workspace（npm 独立管理）
├── tsconfig.json         # typecheck 用（noEmit）
├── tsconfig.build.json   # build 用（emit → lib/）
├── vitest.config.ts
├── electron-builder.yml
├── src/
│   ├── main.ts           # Electron 主进程入口
│   ├── backend-adapter.ts # spawn 适配器
│   ├── supervisor.ts     # 3 阶段状态机
│   ├── launcher.ts       # 后端 spawn 原语
│   ├── command.ts        # 命令行解析
│   ├── paths.ts          # 目录布局
│   ├── logging.ts        # 日志系统
│   ├── backend-stdout.ts # ready-line 扫描 + 失败分类
│   ├── process-tree.ts   # tree-kill
│   ├── reaper.ts         # 孤儿回收
│   ├── extract.ts        # tar.zst 解包 + LINKS 重放
│   ├── zstd-decoder.ts   # zstd 解码（binding/CLI 双通道）
│   ├── rescue-server.ts  # 急救控制端点
│   └── *.test.ts         # 31 个单测
├── res/
│   ├── landing.html      # 启动页（从 desktop/ 复制）
│   └── rescue.html       # 急救页（从 desktop/ 复制）
├── build/
│   └── icon.png          # 从 desktop/assets/ 复制
└── scripts/
```

## 注意事项

- 本包**不加入根 pnpm-workspace.yaml**，用 npm 独立管理（避免 pnpm 11
  overrides 对 electron/tar-stream 产生冲突）
- `desktop/` Go 壳保留不删，两条路线并存，由 release workflow 选择打包哪个
- zstd 解码依赖系统 `zstd` CLI 或可选 npm binding（`@breezystate/zstd`），
  Windows 打包时需确认 CLI 在 PATH 上或将 binding 加入 dependencies
- reaper 的 backend pid 初始值为 main pid（占位），真正的 pid 通过
  `updateReaperBackendPid()` 在每次 spawn 后更新
