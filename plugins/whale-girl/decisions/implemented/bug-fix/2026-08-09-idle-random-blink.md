# Decision: idle 随机眨眼——固定循环改随机节奏，删除 idlePauseMs 配置

Status: implemented

## Problem

手测反馈：idle 时宠物不断循环播放眨眼（重复眨眼），节奏机械。根因：idle 帧推进是「固定往返循环（0→1→2→1→0）+ 固定暂停」（`idlePausedUntil` + `idlePauseMs` 3500ms）——眨眼频率与间隔完全固定，与 walk/working 的随机节奏不协调。这也是 v3「调度决策纯函数化」遗留的最后一块：idle 眨眼仍在 tick 闭包里用固定参数硬编码，无随机性、不可单测。

## Decision

- **idle 改随机眨眼**：常态保持帧 0（睁眼静止），`nextBlinkAt({ now, random })` 纯函数决策随机触发时刻（间隔 3-9s），到点播一次眨眼（帧 0→1→2→0），播完回帧 0 静止再排下一次。
- **删除 `idlePauseMs` 配置**（`src/config.mjs` DEFAULTS + schema、client `CFG_DEFAULTS`、verify-config-sync 自证测试同步移除）——固定暂停机制不再存在，配置项失去意义（语义层常量 BLINK_MIN/MAX_INTERVAL_MS 代码级，进不得配置，同 WORKING_*）。
- **manifest `idle.loop` 改 false**：数据语义与实现一致（非循环眨眼，播完静止），不再误导「idle 是循环动画」。
- 沿用 v3 纪律：随机决策在纯函数（注入随机源、可单测），index.mjs 薄执行；`setState` 重进 idle 时重置眨眼排程。

## Alternatives considered

**A：保留固定暂停，只调大 `idlePauseMs`。** 治标——眨眼仍是固定节奏，只是更慢；「随机」诉求未满足，且配置项语义变成「眨眼间隔」而非「帧停顿」，名不副实——弃。

**B：idle 走 motion 配方（CSS 动画随机）。** motion 白名单只允许 `frames:1` 单帧态（门禁强制），idle 是 3 帧 sprite；CSS 无法表达「随机间隔的一次性眨眼」，且需新增 motion 种类扩白名单——弃。

## Consequences

- idle 眨眼随机（3-9s 间隔），常态睁眼静止，不再固定循环——与 walk/working 的随机节奏一致。
- `idlePauseMs` 从配置面删除（config-sync 门禁随两处同步自动守护一致性）；行为节奏类参数（BLINK/WORKING）统一为 L2 语义层代码级。
- 测试：新增 `nextBlinkAt` 确定性测试（注入随机源，区间边界）；单测 101 条全绿，14 门禁全过。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
