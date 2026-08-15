# Decision: 删除「缺 sheet 降级」——素材全量契约（EMOJI 兜底机制移除）

Status: implemented

## Problem

降级设计（「角色缺某状态 sheet → emoji 兜底」）与用户的产品方向冲突：用户明确「缺 sheet 降级的设计应该删除，要求素材必须要全」。降级机制的实际成本：①EMOJI 表/emojiFor/emojiOverrides/showEmoji 五处实现，散布 client 与门禁；②「可选状态」语义让角色可以交不完整素材，与「第二角色零代码接入」的目标矛盾（代码需处理 undefined 动画集）；③verify-assets 门禁只校验「引用的存在」不校验「必备的齐备」，缺状态静默走 emoji，投放期不报错、运行时才暴露。用户确认：彻底删 emoji（渲染错误即不播），运行时缺素材用占位符+警告。

## Decision

- **素材全量契约**：每个角色 manifest 的 `states` 必须含全部 15 状态（`STATE_NAMES` 权威集合），缺一即被 verify-assets 门禁拒收——「可选状态/核心状态集」语义删除。
- **删 EMOJI 机制**：`client/logic.mjs` 的 EMOJI 表删除，新增 `STATE_NAMES`（15 状态权威集合，spec 总表 ↔ STATE_NAMES ↔ STATE_TABLE 三向一致）；`client/character.mjs` 删 `emojiFor`（含 emojiOverrides 解析），`isKnownState` 改基于 STATE_NAMES；`client/index.mjs` 删 `showEmoji` 路径，改为 `showPlaceholder`（舞台占位 + 控制台警告，仅运行时 sheet 加载失败/迟到路径）。
- **verify-spec-states 门禁改权威**：从「spec ↔ EMOJI」改为「spec ↔ STATE_NAMES ↔ STATE_TABLE 行（含 burst resolve 值）」三向校验，防文法漂移。
- **verify-assets 门禁加必备集**：角色 states 缺任一 STATE_NAMES 状态即拒（含旧格式平铺 states 路径）；状态名 ∈ STATE_NAMES。
- 文档同步：sprites-spec（生图契约改全量）、state-machine（删「核心状态集建议」、改降级说明）、adding-a-character（角色必须填满 15 状态）、growth-system/architecture-evolution（删 emoji 兜底描述）。

## Alternatives considered

**A：保留 EMOJI 表仅作运行时兜底（manifest 门禁强制全量）。** 用户明确「彻底删 emoji」——EMOJI 表存在即暗示「可选素材」合法，且 emojiFor/emojiOverrides 三处代码继续承载已死的语义——弃。

**B：占位=空白（不显示）。** 用户选「占位符+警告」——空白让开发期无法区分「该状态无素材」与「渲染 bug」，警告输出 + 可见占位更利于发现——弃。

**C：verify-assets 只查「角色含全部状态键」，不校验 STATE_NAMES。** 状态名权威必须在代码（STATE_NAMES），否则门禁校验的是 manifest 自说自话——弃。

## Consequences

- 素材契约收紧：新角色必须提供 15 状态全部 sheet，门禁在投放期拦截不完整素材。
- EMOJI/emojiFor/emojiOverrides/showEmoji 删除（五处实现移除），状态权威收敛到 STATE_NAMES 单点。
- 运行时 sheet 加载失败 → 占位 + 警告（异常路径，正常投放不触发）。
- 测试更新：verify-assets 自证（全量齐备接受/缺状态拒绝/未知状态拒绝）、verify-spec-states 自证（STATE_NAMES 权威）、client-logic/character 测试删 EMOJI 断言。
- 关联决策：本决策部分取代 [character-manifest](2026-08-09-character-manifest.md) 的「缺 sheet → emoji 兜底」描述（该记录保留，互链指向本决策）。
