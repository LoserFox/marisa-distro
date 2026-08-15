# Decision: 负面窗口统一——error 4s + disappointed 6s（任务失败与请求错误同窗）

Status: implemented

## Problem

负面展示窗口语义倒置且双标：真正任务失败走 `deriveActivity` 的 error burst（BURST_MS=6s），**从不进 disappointed**；只有 `agent/request-error`（LLM API 抖动）触发 error 4s + disappointed 12s——最 sad 的脸 12s 全给网络抖动，真失败反而没有低落。同时 README 写"失败只短暂失落"，实现却是 16s 总负面（4s error + 12s disappointed），产品语言与实现矛盾；且 12s 尾段对非 loop 的 disappointed 意味着 11s 静止（动画编排修订已改 loop 解决静止，窗口长度问题在此一并收敛）。

## Decision

- **统一窗口**：任务失败与请求错误同一负面序列——`error` 4s（ERROR_MS）→ `disappointed` 6s 尾段（ERROR_MS + DISAPPOINTED_MS），总负面 10s。`DISAPPOINTED_MS` 12000→6000。
- **任务失败也走低落**：`activity()` 在 derived.burst 为 error 时同步设置 `errorUntil`（= burst.until）与 `disappointedUntil`（= burst.until + DISAPPOINTED_MS），与 request-error 处理器同构。
- **窗口取 max 不缩短**：同一窗口内多次失败/请求错误只延长不缩短（`Math.max`），并发负面不被吞。
- **`deriveActivity` 增 `errorMs` 参数**（默认 BURST_MS）：失败 burst 窗口由宿主传入（index.mjs 传 ERROR_MS），纯函数保持默认兼容。

## Alternatives considered

**总负面 ≤6s（error 3s + disappointed 3s）。** 最贴"短暂"产品语言，但 burst 窗口由客户端 3s 轮询消费（POLL_MS=3000），窗口 <4s 可能整窗错过；需先降轮询到 1.5s（连锁改动）。10s 在轮询地板约束下是当前安全最短，选之。

**保持现状（error 6s / request-error 4s+12s）。** 语义倒置不修，sad 只给网络抖动，且 12s 与"短暂失落"的产品模型冲突。

## Consequences

- 任务失败与网络抖动情绪一致：惊吓 4s → 失落 6s，总 10s；并发负面窗口延长不缩短。
- 负面窗口毫秒值只存 index.mjs（spec 不再手抄）；后续调整窗口只改常量，无 spec 联动。
- 轮询地板（3s）仍是负面窗口下限约束；若未来要更短窗口，需先降 POLL_MS（记于本记录）。
