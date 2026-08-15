# 状态机（唯一权威）

本文是 whale-girl **动画状态机**的权威现状文档：状态清单、触发条件、优先级、转换语义、扩展指引。实现见 [.dsh-plugin/client/logic.mjs](../.dsh-plugin/client/logic.mjs)（`STATE_TABLE`，文法单源）与 [.dsh-plugin/index.mjs](../.dsh-plugin/index.mjs)（Node half 事件→窗口）。角色素材规格见 [sprites-spec.md](sprites-spec.md)，成长系统见 [growth-system.md](growth-system.md)。

## 设计原则

- **文法单源**：状态优先级由 `STATE_TABLE` 声明（行序即优先级，首个命中即返回），不散落 if 链。加状态/调优先级只改此表。
- **分工**：Node half 输出**事实窗口**（`{ name, until }`，welcome/celebrate/error/disappointed 的 burst）；client 做**本地交互选择**（drag/transient/joy/session/working 交替）。
- **零负反馈**：失败只触发情绪状态（error→disappointed），不惩罚、不持续。
- **降级（仅运行时）**：sheet 加载失败/迟到 → 舞台占位 + 控制台警告（manifest 门禁保证投放前不会缺，此处只防运行时异常）。

## 状态清单与触发

### 瞬发/覆盖态（优先级高，临时）

| 状态 | 触发 | 来源 | 说明 |
|---|---|---|---|
| `drag` | 用户拖拽（pointermove 越过 6px） | client 本地 | 拖拽中最高优先 |
| `idle`（缓冲） | 拖拽放下后 1.5s（`dragReleaseUntil`） | client 本地 | 放下缓冲，再进底层状态 |
| `eat` / `play` | 点击喂食/玩耍 | client 本地（`transient`） | 瞬发 1.5s，超时复位 |
| `wake` | 睡眠→醒来过渡（视觉边沿；交互醒觉：睡着时拖拽/喂食/玩耍/开菜单） | client 本地 | 瞬发 3s，非循环 |
| `wait` | 任一会话等待批准 | client（sessions 订阅） | 陪伴底座，覆盖 sleep/walk |

### 事件 burst（Node 窗口，until 有效期内优先）

| 状态 | 触发事件 | 窗口 | 说明 |
|---|---|---|---|
| `welcome` | `agent/session-start`（startup） | 6s（可配） | 新会话欢迎 |
| `celebrate` | 任务完成/升级/称号 + **回合完成**（session running→false 边沿，含当前会话） | 6s（任务，可配）/ 4s（回合，client 本地） | 任务层双源同窗（事件+轮询）；回合层 client 本地窗口 |
| `error` | 任务失败/`agent/request-error` | 4s（可配） | 惊吓，负面窗口 |
| `disappointed` | 失败后尾段 | 6s（可配） | 失落，紧跟 error |

### 持续态（底层派生，优先级低）

| 状态 | 触发 | 说明 |
|---|---|---|
| `working` | 思考陪伴期随机插曲（client 节奏器，`workingActive`） | 大部分时间 think，偶尔（随机触发、随机时长）工作姿态 |
| `think` | 任一会话运行/思考（sessions 订阅） | 沉思陪伴（常态） |
| `joy` | 互动后短时 | 1.6s |
| `sleep` | 空闲 ≥60s（可配） | 打盹 |
| `walk` | 周期性游走（18-40s 间隔，可配） | 散步 |
| `idle` | 兜底 | 待机（睁眼静止，随机间隔眨眼） |

### 工作陪伴（working ↔ think）

`think` 是思考陪伴的**常态**（任一会话运行中）。`working` 是 client 节奏器**随机插入**的工作插曲：随机触发间隔（12-30s）、随机持续时长（2.5-6s），大部分时间保持 think 沉思，偶尔摆出「认真干活」姿态。插曲决策在纯函数 `nextWorkingRhythm`（注入随机源、可单测）；会话不活跃时插曲撤防。**working 不是任务指示灯**（不随 Node `activity.working` 驱动——agent 思考阶段本就无任务，由 client 节奏器随机插入）。

## 优先级（STATE_TABLE 行序，文法单源）

逐行列表即行序（`N.` 后的状态 token 与 `.dsh-plugin/client/logic.mjs` 的 `STATE_TABLE` 行序一致，由 verify-spec-states 门禁机械校验——改行序必须同时改本列表与 STATE_TABLE）：

1. `drag`
2. `idle`（拖拽放下缓冲）
3. `burst`（`welcome`/`celebrate`/`error`/`disappointed`）
4. `eat` / `play`（瞬发）
5. `wake`
6. `wait`
7. `celebrate`（回合完成，client 本地窗口）
8. `working`（随机插曲）
9. `think`（常态）
10. `joy`
11. `sleep`
12. `walk`
13. `idle`（兜底）

## 状态转换语义

- **瞬发/覆盖态结束后**：不硬编码回 idle——重新计算底层派生状态（`pickState` 每 tick 重算）。
- **临时覆盖不抢戏**：事件 burst > 用户互动 > 陪伴态；失败情绪不被新会话欢迎盖掉（welcome 不打断 error/disappointed 尾段）。
- **用户交互醒觉**：拖拽放下/喂食/玩耍/开菜单都是用户在场信号——空闲计时从交互时刻重新起算（`wakeFromInteraction`），交互后保持清醒直至再次空闲 ≥ sleepAfterMs；交互瞬间若正睡着则附加 wake 醒觉过渡（拖拽放下先走 1.5s idle 缓冲再 wake）。
- **会话活跃保持清醒**：think/wait 覆盖 sleep/walk（陪伴底座）。
- **朝向连续 + 随机转身**：素材统一朝左基准（flip=1 朝左、flip=-1 镜像朝右）；方向由 walk/drag 写入（walk 向右走 flip=-1、向左走 flip=1；drag 同向），静态态沿用（不无谓跳回默认）；idle/think/wait 随机转身（`nextFacingAt`，10-25s 间隔）。素材规范见 [sprites-spec.md](sprites-spec.md)。

## 扩展指引（给新角色/新状态）

### 加一个新状态（行为级，平台变更）
1. `.dsh-plugin/client/logic.mjs` `STATE_NAMES` 加状态名 + `STATE_TABLE` 加行（`{ state, when, resolve? }`），位置决定优先级
2. `assets/manifest.json` 每个角色 `states` 加条目（**必填 sheet**——素材全量契约）
3. `docs/sprites-spec.md` 状态总表同步（verify-spec-states 门禁强制 spec ↔ STATE_NAMES ↔ STATE_TABLE）
4. 决策记录（行为文法变更）

### 加角色（不新增状态）
- 角色必须提供**全部 15 状态**的 sheet（`characters.<id>.states` 全量映射，缺一即门禁拒收——不再 emoji 降级）
- 帧数/fps/motion 角色可选（表现层）；触发/优先级全角色共通（行为层）
- **完整操作指南（事件→动作映射、动作槽位、动手步骤）见 [adding-a-character.md](adding-a-character.md)**
- 详见 [character-manifest 决策](../decisions/implemented/feature/2026-08-09-character-manifest.md)

### 新角色的素材要求（全量契约）

角色必须提供**全部 15 状态**的 sheet（`idle/walk/working/celebrate/error/disappointed/joy/eat/play/drag/sleep/wake/welcome/think/wait`）——`verify-assets` 门禁强制，缺一即拒收。不再有「核心状态集 + 可选 emoji 兜底」：素材必须全。

## 触发源（Node half → client）

| 宿主事件 | Node half 处理 | client 输入 |
|---|---|---|
| `tasks.onTaskDone` | 记账 + celebrate/failure 窗口 | `activity` |
| `agent/session-start` | 会话 XP + welcome 窗口 | `activity` |
| `agent/request-error` | error/disappointed 窗口 | `activity` |
| sessions.list 快照 | — | `sessionThink` / `sessionWait` / 回合完成翻转→`celebrateUntil` |
| 节奏器（client 本地） | — | `workingActive`（随机插曲）/ `celebrateUntil`（回合完成窗口） |
| 用户 pointer/点击 | — | `dragging` / `transient` / `joyUntil` / `wakeFromInteraction`（交互醒觉：拖拽/喂食/玩耍/开菜单重置空闲 + 睡着则 wake） |
