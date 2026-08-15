# Decision: 用户交互醒觉——交互后不再「立即回 sleep」（sleep → drag → idle → sleep 修复）

Status: implemented

## Problem

手测反馈状态机不合理：`sleep → drag → idle（1.5s 放下缓冲）→ 立即恢复 sleep`。根因是**交互没有重置空闲计时**：`sleeping` 只由 `idleSince` 派生（refresh 3s 粒度），而拖拽放下（pointerup/pointercancel/lostpointercapture）只设 `dragReleaseUntil` 缓冲、从不重置 `idleSince`/`sleeping`——缓冲过期后 `pickState` 立即命中 `sleep` 行，宠物放下即睡回。**同类链路**：喂食/玩耍（eat/play + joy 播完）后同样立即回 sleep；打开菜单原本更新 `lastActiveAt` 想「防睡着」，但 `lastActiveAt` 不参与 `sleeping` 判定（纯死代码），该意图实际无效。

## Decision

- **任何用户交互 = 用户在场信号**：拖拽放下、喂食、玩耍、打开菜单统一重置空闲计时（`sleeping = false`、`idleSince = 0`），空闲从交互时刻重新起算——交互后宠物保持清醒（直到再次空闲 ≥ sleepAfterMs），不再「放下即回 sleep」。
- **交互瞬间若正睡着，附加 wake 醒觉过渡**（`transient = 'wake'` + `WAKE_MS`）：拖拽放下先回 1.5s idle 缓冲（STATE_TABLE 缓冲行优先）再播 wake（3s）——「被拖起来」的自然醒觉，之后进入底层状态。
- **决策纯函数化**：新增 `wakeFromInteraction({ sleeping }) → { sleeping: false, wake }`（logic.mjs，可单测）；index.mjs 的 `releaseInteraction()` 是薄执行（归零 + 条件设 wake）。
- **删除 `lastActiveAt` 死代码**：其全部赋值无读取，且「防睡着」注释误导（`sleeping` 判定只用 `idleSince`）；防睡着语义由 `releaseInteraction` 承担。
- **拖拽被系统打断**（pointercancel / lostpointercapture）：同样按「放下」收尾（idle 缓冲 + `releaseInteraction`），防打断后立即回 sleep；pointerup 用 `wasMoved` 快照判断菜单切换，`moved` 在收尾后归零（`releasePointerCapture` 会触发 lostpointercapture，防重复收尾）。

## Alternatives considered

**A：只重置 `idleSince`，不播 wake。** 解决「立即回 sleep」，但睡着时被拖起直接跳底层状态，缺失「醒过来」的过渡表现——交互唤醒语义不完整，弃。

**B：修 refresh 的 `isActive` 判定（把用户交互计入活跃）。** refresh 消费 Node half activity，用户交互是 client 本地事件，跨层耦合且 3s 轮询延迟——交互时应即时醒觉，弃。

## Consequences

- `sleep → drag → 放下` 现在走 `idle 缓冲 → wake（3s）→ 底层状态`，不再立即回 sleep；feed/play 播完、菜单关闭后同理保持清醒。
- 纯 client 层修复：重装 + 刷新即可生效，无需重启 web（不涉及 Node half）。
- 测试面：新增 `wakeFromInteraction` 单测（醒着/睡着两条）+ 集成测试（放下缓冲过期后不回 sleep、feed/play 播完不回 sleep，含旧行为对照断言）。
