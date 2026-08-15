# Decision: 动画编排修订——节奏批次 + error 双帧化 + 定向例外门禁

Status: implemented

## Problem

13 状态动画设计整体评审（subagent 对照源码行号与 PNG 实测）发现多处与"事件本性"原则相悖：eat/play 一次性动画 375ms 播完即复位（核心乐趣循环单薄，且与 1500ms 瞬发窗口两个计时器错配）；disappointed 非 loop 但窗口 12s——播 1s 冻结 11s，违反"burst 窗口内持续表现"；celebrate 8fps loop 6s 狂跳 16 圈、welcome 6fps 18 次挥手、wake 400ms 伸懒腰像抽搐、idle 每秒眨眼像困倦；drag 用 shake（颤抖）而语义是 tilt（被斜向拉扯）；error 单帧瞪眼贴纸抖 4~6s 像警报。同时 docs/sprites-spec.md 状态总表/模板/规则与部署 manifest 多处漂移且自相矛盾（"运动配方"列给多帧状态配 CSS 运动，违反自家"motion 只配 frames:1"规则）。

## Decision

- **节奏批次（纯 manifest）**：eat/play/disappointed 改 `loop: true`（瞬发态在窗口内循环、burst 尾段持续）；idle 3→2fps、working 3→4fps（与 idle 拉开节奏）、celebrate 8→4fps、welcome 6→3fps、joy 6→5fps、wake 5→3fps；drag `motion: shake→tilt`。
- **error 恢复 2 帧**（正常→惊吓，旧 2 帧 sheet 从 git 历史恢复、按当前质心配准管线重建）+ `shake`：一次播完僵住后由 CSS 颤抖维持 burst 持续表现。
- **门禁定向例外**：规则主体保持"motion 只配 frames:1"；新增 `MOTION_MULTIFRAME_ALLOWED = {error}` 白名单，仅 error 允许多帧+运动叠加（客户端 setState 本就无条件应用 motion 类，无 client 改动）。配自证测试（error 例外接受 + 例外不扩散拒绝）。
- **spec 收敛**：状态总表/模板/规则三对齐部署 manifest；总表触发列删除手抄的窗口毫秒值（只存 index.mjs，遵守"不手抄他文事实"）；素材管线/投放验证节改为 3×3 网格 `--sheet` 流程，并修正"重启 web 后刷新"过时指令（assets 改动只重装 + 刷新）。

## Alternatives considered

**B 方案：放开通用"多帧+motion 叠加"。** 客户端已支持叠加、门禁成本一行，但双重动画缺设计纪律（celebrate 帧跳跃再叠 squash 会乱），收益仅 error 颤抖与 sleep 浮动两个具体点。选定向例外：既拿到 error 的"僵住颤抖"，又保留互斥的简单性。

**error 保持单帧 shake、只压窗口。** 零生图成本，但"惊吓"无过渡（只有一张瞪眼贴纸在抖），生硬；旧 2 帧 sheet 可从 git 恢复，重建成本可忽略，选恢复。

## Consequences

- burst/瞬发状态在窗口内持续表现，一次性动作有完整循环；负面窗口内的失望不再静止。
- error 是唯一多帧+motion 状态：后续新增多帧+运动叠加必须显式扩白名单并走决策记录。
- spec 与 manifest 单一事实源对齐；素材投放指令与当前网格管线一致，不再误导重启。
