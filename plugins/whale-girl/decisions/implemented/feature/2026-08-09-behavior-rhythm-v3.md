# Decision: 行为节奏 v3——随机 working 插曲 + 回合完成庆祝 + 调度决策纯函数化

Status: implemented

## Problem

三个相互关联的缺陷（subagent 架构审计坐实，2026-08-09）：

1. **working/think 交替机械**：working 由 Node half `activity.working`（任务 running 事实）驱动 + client 固定时间片（2s/1s）交替。但 agent 思考阶段**无任务**（activity 是 idle），交替靠时间片硬凑，行为机械且与用户感知脱节——「大部分时间 think、偶尔随机 working」才是自然的工作陪伴节奏。
2. **回合完成无庆祝**：celebrate 只在 task 完成层（Node 窗口）触发；「回合完成」（session running→completed）只有气泡且**明确跳过当前会话**——用户正看着 agent 回答完，宠物毫无庆祝动画。
3. **调度散落**：transient/joy/dragRelease/wander/边沿检测各自为政（优先级陈述散布 9 处），触发源与切换逻辑竞争（wake 被拖拽/burst 吞掉、walk 边播 celebrate 边移动、transient 四写两复位），且**全部在 index.mjs 闭包里不可单测**——「谁产生状态输入」无统一所有权。

## Decision

### 1. working 改随机插曲（不是任务指示灯）

- `STATE_TABLE` working 行：`when: (c) => c.workingActive`——由 client 节奏器注入，**不再读 `activity.working`**（Node 侧 working 仍用于账本活跃时长，但不驱动动画）。
- 节奏器决策在纯函数 `nextWorkingRhythm({ now, sessionThink, working, random })`：think 常态下随机等待（12-30s）插入 working，working 随机持续（2.5-6s）后回 think；会话不活跃时插曲撤防。
- `index.mjs` 的 `armWorking()` 是薄执行层：按决策结果设 setTimeout 到点翻转，不写逻辑。

### 2. 回合完成庆祝（含当前会话）

- `STATE_TABLE` 新增 `celebrate` 行：`when: (c) => c.celebrateUntil > c.now`，优先级在 wait 之下、working/think 之上（等待批准更紧急、用户互动优先）。
- sessions 订阅改纯函数 `detectRoundCompleted(snapshot, seen)` 检测 completed 翻转：任何会话（**含当前**）完成 → `celebrateUntil = now + ROUND_CELEBRATE_MS (4s)` 播庆祝动画；气泡仍只给非当前会话（用户在看的不需文字提示，但庆祝动画不跳过——正是「agent 工作完成后庆祝」的诉求）。

### 3. 调度决策纯函数化（Step 2 落点）

- 新增纯函数面（[client/logic.mjs](../../../lib/client/logic.mjs)）：`nextWorkingRhythm`（随机插曲决策）、`detectRoundCompleted`（翻转检测）、`shouldWake`（睡醒边沿）——now/随机源显式注入，可单测（确定性时间推进测试的落点）。
- wake 边沿从 tick 闭包 hack 改为调用 `shouldWake(prevState, nextState, {dragging, transient})`。
- 所有权规则：状态变量只由 tick 消费纯函数结果写入；事件处理器不再手写窗口；timer 清理进 dispose。

## Alternatives considered

**A：把 working 保留为任务状态指示灯（activity.working 驱动），只调时间片比例。** 治标——交替的机械性源于「状态=任务事实」的语义错位，思考阶段无任务，任何时间片都是硬凑；且无法表达「随机节奏」——弃。

**B：回合完成庆祝也走 Node half（/state 下发 celebrate 窗口）。** Node half 无 sessions 数据面（sessions 只在 client 侧注入），轮询 3s 延迟劣于订阅即时；回合完成是 client 本地信号，本地窗口更自然——弃。

**C：完整 fsm 抽象层（事件总线/转换图）。** 3 个 subagent 一致：正确形态是「调度决策纯函数化」，不是状态机框架——15 状态优先级文法已由 STATE_TABLE 表达（`state-table-grammar` 决策），强行转换表化/事件总线化重蹈 `event-table-not-adopted` 覆辙（表达力损失、无收益间接层）。本决策只落地纯函数调度面，框架化留作后续演进选项（见 [architecture-evolution.md](../../../docs/architecture-evolution.md) P0）。

## Consequences

- 工作陪伴：think 沉思为主，working 偶尔随机插入（12-30s 间隔、2.5-6s 时长），不再机械交替；会话结束插曲撤防。
- 回合完成（含当前会话）：宠物播 celebrate 庆祝动画 4s，非当前会话附带气泡提示。
- 调度决策可单测：`nextWorkingRhythm`/`detectRoundCompleted`/`shouldWake` 均有确定性测试（注入 now/随机源），修复「调度不可测」根因。
- 测试更新：旧时间片用例（#15/#16/#22）改为 workingActive/celebrateUntil 语义；working 不再由 activity.working 驱动（#2/#4/#8 相应更新）。
- 已知边界：walk 的「burst 期间仍移动位置」（rAF step 不查 activity）与瞬发/窗口复位的统一所有权，属后续调度收敛（Step 2+），本决策未动。
