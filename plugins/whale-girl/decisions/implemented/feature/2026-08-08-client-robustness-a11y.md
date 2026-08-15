# Decision: client half 可访问性与健壮性批次（a11y / reduced-motion / 外部关闭 / 位置持久化 / 弹窗感知）

Status: implemented

## Problem

审查 P1 批次：client half 只有鼠标交互——无键盘/aria（键盘与读屏用户无法打开菜单）、`prefers-reduced-motion` 未尊重、菜单无法外部关闭（Esc/点击外部）、后台标签回前台时状态陈旧（轮询被节流）、拖拽位置刷新即丢失、宠物层 z-index 高于 DSH 全部浮层（打开弹窗时遮挡内容并拦截点击）。

## Decision

- **a11y**：host `role="group"` + `aria-label` + `aria-expanded`；stage `role="button"` + `tabindex="0"`，Enter/Space 切换菜单；`focus-visible` 焦点样式。菜单开关统一走 `toggleMenu(open)`（同步 aria-expanded）。
- **reduced-motion**：`@media (prefers-reduced-motion: reduce)` 关闭 bob/爱心漂浮/气泡动画。
- **外部关闭**：document `pointerdown`（目标不在 host 内）与 `Escape` 关闭菜单。
- **回前台刷新**：`visibilitychange` 且 visible 时立即 `refresh()`。
- **位置持久化**：拖拽结束写 `localStorage['dsh-pet:pos']`，启动恢复（非法/损坏数据忽略回退默认），窗口 resize 时重新 clamp 进视口。
- **弹窗感知**：MutationObserver 监听 body，出现 `[role="dialog"]` 时给 host 加 `data-dsh-pet-inert`（opacity .25 + pointer-events none），弹窗消失恢复——不猜 z-index，对官方 UI 演进免疫。

## Alternatives considered

**z-index 直接压过弹窗或改小。** 猜值会随官方 UI 演进失效——dialog 感知（DOM 事实）更稳。

**仅加 role/aria 不加键盘操作。** 半套 a11y 无意义——键盘路径与语义必须成套。

**位置不持久化。** 刷新回弹是明显体验缺陷；localStorage 零成本。

## Consequences

- 键盘/读屏可用；动效尊重系统设置；菜单有明确关闭路径；弹窗不遮挡；位置刷新保留。
- 新增监听器/观察者全部在 disposer 清理（disable 无残留）。
- 已知未覆盖：多标签位置/菜单同步（BroadcastChannel，可选后续）。
