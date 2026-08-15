# Decision: 播放行为数据驱动——manifest playback 字段取代状态名特判

Status: implemented

## Problem

帧播放行为散落在 client 播放器里以**状态名特判**硬编码：idle 走「帧0常态+随机眨眼」分支（`animState === 'idle'`）、walk 走「往返」分支（`animState === 'walk'`）、其余走通用循环/一次性。问题：①代码知道每个状态的素材内部结构（idle 帧0是睁眼、walk 要往返）——改素材帧序或加新角色若帧结构不同，要改播放器；②帧序语义（帧0=起点、末帧=完成态）只存在于 sprites-spec 人类可读的画面描述，无机器契约；③manifest 只有 `loop` 布尔，表达不了「往返」「眨眼」——所以 walk/idle 才要特判。用户提出「每个动作内部每帧的行为是否也应规范」，并明确要求第二角色能从契约知道每帧具体行为。

## Decision

- **manifest 每状态新增 `playback` 字段**（封闭枚举，取代 `loop` 布尔语义）：
  - `loop`：正向循环 0→1→…→N-1→0（帧0=常态起点），帧数 ≥1
  - `pingpong`：往返 0→1→…→N-1→…→0（帧0/末帧为两端姿态），帧数 ≥2
  - `once`：播完保持末帧（帧0=起点、末帧=完成态），帧数 ≥1
  - `blink`：常态帧0静止 + 随机间隔触发一次动作播完回帧0，帧数 ≥2
- **播放器数据驱动**：tick 删 `animState === 'idle'` 与 `animState === 'walk'` 特判，改为读 `cfg.playback` 分支——播放器不再知道任何状态名，只剩「帧播放模式」一种概念。
- **verify-assets 门禁**：playback ∈ 枚举 + 帧数 ≥ 该模式下限（loop≥1/pingpong≥2/once≥1/blink≥2）交叉校验；`loop` 字段从校验中移除。
- **spec 契约**：状态总表 `loop` 列改「播放行为」列（标注每状态 playback）；新增「播放行为」表（模式/帧序/下限/示例）与「帧0=常态起点」帧序语义契约；新增「角色契约」章节（第二角色 = 15 张 sheet + manifest，零代码）。
- 帧数下限/枚举常量在 [client/logic.mjs](../../../.dsh-plugin/client/logic.mjs)：`PLAYBACK_MODES` / `PLAYBACK_MIN_FRAMES`（门禁与测试共用，单一来源）。

## Alternatives considered

**A：保留 loop 布尔 + 新增 playback 补充。** 两个字段表达同一维度（循环与否）——冗余且漂移风险（loop 与 playback 冲突时以谁为准）；playback 完整表达循环语义，loop 冗余——弃。

**B：不新增字段，只写文档规范帧序。** 播放器特判仍在——改素材帧序/加新角色仍要改代码，机器不可校验——弃。

**C：完整帧行为契约（含帧内容门禁）。** AI 生图帧间抖动检测易误报、成本高；playback 数据驱动已覆盖「如何播」，帧内容质量留待人工审计——弃。

## Consequences

- 播放器零状态名特判：任何角色/帧数/模式一份代码驱动；第二角色按契约填 playback 即可。
- manifest 校验收紧：playback 枚举 + 帧数下限在投放期拦截非法组合。
- `loop` 字段从 manifest/门禁/文档移除（历史决策记录的 loop 描述为当时快照，不追溯改写）。
- 测试：verify-assets 自证新增 playback 枚举/帧数下限用例；client-logic 新增 PLAYBACK_MODES 完整性用例。
