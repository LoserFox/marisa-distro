# Decision: 文法单源化——声明式状态表 STATE_TABLE（pickState 数据驱动）

Status: implemented

## Problem

状态优先级文法（drag > burst > eat/play > wake > wait > think > working > joy > sleep > walk > idle）被实现为 `pickState` 的硬编码 if 链（client/logic.mjs），且与 Node half 的窗口级联注释、docs/sprites-spec.md 的优先级散文各写一份——加状态/调优先级必须多处同步，漏一处即文法漂移，无门禁兜底（第一性原理评审的硬编码清单 #1/#4）。

## Decision

- **STATE_TABLE 声明式状态表**（client/logic.mjs，文法单源）：行序即优先级，每行 `{ state, when(谓词), resolve?(动态状态) }`；`pickState` 遍历表返回首个命中行，`idle` 恒命中兜底在末行。原 if 链每个条件**原样迁移**为表行——行为完全不变（17 条既有 pickState 测试全绿证明）。
- **burst 动态解析**：burst 行 `resolve: (c) => c.activity.name`（welcome/celebrate/error/disappointed 窗口值由 Node half 级联输出）——Node 仍是 burst 窗口权威，client 只做本地交互选择（drag/transient/joy/session），两半分工不变。
- **STATE_TABLE 完整性测试**（+2）：表内状态全部在 EMOJI 表、idle 在末行恒命中、关键竞争手测（drag 最高/burst 高于瞬发/wait>think>working/think>sleep）。
- 契约保持不变：/state 仍返回 `{ name, until }`（窗口级联权威在 Node），本次只单源化 client 的选择文法。

## Alternatives considered

**A：/state 改返回事实集 `{working, bursts[]}`，Node 级联下沉 client。** 更大重构（两 half 契约变更 + 窗口竞争逻辑搬迁 + 新测试面）；/state 契约是客户端轮询唯一来源，改契约风险高——先单源化 client 选择文法（本次），事实集化列为后续演进（subagent 报告 P0 的第 1/3 步）。

**B：把优先级写成 spec 散文 + 门禁比对。** 散文不可程序化比对（自然语言歧义）——弃，用可测试的 STATE_TABLE 数据本身作为唯一权威。

## Consequences

- 加状态/调优先级 = 改 STATE_TABLE 一行（+ 可选 EMOJI/manifest/spec 同步），不再散落 if 链；文法有测试守护。
- 已知边界：Node half 的窗口级联（errorUntil/disappointedUntil/welcomeUntil/celebrateUntil 四窗口竞争）仍是闭包内 imperative 代码（无单测）——本次未动（facts 化列为后续）；两 half 的「文法」已单源（client 选择表），Node 输出的是事实窗口而非选择，语义不再重复。
- 关联：docs/architecture-evolution.md 第一性原理节；架构演进第 3 项（部分——文法单源达成，事实集化契约列为后续）。
