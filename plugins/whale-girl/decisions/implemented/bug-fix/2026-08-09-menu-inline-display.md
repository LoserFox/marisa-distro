# Decision: 菜单显示改内联 display——toggleMenu 不再依赖 CSS 类

Status: implemented

## Problem

用户反馈：点击宠物打开菜单后，无法触发「喂食/玩耍」等按钮。排查：interact 逻辑正常（JS 直接 `.click()` 触发 eat 动画 + 气泡），真实点击按钮坐标无效。根因：**菜单容器创建时内联了 `display: none`（`menu.style.cssText`），但 `toggleMenu` 只用 `classList.toggle('open')` 切类**——`.pet-menu.open { display: flex }` 是 CSS 类规则，**内联 `display: none` 优先级永远高于类规则**，菜单打开后 display 仍为 none（CDP 实测：class=open 但 computed display:none）——按钮从未显示，自然点不到。这是「宿主可能覆盖 CSS 注入」的同类问题（状态卡/菜单按钮/hitarea/sprite 均需 JS 内联），菜单容器的显示状态漏了内联。

## Decision

- **toggleMenu 显式切换内联 display**：`menu.style.display = next ? 'flex' : 'none'`（与 class 同步）——内联是权威，不依赖 `.pet-menu.open` 类规则（可能被宿主清理，且内联 none 压过类）。
- 其余交互沿用既有模式：hitarea/sprite/状态卡关键样式均 JS 内联（见 [hitarea-follows-state](2026-08-09-hitarea-follows-state.md) 决策）。

## Alternatives considered

**A：删掉创建时的内联 display:none，只靠类规则。** 若宿主清理 CSS 注入，菜单无初始隐藏（会常驻显示）；且与「关键样式内联」策略相悖——弃。

**B：用 hidden 属性/aria-hidden 控制。** 语义更佳但与现有 class 状态判断（layoutStatus 等用 `classList.contains('open')`）耦合，改动面大——弃。

## Consequences

- 菜单打开时 display:flex（内联），按钮可见可点；关闭时 none。CDP 实测：菜单 rect 211×57、display:flex。
- 教训补充：所有「显示/隐藏」切换若容器有内联 display，toggle 必须同步内联（不能只切类）——宿主 CSS 覆盖问题的统一规避。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
