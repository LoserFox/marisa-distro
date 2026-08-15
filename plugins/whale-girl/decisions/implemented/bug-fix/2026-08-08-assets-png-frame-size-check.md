# Decision: verify-assets 加 PNG 多帧尺寸校验——单姿势图配 frames>1 会被劈开

Status: implemented

## Problem

真图端到端验证时发现：`assets/raw/slices/` 的切片是**单姿势 256×256 透明图**（像素分析：内容跨 40-216px、两侧透明、中缝无分界），而 spec 的 manifest 模板把 eat/play 声明为 `frames: 2`。若按此投放，帧播放器 frameW = 128，frame 0 显示姿势左半、frame 1 显示右半——**单个姿势被劈成两半**，动画明显损坏。verify-assets 此前只校验文件存在/字段合法，抓不到这种"图与帧数不匹配"。

## Decision

- **verify-assets 加 PNG 多帧契约校验**：`frames > 1` 的 PNG sheet 必须满足 `宽度 = frames × 高度`（横排帧图、帧等宽同高、帧间无间距——spec 契约）。单姿势 256×256 配 frames:2 → 256 ≠ 512 → 拒绝，错误信息提示"单姿势图勿配 frames>1"。
- **无依赖 PNG 尺寸读取**：解析 IHDR 的宽高（readUInt32BE），非 PNG（SVG/WebP）跳过（SVG 可含任意 viewBox，无法廉价判定）。
- 配 2 个自证用例（单姿势 frames:2 拒绝、真两帧 512×256 接受）+ makeTree 支持 Buffer 写入。

## Alternatives considered

**靠人工/发布流程发现。** 此错误类（图与帧数不匹配）在投放时必然发生且一眼可见——但门禁能在落地前拦住，成本极低。

**尺寸校验放宽为"宽度 ≥ frames × 帧宽"启发式。** spec 契约是帧等宽同高无间距，严格相等才与渲染一致；放宽会放过劈开场景。

## Consequences

- eat/play 的 frames:2 投放需**真两帧横排图（512×256）**，或把 manifest 改为 frames:1（单姿势 + 可选的瞬发表现）——该约束已由门禁强制。
- 门禁对 PNG 多帧 sheet 的尺寸契约生效；SVG 多帧仍靠人工核验（当前 idle.svg 为 4 帧 SVG，384×96 满足 4×96 契约，人工核对过）。
- 已知边界：门禁判定尺寸契约，不判定语义（两帧图是否真的是两个姿势）——语义仍靠投放人工核验。
