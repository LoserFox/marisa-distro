# Decision: 工作陪伴交替不依赖 Node half activity——修复「Agent 工作时始终 think 单帧」

Status: implemented

## Problem

手测（2026-08-09）发现：Agent 工作时宠物**始终停留在 think 一帧**，期望的 working/think 交替不生效。根因：原交替条件依赖 `activity.name === 'working'`，而 Node half 的 `activity()` 只反映**任务账本**（tasks running），模型思考/生成阶段**没有 running 任务**——`/state` 轮询返回 `{name:'idle'}`。client 侧只有 `sessionThink=true`（sessions.list 任一 running），恒走 think 行，交替永不触发；且 think 素材是 1 帧+float，视觉上就是一帧定住。

## Decision

- **交替改由 client 侧时间片驱动，与 Node half activity 解耦**：`workingSlice = (now % WORKING_SLICE_MS=3000) < WORKING_ACTIVE_MS=2000`（2s working / 1s think 周期）。
- **working 行条件**：`(sessionThink && workingSlice) || (!sessionThink && activity.name === 'working')`——会话活跃时按时间片交替，不活跃（无 sessionThink）时仍沿用任务账本判定。
- **think 行条件**：`sessionThink`（保留兜底：交替周期外回到 think 沉思）。
- 语义变化：`sessionThink` 单独不再恒 think，而是 working/think 按 2:1 交替——「Agent 工作时」从静态沉思变为活跃工作陪伴。

## Alternatives considered

**A：Node half 思考期间也报 activity working。** 需要 Node half 感知模型思考态——Node half 无此数据面（sessions 只在 client 侧注入），且 3s 轮询延迟劣于 client 本地时间片——弃。

**B：缩短 think 素材帧数/加动画。** 治标：交替本身失效，加帧也还是单画面；且素材管线成本高于逻辑修复——弃（若交替生效后用户仍觉单调，可再议 think 素材）。

## Consequences

- 「Agent 工作时」= working（托腮小灯泡，3 帧）与 think（托腮，1 帧+float）按 2s/1s 交替，不再依赖 Node half 任务账本；思考阶段（无任务）同样交替。
- 测试更新：新增「activity idle 时也按时间片交替」用例；原 `sessionThink → think` 断言显式传 `now`（think 段 2500）消除真实时钟不定性。
- 纯 client 层修复：重装 + 刷新即可生效，无需重启 web。
