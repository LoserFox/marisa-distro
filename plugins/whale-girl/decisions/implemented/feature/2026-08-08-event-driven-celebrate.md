# Decision: 事件驱动庆祝（F3）——账本与庆祝同源，页面关闭期完成的任务重开后也庆祝

Status: implemented

## Problem

账本记账已迁入 `ctx.tasks.onTaskDone` 事件驱动（[integration-review-fixes](../bug-fix/2026-08-08-integration-review-fixes.md) F1），页面关闭/轮询缺席时任务终态不漏记（+XP/称号/回忆）。但 celebrate 视觉窗口仍只由轮询路径（`deriveActivity` 翻转检测）产生——**页面关闭期间完成的任务账本记了 XP，重开后却无庆祝**（轮询缺席时 `known` 无翻转可观察，无观众时的庆祝丢失）。原记录将该缺口列为 F3「另立提案」。

## Decision

- **事件驱动 celebrate 窗口**：`ctx.tasks.onTaskDone` 的 `completed` 分支记账的同时设置 `celebrateUntil = now + CELEBRATE_MS`（6s，与 `deriveActivity` 的 `BURST_MS` 同长）。页面关闭期间完成任务（轮询缺席）时窗口保留在内存，重开后首次轮询 `/state` → `activity()` 读到 `celebrateUntil > now` → 同源庆祝。
- **双源同窗取 max 不叠加**：`activity()` 的 burst 级联把事件路径 `celebrateUntil` 与轮询路径 `derived.burst`（celebrate）合并，取更晚者——同一任务两条路径都产出庆祝时只显示一个窗口，不延长。
- 级联顺序不变：`welcome > error > disappointed > celebrate > working > idle`；celebrate 仍低于负面窗口（失败/错误优先），`agent/request-error` 不设 celebrate。
- killed 仍中性：`onTaskDone` 只对 `completed`/`failed` 记账+设窗口，killed 不庆祝（与 [integration-review-fixes](../bug-fix/2026-08-08-integration-review-fixes.md) F1 语义一致）。

## Alternatives considered

**B：庆祝窗口也持久化到 state.json。** 关闭期完成的任务重开后跨 web 重启也庆祝——但「无观众时的庆祝」是瞬发视觉事件，持久化会与回忆/XP 长期语义混淆，且窗口过期判定依赖更多状态——弃。

**C：重开后对比任务计数增量推导庆祝。** 需要持久化历史任务计数与时间戳，复杂度高于直接设窗口；计数在账本里已有（tasksDone），但无时间信息无法开窗口——弃。

## Consequences

- 页面关闭期间完成的任务重开后也庆祝（账本与庆祝同源）；双源取 max 不叠加延长；killed 中性保持。
- 已知边界：窗口是内存态（CELEBRATE_MS=6s），**web 进程重启**（非页面关闭）后 `celebrateUntil` 归零——与 F2 同类的进程级限制；仅页面关闭（进程存活）场景补全。
- 关联记录：本记录实现 [integration-review-fixes](../bug-fix/2026-08-08-integration-review-fixes.md) 的 F3 提案项。
