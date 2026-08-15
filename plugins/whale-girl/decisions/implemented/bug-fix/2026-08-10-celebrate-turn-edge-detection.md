# Decision: 修复 celebrate 误触发——回合完成改用 running true→false 边沿

Status: implemented

## Problem

手测反馈：celebrate 动画在**没有任何 session 结束一个 turn** 时播放。根因是回合完成检测消费了官方 sessions 快照的 `completed` 字段——该字段的语义是**「非选中会话」running→false 边沿**（`client/runtime/src/client/sessions/manager.ts` 的 `completedNotifications`：侧栏绿色 done 提醒），不是「任意会话的一个 turn 完成」：

- **当前选中会话完成不标记**（`if (sessionId !== selected) add`）——用户当前回合结束反而不庆祝（v3「agent 工作完成后播 celebrate」需求在此从未真正生效）；
- **后台/子会话（subagent）完成误触发**——用户没有感知的「session 结束」也播庆祝（「没有任何触发」的观察来源）；
- `completedNotifications` 跨 connection generation 持久、select 时清除——时序上还会造成重复/错乱窗口。

## Decision

- **回合完成检测改用 `running` true→false 边沿**（官方快照的 running 字段，语义明确）：任一会话（含当前选中、子会话）running 从 true 变 false = 一个 turn 结束 → 播 celebrate（`celebrateUntil` 窗口）+ 非当前会话附气泡。
- 新增纯函数 `detectTurnCompleted(snapshot, prevRunning)`（logic.mjs）：位表对比 running 边沿，首帧只建位表不触发、持续态不触发、快照缺行清理位表（防重开误判）；宿主在 onSessions 维护 `prevRunning`。
- `detectRoundCompleted`（completed 字段消费）废弃并删除（处置由 [2026-08-10-remove-dead-code](../simplification/2026-08-10-remove-dead-code.md) 更新：无消费方，纯死代码）；onSessions 移除 seen/seed 逻辑。

## Alternatives considered

**A：只过滤「非选中会话」的 completed（保留 completed 字段）。** 当前会话完成仍不庆祝（需求缺口在）；subagent 完成仍误触发；completedNotifications 的持久/清除时序错乱未解决——治标不治本，弃。

**B：订阅 turn/end 事件（assistant-timing 的 completedTime）。** 更精确但依赖事件面（官方时序 API），快照 running 边沿已足够且纯函数可测——弃（复杂度换不来收益）。

## Consequences

- celebrate 只在真实 turn 结束时触发（含当前会话——v3「agent 工作完成庆祝」需求真正生效）；无「无触发播放」。
- 当前会话完成不再被 completed 字段的「非选中」限制漏掉；子会话完成仍算 turn 结束（agent 内部子任务完成是真实完成，庆祝合理）。
- 纯函数可测（新增 2 组测试）；逻辑层不动 Node half。重装 + 刷新生效。
