# Decision: client half 交互修复批次（transient 复位 / pointer 语义 / 悬浮定位）

Status: implemented

## Problem

五路并行审查（交互、状态驱动、Node half、sprite 就绪、机制契约）在 client half 发现一组交互缺陷，其中两项是阻断性的：瞬发 eat/play 表情在 sheet 缺失时永不复位（点一次喂食/玩耍宠物永久锁死在 😋/🎾）；pointerdown 无条件 setPointerCapture 导致菜单按钮的 click 派发失效且 pointerup 先关菜单。另有多项小缺陷（浅色主题菜单对比度、position 覆写、触屏悬挂、sprite 迟到不换肤、happy 不可达）。

## Decision

- **瞬发动画复位改为超时驱动**：`transientUntil = Date.now() + TRANSIENT_MS(1500)`，tick 里到点必清；非循环 sheet 播完仍可提前复位。与 sheet 是否存在解耦——"sheet 缺失用 emoji 兜底"的增量投放路径不再卡死。
- **pointer capture 延迟到越过拖拽阈值**：纯点击不捕获，菜单按钮 click 正常派发；pointerup 的菜单 toggle 加 `!e.target.closest('button')` 守卫（点按钮不关菜单）；补 `pointercancel` 复位与 CSS `touch-action: none`。
- **恢复悬浮定位**：删除 `host.style.position = 'relative'`（它覆写了 CSS 的 fixed），宠物重新钉在视口右下角。
- **sprite 迟到换肤**：`showingSprite` 标记当前呈现方式，tick 里 sheet 加载完成后对当前状态强制换 sprite。
- **happy 状态接线**：`pickState` 增 `mood >= 80 && hunger < 40` → `happy`（此前 EMOJI/README 有 happy 但永不返回，用户按 README 画了 happy sheet 不会播）。
- **菜单对比度**：`.pet-menu` 补与 `.pet-status` 相同的深色半透明背景，浅色主题下按钮可见。
- **纯逻辑抽取**：`pickState`/`EMOJI`/`TRANSIENT_MS` 移入 `client/logic.mjs`（无 DOM 引用），`tests/client-logic.test.mjs` 覆盖状态优先级、burst 窗口、happy 边界、确定性。

## Alternatives considered

**瞬发动画仅靠非循环 sheet 播完复位（原实现）。** 在 eat/play 无 sheet 时（manifest 只有 idle）复位逻辑永不执行——正是这个缺陷本身，弃。

**无条件 setPointerCapture（原实现）。** 使菜单按钮 click 失效且点击即关菜单——弃；capture 只在拖拽开始后启用。

**从 EMOJI/README 删除 happy。** 回避了"不可达"但丢掉了"心情好"这一状态机天然可派生的行为，且用户已按 README 规划绘制 happy——接线而非删除。

## Consequences

- 主交互路径（喂食/玩耍/菜单）在 sheet 缺失与浅色主题下都可用；触屏拖拽不再悬挂。
- sprite 增量投放语义更稳：任何状态在任何加载时机下都能从 emoji 平滑换到 sprite。
- client 纯逻辑现在可单测（8 条新用例），交互行为有回归保护。
- 已知未覆盖（后续批次）：a11y（键盘/aria）、`prefers-reduced-motion`、菜单外部关闭、弹窗感知（z-index 遮挡）、默认位置与输入区冲突——见审查综合的 P1/P2 清单。
