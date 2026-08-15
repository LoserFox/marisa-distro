# Decision: agent/request-error 不再记入任务失败计数

Status: implemented

## Problem

v2 里 `agent/request-error` 事件同时做两件事：触发 error/disappointed 情绪，且 `recordFailure` 把失败计数 +1 并写入回忆「任务失败（第 N 次）」。问题：LLM 请求错误是**瞬态 API 抖动**（模型重试后可能成功），不是任务失败——回忆里出现虚假的「任务失败」，且与任务状态翻转（running→failed，deriveActivity）**双计**：一次坏任务多次请求错误即可刷出「越挫越勇」（failures≥5）称号。

## Decision

- `agent/request-error` 只设置 `errorUntil`/`disappointedUntil` 情绪窗口，**不再** `recordFailure`/`scheduleSave`。
- 「任务失败」计数（`stats.failures` + 回忆）只认 `deriveActivity` 的任务状态翻转（running→failed）——语义与「失败的任务数」一致。
- 请求错误仍触发 error(4s)→disappointed(6s) 情绪（宠物对 API 抖动有反应，总负面 10s，与任务失败同窗），只是不计资历。

## Alternatives considered

**请求错误单独建 stats.requestErrors 统计。** 新增字段面（schema/客户端显示/持久化归一化都要改），当前无消费者；需求出现时再加。

**保持双计（现状）。** 回忆与称号语义失真——不可接受。

## Consequences

- 回忆与「越挫越勇」称号反映真实任务失败数；API 抖动只影响情绪，不影响资历。
- 已知边界：一次任务内多次请求错误只有最后的状态翻转记一次失败（次数不可见）——可接受，避免噪音。
