# Decision: 浏览器冒烟加固（元素级断言 + 重试）与真图端到端验证

Status: implemented

## Problem

用真图 + spec 的 12 态 manifest（frames:1 + motion）做端到端渲染测试时，冒烟脚本误报失败：其字符串断言吃 CSS 选择器（`[data-dsh-pet]`）与模块源码的假绿；`<div data-dsh-pet=""` 属性带 `=` 未被元素正则匹配；且虚拟时间下资源加载时序不稳定（单次 dump 可能过早）。

## Decision

- **冒烟加固**（scripts/verify-client-smoke.mjs）：
  - 元素级断言：`<div data-dsh-pet[=> ]`（区分 CSS 选择器）、`<span class="pet-lv"`（apply 走完渲染管道）、舞台 sprite 元素含 `background-image`（而非仅 class 字符串）。
  - 失败重试：最多 3 次 dump（`--virtual-time-budget=15000`），任一绿即过——吸收虚拟时间下的加载时序抖动。
- **真图端到端验证结果**（临时在站内写入 spec manifest + 真切片，验证后恢复）：`idle.png` 真图渲染（256px 缩至 0.586≈150px）、`pet-motion-bob` 运动类生效、状态条显示真实账本回忆（「新会话开启（第 3 个）」）、菜单正常——client 的 sprite 帧播放器 + motion 配方对 spec 投放的 12 态 manifest 全部就绪。

## Alternatives considered

**仅调大虚拟时间预算。** 解决不了断言假绿（字符串匹配 CSS）与元素正则漏配——断言语义修正才是根治。

**不重试。** 虚拟时间下资源加载的时序抖动会让工具偶发误报，重试是低成本吸收。

## Consequences

- 冒烟对「CSS 假绿 / 元素漏检 / 时序抖动」三类误报免疫；真图与 motion 路径被实证可用。
- 已知边界：冒烟断言渲染存在，不断言动画实际播放（CSS 动画需人工/视频级核验）；站内真图测试为临时注入，已恢复原 manifest。
