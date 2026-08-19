# Sprite 素材规格（生图契约）

本文是 whale-girl 动画素材的**唯一权威规格**：状态清单、生图契约、运动配方、投放流程。README 只链接本文件；改动本清单必须同时改 [lib/client/logic.mjs](../lib/client/logic.mjs) 的状态选择、[lib/client/index.mjs](../lib/client/index.mjs) 的运动类与 `assets/manifest.json`（素材全量契约：每个角色必须含全部 15 状态，缺一即被门禁拒收）。

## 机制原则（积累型伙伴）

**零负反馈**：宠物没有饥饿/心情等会衰减、会惩罚冷落的需求；失败只短暂失落（`disappointed` 瞬发），不持续不扣资历。**积累型**：一切向上积累，真实的共同经历（完成任务/会话/陪伴时长）→ 资历等级/称号/回忆。

## 素材管线（AI 生图 → 规范 PNG 资源）

**每张生图 = 3×3 网格**（行 = 状态、列 = 帧；静态姿势 1 帧占 1 格，行内帧横排、格间留白）。帧内一致天然保证（同一张图），状态间一致性靠参考图。不用「单张 2K 大图含全部状态」方式（网格切分对不上、单帧无中间过程）。

**工具**：[scripts/slice-sheet.py](../scripts/slice-sheet.py)——AI 生图 → 规范 PNG 资源的通用工具（PIL+numpy，无第三方依赖）。三种模式 + 规范化参数：

| 模式 | 适用 | 示例 |
|---|---|---|
| `--single` | 单状态（单图/左右分栏，如 think|wait） | `--single --columns 2 --states think,wait --key 252,2,249` |
| `--grid` / `--auto` | 网格图（每格一子图） | `--grid 3x3 --key auto` |
| `--sheet` | 网格图（行=状态、列=帧，连通域分段） | `--sheet 3x3 --states idle,working --frames 3,3 --key auto` |

**通用参数**：`--key`（抠图：gray/auto/R,G,B）、`--size`（默认 256）、`--normalize-scale`（内容占比目标，默认 0.88 = 角色高度占帧 88%，自动加透明边缘）、`--align`（底对齐默认/居中）、`--swap-frames`（帧序校正，AI 帧序乱时如 `--swap-frames 2,0,1`）、`--out`（输出目录）。

1. **生图**：3×3 网格图（纯色背景，见提示模板），参考 [originals/鲸鱼娘.png](../originals/鲸鱼娘.png) 锁风格。
2. **切分/归一化**：`python3 scripts/slice-sheet.py <图> <模式> --key <色> --out assets/characters/<角色id>/` → 行带连通域分离 → 逐帧裁切 → 质心配准（±2px 钳制）→ 底中对齐 → 内容占比 88% → 帧横排 sheet（帧 256×256）。工具自证测试：`python3 tests/slice-sheet.test.py`（门禁 tool-tests）。
3. **投放**：sheet 进 `assets/characters/<角色id>/`，`assets/manifest.json` 的角色 `states` 加条目（`frames: N` + 可选 `motion`；`verify-assets` 门禁保证引用存在与多角色遍历）。

**点击热区（跟随当前状态）**：client 逐状态分析 sheet 不透明像素 bbox（0-1 归一化），热区贴合**当前显示状态**的实际轮廓——状态切换时热区实时收窄/放宽（各状态内容占比 55-88% 差异大：walk 横向仅 55%，若用全部状态并集会被宽幅状态撑大）。素材内容占比 88% 契约给动画留呼吸空间，热区因此比角色轮廓略大属预期（0 边界会破坏帧契约）。

## 生图提示模板（每状态一行，纯色背景）

**背景要求（关键）**：**纯绿色 `#00FF00`**——鲸鱼娘配色（蓝/紫/粉）与洋红底在色域重叠（实测反复出现洋红残边/微斑），与绿色**完全不相交**（距离 360+），键抠零歧义。❌ 洋红/粉/紫底（与角色配色冲突）；❌ 白/浅灰底；❌ "透明背景"提示（Gemini 只画假透明棋盘格）。

> 生成一张 1024×1024 的贴纸插画：背景为**纯绿色（#00FF00）**，无渐变/纹理/杂色。角色是《鲸鱼娘》表情包角色，画风、配色、线条比例与参考图完全一致，角色本身**不得含洋红色**；全身取景、居中、占画面约 80%，**人物朝向一律朝左**（统一素材朝向基准，见「朝向与素材朝向规范」）。**<状态画面描述>**。需要动感的状态加一句："画面为 **N 个动作帧横排**（从左到右依次为动作过程），帧间等宽、互不重叠、无分割线"。

| 状态 | 帧数 | 画面描述 |
|---|---|---|
| `idle` | 3 | 正面站立待机：第 1 帧睁眼、第 2 帧闭眼（眨眼）、第 3 帧微睁，身体呼吸起伏 |
| `working` | 3 | 一手托腮思考：头微倾、眼神专注、头顶小灯泡，三帧为思考的轻微晃动 |
| `celebrate` | 3 | 双手高举欢呼：三帧为跳起的起跳—腾空—落下，周围小星星 |
| `error` | 2 | 惊吓：第 1 帧正常、第 2 帧瞪眼张嘴呆毛炸起，一个感叹号 |
| `disappointed` | 2 | 低头垂肩：第 1 帧正常、第 2 帧低头含泪叹气 |
| `joy` | 2 | 眯眼咧嘴大笑，身体微倾，周围小爱心，两帧轻微摆动 |
| `eat` | 3 | 双手捧食物啃咬：咬下—咀嚼—咽下，腮帮鼓起 |
| `play` | 3 | 抛接小球：抛出—腾空—接住，身体蹦跳 |
| `drag` | 1 | 被斜向拉扯：单帧身体倾斜双手乱摆（拖拽态由 `tilt` 运动配方持续摇摆） |
| `walk` | 3 | **侧面行走**：左到右依次为迈步循环（抬左腿—落脚—抬右腿），身体微微起伏 |
| `sleep` | 2 | 蜷缩闭眼睡觉：身体随呼吸起伏两态，头顶 Zzz |
| `wake` | 2 | 伸懒腰：第 1 帧闭眼张嘴打哈欠、第 2 帧揉眼睛睁开 |
| `welcome` | 2 | 举手挥手打招呼：两帧为挥手上下摆动，周围小星星 |
| `think` | 1 | 沉思陪伴：双手托腮、眼神望向远处（会话思考中），单帧 + 轻微上下浮动 |
| `wait` | 1 | 等待回应：身体前倾、眼睛看向观众（等待批准时），单帧 + 轻微左右摇摆 |

## 状态总表（权威，15 状态）

窗口时长不在此重复：burst/瞬发窗口的毫秒值只存 [lib/index.mjs](../lib/index.mjs)；**完整触发条件/优先级/转换语义见 [state-machine.md](state-machine.md)（唯一权威）**，本表触发列只写事件来源。motion 配方与帧播放器默认互斥（`motion` 只配 `frames:1`）；`error` 是唯一多帧+运动叠加的定向例外（见下方规则）。`think`/`wait` 已有 sheet（1 帧 + `float`/`wiggle` 运动配方），表内为实际投放。

| 状态 | 触发 | 帧数 | motion 配方 | 播放行为 | 画面 |
|---|---|---|---|---|---|
| `idle` | 默认（常态睁眼静止，随机间隔眨眼） | 3 | — | `blink` | 待机站姿（帧0睁眼常态，随机眨眼 0→1→2→0） |
| `working` | 思考陪伴期随机插曲（client 节奏器，大部分时间 think） | 3 | — | `loop` | 托腮思考 |
| `celebrate` | 任务完成/升级/称号（burst，事件+轮询双源）/回合完成（client 本地窗口） | 3 | — | `loop` | 举手欢呼 |
| `error` | 失败/`agent/request-error`（burst） | 2 | `shake`（定向例外） | `once` | 正常→惊吓，播完僵住颤抖 |
| `disappointed` | 失败后短时失落（burst 尾段） | 2 | — | `loop` | 垂头含泪 |
| `joy` | 投喂/玩耍后短时 | 2 | — | `loop` | 眯眼笑 |
| `eat` | 点击投喂（瞬发） | 3 | — | `loop` | 啃咬循环 |
| `play` | 点击玩耍（瞬发） | 3 | — | `loop` | 抛接球循环 |
| `drag` | 拖拽中 | 1 | `tilt` | `loop` | 被斜向拉扯 |
| `walk` | 周期性游走 | 3 | — | `pingpong` | 侧面行走（往返步态） |
| `sleep` | 空闲 ≥60s | 2 | — | `loop` | 蜷睡 |
| `wake` | 睡醒过渡（瞬发） | 2 | — | `once` | 伸懒腰，播完保持末帧 |
| `welcome` | 新会话（burst） | 2 | — | `loop` | 挥手打招呼 |
| `think` | 任一会话运行中（sessions 订阅，陪伴底座） | 1 | `float` | `loop` | 沉思陪伴（托腮望向远处，上下浮动） |
| `wait` | 任一会话等待批准（sessions 订阅，陪伴底座） | 1 | `wiggle` | `loop` | 等待回应（前倾看向观众，左右摇摆） |

### 播放行为（playback，manifest 必填）

帧播放模式决定**每帧如何被推进**（播放器按此数据驱动，不再按状态名特判）：

| 模式 | 帧序 | 帧数下限 | 示例 |
|---|---|---|---|
| `loop` | 正向循环 0→1→…→N-1→0（帧0=常态起点） | ≥1 | working/celebrate/joy/eat/play/sleep/welcome 等 |
| `pingpong` | 往返 0→1→…→N-1→…→0（帧0/末帧为两端姿态） | ≥2 | walk（左右腿步态） |
| `once` | 播完保持末帧（帧0=起点、末帧=完成态） | ≥1 | wake（伸懒腰）、error（僵住+shake） |
| `blink` | 常态帧0静止 + 随机间隔触发一次动作播完回帧0 | ≥2 | idle（随机眨眼） |

帧序语义契约：**帧0 = 常态起点**（所有模式）——生图时第 1 帧画起点姿态，动作过程在后续帧。

### 朝向（flip）与素材朝向规范

**素材统一朝左基准**（角色契约，全角色适用）：所有状态素材的人物默认朝左（flip=1 显示朝左、flip=-1 镜像显示朝右）。生图时人物一律朝左；代码 flip 以朝左为基准（walk 向右走 flip=-1、向左走 flip=1；drag 向左拖 flip=1、向右拖 flip=-1；静态态随机转身 flip 翻转）。**代码不得依赖具体角色的朝向**——素材契约保证 flip=1 恒为朝左，第二个角色同样遵守即零代码改动。

方向写入点：**walk**（按移动方向）、**drag**（按拖拽位移方向）；静态陪伴态（`idle`/`think`/`wait`）沿用其方向（**动作间朝向连续**，不无谓跳回默认），并**随机转身**（`nextFacingAt`，间隔 10-25s，见 [state-machine.md](state-machine.md)）。

**朝向统一状态**：walk/eat/drag/joy/play/wake/welcome 素材已统一朝左；其余状态素材本就朝左。**生图时人物一律朝左**——新状态/新角色不遵守会在审计时暴露（帧内左右比偏离 1 即提示）。

优先级（[lib/client/logic.mjs](../lib/client/logic.mjs)）：`drag` > 事件 burst（`welcome`/`celebrate`/`error`/`disappointed` 窗口内）> 瞬发（`eat`/`play`/`wake`）> `wait` > 回合完成 `celebrate`（client 本地窗口）> `working`（随机插曲）> `think` > `joy` > `sleep` > `walk` > `idle`。会话活跃时宠物保持清醒陪伴（覆盖 `sleep`/`walk`），用户互动与事件反馈不抢戏。

## 角色契约（第二角色接入清单）

**一个新角色 = 15 张 sheet + 1 段 manifest**，零代码改动。素材契约由 verify-assets 门禁强制：

| # | 契约项 | 要求 |
|---|---|---|
| 1 | 状态全量 | 必须提供**全部 15 状态** sheet（缺一即门禁拒收） |
| 2 | 素材规范 | 纯绿底 `#00FF00` / 帧 256×256 / 内容占比 88% / 底对齐 / 帧横排 / **人物一律朝左** |
| 3 | 帧序语义 | **帧0 = 常态起点**；动作过程在后续帧（生图时第 1 帧画起点姿态） |
| 4 | 播放行为 | 每状态声明 `playback`（loop/pingpong/once/blink），帧数满足下限 |
| 5 | 文件命名 | `assets/characters/<id>/<状态名>.png`，角色 id 限 `[a-z0-9-]` |

**每帧具体行为**见上方「播放行为（playback）」表——每个状态的帧数、播放模式、帧序语义、画面描述都在状态总表内，照表生图即可。

## manifest 模板（角色索引；whale-girl 15 状态全量）

`verify-assets` 要求每个角色 manifest 含全部 15 状态（素材全量契约——缺 sheet 不再 emoji 降级，门禁拒收）。角色索引格式：`characters.<id>.states`（sheet 在 `assets/characters/<id>/`）；`default` 指定默认角色；顶层 `states` 为旧格式兼容简写（单角色、sheet 平铺 `assets/`），`verify-assets` 两种格式都校验。

```json
{
  "characters": {
    "whale-girl": {
      "name": "鲸鱼娘",
      "credit": "ZipZipPipe",
      "meta": { "stageSize": 110 },
      "states": {
        "idle":         { "sheet": "idle.png",         "frames": 3, "fps": 2,  "playback": "blink" },
        "working":      { "sheet": "working.png",      "frames": 3, "fps": 3,  "playback": "loop" },
        "celebrate":    { "sheet": "celebrate.png",    "frames": 3, "fps": 4,  "playback": "loop" },
        "error":        { "sheet": "error.png",        "frames": 2, "fps": 8,  "playback": "once",  "motion": "shake" },
        "disappointed": { "sheet": "disappointed.png", "frames": 2, "fps": 2,  "playback": "loop" },
        "joy":          { "sheet": "joy.png",          "frames": 2, "fps": 5,  "playback": "loop" },
        "eat":          { "sheet": "eat.png",          "frames": 3, "fps": 8,  "playback": "loop" },
        "play":         { "sheet": "play.png",         "frames": 3, "fps": 4,  "playback": "loop" },
        "drag":         { "sheet": "drag.png",         "frames": 1, "fps": 5,  "playback": "loop",  "motion": "tilt" },
        "walk":         { "sheet": "walk.png",         "frames": 3, "fps": 6,  "playback": "pingpong" },
        "sleep":        { "sheet": "sleep.png",        "frames": 2, "fps": 1,  "playback": "loop" },
        "wake":         { "sheet": "wake.png",         "frames": 2, "fps": 3,  "playback": "once" },
        "welcome":      { "sheet": "welcome.png",      "frames": 2, "fps": 3,  "playback": "loop" },
        "think":        { "sheet": "think.png",        "frames": 1, "fps": 2,  "playback": "loop",  "motion": "float" },
        "wait":         { "sheet": "wait.png",         "frames": 1, "fps": 2,  "playback": "loop",  "motion": "wiggle" }
      }
    }
  },
  "default": "whale-girl"
}
```

> 规则（verify-assets 门禁强制）：**`motion` 只允许配 `frames: 1`**——多帧状态由帧播放器动画，运动配方与帧播放器互斥（单帧状态才用 CSS 运动补充）。**定向例外：仅 `error`（2 帧「正常→惊吓」+ `shake`）**——一次播完僵住后由 CSS 颤抖维持 burst 窗口内的持续表现（见决策记录动画编排修订）。**角色 id 只允许 `[a-z0-9-]`**（URL 路径安全，防注入）。

**角色 meta 可选字段**（[lib/client/character.mjs](../lib/client/character.mjs) 解析）：`stageSize`（舞台尺寸 px，默认 110；未配置时经 `--pet-size` 生效）。

## 资历与称号（积累型）

XP/等级/称号/回忆/情绪的完整契约见 [docs/growth-system.md](growth-system.md)（唯一权威），本文件只保留与素材相关的部分（称号列表在素材规格中无关联，不再重复）。

## 投放与验证

1. 生图产物（3×3 网格，纯色背景）放 `assets/raw/`（gitignored，不入库）。
2. `python3 scripts/slice-sheet.py assets/raw/<图>.png --sheet 3x3 --states <行状态名> --frames <每行帧数>` → 帧 sheet 写入 `assets/`。
3. `assets/manifest.json` 加/改条目（`verify-assets` 门禁保证引用与 PNG 尺寸契约，缺文件即红）。
4. 实况验证：按 [README「安装」](../README.md#安装) 方式重装（`dsh plugin --profile web add` git 源）→ **刷新页面即可**（assets/ manifest 改动无需重启 web——assets 路由按请求读盘）；改 Node half（lib/index.mjs/src）才需重启 web 且日志须无 `plugin tree failed to load`；改 client 后跑 `node scripts/verify-client-smoke.mjs <web-url>`。
