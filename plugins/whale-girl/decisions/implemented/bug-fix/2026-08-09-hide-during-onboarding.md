# Decision: onboarding 向导激活时宠物隐藏——精确 id 判定

Status: implemented

## Problem

用户要求：onboarding（DSH 新手引导向导）激活时宠物不应显示。现状：syncInert 只检测 `[role="dialog"]`（降为 inert 半透明），不检测 onboarding——当初为规避误伤隔离站欢迎页而移除了宽泛的 `[class*="onboarding"]` 子串检测（该子串会匹配任何类名含 onboarding 的元素，误伤面过大）。

## Decision

- **onboarding 判定用精确 id**：`document.getElementById('deepseek-onboarding-title')` 或 `[aria-labelledby="deepseek-onboarding-title"]`——DSH 向导页面标题的唯一标识，避免宽泛类名误伤。
- **onboarding 激活 → 宠物隐藏**（`data-dsh-pet-hidden` + **内联 `display: none`**）：属性与内联样式双保险——CSS 规则 `[data-dsh-pet-hidden]{display:none}` 可能被宿主清理（实测：属性已设但 display 仍 block），内联 display 是权威。
- **dialog 打开 → 仍 inert**（半透明、不挡点击，原有逻辑保留）。
- 优先级：onboarding > dialog > 正常（onboarding 时隐藏优先，dialog 时 inert）。

## Alternatives considered

**A：宽泛 `[class*="onboarding"]` 检测。** 误伤面大（任何类名含 onboarding 的元素都会触发隐藏，包括无关 UI）——当初即因此移除——弃。

**B：onboarding 时也 inert（半透明）。** 半透明宠物仍可见，会干扰向导视觉焦点；用户明确要「不显示」——弃。

**C：只设 data-dsh-pet-hidden 属性。** 实测属性生效但 CSS 规则被宿主清理后视觉仍显示——隐藏必须内联 display（同「宿主 CSS 覆盖」系列规避）——弃。

## Consequences

- CDP 实测：onboarding 激活时宠物 `data-dsh-pet-hidden`=true 且**内联 display:none**（真正隐藏）；dialog 逻辑保留。
- 判定基于 DSH 向导标题 id——若 DSH 改版移除该 id，检测失效（宠物恢复显示），需跟进宿主 DOM 变化。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
