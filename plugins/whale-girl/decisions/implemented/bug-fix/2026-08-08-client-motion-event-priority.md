# Decision: client 动画事件优先级与游走交互修复

Status: implemented

## Problem

游走状态在任务事件和互动之前被选择，会遮住 celebrate/error/working/eat/play 等反馈；游走结束后没有重新排程；pointerdown 即进入 dragging，普通点击会短暂显示拖拽姿势。

## Decision

- 状态优先级固定为拖拽 > 事件 burst > 瞬发互动 eat/play > wake > working > joy > sleep > walk > idle；临时覆盖结束后重新计算底层状态。
- pointerdown 只记录按压，越过 6px 阈值后才进入 dragging；点击不改变拖拽动画。
- 游走停止时重新排程下一次游走，睡眠或拖拽中断后也能恢复周期。
- `pickState` 将缺省 transient 视为无瞬发状态，兼容调用方未显式传 `null` 的输入。
- `wake` 使用独立的 3000ms 窗口；非循环 wake sheet 播完后保持末帧，直到窗口到期再回到底层状态。
- `idle` 三帧采用往返播放 `0→1→2→1→0`，避免待机循环从半睁直接跳回睁眼造成突变。
- `walk` 同样采用往返帧播放；游走起点正确保留 `x=0`，避免左边界被误判为缺省位置。
- 每轮游走开始时即时刷新 sprite 的 `scaleX`；即使状态仍为 `walk`，新方向也不会沿用上一轮朝向。
- 拖拽越过阈值后按连续横向位移更新 `scaleX`，中途反向立即翻转 drag sprite。
- 状态卡默认紧凑地显示在宠物下方且不自动上翻，避免遮挡角色；舞台状态切换只保留当前 sprite 或 emoji，互动特效留在独立 effects 层，避免残影。
- 状态卡与菜单均相对固定 110px 舞台绝对定位；菜单打开时显式隐藏状态卡，避免菜单参与流式布局或两层同时遮挡角色。

## Alternatives considered

**让 walk 保持高优先级。** 会使反馈事件不可见，违背事件驱动宠物的核心目的，弃。

**pointerdown 立即进入 dragging。** 点击和拖拽无法区分，弃。

## Consequences

任务完成/失败和喂食/玩耍反馈不会被游走覆盖，普通点击不会闪现拖拽姿势；游走成为无其它反馈时的背景行为。
