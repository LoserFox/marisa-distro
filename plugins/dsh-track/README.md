# dsh-track · Track Bridge

[English](README.en.md) | 中文

> **DeepSeek Harness 的嵌入式任务管理引擎** —— 把「念头、决策、任务」变成结构化、可追溯、可折叠的数据。
> 捕获零摩擦，决策留痕迹，任务有生命周期。数据全部在 harness 内部（session 事件 + storage KV），零外部依赖。

**状态** Active · **测试** 204 passing · **构建** `pnpm run build` · **版本** 0.3.0
> **v0.3.0 · 去重 + 面板修复（2026-08-14）**：捕获墙不再出现重复条目——`createCapture`
> 统一闸门（持久化 per-session 标记 + 内容哈希兜底，重启后不重捕）；右侧面板/页签修复（正式版 UI
> 布局下挂载到真实会话根，Track 页签可开合）；底部 strip 显示真实捕获数并可点击打开面板。
> **v0.2.1 · final 正式版适配（2026-08-12）**：官方正式版（snapshots/20260812T172954Z-final-unwatermarked）
> 的词汇清洗中两处无别名硬改名——`SessionQueryService`→`SessionQueryEngine`（dsh-session-query）、
> `ctx.httpServer`→`ctx.webServer`（dsh-host-webserver）——已适配（tsc + 342 测试 + 生产等价冒烟验证）。

---

## 🖥️ 界面预览

| 面板总览（右侧捕获墙 + 任务墙） | 跳回来源对话（高亮定位到原始 prompt） |
|---|---|
| ![dsh-track 面板总览](assets/panel.png) | ![跳回来源对话](assets/jump-back.png) |

## ✨ 特性

- 🧠 **捕获墙（Capture Wall）** —— `capture_thought` 零摩擦收录念头；规划时的 `todo_write` 也会被自动捕获，且每条都携带**动机上下文**（当时那条用户请求），永远不会变成"无来由的琐碎清单"。
- ⚖️ **决策账本（Decision Ledger）** —— 遇到不可逆 / 风险 / 范围 / 验收类决策，先上报决策点，用户轻决策回答，**选择与理由**落盘可查（回答率进 funnel）。
- 📋 **任务生命周期（Evidence-driven Lifecycle）** —— Linear 兼容的任务模型；证据驱动的状态机，`done` / `canceled` **永不自动达成**，必须用户确认。
- 🔄 **历史同步（History Sync）** —— 一键把工作区过往会话折叠成 epic/issue 候选，默认 dry-run，确认后才落库。
- 💰 **LLM 用量账本（Usage Ledger）** —— track 引擎自己调用的 LLM 费用（token / 成本）单独计量，"track 花了多少 token" 一句话可查。
- 🖥️ **Web 面板** —— 右侧栏汇集墙 + 任务墙；每条记录都可 **「↩ 对话」跳回来源会话的那条原始 prompt**，高亮定位。

## 🚀 快速开始

```sh
# 1. 安装插件（官方推荐：用发布版 dsh 安装；本地已有 dsh 也可直接 `dsh plugin ...`）
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:dsh-external/dsh-track
#    （或本地路径：`... add /absolute/path/to/dsh-track`）

# 2. 安装协议 skill（决策点 / 任务推进的调用纪律，装到默认扫描目录）
mkdir -p ~/.dsh/skills && cp -r skills/dsh-track ~/.dsh/skills/

# 3. 重启 dsh web（守护会自动拉起），工具自动挂载
dsh web
```

**验证**：浏览器打开面板（右下角 ◆ 按钮，或会话标签栏的 *Track* 标签页），看到「捕获想法」和「任务」两栏即安装成功。

## 📖 核心工作流

| 流程 | 做什么 | 入口 |
|---|---|---|
| **捕获** | 随时把念头丢进捕获墙；agent 规划时（todo_write）自动捕获，自动附带动机上下文 | `capture_thought` · 面板输入框 |
| **决策** | 遇到不可逆 / 风险 / 价值观 / 范围 / 验收决策时上报，用户轻决策回答，选择与理由落盘 | `report_decision_point` → `track_respond_decision` |
| **任务** | 把需求变成任务；声明会话在推进它，执行证据自动累计；状态机推进，`done` 必须用户确认 | `track_create_issue` → `track_attach_issue` → `track_update_issue_state` |
| **回顾** | 把过往会话折叠成任务候选；随时跳回任何条目的来源对话与原始 prompt | `track_sync_history` · 面板「↩ 对话」 |

## 🧰 工具清单

| 工具 | 作用 |
|---|---|
| `capture_thought(content, tags?)` | 把念头零摩擦收进捕获墙 |
| `report_decision_point(question, options, my_preference, rationale, impact, need)` | 上报决策点；用户轻决策回答，自动存入决策账本 |
| `track_respond_decision(decision_id, choice, rationale?)` | 用户回答后落盘选择与理由（幂等；`dismissed` 表示跳过） |
| `track_list_decisions(state?, since?, session_id?)` | 查决策历史（待确认 / 已回答 / 已跳过） |
| `track_create_issue(title, description?, priority?, acceptance?, parent_id?)` | 创建 Linear 兼容任务 |
| `track_attach_issue(issue_id)` | 声明当前会话正在推进某任务；此后执行证据自动记到该任务 |
| `track_update_issue_state(issue_id, target, note?, confirmed_by_user?)` | 提议 / 确认状态变更；`done` / `canceled` 必须带 `confirmed_by_user=true`（系统永不自动标 done） |
| `track_issue_evidence(issue_id)` | 查任务的证据账本与推断状态 |
| `track_list_issues(team_id?, state?)` | 列出任务 |
| `track_sync_history(workspace?, since?, dry_run?, max_sessions?, engine?)` | 把工作区 session 历史折叠成 epic/issue 候选（默认 dry-run） |
| `track_usage(since?)` | 报告 track 引擎发起的 LLM 调用开销：请求数、各类 token、耗时、估算成本 |
| `track_backfill_captures()` | 存量捕获动机上下文回填（幂等，安全可重跑） |

## 🖥️ Web 面板与 HTTP API

面板（`src/client/right-panel.ts`）直接挂载在会话右侧栏，纯 DOM 注入、无框架依赖：

- **捕获墙**：输入捕获、分页、两步确认删除、一键转任务；
- **任务墙**：按状态分组（进行中优先）、可展开详情、删除；
- **↩ 对话**：每条捕获/任务都可一键跳回来源会话的那条原始用户 prompt——自动切换左侧会话、翻页到深历史、滚动定位并高亮闪烁；旧数据无消息 id 时回退到该会话首条用户消息；
- 20s 轻量自动刷新、面板宽度可拖拽、收起后有 ◆ 悬浮按钮。

HTTP API（面板的数据面，`/api/track/*`）：

| 端点 | 说明 |
|---|---|
| `GET/POST /api/track/captures` · `DELETE /:id` · `POST /:id/promote` | 捕获墙 CRUD + 转任务 |
| `GET /api/track/issues` · `DELETE /:id` · `GET /:id/evidence` | 任务列表 / 删除 / 证据账本 |
| `GET /api/track/decisions?state=&since=&session_id=` | 决策历史 |
| `GET /api/track/usage?since=&limit=` | LLM 用量汇总 + 最近明细 |
| `GET /api/track/funnel` | 工具调用漏斗（capture 转化率等） |
| `POST /api/track/sync` | 历史同步（等价 `track_sync_history`） |

## 🏗️ 架构

**Fat skill + thin harness**：决策判据与调用纪律在 [`skills/dsh-track/SKILL.md`](skills/dsh-track/SKILL.md)，harness 侧只注册工具与存储，不做判断。

**存储归位**：决策点/todo 留 session 事件（可回放）；Capture / Issue / Decision / Usage 存 `ctx.storage` KV（跨会话独立），数据为 **Linear 兼容形状**（随时可迁）。

```
src/index.ts          host 插件：工具注册 + 事件订阅 + store 接线 + HTTP API
src/store.ts          TrackStore：KV 单元封装（串行写链）
src/types.ts          Linear 兼容数据形状
src/capture/         自动捕获 + 动机上下文（observer / context / backfill）
src/lifecycle/       证据观察器 + 状态机（evidence-driven lifecycle）
src/sync/            历史同步引擎（extract → segment → intent → synthesize → align）
src/usage.ts          LLM 用量账本（recorder + 汇总 + 成本估算）
src/client/           Web 面板（right-panel / composer strip）
skills/dsh-track      fat skill：决策点判据 / 格式 / 纪律
cordis.patch.yml      bundle patch（dsh plugin add 自动应用）
```

**设计约束（插件开发者必读）**：业务数据**不写** session 自定义事件——2026-08-11 起 harness 对未知事件类型会拒读整份日志；观察会话只走官方事件流，只读不写（详见 `src/types.ts` 末尾注释与仓库 AGENTS.md）。

## 🛠️ 开发

```sh
pnpm install
pnpm run build      # tsc 产物 lib/ + client bundle
pnpm test           # vitest（188 tests）
```

- 开发用仓库内 worktree（`.worktrees/<name>`）+ 分支 + PR + squash merge（见仓库 `AGENTS.md` L4/L5）。
- 新增 `@deepseek-ai/*` 依赖须同步改 tsconfig paths、vitest alias、ab-config relink（L7）。

## 📚 相关链接

- 仓库：[github.com/dsh-external/dsh-track](https://github.com/dsh-external/dsh-track)
- 协议 skill：[`skills/dsh-track/SKILL.md`](skills/dsh-track/SKILL.md)（决策点判据、任务推进纪律）
- 仓库约定：[`AGENTS.md`](AGENTS.md)（提交 / worktree / 文档双语规范）

## 📄 License

私有插件仓库（`package.json` 标记 `private`）；skill 元数据声明 **BSD-3-Clause**。
