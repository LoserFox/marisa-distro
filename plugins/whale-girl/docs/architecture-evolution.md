# whale-girl 架构演进设计（subagent 评审综合）

> 本文件综合 4 个独立 subagent 的架构评审（角色扩展性 / 开放性 / 配置系统 / 第一性原理），
> 输出支撑「换角色、用户自定义、可配置」三目标的架构设计。评审基于代码实况（2026-08-09）。
>
> **状态：历史设计快照（2026-08-09）。** 其中的提案多已落地或被后续决策取代——现状以
> [state-machine.md](state-machine.md)、[sprites-spec.md](sprites-spec.md)、[growth-system.md](growth-system.md)
> 与 `decisions/implemented/` 为准；本文只作演进脉络与备选方案参考。

## 本质定义（第一性原理）

> **宠物不是生物、不是状态机，而是「宿主工作台事件流的积累折返（fold）与实时投影」**——
> 把任务/会话/错误的脉搏折叠成资历（持久账本）与此刻情绪（活动投影），再按一份可替换的
> 表现清单（manifest）渲染出来的陪伴视图。

由此推导的职责分离：**账本（真相，Node）** · **投影（事实，纯函数）** · **选择（状态，client）** ·
**视图（渲染，数据驱动）**。现状已在正确内核上（5 个 src 模块纯函数化 + 单测 + 数据驱动 manifest +
事件驱动记账 + 门禁文化），真正的结构性缺口是**行为文法（优先级/窗口/事件映射）是硬编码而非数据，
且被劈成两份不可测实现**（该缺口已由 [state-table-grammar 决策](../decisions/implemented/feature/2026-08-09-state-table-grammar.md) 关闭：STATE_TABLE 文法单源 + verify-spec-states 机械守护）。

## 一、角色/外观扩展性（subagent：skin）

### 抽象分层
- **行为层（共通，不可替换）**：15 状态语义、pickState 优先级、过渡语义、motion 白名单、
  帧播放器、拖拽/菜单/状态卡/sessions 订阅/wander——任何角色共享。
- **角色 character（可替换单元）**：`{ id, name, credit?, meta{ stageSize, maxSprite, anchor }, states: {状态→动画集} }`
- **动画集 animation set（最小替换单元）**：现 manifest.states 条目 `{ sheet, frames, fps, playback, motion }`（playback 数据驱动，见 [playback-data-driven](../decisions/implemented/feature/2026-08-09-playback-data-driven.md)）。
- **主题 skin（暂不落地，接口预留）**：同角色多配色时才有独立存在意义（YAGNI），解析函数签名预留 overlay 位。

### 数据面
```jsonc
// assets/manifest.json 升级为角色索引（兼容顶层 states 旧读）
{ "characters": { "whale-girl": { "meta": { "stageSize": 110, "credit": "ZipZipPipe" },
                                   "states": { /* 现 states 原样搬入 */ } },
                  "cat": { "meta": { "stageSize": 96 }, "states": { /* 全部 15 状态 */ } } },
  "default": "whale-girl" }
// assets/characters/<id>/<sheet>.png —— Node half 零改动（assets 路由已支持子目录）
// 注：素材全量契约要求每角色 15 状态全有 sheet（缺一即门禁拒收），见 asset-full-contract 决策
```

### 关键改造点（client 三处参数化）
| 现硬编码 | 改为 |
|---|---|
| `manifest.states[name]` | `stateOf(character, name)` → undefined 即占位（素材全量契约，门禁保证不会缺） |
| `ASSETS_URL/${sheet}` | `assetUrlFor(characterId, sheet)` |
| `loaded`/`sheetSize` 以裸 sheet 名为 key | key 加 `${characterId}:${sheet}` 前缀（防切角色串图） |
| `SPRITE_MAX=110` + CSS 110px | 角色 `meta.stageSize/maxSprite` → CSS 变量 `--pet-stage-size` |

### 降级（现成机制显式化）
素材全量契约：角色必须提供全部 15 状态 sheet（verify-assets 门禁强制，缺一即拒）；运行时 sheet 加载失败 → 占位 + 警告。

### 演进路径
- **P1 角色清单化**：✅ 已完成（manifest 角色索引 + .dsh-plugin/client/character.mjs + 门禁多角色，见 [character-manifest](../decisions/implemented/feature/2026-08-09-character-manifest.md)）。
- **P2 切换 UX**：✅ 已完成（菜单「换角色」+ localStorage 偏好 + stageSize 接入 --pet-size）。
- **P4 外部角色包——留档边界（当前不做）**：
  - **是什么**：第三方开发者独立发布「角色皮肤包」插件，用户安装后宠物可换用该角色——像游戏 MOD/皮肤市场。角色从「随 whale-girl 内置」升级为「独立分发单元」。
  - **为什么需要 plugin-registry**（前提已过时：独立分发已迁官方 repository-plugin——config.yaml `github:` 源，见 [migrate-to-official-repository-plugin](../decisions/implemented/simplification/2026-08-10-migrate-to-official-repository-plugin.md)）：registry 是当时生态里「独立分发一个包」的唯一机制（`dsh plugin install <dir|tgz>`，每插件独立安装/启用/卸载 + 信任模型）；whale-girl 是单插件，无法自造「安装另一个独立包」的能力，重复造轮子还会破坏统一生命周期与信任模型。
  - **需要的机制改动（触发时做）**：① registry `contributes` 开放角色包声明（当前封闭集合仅 tools/skills）；② registry 暴露「按插件 id 读静态资源」通道（whale-girl 的 assets 路由只读自己目录）；③ whale-girl 角色清单双来源（内置 + 外部角色包扫描）、资源 URL 跨包；④ 角色包协议文档（character.json + 素材规格，复用 sprites-spec 纯绿/帧契约）。
  - **触发条件**：出现真实第三方角色包需求（有第二个角色、有人要发包）——需求为零时做平台级能力是过度设计；自然演进是先有第二个**内置**角色（验证多角色系统），再启动 P4。

## 二、开放性（subagent：open）

### 自定义维度排序（价值/成本/风险）
| 档 | 维度 | 推荐 |
|---|---|---|
| A1 | 回话文本池（interact 回话+气泡模板+菜单/状态卡文案） | ✅ v1 开 |
| A2 | 行为/计时常量（burst 窗口、睡眠/游走阈值） | ✅ v1 开 |
| A3 | ~~EMOJI 兜底表~~（v5 删除：素材全量契约） | — |
| B1 | 互动动作表（泛化 feed/play） | ⏸ v1.5 |
| B2 | 称号文案与解锁阈值 | ⚠️ 只开文案+阈值，不开 XP/曲线 |
| C1/D1 | 触发规则 / 自定义互动语义 | 🔒 封闭（账本/状态机核心） |

**原则：表现层开放、语义层封闭、安全面封闭。** 开放判据 = 改坏了是否伤及账本不变量或宿主安全。

### 接口形态
- **JSON 配置**为主形态（`<dshHome>/data/whale-girl/pet.config.json`，按请求读盘 + mtime 缓存，改配置免重启）——已落地为**宿主 settings 配置**（settings.yaml 的 `whale-girl:` section，见 [config-system](../decisions/implemented/feature/2026-08-09-config-system.md)）。
- **无 Agent 工具面**（2026-08-10 起删除全部 Agent 工具，互动纯 GUI——见 [remove-agent-tools](../decisions/implemented/simplification/2026-08-10-remove-agent-tools.md)）：不向模型开放读写。
- **不引入脚本 DSL**：规则面用声明式谓词（`{ field, op, value }`，op 白名单枚举）。
- **第三方插件**：Node half `ctx.provide('pet', service)` 只读服务（账本快照+信号订阅）+
  client half 文档化 CustomEvent（`whale-girl:say`/`whale-girl:fx`）——生态原生机制，v1 不做「平台」承诺。

## 三、配置系统（subagent：config）

### 三层归属
- **L1 体验层（用户可配）**：宿主 settings namespace `whale-girl`——尺寸/透明度/游走/睡眠/轮询/气泡/
  回话文案池 + Node 侧 burst 窗口。
- **L2 语义层（代码级）**：XP/等级曲线/称号阈值/MEMORY_MAX/ACTIVE_CAP/XP_CAP——**进不得配置**（
  理由：normalizeState 以 xp 重算 level，配置化即跨设备漂移；称号阈值可配即语义崩塌）。
- **L3 契约/安全层（不可配）**：BODY_LIMIT/路由/CSRF/路径净化。

### 关键现实约束
- 宿主 `contributes` 是**封闭集合（仅 tools/skills）**——配置 schema 由插件运行时注册到
  `ctx.settings`（schemastery），权威在代码 `.dsh-plugin/src/config.mjs`（零宿主依赖、可单测、铺路未来 manifest 开放）。
- **单一权威持久源**：settings.yaml（体验层）+ localStorage 仅位置。客户端体验 override 仅内存级，防双持久层漂移。
- **热更新**：settings-local chokidar 热发布 → `scope.watch` → /state 带 `configRevision` → 客户端
  下一轮轮询感知。`applies: 'live'` 免重启。
- **写入口信任边界**：用户设置 UI / settings 文件 /（可选）菜单面板 POST /config；**不向模型工具开放写**。
- **门禁**：`verify-settings-schema`（拒绝缺默认值/未 clamp/语义层字段名）+ `verify-config-sync`
  （消费端单源引用）+ 语义层引用门禁（`.dsh-plugin/src/config.mjs` 不得 import 语义常量）。

## 四、第一性原理重构路径（subagent：first）

### 硬编码「换了就崩」清单（按严重度）
| # | 硬编码 | 崩法 |
|---|---|---|
| 1 | `pickState` if 链 + Node 级联（同一文法两半） | 加状态/调优先级须改两个 half + spec，漏一处即文法漂移 |
| 2 | `TITLES` 封闭集合 + 阈值 | 加称号改代码+spec 两处，normalizeState 静默丢未知称号 |
| 3 | `record*` 散函数 + XP 常量 | 新事件源=新函数+手工接线，无通用事件面 |
| 4 | 状态名散落六处（manifest/EMOJI/pickState/级联/spec/门禁） | typo 状态名静默渲染 🐣 |
| 5 | `CELEBRATE_MS == BURST_MS` 靠注释维持 | 改一个忘另一个，窗口漂移 |
| 6 | 窗口级联在 apply() 闭包（.dsh-plugin/index.mjs） | 项目唯一无单测的语义核心 |

### 重构路径
- **P0（重构不新增特性，AGENTS.md 已授权「可自由重组」）**：
  1. **文法单源化**：/state 从 `{name, until}` 改返回事实集 `{working, bursts[]}`，Node 级联下沉进
     client 声明式状态表；`pickState` 变数据驱动解析器（状态表：`{id, triggers, priority, window, fallback}`）。
     → 消除 #1/#4/#6。
  2. **配置面**：`.dsh-plugin/src/config.mjs` + settings 注册 + /state 下发（体验层最小集）。
  3. **事件表声明化**：`events → {xp, statsPatch, memoryTemplate, burst?}` 替代 record* 散函数 → 消除 #3。
  4. **契约文档化**：/state facts schema 与 sessions 快照归约为同一「活动事实契约」（两份 producer、一个 consumer）。
- **P1（特性）**：think/wait 补 sheet（✅ 已完成）；多角色账本（已落地为**多角色共享账本**，见 [multi-character-ledger-shared](../decisions/implemented/feature/2026-08-09-multi-character-ledger-shared.md)）；账本升级追加式事件日志。
- **P2（平台）**：轮询→推送（dsh-client-connection）；表现尺寸参数化。

## 五、优先级建议（落地顺序）

1. **配置系统（体验层最小集）**——价值最高、改动可控（.dsh-plugin/src/config.mjs + settings 注册 + /state 下发），
   直接回答「用户自定义」。
2. **角色清单化 P1**——换角色零改代码，回答「扩展性」；与配置系统正交可并行。
3. **文法单源化 P0**——结构性重构，是所有后续演进的安全底座；建议在配置与角色之后做
   （先有稳定的配置/角色面，再统一文法，避免同时改两处）。
4. **开放性窄缝（ctx.provide + CustomEvent）**——生态机制铺路，独立小改动。

## 验证与纪律

- 每个演进一个 PR 一种性质 + 决策记录（含 Alternatives considered）。
- 门禁先行：verify-settings-schema / verify-config-sync / verify-assets 多角色遍历，各配非法样例自证。
- 验证纪律不变：Node half 改动 web 重启；.dsh-plugin/client/assets 改动重装+刷新；冒烟跑 verify-client-smoke。
