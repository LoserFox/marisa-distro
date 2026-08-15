# 成长系统（唯一权威）

本文是 whale-girl **成长系统**的权威现状文档：经验、成就、回忆、情绪/彩蛋的完整契约。README 与决策记录只链接本文件，不重复事实。代码实现见 [.dsh-plugin/src/pet-state.mjs](../.dsh-plugin/src/pet-state.mjs)（账本纯函数）与 [.dsh-plugin/index.mjs](../.dsh-plugin/index.mjs)（事件接线）。

## 设计原则（积累型伙伴）

- **零负反馈**：无衰减、无惩罚、无需求；失败只计数与短暂失落，不扣资历。
- **积累型**：一切向上积累——真实的共同经历（任务/会话/陪伴时长）→ 资历。
- **单一 XP 轴**：等级纯派生，`level` 永远由 `xp` 计算，禁手写。
- **语义层封闭**：XP 数值、等级曲线、称号集合与阈值是**代码级封闭集合**（配置门禁守护，见 [config-system](../decisions/implemented/feature/2026-08-09-config-system.md)），用户/角色不可配置。

## 经验系统（XP / 等级）

### XP 来源

| 来源 | XP | 触发 |
|---|---|---|
| 完成任务 | +10 | `ctx.tasks.onTaskDone`（completed；页面关闭期也不漏记） |
| 新会话（startup） | +5 | `agent/session-start`，source='startup' |
| 续接/延续（resume/compact/clear） | +2 | 同上，其余 source |
| 活跃陪伴时长 | 累积 | 任务运行中按轮询差分累加；单次增量封顶 5min（防睡眠一夜刷满） |

- 请求错误（`agent/request-error`）**不计数不惩罚**——只触发情绪（见彩蛋）。
- 失败任务只计数（stats.failures），不扣 XP、不写「失败惩罚」语义。

### 等级曲线

- `xpForLevel(L) = 50·L·(L−1)/2`（L2=50、L3=150、L4=300…），反函数闭式解 O(1)。
- XP 上限封顶（XP_CAP=1e12）与浮点取整在持久化归一化（[persistence.mjs](../.dsh-plugin/src/persistence.mjs)）。

### 账本结构

`state.json`：`{ level, xp, stats{tasksDone, failures, sessions, activeMs, firstSeenAt}, titles[], memory[], updatedAt }`。多角色共享同一账本（资历归陪伴关系，见 [multi-character-ledger-shared](../decisions/implemented/feature/2026-08-09-multi-character-ledger-shared.md)）。

## 成就系统（称号）

里程碑解锁，**封闭集合**（加称号要同时改本表与 [.dsh-plugin/src/pet-state.mjs](../.dsh-plugin/src/pet-state.mjs) 的 TITLES）：

| id | 名称 | 解锁条件 |
|---|---|---|
| first-task | 初次协作 | 完成 ≥1 任务 |
| helper | 勤劳伙伴 | 完成 ≥20 任务 |
| veteran | 百炼成钢 | 完成 ≥100 任务 |
| regular | 常驻伙伴 | 累计活跃 ≥6 小时 |
| resilient | 越挫越勇 | 失败 ≥5 次 |
| social | 广结善缘 | 开启 ≥10 会话 |

- 解锁即：写入回忆 + 触发 celebrate 情绪。
- 称号由 stats 谓词**幂等派生**（checkTitles），已解锁不重复。

## 回忆系统（共同经历日志）

- 环形日志，最多 **8 条**（MEMORY_MAX）。
- 记录事件：完成任务「…」（第 N 个）、任务失败（第 N 次）、新会话开启（第 N 个）、回到旧会话、升到 Lv.N 🎉。
- 时间戳 `[HH:MM]`，状态条展示最新一条（hover 宠物显示）。

## 情绪/彩蛋系统（非数值，纯体验）

| 类别 | 机制 | 表现 |
|---|---|---|
| 瞬发情绪 | welcome / celebrate / error→disappointed / joy | 状态动画 + 窗口时长（可配置，见 [config-system](../decisions/implemented/feature/2026-08-09-config-system.md)） |
| 互动彩蛋 | 喂食/玩耍回话池（可配置）+ 爱心爆发 + 气泡 | 纯乐趣，无数值影响 |
| 会话陪伴 | think（思考）/ wait（等待批准）/ 回合完成气泡 | 多会话聚合（见 [session-thinking-state](../decisions/implemented/feature/2026-08-08-session-thinking-state.md)） |
| 行为彩蛋 | 游走散步 / 睡觉伸懒腰 / 拖拽挣扎 / onboarding 隐藏 | 位置/尺寸/游走可配置 |
| 零负反馈彩蛋 | 失败只「失落」不惩罚 | 「越挫越勇」是唯一把失败转正向的设计 |

## 未来方向（未实现）

- **token 消耗 XP**：机制提案已起草（plugin-registry 仓库 docs/proposal-agent-request-done-usage.md——跨仓库不链，见该仓库）——宿主暴露 usage 事件后可做次级 XP 来源（每 N token = 1 XP，防通胀）或独立「工作投入」统计。
- **更多称号维度**：夜猫子（深夜活跃）/ 多面手（多种任务 kind）/ 持久战（单次长任务）。
- **等级称号联动**：特定等级解锁专属称号/外观。
- **回忆回顾**：从最新 8 条扩展到可浏览的历史（当前只存环形尾部）。

## 边界

- **不可配置**（语义层封闭）：XP 数值、等级曲线、称号集合与阈值、MEMORY_MAX、XP 上限——防破坏账本一致性与称号可信度（`normalizeState` 以 xp 重算 level 的契约依赖这些常量稳定）。
- **不可由角色扩展**：触发事件与状态文法（STATE_TABLE 全角色共通）——角色必须提供全部 15 状态素材，不能新增动作语义。
