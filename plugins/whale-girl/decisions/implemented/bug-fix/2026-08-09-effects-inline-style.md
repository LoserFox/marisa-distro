# Decision: 特效层（effects/爱心/气泡）关键样式 JS 内联——修复裸样式与角色顶开

Status: implemented

## Problem

用户反馈两个 bug：① 爱心/气泡/完成任务提示等**裸样式**（无背景/定位/动画）；② 这些文字出现时**把角色「顶」到下面**（向下偏移）。根因同「宿主覆盖 CSS 注入」系列：`effects`/`pet-heart`/`pet-bubble` 的 CSS 类规则（`position: absolute` 等）被宿主清理——effects 变 `static` 参与文档流，heart/bubble 成为文档流元素，把 sprite（绝对定位）挤到下方；且 heart/bubble 无内联样式，显示为裸文本。

## Decision

- **effects 层内联关键定位**：`position: absolute; left:0; top:0; width/height: var(--pet-size); pointer-events:none; overflow:visible; z-index:2`——特效层保持覆盖角色，不参与文档流。
- **heart 内联关键样式**：`position: absolute; font-size:20px; pointer-events:none; line-height:1; left/top; z-index:3`；**动画改 Web Animations API**（`heart.animate`：上浮+放大+淡出）——不依赖 CSS 注入的 keyframes（宿主清理后爱心变静态）。
- **bubble 内联关键样式**：`position: absolute; left:50%; top:-8px; transform:translate(-50%,-100%); background/color/font/padding/border-radius; white-space:nowrap; pointer-events:none; z-index:3`——**定位到角色上方**（气泡底部贴角色头顶）；**动画改 Web Animations API**（淡入上浮，帧内含 translate(-50%,…) 保持居中）。
- 沿用既有模式：所有参与文档流/定位的元素关键样式 JS 内联（status/menu/hitarea/sprite/effects/heart/bubble），不依赖 CSS 注入（宿主可能覆盖/清理 style 标签）。

## Alternatives considered

**A：把 keyframes 也搬进 JS（插入 style 元素动态重建）。** 动画失效但位置/样式正确；keyframes 重建成本高且与 CSS 注入同生命周期（同一 style 标签被宿主清理则同样失效）——改用 Web Animations API（`element.animate`）彻底脱离 CSS 注入，宿主无法清理——弃。

## Consequences

- CDP 实测：气泡出现后 sprite 位置 (0,0) 不变（不再顶开）；effects 保持 absolute 覆盖层 (0,0,110×110,z:2)；**气泡 absolute 定位角色上方 (y=-33)，动画挂载（getAnimations()=1）**；**爱心动画恢复（getAnimations()=1）**。
- 动画不再依赖 CSS 注入（Web Animations API），宿主清理 style 标签不影响爱心/气泡动画。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
