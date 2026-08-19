# Decision: 桌面渲染壳换 Tauri v2——体积 277MB → ~10MB 级

Status: implemented

## Problem

桌面伴侣（desktop/）原渲染壳用 Electron：二进制 277MB（Electron.app），只为渲染一个 150x150
透明精灵——交付 A（仓库目录自装）场景下用户下载/安装成本过高。渲染壳代码本身仅 80KB
（lib/render + render/），引擎（lib/client，零依赖）与渲染壳已解耦——换壳是受控改动。

## Decision

- **Tauri v2 为主渲染壳**（`desktop/src-tauri/`）：Rust 负责透明置顶窗（`macOSPrivateApi`
  透明 + `withGlobalTauri`）、资产拉取（ureq 原生 HTTP，webview 零网络零 CORS 面）、
  引擎子进程桥（spawn `node lib/index.mjs --render-json`，stdout JSON 行 → Tauri 事件；
  stdin 收 interact/stop 命令）。webview 跑 `render/` 同一渲染层：`tauri-bridge.js` 把
  `window.whaleGirl` 接到 `window.__TAURI__`（invoke/listen），`renderer.js` 零改动。
- **Electron 渲染壳保留为遗留**：`lib/render/window.mjs` + `render/preload.cjs` 不动，
  从 package.json devDependencies 移除（`npm i -D electron` 手动启用），作跨平台参考/回退。
- **引擎新增 `--render-json` 模式**：渲染壳无关的 JSON-lines 协议（动画意图/快照/回话 →
  stdout；interact/stop ← stdin），与 Electron/headless 共用 `createCompanion` 与 hooks。
- 体积：debug 36MB / release ~10MB 级（vs Electron 277MB）；依赖仅 Cargo 侧（tauri/serde/
  ureq/base64），Node 引擎保持零运行时依赖。

## Alternatives considered

- **Swift/AppKit 原生渲染壳**：体积更小（~1MB）但仅 macOS、无 webview 复用（renderer.js
  需移植为原生绘图）——弃（跨平台 + 渲染层复用优先）。
- **PyQt/PySide**：~150MB，体积未实质改善——弃。
- **Tkinter**：macOS 透明窗口支持差（宠物带方框）——弃。
- **保留 Electron 仅治理体积**（optionalDependency）：GUI 用户仍要 277MB——治标不治本——弃。

## 取代检查

部分取代 [2026-08-16-desktop-companion.md](2026-08-16-desktop-companion.md) 的渲染壳选型
（Electron → Tauri 为主，Electron 降级遗留）；该记录的架构决策（外部 HTTP 消费者、presence
契约、引擎/渲染解耦、desktop/ 不进 bundles）不受影响。

## Consequences

- 桌面伴侣体积 277MB → ~10MB 级（release）；引擎与渲染协议化（--render-json），未来可换
  任意轻量外壳（Swift/系统托盘等）。
- Tauri 构建需 cargo（一次性编译 tauri 依赖树 5-15 分钟）；webview 为系统 WebKit（macOS）。
- 已知：`tauri.conf.json` 的 `macOSPrivateApi`（透明窗）与 `withGlobalTauri`（bridge）缺一
  不可；**capability 必须含 `core:event:allow-listen`**——否则 webview 的 `event.listen` 被
  能力系统拦截（invoke 正常但事件全丢，宠物卡初始 idle、点击无反馈，本地部署实测踩中）；
  WKWebView 写 `~/Library/WebKit` 失败仅告警不阻塞渲染。
- 渲染层行为对齐 web 版：拖拽用原生 `start_dragging` + delta 兜底（canvas 内逐事件移动，
  `drag_window` clamp 屏幕边界）；walk 状态窗口按 45px/s 平移、撞边反转（Rust 回报）。
- 引用点：`desktop/src-tauri/`、`desktop/render/tauri-bridge.js`、`desktop/lib/index.mjs`
  （--render-json）、`desktop/package.json`（scripts）、DESIGN/BUILD-RUN（更新）。
