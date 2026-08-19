# Track 自动维护机制设计（auto-maintenance）

> 目标：capture → issue → done 管线持续自动运行，不再靠突击式手动 sync。
> 原则（2026-08-14 讨论 + 调研结论 docs/research-task-state-machine.md）：
> 1. 机器只提议完成/取消（pendingConfirm），用户确认是最后一关（done/canceled 状态门控）
> 2. 确定性规则可以自动执行（标题去重、capture 促转），LLM 判定保持人工/按需触发
> 3. 所有自动动作留审计痕迹（audit 表 + 日志）

## 三个自动循环（同一个 6h 定时器，全部确定性、零 LLM 成本）

- 循环1 生命周期 sweep：重估所有 in_progress issue（完成证据→done 提议；14d 无进展→canceled 提议；闲置>2d 且无证据→review 提议）。写 pendingConfirm，不改 state，用户面板确认/驳回
- 循环2 capture triage：open capture 内容精确等于某 issue 标题 → 自动促转；>14d 未促转的 stale capture 计数上报
- 循环3 精确重复归并：非终态 issue 按 normalized title 分组，>1 的组把后序归并进最早 identifier（union 会话），源置 canceled。仅精确同名才自动（机械判定）；近似重复只记日志不自动

定时器：web 启动即跑一次 + 每 6h（SWEEP_INTERVAL_MS）。

## 触发式路径（LLM 重，保持按需）

- v2 sync（track_sync_history / POST /api/track/sync）：从会话提取新任务 + 促转匹配 capture。不建议定时自动跑：内存峰值曾压垮 3080（本机 swap 长期 14/14GB）、每轮 600k+ tokens。建议每周一次 + 用户主动触发，maxSessions 限额
- 待确认消化：面板「待确认」区一键确认完成/取消/驳回——用户侧唯一的手动闭环

## 自动状态迁移规则（回答『怎么自动变成确认完成或其他状态』）

1. todo → in_progress：证据足够（活动/回合完成/模型提议）→ 自动提交（可逆，已实现）
2. in_progress → done_candidate：todo 全完成 + 回合正常结束（或用户说『可以了』）→ pendingConfirm.done，等用户确认（已实现；调研结论：todo 全 done 只作守卫）
3. in_progress → canceled_candidate：14d 无进展 → pendingConfirm.canceled（已实现）
4. in_progress → review_candidate：闲置>2d 且无任何生命周期证据（sync 建 issue 典型形态）→ 面板三按钮：确认完成/确认取消/还在做（已实现）
5. duplicate → merged/canceled：精确同名自动归并（本轮新增）
6. open capture → promoted：标题精确匹配已有 issue 自动促转（本轮新增）

## 已实现的可选项（2026-08-14 第二批，用户拍板全部做）

- **配置面板**：Track 面板 ⚙ 设置区 + GET/POST /api/track/config（TrackGlobal.config，缺失字段回落默认值）
- **auto-confirm canceled**：pendingConfirm.canceled 悬挂 > autoCancelPendingDays（**默认 14 天**，可配，0=关闭）→ 自动确认取消。done 永不自动确认
- **定时 sync**：1h 心跳检查 syncIntervalDays（默认 7 天，0=关闭），扫 lastSync 里的 workspace，syncMaxSessions 限额（默认 10），engine 默认 v1（零 LLM 零内存风险；v2 手动按需）
- **近似重复自动归并**：token 相似度 ≥ nearDupThreshold（默认 0.6，可配，精确同名=1.0 一套逻辑覆盖）→ 自动合并进最早 identifier；union 会话不丢数据、每并留 audit。用户明确要求自动并而非提议

## 验收（2026-08-14 落地）

- 第一批：mergeIntoCanonical + triageCaptures + 精确重复归并 + POST /issues/:id/merge
- 第二批：配置面板 + auto-confirm canceled(14d) + 定时 sync(v1/7d/10cap) + 近似重复自动归并(0.6)
- 240 tests 全过；15 个已完成 capture 已删、9 个重复 issue 已归并
- 现场效果：启动日志 `[dsh-track] sweep / auto-confirm / capture triage / dup-merge / scheduled sync`