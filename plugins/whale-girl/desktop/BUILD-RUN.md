# whale-girl-desktop — 构建与运行指南

把 DSH Web GUI 内的桌面宠物插件 **whale-girl** 渲染到操作系统桌面，作为独立伴侣进程常驻屏幕，
并实时消费 whale-girl 的状态/事件。网页端在桌面伴侣在线时自动隐藏自己的宠物，避免"双宠物"。

- 技术方案与契约：见 [DESIGN.md](./DESIGN.md)
- 集成方式：**外部 HTTP 消费者**，不改 whale-girl 本体（DESIGN §2.1 决策）

---

## 1. 环境要求

- Node.js **≥18**（本机 v24.11.1 验证通过），npm ≥9
- DSH web 服务运行在 `http://127.0.0.1:3080`（whale-girl 插件已装）
- 桌面渲染（Electron）需图形界面；纯核心可 headless 跑（`--headless`）

## 2. 安装依赖

```sh
cd desktop
npm install        # 引擎零运行时依赖（Node 引擎脚本无第三方包）
```

**桌面渲染壳（Tauri，推荐）**——构建 Rust 侧（首次编译 tauri 依赖树约 5-15 分钟）：

```sh
cd desktop/src-tauri
cargo build        # 产物 target/debug/whale-girl-desktop（CARGO_TARGET_DIR 可指 /tmp 保持仓库干净）
```

**Electron 遗留壳（可选）**：`npm i -D electron`（二进制约 277MB；国内网络超时用
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` + `electron_config_cache=/tmp/...` 补下载）。

## 3. 运行

### 桌面模式（推荐）——Tauri 渲染壳

```sh
cd desktop/src-tauri && cargo run          # 或直接运行编译产物
# 指向非本机 DSH：
WHALE_GIRL_BASE_URL=http://IP:PORT cargo run
```

启动后屏幕中央出现鲸鱼娘宠物（150x150 透明窗、置顶、点击可投喂/玩耍、拖拽可换位）。
退出：关闭窗口 / Ctrl+C → 引擎子进程 `{online:false}` 下线，网页宠物立即恢复。

### 桌面模式（遗留）——Electron 渲染壳

```sh
cd desktop && npm run start:desktop        # electron .（需先 npm i -D electron）
```

### Headless 模式（核心自测 / 无桌面环境）

```sh
npm run start:headless     # node lib/index.mjs --headless
```

只跑心跳 + 状态轮询 + SSE，不弹窗口，打日志。用于自测 / CI / 服务器。

### 其他启动参数

```sh
node lib/index.mjs --base-url=http://IP:PORT   # 指向非本机 DSH
node lib/index.mjs --poll-ms=5000              # 轮询间隔
node lib/index.mjs --no-presence               # 不接管在场上线（不隐藏网页宠物）
node lib/index.mjs --no-render                 # 同 --headless
node lib/index.mjs --render-json               # JSON-lines 渲染桥（供 Tauri/Swift 等外壳消费）
```

环境变量：`WHALE_GIRL_BASE_URL` / `WHALE_GIRL_POLL_MS` / `WHALE_GIRL_HEARTBEAT_MS`。

## 4. 测试

```sh
npm test
```

`node --test test/**/*.test.mjs`，**26 用例全绿**，覆盖：
- 状态机（`pickState`/`pickAnimation`）确定性映射：burst 优先级 / wait / think /
  celebrate / sleep / transient
- 本地调度（`scheduler`）：空闲→入睡、活跃重置、interact eat/play+joy
- SSE 客户端解析与重连（本地 http server 模拟）
- **端到端契约**（连真实 3080）：/state /config /manifest /presence /interact /sprite 形状
  + `createCompanion` 全链路（心跳上线 → stop 下线）

> 端到端用例会短暂把 `companionOnline` 置 true 再置 false，测试结束自动恢复，无副作用。

## 5. 目录结构

```
whale-girl-desktop/
├─ DESIGN.md              # 设计方案
├─ package.json           # ESM，main: lib/index.mjs；脚本 start/start:headless/start:desktop/test
├─ lib/
│  ├─ index.mjs           # 入口：headless 还是 Electron 渲染
│  ├─ src/config.mjs      # 本地运行参数（BaseURL、pollMs、heartbeatMs）
│  ├─ client/
│  │  ├─ http.mjs         # fetch 封装：/state /interact /config /sessions /presence /assets
│  │  ├─ events.mjs       # SSE 客户端（fetch 流式，断线重连）
│  │  ├─ companion.mjs    # 核心引擎：心跳 + 轮询 + SSE + 调度 + 互动
│  │  ├─ scheduler.mjs    # 本地节奏：睡眠/游走/working 插曲/interact 瞬发
│  │  ├─ state.mjs        # 状态机：activity→动画意图（对齐 whale-girl pickState）
│  │  ├─ state-names.mjs  # 15 状态权威集合
│  │  ├─ behaviors.mjs    # working 节奏/睡醒/醒觉纯函数
│  │  └─ utils.mjs        # 路由拼接 + 日志
│  └─ render/
│     └─ window.mjs       # Electron main：透明置顶窗 + IPC 数据通道
├─ render/
│  ├─ index.html          # 渲染页（透明背景 + 气泡 + 角标）
│  ├─ preload.cjs         # 最小安全 IPC bridge
│  └─ renderer.js         # Canvas 帧播放器 + 内容 bbox 点击穿透 + 拖拽
└─ test/contract.test.mjs # 状态机/调度/SSE + 端到端契约测试
```

## 6. 已实现功能（P0 + P1 核心）

| 项 | 状态 | 说明 |
|---|---|---|
| **P0-1** presence 心跳 | ✅ | 每 15s `POST /presence {online:true}`；退出 `{online:false}`；崩溃 45s 自动过期 |
| **P0-2** 状态轮询 | ✅ | 每 3s `GET /state`，解析 pet + activity |
| **P0-3** 事件即时刷新 | ✅ | SSE `/events`，事件到即刷新——完成/失败/会话/turn 即时反映 |
| **P0-4** 桌面渲染 | ✅ | Electron 透明置顶窗 + Canvas 帧播放（manifest 帧布局） |
| **P0-5** 退出清理 | ✅ | 关窗/退出 → 显式下线 |
| **P1-1** 点击互动 | ✅ | 点宠物 → feed/play 轮换，气泡回话 |
| **P1-2** 资历角标 | ✅ | Lv./任务数/称号 + 思考中标记 |
| **P1-4** 配置跟随 | ⏳ | 结构预留（remoteConfig 已读，size 跟随 P2 完成） |

## 7. 关键实现说明 / 踩坑记录

1. **Electron ESM main 顶层 await 陷阱**：入口 `lib/index.mjs` 若在模块顶层 `await runDesktop()`
   （其内 `await app.whenReady()`），会阻塞 Electron 事件循环导致 `ready` 永不触发（窗口不建、
   无心跳）。修法：入口用 `process.nextTick(() => runDesktop(...).catch(...))` fire-and-forget，
   `runDesktop` 内部照常 `await app.whenReady()`（见 window.mjs）。
2. **确定性时间 bug**：状态机 `STATE_TABLE` 的 burst/joy/celebrate 谓词最初用 `Date.now()`，
   测试传固定 `now` 时全失效（26 用例 3 失败）。改为读注入的 `c.now` 后全绿。
3. **interact 顺序**：`feed`/`play` 瞬发应覆盖醒觉（wake 只用于拖拽放下），调整了
   `applyInteraction` 顺序对齐 whale-girl 上游。
4. **Electron 二进制下载**：国内网络默认 CDN 超时，改用 `npmmirror.com` 镜像成功。
5. **CSRF 面**：桌面本地 HTTP 调用不带 Origin/Sec-Fetch-Site → whale-girl `isCrossOrigin`
   判定为同源，`/presence`、`/interact` 放行（已验证，见测试）。
6. **renderer 首帧空白（同态早退）**：`switchAnim` 在 `name === animState` 时早退——初始
   `animState` 即 `'idle'`、宿主空闲时引擎首个动画就是 idle，早退跳过 `ensureSheet` 导致
   canvas 永远空白（Tauri/Electron 都中招）。修法：同态重入且 sheet 未缓存时补
   `ensureSheet + drawFrame + reportHitarea`（见 renderer.js）。
7. **--render-json EPIPE**：渲染壳（父进程）退出后管道关闭，引擎写 stdout 报 EPIPE——
   `process.stdout.on('error')` 捕获后优雅退出（见 index.mjs）。
8. **Tauri 透明窗**：`tauri.conf.json` 需 `macOSPrivateApi: true` + `app.withGlobalTauri: true`
   （否则 `window.__TAURI__` 不存在，bridge 失效）；窗口配置 `transparent/decorations:false/
   alwaysOnTop/skipTaskbar`。macOS 下 WKWebView 写 `~/Library/WebKit` 失败仅告警（降级内存存储，
   不影响渲染）。
9. **Tauri v2 能力权限（必踩）**：webview 的 `event.listen` 被能力系统拦截——capabilities 缺
   `core:event:allow-listen` 时监听静默失败（`invoke` 正常但事件全丢，宠物卡在初始 idle、
   点击无反馈）。必须给 capability 加 `["core:default", "core:event:allow-listen"]`
   （见 tauri.conf.json `security.capabilities`）。

## 8. 验收对照（DESIGN §7）

1. ✅ 桌面进程启动 → `/state.companionOnline === true`，网页端隐藏宠物
   （实测 `companionOnline: true`，窗口可见宠物）
2. ✅ 每 15s 心跳；进程退出（含 Ctrl+C 经 SIGTERM）→ 显式 `{online:false}`，网页宠物即恢复；
   强制杀死则 45s TTL 过期自动恢复
3. ✅ 事件即时性：SSE 事件 → 立即 `/state`，1 次往返出动画（任务完成 → celebrate）
4. ✅ 只做外部 HTTP 消费者，账本（XP/称号）由 whale-girl 独占，本程序不写任何账本面

---

### 已知限制 / 后续（P2）
- `size` 配置跟随、开机自启、多屏位置记忆为 P2 预留（renderer 已支持，主进程未接牢）。
- 点击穿透基于内容 bbox 开关，未做逐帧窗口收缩（透明边距可能挡鼠标，P2 增强）。
10. **拖拽（原生 + delta 兜底）**：`start_dragging()`（原生，真实手势平滑、超窗不断）与 delta 兜底
    （canvas 监听器内逐事件移动窗口——验证过的路径；原生接管后 webview 收不到 pointermove 自然停，
    不叠加）。`drag_window` 命令 clamp 到显示器边界。
11. **游走位移**：walk 状态期间窗口按 `45px/s`（对齐 web 版 speedPxPerSec，*dpr 转物理像素）沿
    walkDir 平移；`drag_window` 返回是否撞边，renderer 撞边反转朝向（素材朝左基准 flip=-walkDir）。
12. **拖拽动画**：拖拽超过 6px 阈值后 renderer 本地覆盖为 `drag` 状态（对齐 web 版），松手恢复
    引擎动画（拖拽期间缓存 lastEngineAnim）；拖拽覆盖使游走位移暂停（animState 不再 walk），
    消除"边拖边走"抖动。注意 `dragging`/`lastEngineAnim` 必须在处理器前声明（漏声明会让阈值
    在 `moved=true` 后抛 ReferenceError——窗口能动但动画永远不切换，已踩）。
13. **拖拽朝向**：拖拽期间按水平移动方向更新 `flip`（素材朝左基准：向左拖 flip=1、向右拖
    flip=-1，对齐 web 版 drag 朝向逻辑），方向变化立即 `drawFrame + reportHitarea`。
