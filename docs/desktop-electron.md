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
make-bundle.ps1，以下为 stage 构成实测 + 压缩比估算）**：

| 构成 | stage 体积（node_modules 除外） |
| --- | --- |
| harness 源码树（b150a551 = 0.1.1-rc.2） | 48.7 MB |
| plugins 28 个（含 dsh-stickers 贴纸资产 76 MB、dsh-track 31 MB、better-sidebar 15 MB） | 157.8 MB |
| dsh-mygo（vendored） | 4.0 MB |
| node.exe（Windows v22 runtime，估） | ~80 MB |
| mnemon.exe（bundle 管理 CLI） | 14 MB |
| **stage 合计** | **~305 MB**；tar.zst 压缩后估 **~95-110 MB**（JS/TS 文本 3:1 + 资产少压缩） |

**完整发行版总体积（Windows 安装包）**：
- Electron 壳路线：88 MB（壳）+ ~100 MB（backend.tar.zst）≈ **NSIS 安装包 ~190 MB**（xz 压缩后约 150-170 MB）
- Wails 壳路线：20 MB（壳含 go:embed 后端 payload 的入口）+ 同一份 backend.tar.zst ≈ **~120-130 MB**
- 后端是两壳共用的大头；壳差 68 MB 全部是 Chromium vs WebView2 系统共享的代价。
- 注意：backend.tar.zst 真实数字只能在 Windows 主机跑 make-bundle.ps1 得出（脚本内含 pnpm install + junction 处理 + .ignored_* 裁剪），上表 stage 构成为 Linux 侧 du 实测，压缩后数字为估算。

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

## 验证状态

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
