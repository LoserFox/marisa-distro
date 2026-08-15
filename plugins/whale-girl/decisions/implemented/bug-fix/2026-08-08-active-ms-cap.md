# Decision: recordActive 单次累加封顶（防机器睡眠一夜刷出「常驻伙伴」）

Status: implemented

## Problem

`recordActive` 把 `now - lastActiveCheck` 整体累加（仅 Math.max(0) 守卫）。页面开着、任务跑过夜、机器睡眠 → 唤醒后首轮 poll 把整段睡眠时长一次计入活跃：「常驻伙伴」（activeMs≥6h）可一夜刷出。这是明确缺陷（睡眠非陪伴），与「陪伴观察时长」的语义讨论（见 proposed/feature/2026-08-08-active-ms-semantics.md）无关，独立修复。

## Decision

- `recordActive` 单次增量封顶 `ACTIVE_CAP_MS = 5min`（纯函数内，所有调用方一致受保护）。
- 6h 的「常驻伙伴」需 72 次封顶增量累加（等价于 6h 真实观察窗口）。
- 测试更新：原「单次 6h 解锁」用例改为「72×5min 累加解锁」+ 新增「单次 6h 封顶为 5min 不解锁」用例。

## Alternatives considered

**在宿主（index.mjs）处封顶。** 只保护轮询路径；纯函数内封顶保护一切调用方且可单测。

**睡眠检测（navigator 事件/系统 API）。** Node half 无睡眠事件面；封顶是等价且简单得多的护栏。

## Consequences

- 睡眠时段不再计入活跃；「常驻伙伴」反映真实观察时长。
- 语义决定（观察窗口 vs 真实工作时长）留待提案记录由产品定夺——本修复对两种语义都正确。
