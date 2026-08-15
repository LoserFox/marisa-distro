# Decision: sprite 空舞台 bug 修复 + 浏览器冒烟脚本

Status: implemented

## Problem

headless Chrome 对验证站做浏览器级检查时发现：舞台（.pet-stage）为空，宠物脸不可见。根因：`showSprite` 用 `stage.textContent = ''` 清空舞台子节点——这把创建时 append 的 sprite div 一并摘出 DOM，随后对**已脱离 DOM 的节点**设置 background-image 等样式，白忙一场。emoji 兜底路径不受影响（textContent 直接写文本），掩盖了该 bug；自 v1 sprite 系统引入（01c0869）起即存在。curl 验证（bundle 200 + boot graph）覆盖不到此面——这是 P6 验证缺口在 dsh-pet 的实操实证。

## Decision

- **修复**：`showSprite` 改 `stage.replaceChildren(sprite)`——清掉 emoji 文本等其它子节点，同时确保 sprite 在 DOM 中（若被 emoji 路径摘出则重新挂回）。
- **浏览器冒烟脚本**：新增 `scripts/verify-client-smoke.mjs <web-url>`——headless Chrome（`--virtual-time-budget` 让 boot 完成）dump DOM，断言：无 `Failed to load plugins`、`[data-dsh-pet]` 存在、舞台有可见内容（`.pet-sprite.ready` 或 emoji）。非门禁（依赖 Chrome 与运行中 web），列为 client 改动的验证步骤（AGENTS.md 按改动面选检查）。

## Alternatives considered

**`textContent=''` 后再 `stage.appendChild(sprite)`。** 两步操作与 replaceChildren 等价；一步更不易再错。

**不修，依赖 emoji 兜底。** 放弃 sprite 渲染——manifest 引用的 sheet 一旦存在就走 sprite 路径，舞台恒空，与"丢图即用"承诺直接冲突。

## Consequences

- sprite 在真实浏览器中渲染（headless 证实 idle.svg 播放中，帧位推进正常）；emoji 兜底仍可用。
- client 改动多一步浏览器冒烟验证（补上 curl 覆盖不到的 client-apply 面）。
- 已知限制：冒烟断言渲染存在，不断言交互行为（拖拽/菜单需人工或 CDP 级测试）。
