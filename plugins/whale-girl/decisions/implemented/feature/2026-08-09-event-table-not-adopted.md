# Decision: 事件表声明化不做——record* 散函数保持现状

Status: implemented

## Problem

第一性原理评审（docs/architecture-evolution.md 硬编码清单 #3）建议「事件表声明化：`events → {xp, statsPatch, memoryTemplate, burst?}` 替代 record* 散函数 + 手工接线」——认为新事件源=新函数+手工接线，无通用事件面。

## Decision

**不实现事件表声明化，record* 散函数保持现状。** 理由：

1. **表达力损失**：`recordTaskCompleted` 的记忆模板含运行时变量（`完成任务「X」（第 N 个）`——任务标签 + 递增计数），`recordSession` 含条件首见（`firstSeenAt ?? nowMs`）——纯声明式事件表无法表达这些业务逻辑，强行声明化会把逻辑塞进模板字符串函数或引入回调，反而更复杂。
2. **现状已足够好**：5 个 record* 函数各有明确职责、单测覆盖完整（pet-state.test.mjs）、无重复代码（共享 `commit()` 归约器）——「散函数」实为「每个事件一个明确的账本效果函数」，是清晰设计而非债务。
3. **账本是核心不变量**：重构账本事件映射风险高（XP/称号/回忆语义），收益（消除的接线仅 5 个函数）远小于风险。

## Alternatives considered

**A：实现事件表（推荐路径的原文）。** 每个事件一行 `{xp, statsPatch, memoryTemplate, burst?}`——但 memoryTemplate 需支持运行时插值（标签/计数），变成「模板 + 求值函数」混合，复杂度不降反升——弃。

**B：保留 record* 但加统一事件注册表（id → handler）。** 中间态：多一层间接，无实质收益（消费方仍是显式调用）——弃。

## Consequences

- record* 散函数 + commit 归约器保持现状（清晰、可测、无重复）。
- 新事件源 = 新增一个 record* 函数 + index.mjs 一行接线（现状成本），不因「声明化」而简化。
- 已满足的第一性原理目标：文法单源（STATE_TABLE，[2026-08-09-state-table-grammar](./2026-08-09-state-table-grammar.md)）；事件面维持显式函数——这是刻意的权衡，非遗漏。
