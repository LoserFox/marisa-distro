# 文档修正轮报告（9 项外部评审，逐条先核后改）

> 生成时间：2026-08-12 · 依据：README/DEV-GUIDE 一致性评审（A1-D1 共 9 项）。
> 纪律：先读代码真相、再读设计真相、再读证据链；禁止按指控直接改。
> 提交：43c33a7（本轮动作）+ 前置提交 c289c7b（B2 的 §8.6 补登，早于评审）。
> 复核改计（2026-08-12 用户裁决）：A3/A4/B2 由「指控错（评审快照过时）」
> 改计为**前置完成**——评审要求的动作已在评审前的提交（Rev-A2 / c289c7b）完成，
> 本轮无新动作；判定以本行为准。

| 项 | 判定 | 证据（文件:行号） | 动作 |
|---|---|---|---|
| A1 | 文档错 | EB-D21（expected-behavior.md:104）；design-r3 §1.7（design-r3.md:91-99）；lifecycle.ts:2886-2916 | README/DEV-GUIDE dispose 措辞改为「超时放弃等待（dispose-abandoned，不阻塞回滚）」 |
| A2 | 文档错 | EB-D16（expected-behavior.md:99）；EB-D19（:102 符号别名） | DEV-GUIDE §4.1 三态引用改 EB-D16 |
| A3 | **前置完成** | 实现：args.ts:2/73 手写解析，无 commander import；design-r5-cli.md:350-351 + Rev-A2（:495②） | 无新动作（偏离已在 Rev-A2 登记，早于评审） |
| A4 | **前置完成** | verify-self-contained.mjs:100（lockfile 必读）、:125（恰 7 skills）；design-r5-cli.md:379-384 + Rev-A2（:495③，含推翻「不复制」的原因） | 无新动作（已在 Rev-A2 登记，早于评审） |
| B1 | 偏离未登记 → 已登记 | resolver.ts:77-88；design-r4-backlog.md:36-37 | design-r4.md §13 追加 Rev-P4（:318） |
| B2 | **前置完成** | cli-verification.md §8.6 需求 2（:209-214，c289c7b 已补登，早于评审）；DEV-GUIDE §10 一致 | 无新动作 |
| C1 | 裁量采纳 | T50 实测（cli-verification §8.2） | 新建 CD-2 文档 + README 治理差异提示 |
| C2 | 裁量采纳 | docs/ 实清单 | README 文档地图补 8 项 |
| C3 | 裁量采纳 | design-r5 §9 C1 / §7.3 | 新建 docs/EXT-CD-index.md |
| D1 | 裁量采纳 | manifest-v2.ts 字段 | DEV-GUIDE §2.1 新增字段参考 |

## 四条重点项详解（A3/A4/B1/B2）

### A3（解析器：commander vs 手写）

- 实现：**手写**（`packages/cordis/mygo-cli/src/args.ts:2,73` 的 `parseCliArgs`；
  src 全目录无 `commander` import）。
- 设计：design-r5 §4.2 现行文 = **手写最小解析器**（design-r5-cli.md:350-351，
  标注「Rev-A2 修正」）；§10 Rev-A2 ② 记录偏离原因（0811 pnpm 非提升布局）。
- 判定：**前置完成**——评审声称 design-r5 写 commander，实为 Rev-A2 之前的
  旧文本；偏离登记在评审前已完成（Rev-A2 ②），无新 Rev 需求。

### A4（init 资产：skills/lockfile）

- 模板硬性要求：**是**——`verify-self-contained.mjs:100` 必须读
  `pnpm-lock.yaml`（缺失即抛错），`:125` 要求 `.agents/skills` 恰 7 个。
- 「不复制」决策被推翻，原因已记：design-r5-cli.md:382-384（verify-self-contained
  硬性要求）+ §10 Rev-A2 ③。
- 判定：**前置完成**——推翻「不复制」的原因已在评审前的 Rev-A2 ③ 登记，
  无新动作。

### B1（sourceRank）

- 实现：`pinned > registry > locked > bundle > 其他`（resolver.ts:77-88；
  pack 候选归「其他」，pack 钉版经 pins rank0）。
- 原文档：design-r4-backlog.md:36-37 称「pack 插在 pinned 之后」——与实现不符，
  且当时未登记。
- 动作：**已追加 design-r4.md §13 Rev-P4（:318）**，以实现为准并指向 backlog
  段；DEV-GUIDE §3.1 保持实现表述。这是四条里唯一需要新 Rev 的。

### B2（EXT-3 需求 2）

- cli-verification §8.6 需求 2：**评审前已补登**（提交 c289c7b；
  cli-verification.md:209-214）；DEV-GUIDE §10 同句一致。
- 判定：**前置完成**——§8.6 需求 2 已在评审前的 c289c7b 补登，无新动作。

## 回归与提交

- 全量回归 64 文件 / 624 用例 + EB 13/13（无网拦截）；本轮仅 `.md` 改动。
- 提交：43c33a7（本轮）；前置 c289c7b 含 B2 的 §8.6 补登。
