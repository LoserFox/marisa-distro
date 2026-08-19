---
name: dsh-track
description: "Track Bridge 任务管理协议。当执行中遇到不可逆/风险/范围/验收类决策、用户提到与当前工作无关的想法、或需要把工作映射为结构化任务时使用。提供决策点上报（含回答落盘）、念头捕获、issue 创建与查询的调用纪律 English: Track Bridge task-management protocol — decision-point reporting (with answer recording), thought capture, and issue create/query discipline; use when the user faces an irreversible/risky/scope/acceptance decision, mentions an off-topic idea, or wants work mapped to structured tasks."
license: BSD-3-Clause
metadata:
  version: 0.5.0
  author: fakechris
---

# 一句话判据

只有满足【影响不可逆 或 涉及风险/价值观 或 改变范围/验收 或 无法从上下文推断用户偏好】才上报决策点，
其余自行决定。

# 决策点上报（report_decision_point）

## 上报（正例）

- "用框架 A 还是 B？"（技术选型，影响架构）
- "把 API key 存本地可接受吗？"（安全风险）
- "顺带把文档也写了？"（范围边界）
- "做到什么程度算 done？"（验收标准）
- "这个方案要动数据库 schema，值得吗？"（不可逆成本）

## 不报（反例）

- 变量命名、函数拆分、测试写法、错误消息措辞（可逆常规选择）
- 用户已说"你决定"或已有明确规范/约定
- 同类决策之前已被用户接受过（沿用即可，不重复上报）
- 工具选型、文件摆放、实现顺序（纯执行细节）

## 上报格式（≤5 行）

决策点：<一句话>
选项：<A…> / <B…>
我的倾向：<A>，因为<理由>
影响：<选 A 意味着…>
需要你：<确认|选择|补充>

## 记录回答（必须，2026-08-12 起）

- 上报后系统已把决策存进 KV（返回文本首行 `Decision recorded: dec_xxx` 是稳定指针）。
- **用户回答后，立即调用 `track_respond_decision(decision_id, choice, rationale?)` 落盘用户的选择与理由**——
  不落盘等于没问；这是"用户的选择和理由"从聊天文本升级为可查询数据的唯一通道。
- 用户说"先不定了/跳过/随便"时，`choice` 传 `'dismissed'`。
- 查历史决策：`track_list_decisions(state?, since?, session_id?)`；面板/`/api/track/decisions` 同源。

## 纪律

- 长任务默认最多 5 个决策点；同类决策首次上报后自动记录，后续沿用
- 必须给出倾向 + 理由，让用户只做轻决策（点头/选 A/补充一句）
- 用户回答后，把结论记入会话，继续执行；不要反复确认已答过的点

# 念头捕获（capture_thought）

- 用户提到与当前工作无关的想法、未来计划、半成型念头时，调用 capture_thought 收进汇集墙
- 不打断当前工作；捕获是零摩擦的，不需要用户结构化
- 捕获后如用户明确要求落实，再考虑升级为 issue

# 任务映射（track_create_issue / track_list_issues）

- 一个念头/衍生需求要变成具体工作时：track_create_issue（给 title、描述、验收标准、优先级）
- 查已有任务避免重复：先 track_list_issues 再创建
- 任务状态以 Track 为权威（契约字段：验收标准/优先级/依赖）；session 内 todo 是执行细节
- 衍生需求（前置依赖、跨项目 bug、"顺便做 X"）先识别、建议归属，经用户确认再创建，不自动落 issue

# 任务推进（track_attach_issue / track_update_issue_state / track_issue_evidence，2026-08-12 起）

- **开始做某个 issue 时**（计划阶段/写第一条 todo 时）：调用 `track_attach_issue(issue_id)` 声明推进——
  此后本会话的执行证据（todo 完成、轮次结果、工具错误）自动记到该 issue，状态机自动推断进度。
- **查看进度/证据**：`track_issue_evidence(issue_id)` 看推断状态、置信度、证据账本。
- **推进状态**：`track_update_issue_state(issue_id, target, note?)` 提建议即可；
  但 **done / canceled 必须用户明确确认**——先问用户（"看起来做完了，要标完成吗？"），
  用户同意后带 `confirmed_by_user=true` 再调用。**系统永远不会自动标 done。**
- 发现 done/canceled 提案待确认（track_issue_evidence 里出现 "Pending confirmation"）时：
  主动问用户，不要擅自落盘。

# 历史同步（track_sync_history）

- **用户问"最近的工作/同步到 Track/整理历史"时**：调用 `track_sync_history`，把工作区 session 历史折叠成 issue/epic 候选
- 参数：`workspace`（默认当前 cwd）、`engine`（推荐 `'v2'`：segment+intent+synthesize 管线，质量远超 v1）、`since`（默认 7 天）
- **默认 dry_run=true 只看候选清单**；用户确认后再跑 `dry_run=false` 写回（不自动落 issue）
- 会话中出现 `track/sync-preview` 事件（Phase 0b 自动聚合预览）时：向用户摘要候选，询问是否写回或细看
