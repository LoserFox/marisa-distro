# Decision: spec 状态总表与 EMOJI 表一致性门禁 + spec/README 漂移同步

Status: implemented

## Problem

docs/sprites-spec.md 是动画素材的**唯一权威规格**（状态清单、生图契约），但「spec 状态总表 ↔ client EMOJI 兜底表逐名一致」无门禁守护：P2 会话感知新增 `think`/`wait` 两状态后，spec 仍写「13 状态」（文档漂移，两处漏同步）；README 同样写「13 状态」、生图背景要求停留在「洋红或绿」旧结论（spec 已实证纯绿唯一可靠）。漂移未被任何程序拒绝。

## Decision

- **新门禁 verify-spec-states**（scripts/gates/verify-spec-states.mjs，入 run.mjs local 组）：解析 spec「状态总表（权威，N 状态）」小节，校验
  - 标题声明数 N = 表格实际状态行数（防标题数字漂移）；
  - 表格状态集合 = client EMOJI 键集合（双向——新增/改名状态必须同时改 spec 与 logic.mjs，任一漏改即红）。
- **自证测试**（verify-spec-states.test.mjs）：接受（一致）、拒绝 EMOJI 有 spec 缺、拒绝 spec 有 EMOJI 缺、拒绝声明数≠行数、拒绝缺标题——5 条。
- **漂移同步**：spec 状态总表补 `think`/`wait`（15 状态，标注当前 emoji 兜底、期望画面供补图）、生图模板补两行、manifest 模板注明 13 个有 sheet 状态 + think/wait 兜底、优先级与 XP 说明更新（wait > think 级联、续接 +2 XP）；README 状态数 13→15、生图背景改纯绿、功能描述补会话感知。

## Alternatives considered

**B：把 spec 表格校验并入 verify-md-links。** 该门禁职责是链接可达性，混入状态集合校验会让单一门禁承担两种不变量、失败信息混杂——独立门禁更清晰。

**C：只同步文档不设门禁。** 漂移会复发（本次就是新增状态后漏同步）——「约定必须有门禁」要求机械可查的约定变成拒绝程序。

## Consequences

- spec 与 EMOJI 表双向一致有门禁守护，新增/删除状态时漏改任一侧即门禁红；README/spec 与部署实况一致（15 状态、纯绿背景、会话感知）。
- 门禁清单权威在 scripts/gates/run.mjs（现 9 个，local 组 7 个）。
