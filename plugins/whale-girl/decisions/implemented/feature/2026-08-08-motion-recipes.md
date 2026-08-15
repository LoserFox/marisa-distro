# Decision: 运动配方（motion）渲染支持——frames:1 状态的 CSS 动画层

Status: implemented

## Problem

sprites-spec 定稿的混合素材管线：12 个状态基本 `frames: 1` + `motion` 配方（bob/wiggle/squash/shake/sigh/hop/tilt/float/wave），eat/play 用 `frames: 2` 帧循环。但 client 只实现帧播放器（sheet/frames/fps/loop），`motion` 被静默忽略——按 spec 投放真图后，所有 frames:1 状态将是**静态贴纸**（评审 L2）。

## Decision

- **舞台级运动类**：`manifest.states[name].motion` → `stage.classList` 的 `pet-motion-<配方>` 类；9 个配方各配一组 keyframes（无限循环，状态窗口由状态机决定显示时长）。emoji 兜底路径同样生效。
- **与帧播放器互斥**：motion 只配 `frames: 1`（spec 契约）；`frames > 1`（eat/play）走帧播放器、无运动类。
- **动画作用于舞台而非 sprite**：舞台无内联 transform，与 sprite 的缩放内联 transform 不冲突（原 .pet-stage 的固定 bob 动画移除，idle 由 manifest 的 motion "bob" 接管）。
- **reduced-motion**：媒体查询禁用舞台/sprite 动画（含 motion 类）。
- **verify-assets 门禁**：motion 必须在白名单、且 frames 必须为 1（配 3 个自证用例：合法、白名单外、frames>1）。

## Alternatives considered

**motion 作用于 sprite 元素。** sprite 有内联 `transform: scale(...)`，CSS 动画的 transform 会覆盖它——缩放大帧图时尺寸错误。

**不做 motion，等 spec 改为纯多帧。** 管线已定稿 frames:1 + motion；静态贴纸违背"丢图即动"的体验承诺。

## Consequences

- 真图按 spec 投放（frames:1 + motion）后，宠物有过程动画（呼吸/晃脑/弹跳/抖动等）而非静态贴纸；eat/play 仍走帧循环。
- 门禁与客户端配方白名单各自维护（两处名单一致，已注释互指）。
- 已知未覆盖：多帧 + motion 同时声明被门禁拒绝（设计互斥）；wake 状态无 motion（spec 如此，1.5s 瞬发静态可接受）。
