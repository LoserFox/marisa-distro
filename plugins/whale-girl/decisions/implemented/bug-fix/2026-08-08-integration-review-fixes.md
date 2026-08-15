# Decision: 集成审查修复批次（killed 庆祝漏网 / motion 类清理 / 冒烟与门禁补强）

Status: implemented

## Problem

对最近集成提交（onTaskDone 记账、motion 配方、真图管线、active-cap）做聚焦审查发现：**killed 中性语义在显示路径漏网**——`wasWorking && !working` 消失兜底不看结束原因，用户取消的任务仍会触发 6 秒 celebrate 庆祝（账本已中性，显示未中性，两路径发散）；setState 的 motion 类清理遍历活 DOMTokenList 边删（当前单类安全，脆弱模式）；冒烟不断言 motion 类与账本渲染（「motion 生效/账本显示」只停留在实证结论）；verify-assets 不校验 manifest 状态名与 client EMOJI 兜底表一致（新增状态会静默兜底 🐣）。

## Decision

- **F1 killed 中性补齐**：deriveActivity 加 `sawKill` 标记（running→killed 置位），消失兜底改为 `wasWorking && !working && !sawKill`——取消的任务不再庆祝；配 2 条单测（单轮 killed 无 burst、消失兜底被 sawKill 抑制）。
- **F5 motion 类清理加固**：`[...stage.classList]` 快照迭代再删（活集合边删可能跳项）。
- **F7 冒烟补强**：断言 `pet-motion-*` 类（idle 兜底态必为 pet-motion-bob）与 `.pet-stats` 内容（`\d+ 任务`）——motion 生效与账本渲染升级为可回归断言。
- **F9 门禁交叉校验**：verify-assets import client EMOJI 键集合，拒绝 manifest 状态 ∉ EMOJI（新增状态须同步兜底表）；配自证用例。
- **已知限制（写入记录，不实现）**：F2 插件未挂载期间完成的任务仍漏记（onTaskDone 无法重放历史，挂载对账需 recordedTaskIds 持久化与任务 id 跨重启回收冲突的权衡——设计留待产品定夺）；F3 页面关闭期间完成的任务 +XP 但无 celebrate（显示依赖轮询观察，无观众时无意义——事件驱动 burst 为结构性改进，另立提案）。

## Alternatives considered

**F1 用 sawFail 同样抑制 failed-vanish 庆祝。** failed 任务从列表消失与 completed 无法区分（宿主侧限制），且 failed 有逐任务 error burst 兜底——仅 sawKill 已覆盖明确冲突面。

**F2 立即实现挂载对账。** recordedTaskIds 持久化与任务 id 跨进程回收（`<kind>-<count>` 重启归零）冲突，防双记的去重语义不稳定——记录为已知限制，设计留待产品定夺，避免半成品。

## Consequences

- killed 的账本与显示双路径语义一致（中性）；motion/账本渲染有冒烟回归防线；manifest 状态与 EMOJI 兜底表一致有门禁守护。
- 已知限制已文档化（F2 未挂载漏记、F3 关闭期无庆祝），非静默缺口。
