# Decision: SSE 事件推送——事件响应延迟从 pollMs 轮询降到单次 /state 往返

Status: implemented

## Problem

手测反馈：宠物对会话/任务事件的响应有 1~2 秒延迟（新会话 welcome、回合完成 celebrate、思考陪伴的**开始时刻**被推迟）。根因：事件（`session/event` 边沿、`agent/session-start`、`onTaskDone`、请求错误）发生后，Node half 的 `activity()` 只在 `/state` 请求时执行并返回新值——client 每 `pollMs`（默认 3000ms）轮询一次，事件到宠物反应的延迟 = 0~pollMs（平均 ~1.5s，最坏 3s）。`turnCompleted`/`welcomeUntil`/`sessionThink` 的窗口都是「事件发生后开始计时」，轮询采样让宠物**晚一拍**进入动作。

## Decision

- **SSE 事件流主通道**：Node half 新增 `GET /whale-girl/events`（`text/event-stream`）路由，维护连接集合并以 25s 注释行心跳防空闲断开；四个事件点（turn 边沿、会话启动/续接、任务终态、请求错误）发生时 `broadcastEvent()` 推送。client 用 `EventSource` 订阅，收到事件立即 `refresh()` 拉最新 `/state`——延迟从「0~pollMs 轮询」降到「单次 /state 网络往返」（本地 <50ms）。
- **轮询保留兜底**：`pollMs` 轮询不变（默认 3s）——SSE 断线/不可用时宠物照常跑；`EventSource` 内建自动重连（`retry: 3000`），重连期间轮询兜底。双通道幂等（`refreshing` 标志防并发）。
- **事件路由单一来源**：`EVENTS_PATH` 加入 `src/routes.mjs`（verify-routes-sync 门禁守护），client/Node half 共用。
- 连接生命周期：`res` 写入失败（断连）即从集合移除；`close` 时清理连接并停心跳；广播 try/catch 不阻塞事件处理。

## Alternatives considered

**A：缩短默认 pollMs（3000 → 1000）。** 延迟降到 0~1s（平均 0.5s），3x 请求量（轻量端点可承受）——但延迟依然存在（治标），且「回合完成庆祝晚 1s」在快节奏交互下仍可察觉。弃：事件驱动本就是「事件 → 立即反馈」的语义，轮询采样是结构性妥协。

**B：长轮询（/state 挂起直到事件或超时）。** 无 SSE 的浏览器兼容顾虑，但服务端需维护挂起请求集合 + 超时/清理，复杂度不低于 SSE，且每请求都占一个连接（多标签页翻倍）。弃。

**C：client 本地即时反馈（不依赖 Node）。** v8 已实证自渲染 client 拿不到会话事件（官方注入面只给 `__DSH_BOOT__`），回合完成信号只能经 Node half——此路不通。

## 取代检查

部分取代 [2026-08-10-session-state-node-aggregation.md](2026-08-10-session-state-node-aggregation.md)：
其「Consequences」的「turn/end 边沿经 3s 轮询采样（延迟略增，可接受）」由本记录取代（SSE 推送后事件即时下发）；
该记录的架构决策（Node half 聚合进 /state、client 从 /state 读、turn 边沿语义）不受影响。

## Consequences

- 事件响应即时化：回合完成庆祝/欢迎/思考陪伴/等待批准/任务失败情绪——全部事件驱动即时生效（<50ms 本地往返），轮询仅兜底。
- 双通道幂等：SSE 与轮询都触发 `refresh()`（`refreshing` 防重入），事件乱序/重复到达安全（`/state` 是全量快照，无增量状态）。
- 连接面：每页面一个 EventSource（多标签页 N 个连接，轻量）；headless（无 httpServer）组合无 SSE 也无 UI，行为不变。
- Node half + client 改动：重装 + web 重启生效；client.js 由 build-client 重新生成。
