# Decision: Sprite 视觉升级 + dsh 事件驱动动画

Status: implemented

## Problem

宠物当前用 Unicode 表情符号（🐣）渲染。用户要求换成真实图片角色（表情包"鲸鱼娘"，透明 PNG），配丰富动画，并要求动画能对应 dsh 事件（agent 工作、任务完成通知、出错等）。`/plugins` 路由只服务 `<id>/client.js`（及 .map），任意静态文件不可达——图片不能直接放插件目录被浏览器 fetch。

## Decision

- **资产管线**：`assets/` 目录存 sprite sheet（**每状态一张横排帧图**，透明背景，PNG/SVG/WebP 均可）；Node half 注册 `/plugins/vlln/dsh-pet/assets` **前缀路由**静态服务（`src/assets.mjs` 做路径净化防目录穿越 + 按扩展名给 MIME）；`assets/manifest.json` 声明 `states`：状态 → `{ sheet, frames, fps, loop }`。
- **帧播放器**：client half 按 manifest 预加载 sheet（Image 记录自然尺寸），`.pet-sprite` 元素用 background-position 按帧循环；非 loop 状态播完自动回到派生状态。
- **状态选择优先级**（客户端）：`drag`（拖拽中）> 瞬发 `eat`/`play`（喂食/玩耍动作，播一次）> burst `celebrate`/`error`（until 窗口内）> `working`（agent 工作）> `sleep`（长时空闲）> `hungry`/`sad`（属性驱动）> `idle`。
- **事件驱动**：Node half 从 `ctx.tasks` 派生活动状态（`src/activity.mjs` 纯函数）：存在 running/stopping 任务 → `working`；任务 running→completed/killed 翻转**或任务消失** → `celebrate` burst（6s 窗口）；running→failed → `error` burst；`agent/request-error` 事件 → `error` burst。`state` 路由返回 `activity: { name, until }`，客户端 3s 轮询消费。
- **emoji 兜底**：sheet 缺失/未加载时用表情符号渲染——增量替换，图没齐宠物照常工作。当前 `assets/manifest.json` 仅含 `idle`（`idle.svg` 占位 sheet 演示管线），其余状态由用户生图后按 README 契约补入。
- 宿主事件只观察（`ctx.on`），不改官方树；`pet-state.mjs` 保持纯函数不动（activity 是派生字段，不写入宠物状态）。

## Alternatives considered

**data URL 内联进 bundle。** `/plugins` 不服务静态文件，内联可绕过；但 sprite 更新要重建 bundle、加载慢、bundle 膨胀。落败 → assets 前缀路由（浏览器可缓存，图可增量替换）。

**推送式（connection 通道）。** 实时性更好，但引入平台模块依赖、改变构建契约；3s 轮询对动画状态足够（burst 窗口 6s 覆盖 ≥2 次轮询）。落败 → 保持轮询。

**只做静态动画不做事件驱动。** 满足不了用户"对应 dsh 事件"的需求。落败。

## Consequences

- 资产是**输入物**（用户/AI 生成），非构建产物——不做 `--check` 守护；manifest↔文件一致性由 `verify-assets` 门禁守护（引用的 sheet 必须存在）。
- 生图契约（用户侧）：透明背景、每状态一张横排帧图、帧等宽同高、风格一致（以 `originals/鲸鱼娘.png` 为参考）；推荐先出角色设定图锁定风格再扩展。
- 事件动画的实时性受轮询粒度限制；burst 窗口机制保证 6s 内可感知。
