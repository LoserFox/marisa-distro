# Decision: 会话感知改由 Node half 聚合进 /state——官方自渲染 client 无 ctx.sessions

Status: implemented

## Problem

升级 0810 基线后，宠物无法响应 session 的启动/完成/结束事件（用户反馈 0808/0809 正常）。根因：**迁移到官方 repository-plugin 自渲染 client 后，client 脚本以 `apply({})` 自执行——没有 fiber 注入的 ctx，`ctx.sessions` 不可达**（官方注入面只向脚本暴露 `window.__DSH_BOOT__`（rev+entries），无会话服务通道，实证 dist bundle）。迁移前 client 经 `__ModuleLoader__` fiber 注入拿 ctx.sessions 正常。会话感知（think 陪伴/等待批准/回合完成庆祝/working 插曲）在新形态下整段失效。

## Decision

- **Node half 聚合会话状态进 /state**：entry `inject` 加 `'sessions'`；经 `ctx.on('session/event')` 跟踪 `turn/start`·`turn/end` 边沿（`activeTurns` 计数）→ `sessionThink`（任一会话 turn 活跃）；`turn/end` 边沿置 `turnCompleted` 翻转标志；activity() 返回增加 `sessionThink`/`sessionWait`/`turnCompleted`，随 /state 轮询下发。
- **client 从 /state 读**：refresh 里读 `act.sessionThink`/`act.sessionWait` 更新 sessionMood，`act.turnCompleted` 翻转 → celebrateUntil；退役本地 sessions 订阅（自渲染形态 ctx 为空恒失效）。
- **依赖解析**：Node half 用 `ctx.get('sessions')` 弱获取（同 settings 模式），sessions 服务缺席时保持上次值（降级同旧语义——宠物照常跑，无会话感知）。
- **turn/end 语义**：0810 的 session 事件模型（`turn/start`/`turn/end`/`step/*`）替代旧 client 的 `running true→false` 快照边沿——turn 即「一个回合完成」的精确信号，含当前/子会话。

## Alternatives considered

**A：找官方自渲染脚本服务通道。** 实证 0810 只暴露 `__DSH_BOOT__`（rev+entries），无会话/数据 API——此路不通。

**B：client 轮询额外会话 HTTP 路由。** 需自建 Node 会话查询路由（同 /state 机制）——不如直接聚合进现有 /state 复用轮询，零新通道。

## Consequences

- 会话感知恢复：宠物在会话 turn 活跃时 think 陪伴/working 插曲，turn 完成时庆祝（含当前会话）。
- 纯 client 的 `deriveSessionMood`/`detectTurnCompleted` 不再被 client 消费（保留于 logic.mjs + 测试，作为 Node 聚合语义的参考/回归基线）。
- Node half 改动：需 web 重启生效（ESM 缓存）；client 改动重装 + 刷新。
- 已知边界：`sessionWait`（等待批准）暂未实现（turn/end 的 reason 到 TurnEndReason 映射待下一步）；turn/end 边沿经 3s 轮询采样（比旧快照订阅延迟略增，可接受）。
- 实现层修正：事件字段是 `type` 不是 `kind`、订阅不随 sessions 服务缺席而丢、sessionWait 已实现（reason.kind === 'blocked'）——见 [2026-08-10-session-event-field.md](2026-08-10-session-event-field.md)（部分取代本记录的实现层陈述）。
- 轮询采样延迟已被取代：事件响应改经 SSE 即时推送（[2026-08-10-sse-event-push.md](2026-08-10-sse-event-push.md) 部分取代本记录的「3s 轮询采样」陈述）。
