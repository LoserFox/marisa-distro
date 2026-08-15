# Decision: 点击热区跟随当前状态——逐状态 bbox 取代全状态并集 + 首帧 bbox 修正

Status: implemented

## Problem

六轮问题。**第一轮**：热区由 `contentBox`（全部状态不透明像素并集）驱动，被宽幅状态撑到 88×97px。**第二轮**：改逐状态后仍「大片空白可点击」——`analyzeSheet` 扫描**整张 sheet**，多帧 sheet 把第 2..N 帧内容跨度计入 bbox（w=0.925），热区被撑到 sheet 全宽。**第三轮**：交互事件绑在 stage（110×110 全尺寸），hitarea 收窄后 stage 四周透明仍暴露可点。**第四轮**：sprite 是 256px 布局盒 transform 仅视觉缩放，溢出 stage 73px/侧，sprite 无 `pointer-events: none` 拦截事件。**第五轮**：hitarea 的 CSS 类规则被宿主清理（position:static 掉出文档流），整个 pet 无交互点。**第六轮（用户精确描述：可交互区在角色左上角空白、素材区不可交互）**：CDP 实测 sprite 视觉位置 (1387,704) vs host (1314,631)——**sprite 布局盒（256px）未居中于 stage**（grid place-items 对齐未作用或宿主覆盖），`transform: scale(0.43)` 以布局盒中心为原点，视觉内容整体偏移 (73,73)，与 hitarea（内容 bbox 定位）错位 61px——交互区与素材区分离。

## Decision

- **sprite 内联绝对定位居中**：`position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(...) scaleX(flip)`（JS 内联 cssText）——不依赖 stage 的 grid place-items（宿主可能覆盖 CSS 注入），translate(-50%,-50%) 以自身中心为原点，视觉恒居中于宿主，与 hitarea 内容 bbox 定位严格对齐。applyFacing 同步。
- **hitarea 关键样式 JS 内联**：`position: absolute; cursor: grab; touch-action: none; z-index: 3` 创建时内联。
- **sprite 设 `pointer-events: none`** + **交互统一由 hitarea 承载**（5 个 pointer 事件改绑 hitarea，stage 禁指针）。
- **热区逐状态 bbox** + **analyzeSheet 只取首帧** + **热区按内容实际位置对齐（flip 镜像）** + **cursor 移到 hitarea**。
- 素材本身不动（0 边界会破坏「帧等宽同高 + background-position 切帧」契约，且 88% 内容占比给动画留呼吸空间）。
- 热区尺寸保留 `Math.max(40, ...)` 下限。

## Alternatives considered

**A：素材内容占比加大（88%→95%+）重切素材。** 收益有限——walk 的 55% 宽幅是动作帧横排的固有形态（不是透明边缘），加大占比只是把 61→64px；需重跑素材管线——弃。

**B：素材真 0 边界（裁透明后重排）。** 每帧裁边后帧不等宽，破坏「PNG 宽 = frames × 高度」契约与帧播放器（background-position 按等宽切）——需重构播放器为变宽帧，成本高风险大——弃。

**C：热区保留并集但缩小（乘系数）。** 无状态感知，walk 时仍偏大；且角色轮廓不规则，乘系数不可靠——弃。

**C：热区保留并集但缩小（乘系数）。** 无状态感知，walk 时仍偏大；且角色轮廓不规则，乘系数不可靠——弃。

## Consequences

- sprite 视觉恒居中于宿主（内联 translate 定位），与 hitarea 内容 bbox 严格对齐——交互区与素材区重合，无错位。CDP 实测 sprite (1314,631) = host，hitarea (1326,645) 贴合内容。
- 交互统一由 hitarea（关键样式 JS 内联防宿主清理）承载：CDP 实测点击热区开/关菜单、拖拽移动正常；walk 热区 101.7→61px。
- 教训：CSS 注入的 style 标签可能被宿主覆盖/清理——所有承载交互与视觉定位的元素（status/menu/hitarea/sprite）关键样式必须 JS 内联，不能只靠 CSS 类。
- 每个状态自身的透明边缘（内容占比 88% 契约）仍让热区略大于角色轮廓——属预期（素材契约给动画留空间），非缺陷。
- 纯 client 改动：重装 + 刷新生效，无需重启 web。
