# Decision: 混合素材管线——关键姿势生图 + 过程动画

Status: implemented

## Problem

素材生成面临路线选择。多帧 sprite sheet（AI 逐帧生图）有三大硬伤：①12 状态 × 2~4 帧 ≈ 35 张图，AI 无法保持角色一致；②帧必须等宽同高、角色位置不漂移，AI 帧间会抖；③多数模型默认实底需抠图。纯代码动画流畅但做不出姿势变化。用户使用 gpt-image-2/Gemini 生成。

## Decision

**混合管线**：**关键姿势生图 + 过程动画 + PIL 切分**，已实现并 spike 验证：

- **生图契约**：单张 2K 大图含 12 个关键姿势子图（4×3 网格、行优先顺序、互不重叠格间留白）。**背景必须纯色**（洋红/绿等角色不含的饱和色）——白/灰底与角色肤色不可分（实测"苍白"），"透明背景"提示会让 Gemini 画假透明棋盘格（灰/白两色，同样抠不净）。
- **切分（`scripts/slice-sheet.py`，PIL）**：`--grid 3x4` 按声明网格切子图，每片裁透明边距 → 居中补边 → 统一 256×256；位置→状态映射由 `--layout` 行优先声明（本机无视觉识别，按位置映射）。抠图三模式：`--key R,G,B`（纯色底，推荐）、`--key gray`（假透明棋盘格，灰度角色皮肤会失真，需 `--repair` 硬化 alpha 救回，不推荐）、`--auto` 网格探测。
- **动画（client）**：manifest 每状态可选 `motion` 字段；`frames: 1` 的单图状态走 CSS 运动配方（bob/wiggle/squash/shake/sigh/hop/tilt/float/wave，挂在舞台元素上避免与 sprite 内联 scale 冲突）；`frames > 1` 仍走帧播放器（tick 只在 frames>1 时推进帧，单图不推进避免闪空白）。多帧播放器保留。
- **spike 验证（当前切片，皮肤失真可接受）**：12 张切片投放 + 浏览器冒烟通过（`verify-client-smoke.mjs`：client apply 成功、sprite 渲染）；web 无 plugin tree 崩溃。

## Alternatives considered

**坚持多帧 sprite sheet。** AI 帧对齐/一致性不可控，动画会抖。落败。

**纯代码动画（零生图）。** 表现力不足——做不出姿势变化。落败。

**透明背景生图。** Gemini 只会画假透明棋盘格；灰度角色 + 灰白棋盘格在颜色上不可分（皮肤被键成半透明）。落败 → 纯色背景。

**实底 + 智能抠图（rembg 等）。** 引入额外依赖与不确定性；纯色底色键是确定性的。落败（必要时可回退）。

## Consequences

- 皮肤失真（"太苍白"）是灰度角色 + 灰度底键抠的固有问题，已用纯色背景契约规避；spike 版切片（失真）待纯色底重生成图替换。
- `assets/raw/` 是生图暂存区（gitignore）；`assets/<状态>.png` 是随插件分发的提交物，由 verify-assets 门禁守护引用。
- client 渲染层 = 帧播放器（frames>1）+ 运动层（frames:1 motion），两路并存；运动配方与 manifest.motion 是一对一契约（改配方必须同步 spec）。
