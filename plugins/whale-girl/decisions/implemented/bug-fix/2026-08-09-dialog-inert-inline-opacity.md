# Decision: dialog inert 半透明内联 opacity——宿主 CSS 覆盖系列扫描收尾

Status: implemented

## Problem

系统性扫描「宿主 CSS 覆盖」类 bug（CSS 注入的 style 标签可能被宿主清理/覆盖，属性设了但视觉不变）。CDP 实测逐项验证后发现一个遗留：`[data-dsh-pet-inert] { opacity: .25 }` 类规则**失效**（设 data-dsh-pet-inert 属性后 opacity 仍 1）——dialog 打开时宠物 inert 半透明不生效。

## Decision

- **syncInert 的 dialog 分支内联 opacity**：`host.style.opacity = '.25'`（dialog 打开时），恢复时清空——与 onboarding 的 `display: none` 同款内联规避（CSS 类规则可能被宿主清理，内联是权威）。
- 三态全部内联：onboarding → `display:none`；dialog → `opacity:.25`（+属性 data-dsh-pet-inert 保留兼容）；正常 → 清空内联。

## 扫描结果（2026-08-09 全量）

CDP 实测每个只靠 CSS 类的元素：

| 元素 | 状态 |
|---|---|
| host 定位（fixed/right/bottom/z-index） | ✅ 实测生效（style 标签在） |
| motion keyframes（bob/float 等） | ✅ 实测生效（animationName=dsh-pet-m-bob） |
| stage pointer-events:none | ✅ 实测生效 |
| status 贴边变体（left/right/above） | 🟠 低风险：布局微调类，失效仅不贴边翻转（非交互） |
| dialog inert opacity | 🔴 本轮修复（实测失效） |
| 其余（status/menu/hitarea/sprite/effects/heart/bubble/host hidden） | ✅ 已内联（历史修复） |

## Alternatives considered

**A：把所有 CSS 类全量改 JS 内联（含 motion/贴边变体）。** 实测 motion keyframes 与 host 定位均生效，无需防御；全量内联会让代码维护成本高且 keyframes 无法内联（需 Web Animations API 重写 9 个 motion）——只内联「实测失效」与「交互关键」项——弃。

## Consequences

- dialog 打开时宠物半透明（内联 opacity:.25）——与 onboarding 隐藏同样可靠，不依赖 CSS 类。
- 扫描闭环：所有「属性设了但视觉不变」的宿主覆盖点已内联；motion/定位实测正常不动。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
