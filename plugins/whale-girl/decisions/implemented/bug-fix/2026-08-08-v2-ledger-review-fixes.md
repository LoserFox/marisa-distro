# Decision: v2 账本审查修复（/state 记账顺序 + 任务回忆用可读标签）

Status: implemented

## Problem

v2 积累账本落地后审查发现两处体验/正确性问题：`/state` 路由的响应对象字面量先读 `state` 再调 `activity()`（后者有记账副作用），导致任务完成当轮返回的 `pet` 是记账前旧值，资历更新晚一个轮询（3s）；任务完成写回忆时用原始任务 id 当标签，回忆日志里是截断的 UUID（`完成任务「a3f9c2d1e4b5a…」`），对"共同回忆"叙事无意义。

## Decision

- **先跑记账再读状态**：`/state` 处理器改为 `const act = activity(); json(res, 200, { pet: state, activity: act }, ...)`——响应里的 `pet` 始终是记账后的值。
- **回忆用任务 label**：`collectTasks` 携带 `label: snapshot.label`；`activity()` 对 `derived.completed` 按 id 取 label（缺 label 用「未命名任务」）传给 `recordTaskCompleted`；长标签沿用 `truncate(14)` 截断。`deriveActivity` 契约不变（只消费 {id, status}，宿主负责标签）。

## Alternatives considered

**保持现状（晚一个轮询 + UUID 回忆）。** 轮询滞后可接受但语义不干净；UUID 回忆是明显体验缺陷——都修。

**deriveActivity 返回 completed 带 label。** 把任务快照的展示字段耦合进活动推导契约，扩大该模块的消费面——宿主侧按 id 查 label 更薄。

## Consequences

- `/state` 响应自洽（pet 与 activity 同轮一致）；回忆日志可读（任务名而非 UUID）。
- 已知未覆盖：`agent/request-error` 与任务 failed 状态可能双计失败（一次坏任务多次请求错误 + 最终失败）——失败计数语义需产品定夺，不在本批处理。
