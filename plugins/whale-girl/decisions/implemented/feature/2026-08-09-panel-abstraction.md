# Decision: 公共面板抽象——状态卡/气泡/菜单统一样式与生命周期

Status: implemented

## Problem

状态卡、气泡、菜单三个「相对角色的浮层面板」样式不统一：背景三套（rgba(27,30,40,.94)/rgba(20,20,28,.85)/rgba(20,20,28,.72)）、圆角两套（10px/8px）、字体两档（11px/12px）、边框/阴影有的有有的无——视觉割裂，且每处样式各自内联重复。用户要求抽象统一。

## Decision

- **`createPanel` 公共工厂**（v6）：统一面板基调（`PANEL_THEME`：背景 rgba(24,28,38,.94)/圆角 10px/字体 11px/文字色/阴影单一来源），参数化：
  - `anchor`：`below`（状态卡/菜单，角色下方）/ `above`（气泡，角色上方）
  - `variant`：`solid`（状态卡：+边框+阴影+blur）/ `plain`（气泡/菜单：纯背景）
  - `offsetY`/`zIndex`/`display`：定位偏移/层叠/初始显示
  - 返回 `{ el, show, hide }`（内联 display 控制，防宿主清理）
- **三面板改用 createPanel**：状态卡（solid/below/offset 18/z 1，含子元素与贴边变体）、菜单（plain/below/z 4，按钮子元素）、气泡（plain/above/offset 8/z 3，Web Animations 动画）。
- **状态卡贴边/翻转改内联**：`layoutStatus` 内联设置 left/right/top/bottom/transform（原 CSS 类 left/right/above/hidden 删除——类无法覆盖内联定位，且可能被宿主清理）；`pet-status-above` 类仅保留控制 `::after` 连接尾方向（伪元素无法内联）。
- **状态卡始终居中**（v6 修订）：去掉左右贴边逻辑——状态卡恒 `left:50% + translateX(-50%)` 以角色中心对齐（用户确认：宠物在视口边缘时卡轻微溢出可接受，max-width 缓解）；仅保留「贴底翻转」（宠物贴视口底部时卡翻上方，防底部溢出/被裁）。
- **子元素样式全面统一**（v6 修订）：所有面板内文字统一主色 `#E8EBF2` + 字体 11px——菜单按钮从 12px/纯白改 11px/#E8EBF2；状态卡 stats/note 从次级灰 #AEB6C4 改主色；仅保留 lv 徽章蓝高亮（功能性区分等级）。PANEL_THEME 移除 sub（不再有次级文字）。
- **状态卡显隐加 `statusForcedHidden` 标志**：气泡/拖拽/菜单打开时 true（hover 不显示），替代原 `pet-status-hidden` 类判断——修复「hover 状态卡不显示」回归（初始 hidden 状态下旧判断恒假）。

## Alternatives considered

**A：仅小幅对齐（圆角/字体）。** 用户选 B（公共组件抽象）——小幅对齐治标，样式仍三处重复内联，后续调整需改三处——弃。

**B：CSS 变量统一基调。** CSS 变量同样依赖 CSS 注入（宿主可能清理）——内联是权威（系列决策教训），PANEL_THEME 常量 + 工厂内联注入——弃。

## Consequences

- 三面板背景/圆角/字体/阴影统一（CDP 实测均 rgba(24,28,38,.94)/10px/11px）；调整一处（PANEL_THEME）全局生效。
- 面板定位/显隐全部内联（防宿主清理）；新增面板用 createPanel 零重复。
- 状态卡 hover/贴边翻转/菜单/气泡功能回归验证通过（CDP）。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
