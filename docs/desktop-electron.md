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
