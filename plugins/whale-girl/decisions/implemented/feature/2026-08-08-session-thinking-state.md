# Decision: 会话感知陪伴（P2 思考态）——宠物对宿主会话活跃状态的反应

Status: implemented

## Problem

宠物此前只感知 Node half 的事件账本（任务完成/失败/会话 XP）与自身互动，对**宿主会话的实时活跃状态**无感知：模型正在思考/生成时宠物照常 idle 或睡觉；会话等待用户批准（approval/plan-review/question）时无提示；其它会话完成回合时无反馈。产品定夺（2026-08-08）：P2 思考态「要做，且应该考虑到多个 session 的情况」——宠物应陪伴整个 GUI 的所有会话，而非只看当前会话。

## Decision

- **信号源**：client half 注入 host `sessions` 服务（bundle 导出面 `inject: ['sessions']`，fiber 等待该服务；manifest `client.inject` 是图元数据不参与注入，bundle 自身导出为准），订阅 `sessions.list`（`SnapshotStore`：`getSnapshot()`/`subscribe(fn)`）。每行含 `running` / `pendingInteraction`（'approval'|'plan-review'|'question'）/ `completed` / `displayTitle`，快照含 `current`（当前会话）。
- **多会话语义**：`deriveSessionMood(snapshot)` 聚合**所有**会话——任一 `running: true` → `thinking`（思考陪伴）；任一 `pendingInteraction` 存在 → `waiting`（等待批准）。宠物陪伴整个 GUI，不只当前会话；当前会话身份保留在快照 `current`，供「回合完成提示」区分。
- **动画状态**（`client/logic.mjs`，纯函数）：新增 `think`（💭 思考陪伴）与 `wait`（👀 等待批准）两个状态。优先级：`drag > 事件 burst > 用户互动 eat/play > wake > wait > think > working > joy > sleep > walk > idle`——会话活跃时宠物保持清醒陪伴（覆盖 sleep/walk），但用户互动、事件反馈、拖拽不抢戏。
- **回合完成提示**（client 侧，不依赖 Node half 轮询）：`completed` 从无到有（翻转）且非当前会话时，一次性气泡「✨ {title} 完成了」（`showReply`，2.5s 消失）——当前会话完成用户正在看，无需提醒；同一 completed 会话只播报一次（`seenCompleted` 去重）。
- **降级**：`sessions` 服务缺失时（`ctx.sessions`/`ctx.get('sessions')` 不可用）跳过订阅，宠物照常运行，只是无思考陪伴——不影响既有行为。

## Alternatives considered

**B：轮询 Node half 会话状态。** 无此数据面（Node half 事件账本不含会话运行状态）；且 3s 轮询延迟明显差于 client 本地订阅——弃。

**C：只感知当前会话（`current`）。** 与产品定夺「考虑多个 session」冲突；宠物应陪伴整个 GUI——弃。

**D：回合完成也播 burst 庆祝动画。** `completed` 是持久状态（未打开前一直为 true），每次刷新都会触发；burst 太吵且与账本 celebrate 语义混淆——改为一次性轻气泡提示（翻转检测 + 去重）。

## Consequences

- 宠物对宿主会话活跃状态实时反应（思考陪伴/等待批准/回合完成提示），多会话聚合；`inject: ['sessions']` 成为 client half 的服务依赖，需验证站 web 重启后验证（fiber 注入契约）。
- 新增 `think`/`wait` 两状态走 EMOJI 兜底（无 sheet 时显示表情），后续并行会话的 sprite 管线可补 sheet（manifest 状态须在 EMOJI 表内，反之不必）。
- 已知边界：`sessions.list` 快照在会话列表就绪前 `byId` 为空（`deriveSessionMood` 安全返回全 false）；订阅回调异常被捕获保留上次 mood。
