# Decision: 删除废弃代码——describe、detectRoundCompleted、emoji 冒烟分支

Status: implemented

## Problem

- `pet-state.mjs describe()`：注释称「工具输出与路由都复用」，但 Agent 工具已删除
  （2026-08-10-remove-agent-tools）、无任何路由消费——死代码（仅测试引用）。
- `client/logic.mjs detectRoundCompleted`：废弃后按原决策「保留代码 + 标注弃用，防误用」，
  但已完成使命（detectTurnCompleted 已稳定、无消费方、无测试覆盖）——纯死代码。
- `scripts/verify-client-smoke.mjs` 的 emoji 兜底断言分支：v5 素材全量契约后 client 不再 emoji 降级，
  分支永不成立（舞台内容断言只该认 sprite）。
- `index.mjs` 未使用的 `titleName` import（工具删除残留）。

## Decision

- 删除 `describe()`（含 tests/pet-state.test.mjs 的 describe 用例；`titleName` 导出保留）。
- 删除 `detectRoundCompleted`（处置由 2026-08-10-celebrate-turn-edge-detection 的「保留标注弃用」更新为删除）。
- `verify-client-smoke.mjs` 移除 emoji 兜底断言与注释（舞台可见内容只认 sprite 渲染）。
- `index.mjs` 移除未使用 import `titleName`。

## Alternatives considered

**A：保留 describe()（修正注释）。** 工具删除后无消费者，「保留 + 改注释」只是推迟删除——删。

**B：detectRoundCompleted 继续保留（原「防误用」理由）。** 已无任何消费/测试，保留即无条件死代码；
原「防误用」担忧已被 STATE_NAMES 权威集合与门禁覆盖——删。

## 取代检查

部分取代 [2026-08-10-celebrate-turn-edge-detection.md](../bug-fix/2026-08-10-celebrate-turn-edge-detection.md)：
其「detectRoundCompleted 保留代码 + 标注弃用」处置由本记录改为删除；running 边沿检测语义不受影响。

## Consequences

- 死代码清除，模块导出面收窄（describe/detectRoundCompleted 不再导出）。
- verify-client-smoke 舞台断言更严格（只认 sprite 渲染，不再接受不存在的 emoji 兜底）。
- 单测 107 → 106（describe 用例删除）；门禁全绿。
