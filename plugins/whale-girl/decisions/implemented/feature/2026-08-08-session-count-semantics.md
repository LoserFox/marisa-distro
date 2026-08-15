# Decision: 会话计数语义——每次 agent 发布 vs 严格新会话

Status: implemented

## Problem

`agent/session-start` 在每次 agent publish 时发出（含 `publish('resume')` 续接旧会话与懒恢复）；dsh-pet 每次事件都 `recordSession` +5 XP + welcome（index.mjs）。因此 `stats.sessions` = 「会话活动/续接次数」而非「新会话数」：「广结善缘」（sessions≥10）在频繁续接下更快达成；回忆里「新会话开启（第 N 个）」可能对同一会话出现多次。当前语义未写入决策记录。

## Decision

- **XP 区分（产品定夺，2026-08-08）**：`agent/session-start` 的 `payload.source` 判别——`startup`（新会话）+5 XP + 会话计数 + welcome 欢迎；`resume`/`compact`/`clear`（续接/延续）+2 XP（`RESUME_XP`），**不**计会话数、**不**触发 welcome（避免切换即欢迎的噪音）。回忆分别记「新会话开启（第 N 个）」与「回到旧会话，继续陪伴」。
- 「广结善缘」（sessions≥10）= 真实新会话数（仅 startup 计数）。

## Alternatives considered

**B：一刀切全部计为新会话（原现状）。** 续接也 +5 XP + 计数 + welcome——「广结善缘」衡量活跃度而非新会话数，且切换即欢迎有噪音——弃。

**C：严格新会话（按会话身份去重）。** 续接不计 XP 不计计数——需要会话身份识别与跨事件去重；续接零正反馈会降低继续陪伴的激励——弃。

**D：时间窗去重。** 阈值是魔数，语义不精确——弃。

## Consequences

- 新会话与续接 XP 区分（+5/+2，`RESUME_XP`）；「广结善缘」= 真实新会话数（仅 startup 计数）；续接不再触发 welcome（切换噪音消除）；回忆区分「新会话开启」与「回到旧会话，继续陪伴」。
- 已知边界：`payload.source` 判别依赖宿主事件契约（'startup'/'resume'/'compact'/'clear'）；若宿主新增 source 值，未匹配者落入续接分支（+2 不计数），语义保守。
