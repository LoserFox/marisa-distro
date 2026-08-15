# 捕获信号审计：官方工具全集 × track 观察器覆盖（capture-signal-audit）

> 审计目的：把 dsh-track 自动捕获（`src/capture/observe.ts`）的**信号源**与当前 harness 快照的
> **官方工具全集 + 会话事件全集**逐一对照，找出「有需求价值但 track 没反应」的缺口，并让信号
> 集合**可配置**，避免再出现"碰到一个问题处理一个问题"的打地鼠式补丁。
>
> 触发事件（2026-08-14）：会话「任务转派与历史状态清理机制讨论」（Code mode）里 `create_goal`
> 携带完整 A/B/C 目标、`todo_write` 规划 10 项，却只触发一条捕获（「C 调研…」，恰好是 todo 首项），
> goal 的 A/B 需求完全没有反应。根因见 [#55](https://github.com/dsh-external/dsh-track/pull/55)。
>
> 审计日期：2026-08-14。对照快照：`slot-a`。

---

## 一、官方工具全集（本快照，与 agent toolset 交叉验证）

| 域 | 工具 | 主要结构化信号 |
|---|---|---|
| 文件 | `read` `write` `edit` `glob` `grep` `read_image` | `tool/call` / `tool/result` |
| Shell/作业 | `bash` `job_output` `job_list` `job_kill` | `tool/call` / `tool/result` |
| Web | `web_search` `web_fetch` | `tool/call` + 搜索类旁路事件 |
| 任务/目标 | `todo_write` `create_goal` `get_goal` `update_goal` | **`todo/write`** / **`goal/change`** |
| 编排 | `subagent` `subagent_fork` `send_message` `list_agents` `interrupt_agent` `workflow` `ralph` | 子会话首条 `user/message`（header `origin:'subagent'`） |
| 交互/计划/调度/技能 | `ask_user_question` `plan` `schedule_create/list/delete` `skill` | `user/message`（用户回答）等 |
| 自修改/查询 | `cordis_define/run/stop/undefine` `session_query` | `tool/call` |
| Track（本插件） | `capture_thought` `report_decision_point` + 11 个 `track_*` | 工具自身写存储 |

会话事件全集（观察器经 `session/event` 可见）：`user/message` `assistant/message` `assistant/chunk`
`tool/call` `tool/result` `turn/start` `turn/end` `step/start` `step/end` `todo/write` `goal/change`
`subagent/descriptor`（**seed 阶段写入，不发布给观察器**，仅日志）`request/header` `request/context`
`session/end-seed` `tool/code-dispatch*` 等。

## 二、信号覆盖审计（工具/事件 → track 三个消费面）

| 信号源 | 需求价值 | capture 观察器 | lifecycle 观察器 | 结论 |
|---|---|---|---|---|
| `todo_write` → `todo/write` | 高（计划=需求） | ✅ 首项/会话 | ✅ all-done/activity | **覆盖** |
| `create_goal` → `goal/change(create)` | 高（目标=需求） | ✅ objective/goal-id | — | **覆盖**（#55） |
| `update_goal` → `goal/change(update)` | 中 | ⛔ 不捕获 | — | 正确（修订非新需求） |
| `subagent`/`workflow`/`ralph` 委托 | 高（委托=子需求） | ✅ 委托 prompt/子会话 | — | **覆盖**（G1，本次） |
| `user/message`（用户需求/讨论级） | 高 | ✅ 首条长需求/会话 | 仅确认短语 | **覆盖**（G2，本次） |
| `capture_thought` / `report_decision_point` / `track_*` | 高 | ✅ 本体 | ✅ attach 后证据 | 覆盖 |
| `web_search`/`web_fetch` | 中 | ⛔ 执行载体 | ⛔ | 合理不捕获 |
| `bash`/`read`/`write`/`edit`/`glob`/`grep`/`read_image`/`job_*`/`skill`/`schedule_*`/`cordis_*` | 低 | ⛔ 执行载体 | activity(write/edit/bash) | 合理不捕获（git-branch 教训） |
| `ask_user_question` | 中 | ⛔（回答走 user/message） | — | 决策协议覆盖 |
| `turn/end` / `tool/result` | — | ⛔ | ✅ completed/error/blocked | 覆盖 |
| `assistant/message` / `assistant/chunk` | 低 | ⛔ | ⛔ | 合理不捕获 |

## 三、候选信号清单（全量枚举后的结论）

**已实现（可配置，默认全开）**：

| 信号 | tag | 捕获内容 | 去重 |
|---|---|---|---|
| `todo` | `auto:todo` | todo 首项/会话 | 会话级（持久标记） |
| `goal` | `auto:goal` | goal objective/创建 | goal-id 级 |
| `delegate`（G1） | `auto:delegate` | 子会话首条 user 消息（委托 prompt；判定=header `origin:'subagent'`，fork 排除） | 子会话级 |
| `requirement`（G2） | `auto:requirement` | 首条长需求 user 消息 | 会话级 + 内容哈希 |

**明确不做（执行载体，git-branch 前车之鉴）**：bash、文件读写、web 抓取、作业、技能、调度、
cordis 自修改等——它们携带执行动作而非需求，捕获即噪音。

**待观察**：`ask_user_question` 的回答、`plan` 模式产物、`web_search` 触发的研究意图——若后续
出现"调研需求没进墙"的实例，优先从这些信号补，而不是动执行类工具。

## 四、配置（当前默认 = 全信号开 + G2 最小版阈值）

插件配置（`Config`，经 profile 注入）：

```ts
{
  // 信号掩码：默认全部开启；关闭某个信号即不产生该类捕获
  captureSignals: {
    todo: true,        // todo_write / todo/write → auto:todo
    goal: true,        // goal/change(create) → auto:goal
    delegate: true,    // subagent 委托 → auto:delegate（G1）
    requirement: true, // 需求级用户消息 → auto:requirement（G2）
  },
  // G2 门槛：低于 minChars 视为简短询问不捕获；高于 maxChars 截断
  requirementCapture: { minChars: 40, maxChars: 500 },
}
```

实现点：`src/capture/observe.ts` 的 `AutoCaptureOptions.signals` / `requirement`；
`src/index.ts` 的 `Config.captureSignals` / `requirementCapture`。

## 五、维护约定（防打地鼠）

1. **新增官方工具时**：先查本表——它是"执行载体"还是"需求信号"？后者进 `observe.ts` 加信号，
   并在本表登记 tag/去重规则 + 补测试。
2. **观察器三消费面都要问**：capture（进墙）≠ lifecycle（进证据）≠ sync（历史折叠），三者独立。
3. **去重纪律**：per-session / per-goal-id / per-child-session / 内容哈希，新增信号必须选一，
   不许裸插入。
