# Decision: 睡醒过渡（wake）改由视觉边沿触发——修复「wake 动画不可见」

Status: implemented

## Problem

手测反馈：从 sleep 状态切换出来时应进入 wake，但任何时刻都观察不到 wake 动画。根因是**睡醒边沿判定与视觉切换脱节**：旧边沿逻辑在 `pollState`（3s 轮询）里用 `wasSleeping && !sleeping` 检测——`sleeping` 由 Node half activity 判定（`activity.name === 'idle'` 且持续空闲超时）。但**视觉上从 sleep 切出由 `sessionThink` 驱动**（think/working 在 STATE_TABLE 优先级高于 sleep）：会话活跃时宠物直接显示 think/working，`sleeping` 仍是 true（activity 还是 idle，思考阶段无任务）——边沿永不翻转，wake 永远不触发；即便 activity 变 working 使 `sleeping` 翻转，排除列表 `['working', ...]` 又把它挡掉。两条路径都让 wake 不可达。

## Decision

- **睡醒边沿改为视觉驱动，移到 `tick`（每帧）**：上一帧实际显示的 `animState === 'sleep'`、本帧 `pickState` 结果不是 `'sleep'`（且非拖拽打断、无瞬发占用）→ 播一次 wake。
- **不依赖 `sleeping` 变量**：视觉离开 sleep 的瞬间（会话活跃 / activity 变非 idle / 用户互动之外）即过渡，无需等 Node half activity 翻转。
- **wake 让位语义保留**：`transient === null && !dragging` 前置——sleep 中用户互动（feed/play）与拖拽不抢播 wake（互动/拖拽本身就是唤醒，播对应动画更自然）；wake 行在 STATE_TABLE 仍低于 drag/burst/eat/play，事件反馈优先。
- 原 pollState 的 `wasSleeping` 边沿逻辑删除（失效根源），`sleeping` 变量保留（仍驱动 sleep 状态的进入）。

## Alternatives considered

**A：修 `sleeping` 翻转时机（activity 非 idle 即翻转）。** Node half 思考阶段 activity 就是 idle，翻转仍需等任务开始，视觉延迟且语义混乱——弃。

**B：把 wake 作为 pickState 的派生状态（sleep 后 N 秒内强制 wake）。** 需要引入「上次离开 sleep 时刻」状态，文法表复杂化，且无法区分拖拽/互动唤醒——弃。

## Consequences

- sleep → 任何非 sleep 状态（think/working/walk/idle 等）的过渡现在都能看到 wake 动画（非拖拽/互动场景）。
- 纯 client 层修复：重装 + 刷新即可生效，无需重启 web。
- 测试面：pickState 单测不受影响（logic.mjs 未改行为，wake 行优先级不变）；冒烟验证 apply + 渲染。
