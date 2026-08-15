# Decision: 积累型伙伴事件模型（v2，零负反馈）

Status: implemented

## Problem

初版宠物是 QQ 宠物机制的 1:1 复刻：hunger/mood 随时间衰减、靠投喂续命。用户明确指出：不复制 QQ 宠物的生物需求机制，要做 **Agent Harness 场景的"新宠物"**——同样是宠物，但事件机制以工作台为脉动源。初版的三轴提案（陪伴/活力/成就）被判定为同构（都是"活跃上升/静默下降"的变体）；用户给出两个原则：**0 负反馈**、**积累型**。

## Decision

宠物改为**积累型账本**（`src/pet-state.mjs`）：

- **零负反馈**：无衰减、无惩罚、无需求。状态里没有 hunger/mood；宠物不因冷落而难受。失败只触发瞬发动画（`error` 惊吓 4s → `disappointed` 失落尾 6s，总负面 10s），不计数为惩罚、不扣资历。
- **积累型**：一切向上积累——真实的共同经历 → 资历。**XP 来源/等级曲线/称号/回忆的完整契约见 [docs/growth-system.md](../../../docs/growth-system.md)（唯一权威），此处不重复。**
- **情绪 = 事件即时反应**（瞬发、不持续）：`working`（任务运行）、`celebrate`（完成/升级/称号，事件+轮询双源同窗）、`error`→`disappointed`（失败）、`welcome`（新会话）、`joy`（投喂/玩耍后 1.6s）、`think`（任一会话运行/思考，sessions 订阅陪伴底座）、`wait`（任一会话等待批准，sessions 订阅陪伴底座）。
- **动画状态 15 个**：idle/working/celebrate/error/disappointed/joy/eat/play/drag/walk/sleep/wake/welcome/think/wait（删 hungry/sad，happy→joy，新增 welcome/walk/think/wait；think/wait 当前 emoji 兜底无 sheet）。
- **互动重定义**：投喂/玩耍是**纯乐趣**——状态不变，只回话（宠物"说话"气泡），无数值影响。
- **持久化**：账本存 `<dshHome>/data/dsh-pet/state.json`，事件记账时 1s 防抖落盘，disable 时末次落盘。
- **事件面**：账本记账经 `ctx.tasks.onTaskDone` 事件驱动（页面关闭期任务终态不漏记，killed 中性；完成同时开 celebrate 窗口——账本与庆祝同源）；`agent/request-error` → error/disappointed 情绪窗口（不计数）；`agent/session-start` → 新会话计数 + welcome / 续接 +2；工作态按轮询间隔累加活跃时长（单次增量封顶 5min）；client 订阅 host `sessions` 服务 → think/wait 陪伴状态与回合完成轻提示。

## Alternatives considered

**三轴情绪（陪伴/活力/成就）。** 三个轴都是"活跃上升/静默下降"的同构变体，信息冗余、实现复杂，且静默下降仍隐含负反馈。落败 → 单轴积累（资历）+ 事件瞬发情绪。

**保留 hunger/mood 仅改数值。** 换汤不换药，仍是 QQ 宠物机制。落败。

**纯事件无任何积累（无等级/称号/回忆）。** 缺少"伙伴感"的长期回报，用户明确要求积累型（资历+称号+回忆）。落败。

## Consequences

- 投喂/玩耍不再产生数值变化——娱乐性由动画/回话/爱心粒子承担，防"点击刷资历"。
- 睡眠/唤醒保留为中性状态（长空闲打盹，回来 wake），不是惩罚。
- 状态路由 `pet` 字段形状变化（无 hunger/mood，新增 stats/titles/memory）——旧客户端字段已同步迁移。
- 持久化文件为 v1（hunger/mood）时被 `normalizeState` 拒绝并回退初始账本（旧数据不迁移，可接受：本插件未对外发布）。
