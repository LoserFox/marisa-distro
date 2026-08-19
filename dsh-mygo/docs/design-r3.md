# design-r3：mygo 运行期与生态层设计定稿

> 生成时间：2026-08-11 · 输入均为既有证据文档，按编号引用；禁止另起炉灶。
> 本阶段只产设计与计划，不写实现代码。

## 0. 输入与方法

引用输入：

- `docs/expected-behavior.md`（FROZEN 基线）：EB-N1..N13 / EB-D1..D22
- `docs/ecosystem-verification.md`：C1..C11 规范变更、T1..T11 测试场景
- `docs/community-census.md`：Rev-1..6 契约修订、D1..D7 任务、T1..T7 测试场景
- `docs/two-tier-contract.md`（含 Rev 修订记录）
- `docs/round-closeout.md` §16：Proxy 三处裸值发布点（lifecycle.ts:762 / 1851 / 2908 / 2937-2940）
- R1：`docs/design.md`（manifest v2、求解器、lockfile、安装时求解/加载时校验、报告格式）
- R2：`docs/design-r2.md`（bundles/provides/loader、pins、符号级校验、确定性）
- 作者野外原型：dsh-vibe-mode 的 `dsh.mygo.compatibility.requires`（包级 id + `service:` 前缀双写法）
- 既有运行时代码词汇：`packages/cordis/mygo/src/types.ts`（`PluginCompatibility` 的 requires/provides/breaks）、`semver-range.ts`（check-only 区间词汇）、`lifecycle.ts`（provideTable/provideValue/syncProvideState）

贯穿约束：侵入最小化（L0 扩展点 > L1 mygo 边界 > L2 附加型补丁 > L3 行为型补丁需人工审批）；vendor 改动登记 PATCHES.md（当前仅 #1 epoch getter，`test-r05En1cU-0811/vendor/PATCHES.md`）；每条决策 MUST 引用输入编号；禁止引入输入之外的新机制（任务二双命名空间由作者原型直接授权）。

## 1. 任务一：设计决策拍板（7 条 [设计决策]）

### 1.1 EB-D10 —— 细 epoch 模型

**裁决：采纳（补充求值约束与既有边界）。**

最终措辞：

> 细 epoch = 确定性元组 `(provider-uid 元组, 版本元组, 符号投影元组, 政策事实元组)`，在挂载时缓存的导出快照上以纯内存比较求值（EB-D20）；原生粗 epoch（uid 拼接串，EB-N1/N8）是其投影——细变粗必变，粗变细不必。同实例换绑定值不改变细 epoch（EB-N7 边界保留）。

依据：EB-N1..N8（原生 epoch 机制）、A5（10k 符号亚毫秒）、A9（epoch 内省）、A10（notify 双源）、A11（动态访问盲区）；运行侧重算批次见 1.2。

### 1.2 EB-D13 —— 最小粒度

**裁决：采纳（补充运行侧重算批次语义）。**

最终措辞：

> 维护者侧最小粒度 = (semver 版本, 导出符号路径)，按发布离散；运行侧最小粒度 = (fiber, 依赖边, 被用符号投影)，按变更批次重算——每次 notify 双源（provide/unprovide 即时 + ACTIVE 翻转，EB-N6/N13）触发的 epoch 重算为一个批次。

依据：EB-D13 原文、A10、census M3（样本触发面小：109 `ctx.get` + 1403 `ctx.<prop>` + 23 `ctx.inject`）。

### 1.3 EB-D15 —— 统一需求满足自动机

**裁决：采纳（确认性裁决）。**

最终措辞：

> 原生反应式（EB-N3..N5 惯性/HMR）与 mygo 细语义（细 epoch + 政策闸 + 前置门）是同一需求满足自动机的两种粒度：粗=调度执行，细=需求函数 + 传感器 + 前置门；两者不冲突，不合并为单一实现。

依据：EB-D15、ecosystem-verification §2.10（Fabric/Modrinth 均无运行期反应式——运行期策略是 mygo 独有域）。

### 1.4 EB-D17 —— P1-local 删除

**裁决：采纳（维持既有裁决）。**

最终措辞：

> P1-local 已删除（矛盾 1 选 (a)）；失败策略为干净两档：P1-global 默认（整体回滚 + 硬告警/结构化报告，EB-D4）、P2 硬约束（INACTIVE + 报告，EB-D2）。R1「同一时刻同 id 唯一版本实例」不变量不受动摇（EB-D17 作废记录保留，不计入统计）。

依据：expected-behavior §6 矛盾 1、EB-D3 作废、EB-D17。

### 1.5 EB-D19 与 C4 —— 符号别名 / id 别名分层

**裁决：EB-D19 修改后采纳；C4 采纳。两者并存，分层管辖。**

| 层 | 字段 | 语义 | 管辖 | 先例 |
|---|---|---|---|---|
| id 别名 | `provides: string[]` | 插件 id 别名；求解器把 `depends: { "<provided-id>": range }` 解析到 provider；同 id（含别名）至多一个实例，重复选中 → 求解期错误 | 求解器 / 安装期 / 单实例约束 | C4 + Fabric provides（ecosystem-verification §2.4/T4） |
| 符号别名 | `symbolAliases: Map<alias, canonical>` | 提供方声明 `b: alias of c`；消费者按 `b` 导入时经 `c` 解析通过校验；未声明别名的改名一律走删除路径（INACTIVE） | 运行期前置门 / 投影层 / 不参与求解器、不影响单实例 | EB-D19 |

语义边界：id 别名在安装期/求解期参与去重与依赖解析；符号别名仅运行期前置门与投影校验使用，不进入依赖图，不参与候选裁决。

最终措辞（EB-D19）：

> GIVEN manifest 声明符号别名/兼容映射（`symbolAliases: { b: "c" }`），WHEN 提供者把符号 b 改名为 c，THEN 消费者可按别名解析通过前置门（reload 成功）；未声明别名时，改名一律按破坏性变更走删除路径（INACTIVE）。别名目标符号必须在提供方导出快照中存在，否则按符号缺失处理（P2 INACTIVE / P1-global 回滚 + 报告）。

依据：EB-D19、C4、ecosystem-verification §2.4、expected-behavior §0.1（EB-D19 冻结前修订）。

### 1.6 EB-D20 —— 前置门同步廉价生死线

**裁决：采纳。**

最终措辞：

> reload 前置校验 MUST 基于挂载时缓存的导出快照做纯内存比较；reload 路径禁止磁盘 I/O（同步性约束，避免异步门与惯性打架）。触发频率假设 MUST 按 notify 双源复核（EB-N6/N13），每次触发成本 MUST 保持微秒~亚毫秒级（A5：10k 符号亚毫秒）。

依据：EB-D20、A5、A10、census M3（触发面数据）。

### 1.7 EB-D21 —— dispose/unload 超时与强制终止

**裁决：采纳（本处给出具体超时值与强制终止语义）。**

最终措辞：

> dispose/unload 过渡 MUST 有超时：默认 **5000ms**（每个 fiber 的 dispose/unload 一次过渡整体计时，不是每个 effect 单独计时）；可由政策配置 `disposeTimeoutMs` 覆盖，范围 0..30000，0 = 立即放弃等待。超时后：该 fiber 强制置 FAILED，释放过渡队列，后续过渡（含 P1-global 回滚与 P2 停用）不得被其阻塞；产出结构化报告（含仍未完成的 effect 名单）。MUST NOT 无限等待。
>
> 强制终止语义（诚实声明）：JS 无法中止运行中的异步生成器；「强制终止」= 停止等待并放弃所有权——不再 await 剩余 disposables，其后续 resolve/reject 被忽略并计入 `dispose-abandoned` 报告项（可能存在资源泄漏，报告 MUST 显式警告）；fiber 从队列摘除后按惯性（EB-N9）继续链式过渡。

依据：EB-D21、A2（永不结束生成器 dispose 挂起）、EB-D4/D2（回滚与停用不得被阻塞）、EB-N9。

## 2. 任务二：manifest schema 定稿（最高优先级）

### 2.1 双命名空间依赖词汇（核心决策）

**包级依赖 `depends` / `breaks`**：

- 键 = 插件 id（非服务名）；值 = npm semver 区间或区间数组（OR）。
- 求解器管辖：进入安装期依赖图，参与候选过滤、环检测、单实例约束（R1 §4、R2 §2、C3）。
- 违例行为：安装期求解失败 → 结构化报告（断点/链/候选/建议，R1 §11 + C1）；运行期提供方消失 → 政策闸按包级事实处理（EB-D11），P2 INACTIVE 或 P1-global 回滚。

**服务级依赖 `requires`**：

- 键 = 服务名（裸名，规范内禁止 `service:` 前缀）；值 = npm semver 区间或数组。
- 语义：**「我需要某个能力，不关心谁提供」**；与 cordis inject/反应式层同构（EB-N1..N8）。
- 校验时机：**仅运行期**。安装期只做形状校验（键合法、区间合法）；服务缺失**不是安装期错误**（论证见下）。
- 违例行为：运行期政策闸（EB-D11）覆盖服务粒度——服务缺失 → INACTIVE（P2）或 P1-global 回滚，报告 `service-missing`，候选集 = 服务提供者观测记录中的已知提供者（当前 ACTIVE + 历史，A6 候选清单；观测记录机制见下）；提供者版本不满足区间 → `provider-version-mismatch`；消费者被用符号不在提供者符号投影 → `symbol-missing`（EB-D12）。
- 三态：INACTIVE 在提供者出现后自动激活（EB-D16）；disabled/政策拒绝不自动激活。

**服务级版本/符号约束与提供者解析结果的关联（完整语义，禁止含糊）**：

1. 服务提供者解析 = cordis 提供者解析路径（与 `ctx.get` / `ctx.<prop>` / `ctx.inject` 同路径，census M3）；解析结果是一个 ACTIVE 提供者 fiber（EB-N1）。
2. 「服务版本」= 该提供者 fiber 所属插件实例的 manifest version（细 epoch 版本元组分量，EB-D10）；`requires` 区间对该版本求值。
3. 「服务符号投影」= 提供对象在挂载时缓存的导出快照（EB-D20 纯内存快照）；消费者被用符号集（静态投影，A11）对提供者符号投影做子集比较（EB-D11/D12）。
4. 多提供者：服务名不参与单实例约束（与插件 id 不同）；解析按 cordis 提供者语义取当前 ACTIVE 提供者；报告候选集 = 观测记录中的已知提供者（A6）。
5. 无提供者可静态预期：安装期无服务提供者清单（manifest 不声明「提供服务」，运行时才有 `ctx.provide`），因此 requires 安装期不可满足性检查不成立——运行期 INACTIVE + 自动激活是唯一正确层。

**服务提供者观测记录（记账机制，MUST 显式声明）**：由于 manifest 不声明提供服务（第 5 条），报告候选集 MUST 来自 mygo 运行期维护的服务提供者观测记录——记录谁在何时 provide 过什么服务（插件 id、服务名、时间、生命周期状态），随 fiber 生命周期清理；只读、不阻断，仅用于报告与诊断。对应实现任务：backlog B19。

**版本/符号政策维度身份标注**：`provider-version-mismatch` 与 `symbol-missing` 为**作者愿景级决策**，超出 requires 最小语义（最小语义 = 声明 + INACTIVE + 报告）；与 EB-D10/D15 决策身份对齐。若该套语义被现实证明过度建设，可按此标注砍掉版本/符号维度，仅保留最小语义，砍除时无心理负担。

**选用指引（depends vs requires，MUST 成文）**：

- 只对能力有需求（不关心谁提供）→ **只写 `requires`**；
- 对具体包有硬耦合（调用其非服务 API / 符号）→ **写 `depends`**；
- 两者都要（既绑定具体包又消费其服务）→ 才**双写**。

社区默认应从「只写 requires」起步；双写只在确有包级硬耦合时使用（参考实现 2.3 属「两者都要」案例，不代表默认形态）。

论证（为什么不是安装期错误）：(a) cordis 反应式语义下提供者可后到（EB-N1..N5），安装期阻断会制造假失败；(b) 服务名不唯一、不具单实例约束，求解器的 id 机制不适用；(c) Fabric/Modrinth 无服务级概念（ecosystem-verification §2.1/§2.6），无安装期先例；(d) mygo 政策闸本来就是运行期机制（EB-D11）。

**原型回收**：作者原型 `compatibility.requires` 中裸键（`dsh-voice-chat`）→ `depends`；`service:` 前缀键（`service:voice-chat`）→ `requires`（去前缀）。见 2.3。

### 2.2 字段全集

`dsh.mygo` schema v3，`formatVersion: 1`。逐字段：类型 / 必选 / 默认 / 违例。

| 字段 | 类型 | 必选 | 默认 | 违例行为 |
|---|---|---|---|---|
| `formatVersion` | integer | 必选 | —（当前 1） | 解析不支持值 → `manifest-invalid` 硬错（C6/T9） |
| `id` | string `/^[a-z][a-z0-9-]*$/` | 必选 | 包名去 scope | 非法 → `manifest-invalid`（R1 §2.2） |
| `version` | semver string（允许预发布） | 必选 | package.json version | 非法 → `manifest-invalid` |
| `entry` | string 相对路径 | 必选 | — | 禁 `../`、绝对路径、盘符 → `manifest-invalid`（C8） |
| `depends` | `Map<pluginId, range\|array>` | 可选 | `{}` | 裸包名（非区间）→ `manifest-invalid`（R1 §2.2-4）；求解期硬约束 |
| `breaks` | 同上 | 可选 | `{}` | 同上；命中区间 → 求解失败 |
| `requires` | `Map<serviceName, range\|array>` | 可选 | `{}` | 含 `service:` 前缀 → `manifest-invalid`（规范内）；运行期政策闸（EB-D11） |
| `core` | range \| array | 可选 | `"*"`（缺省警告放行，lockfile 记 `"*"`，R1 §2.2-5） | 安装期硬约束（R1 §4.2） |
| `recommends` | `Map<pluginId, range\|array>` | 可选 | `{}` | 只校验不选择、只警告不阻断、永不自动安装（C9） |
| `bundles` | `array<{id, version, path}>` | 可选 | `[]` | R2 §1.1/§2.1：path 逃逸、id 重复、声明与实际不一致 → `manifest-invalid` |
| `loader` | `{id, range}` | 可选 | `{id:"standard", range:"*"}` | id ∉ 内置 loader 集或 range 非法 → `manifest-invalid`；加载期不满足 → 硬阻断（R2 §5.1） |
| `patches` | `array<{file}>` | 可选 | `[]` | file 相对、禁逃逸（C8）；bundle patch 展开为 entry 行（D4） |
| `grants` | `Map<capability, grantExpr>` | 可选 | `{}` | 默认拒绝；未授权使用 → 政策拒绝态（EB-D16） |
| `provides` | `string[]`（id 别名） | 可选 | `[]` | 求解器管辖；同 id（含别名）重复 → 求解期错误（C4/T4） |
| `symbolAliases` | `Map<alias, canonical>` | 可选 | `{}` | 前置门管辖；别名目标缺失 → 符号缺失处理（EB-D19） |
| `environment` | 只读元数据对象（如 `{platform:"web"}`） | 可选 | `{}` | 不设硬门；仅报告展示（2.5） |
| `entrypoints` | 保留 | 可选 | — | R1 §2.1 保留 |
| `shared` | boolean | 可选 | `false` | R2 §1.1 保留 |

### 2.3 原型回收：dsh-vibe-mode 映射

原型（`dsh-vibe-mode/package.json`）：

```jsonc
{ "dsh": { "mygo": { "compatibility": { "requires": {
  "dsh-voice-chat": ">=0.1.0",
  "service:voice-chat": ">=0.1.0"
} } } } }
```

规范写法（迁移目标）：

```jsonc
{ "dsh": { "mygo": {
  "formatVersion": 1,
  "depends": { "dsh-voice-chat": ">=0.1.0" },
  "requires": { "voice-chat": ">=0.1.0" }
} } }
```

> 注：本参考实现是「两者都要」案例（原型同时声明包级与服务级约束，改写后原样保留双写）。按 2.1 选用指引，社区默认应只写 `requires`；`depends` 仅在调用该包非服务 API 时才需要。

映射规则（解析器内置兼容层，告警级不阻断）：

1. 旧写法 `compatibility.requires` 中 `service:` 前缀键 → `requires`（去前缀）；
2. 旧写法裸键 → `depends`；
3. `compatibility.breaks` → `breaks`（R1 §2.2-6 沿用）；
4. 新旧同时声明同名键 → `manifest-invalid`（沿用 `normalizeCompatibility` 语义，R1 §2.2-6）；
5. 新 manifest 中出现 `service:` 前缀键 → `manifest-invalid`（规范内禁止）。

**dsh-vibe-mode 改写为规范写法，作为首个参考实现**（census D3/Rev-3/T4）。

### 2.4 版本谓词（C2）

- 词汇 = npm semver 区间：`*`、精确、`=`、`>`、`>=`、`<`、`<=`、`^`、`~`、空格 AND、`||` OR（现有 `semver-range.ts` 词汇，design.md §2.2）。
- 预发布门：预发布版本仅当区间显式引用同一 `major.minor.patch` 三元组的预发布比较符时才可匹配（design.md §2.3 修正项）。
- 数组值 = OR（ecosystem-verification §2.2）。
- **lockfile 精确 pin 覆盖裁决顺序（MUST）**：
  1. lockfile/pins 对某 id 有 pin → 该版本是唯一候选（`pinned: true`，R2 §3.1）；
  2. pin 版本必须满足全部已选插件对其声明的区间（depends/core/breaks）；不满足 → 安装期错误，报告 `constraint.kind: "pin"`（R2 §3.3）；
  3. 无 pin → 候选按区间过滤，按 3.1 全序优先级裁决；
  4. 运行期细 epoch 版本分量 = 已解析（pin 后）版本；同版本静默替换走 uid 变化（EB-D7）+ 安装期内容哈希（EB-D18）。

### 2.5 environment 字段裁决（取代 C7/G1/T7）

**裁决：manifest 不设 environment 硬门字段。**

依据：
- dsh 是单服务端运行时 + webui 透传投影，不存在 Fabric 式双运行时（census M7：`dshClient` 30/80、`dsh.plugin.json` client、`dshx` 4；ecosystem-verification §2.8/G1 的 client/server 硬门不成立）。
- profile（web/headless）适配已由 bundle/分发层承担（census D4：政策作用于展开后的 entry 行，不新设分发层）。

最终条款：`environment` 仅作只读报告元数据（如 `{platform:"web"}`），MUST NOT 阻断加载；若未来出现真实多运行时，经 `formatVersion` 升级再加入硬门。原 ecosystem T7 相应改写（见 §6 T7）。

### 2.6 optional/recommends 语义（一句话定死）

> `recommends` 只参与安装期校验并输出告警，不做候选选择、不阻断安装、永不自动安装。

依据：C9（ecosystem-verification §4）、ecosystem-verification §3 G12（optional/recommends 词表补全）。

### 2.7 formatVersion（C6）

> `formatVersion` 为整数，当前值 1；解析器对不支持的值 MUST 硬错（`manifest-invalid`，报告字段定位），引用 Fabric `schemaVersion` 与 mrpack `formatVersion` 双先例（ecosystem-verification §2.8/G6/T9）；模板对齐参考 census D7。

## 3. 任务三：求解器与安装期规格

### 3.1 求解器

**裁决规则（C3 修订版）**：

- 求解对象 = 包级依赖图（depends/breaks/core/pins/bundles）；`requires` 不进图（3.2）。
- 候选集 = registry + lockfile + bundle + pin 来源合并（R1 §3.1、R2 §2.2），同一版本多来源按固定序 `pinned > registry > locked > bundle` 去重（R2 §2.2）。
- 选择 = 在满足全部硬约束的赋值集合中，按**全序优先级**取唯一最优：
  1. root（pinned/预选）优先；
  2. id 升序；
  3. 版本降序（最高者优先，R1 §4.2）；
  4. 嵌套深度升序（R2 bundles）；
  5. parent 优先级（Fabric ModPrioSorter 先例，ecosystem-verification §2.3/§2.9）；
  6. 确定性 tie-break：来源序（pinned > registry > locked > bundle）后接 manifest sha256 字典序——**保证全序**，Fabric 比较器同优先级返回 0 的缝隙在此闭合（ecosystem-verification §2.3）。
- 环依赖：DFS 检测 → 整体拒绝，报告环路径（R1 §4.3），禁止尽量加载。
- **确定性 MUST 延续 R1**：同输入两次求解输出字节级一致（R1 §4.2/§7.3、R2 §5.3 的 `JSON.stringify` 断言）；若引入 SAT 库，输出 MUST 由上述全序唯一裁决，禁止依赖求解器内部枚举顺序（C3）。
- bundles 嵌套包同图求解 + 单实例约束：R2 §2 语义；同 id 至多一个实例（EB-D17/R1 §1.1）；重复选中 → 错误（ecosystem-verification T3/T4）。

### 3.2 requires 与求解器关系

- **服务名不进依赖图**：求解器输入只含插件 id 级约束（depends/breaks/core/pins/bundles）。
- **安装期服务缺失不是错误**：仅形状校验（2.1）。
- **运行期政策闸负责服务粒度**：INACTIVE（P2）/ P1-global 回滚 + 报告（2.1、EB-D11）。
- 论证：cordis 反应式（EB-N1..N5）、服务名非单实例（2.1-4）、生态无安装期先例（ecosystem-verification §2.1/§2.6）、政策闸本就是运行期机制。
- 报告格式：同一结构化报告 schema，`scope: "service"` 区分（4.6）。

### 3.3 三段分工（C10）

```text
安装期求解（Modrinth 对齐：安装时定版，锁进 lockfile）
  → 加载期验证（lockfile 校验 + entry/manifest 哈希 + 前置门纯内存快照）
  → 运行期反应式（独有域：惯性/HMR/细 epoch；Fabric/Modrinth 均无，ecosystem-verification §2.10）
```

- 加载期不接触 registry、不重新求解（R1 §6/§7.3）。
- Fabric「每次启动重解」作为对照机制记录，不采纳（ecosystem-verification §2.6/C10/T10/T11）。

### 3.4 安装期路径安全（C8 / census D7）

- `entry`、`bundles[].path`、`patches[].file` MUST 为相对路径；禁 `..`、绝对路径、盘符前缀。
- 校验时机：安装期（解压前，R1 §6.5）与加载期（lockfile 校验，R1 §7.1）双重执行；违例 → 硬错 + 结构化报告。
- 对照实现：官方模板 `scripts/verify-self-contained.mjs` 的仓库边界规则（绝对路径/父目录导航/越出路径/符号链接逃逸，census D7/T7）。

### 3.5 BOM 字段（C5）

- lockfile 每条插件记录追加 `sha512`（hex）与 `fileSize`（字节）。
- **npm `integrity` 字段即 sha512**（SRI `sha512-base64`）：社区侧收割直接解析 integrity 并转 hex，免计算（C5/Rev-2）。
- 加载期校验主哈希保持 `entrySha256` / `manifestSha256`（EB-D18）；sha512/fileSize 用于 BOM 对账与报告，不改变校验语义（T5/T6）。

## 4. 任务四：运行期机制规格

### 4.1 细 epoch + 前置门

- 细 epoch 定义见 1.1；求值 MUST 基于挂载时缓存导出快照、纯内存比较、禁磁盘 I/O（EB-D20）。
- 成本预算：每次触发微秒~亚毫秒级（A5）；触发频率按 notify 双源复核（EB-N6/N13），census M3 数据（109+1403+23）作为预算核算输入。
- 计算时机：挂载时快照 + 每次 epoch 重算（通知批次，1.2）；同实例换值不触发（EB-N7）。

### 4.2 Proxy 包装（census D1 + closeout §16）

**三处裸值发布点改造（当前均为裸值逃逸点）**：

| 位置 | 现状 | 改造 |
|---|---|---|
| `lifecycle.ts:762`（provideTable 声明） | `value: unknown` 存原始值 | 只存 `wrapProvidedValue(...)` 后的包装值 |
| `lifecycle.ts:1851`（`provideValue`） | 返回原始值 | 返回包装值 |
| `lifecycle.ts:2908`（`updateProvideTable`） | `{ pluginId, value }` 存原始值 | 存包装值 |
| `lifecycle.ts:2937-2940`（`syncProvideState` seam 发布） | `seam(capability, entry.value)` 发布原始值 | 发布包装值 |

**包装规则（MUST）**：

1. 桥接路径所有服务取值必须经单一 `wrapProvidedValue(name, value, pluginId)` 包装；原始对象引用不写入 provideTable、不返回、不经 seam 发布——**原始对象不逃逸**（closeout §16、A11）。
2. 覆盖三条访问路径：`ctx.get` / `ctx.<prop>` / `ctx.inject` 作用域解析（census D1/T3；三路径均经同一提供者解析，M3 证据）。
3. Proxy get trap：转发 + 记录动态符号访问（A11 动态访问覆盖）；set trap：拒绝/策略告警（EB-D8 exports 冻结的桥接实现，4.3）。
4. 模块级 import（census R6：162 处/46 仓库）**不扩展代理覆盖**：静态投影可见（import 是静态的），由静态投影兜底（census D1、EB-D8/D1 边界）。
5. 改造属于 mygo 边界内实现（L1/L2），不涉及 vendor 补丁；若需新增 vendor 补丁须先登记 PATCHES.md（当前仅 #1）。

### 4.3 桥接 exports 冻结（EB-D8）

- 桥接路径：`wrapProvidedValue` 的 Proxy 提供只读导出面（set 拒绝 + 政策报告），实现 exports 冻结；挂载后原地改导出在桥接路径不可见、被策略拦截。
- 直连路径：维持契约外声明（后果自负，EB-D8），mygo 不包装、不拦截（two-tier §7/§12）。
- 定期快照比对传感器：仅记录为后续可选增强，本轮不实现（EB-D8）。

### 4.4 失败策略 + 三态 + dispose 超时

- 两档失败策略：P1-global 默认（A、B 整体回滚旧状态 + 硬告警 + 结构化报告，EB-D4）；P2 硬约束（INACTIVE + 报告，EB-D2）。
- 三态记账（EB-D16）：`disabled > 政策拒绝 > INACTIVE`；disabled/政策拒绝不因依赖恢复自动激活；INACTIVE 依赖恢复后自动激活（A3 CONFIRMED）。
- dispose/unload 超时：默认 5000ms / fiber/次过渡；`disposeTimeoutMs` 可配置（0..30000，0=立即放弃等待）；超时强制置 FAILED、释放过渡队列、产出结构化报告（含 `dispose-abandoned` 与资源泄漏警告）；回滚与停用不得被其阻塞（1.7、EB-D21/A2）。

### 4.5 变更路径契约（EB-D22）

- 代码/exports 变更 MUST 走 remove+create（新 fiber）；config-only 路径只能改配置、物理上不能替换模块。
- 既有核查：`loader.update` 签名 `Omit<EntryOptions,'id'|'name'>` 物理禁止改 name；entry diff 仅 config → 同 fiber（closeout §17 已证无「换模块不换 fiber」路径）；本设计保持该契约并加回归测试（T6）。

### 4.6 结构化报告 schema（C1）

在 R1 §11 基础上扩展：

```jsonc
{
  "code": "resolve-failed" | "lockfile-mismatch" | "dependency-cycle"
        | "policy-rejected" | "dispose-timeout",
  "summary": "…",
  "scope": "package" | "service",
  "cycles": [["A","B","A"]],
  "conflicts": [{
    "plugin": "A" | "service": "voice-chat",
    "constraint": { "kind": "depends|breaks|core|pin|requires|symbol|alias",
                    "target": "B", "range": ">=2.0.0" },
    "chain": ["A","B","C"],
    "candidates": [ { "version": "1.0.0", "rejected": ["…"] } ],
    "actions": [ "add …", "remove …", "replace … → …" ]
  }],
  "generation": { "from": "g1", "to": "g2" }
}
```

- 词汇：断点 + 候选集 + 建议动作（add/remove/replace）+ 完整链 + **回到哪一代**（C1/EB-D2/D4；对齐 Fabric `ResultAnalyzer`，ecosystem-verification §2.1）。
- 一次输出全部冲突，禁止只报第一个（R1 §11）。
- `generation` 字段记录 P1-global 回滚的旧代目标（EB-D4「回到哪一代」）。

## 5. 任务五：社区侧（双 tier 落地）

### 5.1 收割器（census D2）

- 归一信号：`engines.dsh`（样本 6/80，均 `>=0.0.1`）、`cordis` peer（50/52）、`@deepseek-ai/dsh-tools` peer（35/52）→ 统一 core 区间（census M2）。
- 归一规则：
  - `engines.dsh` 区间 → core 区间直接采用；
  - `cordis` peer 区间 → 经 cordis↔dsh 对照表映射为 core 区间；
  - `@deepseek-ai/dsh-*` 服务包 peer → 经对照表/包版本快照映射（样本 `*` 与 `^0.0.1` 为主）。
- **cordis 版本 ↔ dsh 版本对照表（MUST 解决，来源未定则标记为 r3 外部依赖项）**：
  - 已知锚点：dsh `0.0.1-rc.1` ↔ `@deepseek-ai/cordis 4.0.1-rc.1` ↔ `cordis ^4.0.0-rc.7`（`ext-compat-reports-2026-08-11-npm-rc1.md` §1/§6）；
  - 来源候选：vendor 元数据（vendored cordis package.json ↔ dsh 核心版本）或核心团队提供；
  - 若 design-r3 实现期无法确认来源 → 标记为**外部依赖项 EXT-1**，收割器对无法映射的 peer 输出「无法归一」告警而非猜测。
- 三原则：只读、告警级、永不阻断（two-tier §9）。

### 5.2 双存在检测（Rev-3）

- npm 依赖嵌套（样本 1/27：dsh-cc-tui → `@deepseek-ai/dsh-working-activity`，census M6/R10）与 `service:` 前缀需求（legacy）或 `requires`（canonical，样本 dsh-vibe-mode → voice-chat，census M6/R11）→ 输出重复实例风险警告；MUST NOT 阻断（T12）。

### 5.3 profile bundle 展开语义（census D4）

- `dsh.bundle.patch` → `cordis.patch.yml` 的 insert/override 行展开为 entry 行；mygo 政策层作用于**展开后的行**；不新设分发层（T16）。

### 5.4 legacy `dsh.plugin.json` 迁移策略（census D5）

- 样本：22 个本地仓库仍携带（census M7/R7）。
- 只读映射：`id/version/main/engines.dsh/contributes/client` → 规范字段（id/version/entry/core/environment 元数据/client 报告信息）。
- 行为：识别旧文件输出迁移警告（告警级）；不阻断；迁移文档随 mygo init 候选功能（two-tier §13）一并规划，本轮不实现。

### 5.5 官方模板对齐（census D7）

- 官方模板 `plugin-template@2da8230` 的 package.json 形态（exports `.`/`./invariant`/`./src/*`、peers `cordis`+`schemastery`、`dsh.bundle.patch`、`private→false` 发布门）作为 manifest 生成/校验参考输入。
- 模板 `verify-self-contained` 规则作为安装期路径安全对照实现（3.4/T18）。
- npm 强兼容条款（禁 `link:`/`file:`、自包含 prepare 构建）纳入 Rev-6 修订记录（census §5.1）。

### 5.6 三原则

> 全部社区侧行为 MUST 遵守：只读、告警级、永不阻断（two-tier §9/§10/§11）。

## 6. 测试计划（合并去重编号）

合并 ecosystem-verification T1..T11 与 census T1..T7，去重后 20 项：

| # | 场景 | 来源映射 |
|---|---|---|
| T1 | 报告渲染：断点 + 候选集 + 建议动作 + 完整链 + 回到哪一代 | eco T1 / C1 |
| T2 | 版本范围边界：`~`/`^`/`.x`/预发布/构建元数据忽略/非 semver 仅 `=`/`*` | eco T2 / C2 |
| T3 | bundle 同 id 冲突、嵌套循环、嵌套深度上限 | eco T3 / C3 |
| T4 | id 别名占用裁决（provides duplicate；提供者 vs 真实 mod） | eco T4 / C4 |
| T5 | 安装期哈希不匹配 → 不写盘、重试、失败报告 | eco T5 / C5 |
| T6 | 加载期 entrySha256 漂移 → P1-global/P2；config-only 同 fiber、换模块新 fiber（EB-D22 回归） | eco T6 + closeout §17 |
| T7 | environment/profile 只读元数据不阻断（原硬门测试改写；C7 裁决） | eco T7 修改 / 2.5 |
| T8 | 路径穿越清单（`..`、绝对路径、盘符）→ 安装拒绝 | eco T8 / C8 |
| T9 | formatVersion 不兼容 → 解析错误 + 报告 | eco T9 / C6 |
| T10 | 安装期求解失败（required 缺失/无兼容版本）→ 中止 + 结构化报告 | eco T10 / C10 |
| T11 | 运行中安装新插件并变更依赖、不重启 → 反应式收敛一致态 | eco T11 / §2.10 |
| T12 | 双存在检测：npm 依赖嵌套 + requires 服务需求 → 告警不阻断 | census T1 / Rev-3 |
| T13 | 收割器信号归一：engines.dsh / cordis peer / dsh-tools peer → core 区间 | census T2 / D2 |
| T14 | Proxy 三路径覆盖（ctx.get / ctx.<prop> / ctx.inject）+ 三处发布点原始对象不逃逸 | census T3 / D1 + closeout §16 |
| T15 | `service:` 前缀原型映射 + requires 政策闸（service-missing / provider-version-mismatch / symbol-missing + INACTIVE 自动激活） | census T4 / D3 |
| T16 | bundle patch 展开 → entry 行；政策作用于展开后行 | census T5 / D4 |
| T17 | 跨调用可变状态插件在 P1-global/P2 回滚后的状态残留回归 | census T6 |
| T18 | 模板自包含规则（verify-self-contained）作为路径安全对照；vibe-mode 规范写法参考实现 | census T7 / D7 + 2.3 |
| T19 | 求解器确定性：同输入两次求解字节级一致；全序 tie-break（同优先级缝隙闭合） | R1 §4.2/§7.3 + R2 §5.3 + 3.1 |
| T20 | requires 不进依赖图：安装期不阻断、运行期 INACTIVE + 提供者出现自动激活 | 2.1 + EB-D16 |

## 7. 侵入等级与 vendor 登记

- Proxy 改造（4.2）：mygo 边界内（L1/L2），无 vendor 补丁。
- epoch getter：既有 vendor 补丁 #1，保持登记（PATCHES.md）。
- 若实现期新增 vendor 改动：MUST 先登记 PATCHES.md（文件/改动/原因/上游同步注意事项），禁止未登记修改 vendor 代码（round-closeout §14）。

## 8. 自验收（本任务书五大任务覆盖）

| 任务书章节 | 本文件 | 覆盖 |
|---|---|---|
| 任务一：7 条设计决策逐条裁决 + EB-D21 具体超时 + EB-D19/C4 分层 | §1.1-1.7 | [OK] |
| 任务二：双命名空间、字段全集、原型回收、版本谓词、environment 裁决、optional/recommends、formatVersion | §2.1-2.7 | [OK] |
| 任务三：求解器全序确定性、requires 与求解器关系、三段分工、路径安全、BOM | §3.1-3.5 | [OK] |
| 任务四：细 epoch/前置门、Proxy 三路径与三处发布点、exports 冻结、失败策略/三态/dispose 超时、EB-D22、报告 schema | §4.1-4.6 | [OK] |
| 任务五：收割器与 cordis↔dsh 对照表（EXT-1）、双存在、bundle 展开、legacy 迁移、模板对齐、三原则 | §5.1-5.6 | [OK] |
| 输出：design-r3-backlog.md | 见 [design-r3-backlog.md](design-r3-backlog.md) | [OK] |
| 测试计划合并去重 | §6（T1..T20） | [OK] |

## 9. 修订记录（实现轮追加）

| 修订编号 | 日期 | 原因 |
|---|---|---|
| Rev-I1 | 2026-08-11 | design-r3 实现轮（B1-B18）落地：manifest v3（§2.2）、求解器全序（§3.1）、requires 政策闸（§2.1/B6）、细 epoch 前置门（§4.1/B13）、观测注册表（§2.1/B19）、报告 schema（§4.6/B7）、dispose 超时（§1.7/B8）、BOM sha512+fileSize（§3.5/B9）、路径安全（§3.4/B10）、收割器与双存在（§5.1-5.2/B11-12）、bundle 展开/legacy 映射/模板对齐（§5.3-5.5/B14-16）；实现期新增两处契约字段：`PluginDefinition.serviceRequires`（requires 载体）与 `PluginDefinition.symbolAliases`（EB-D19 载体），均经 MANIFEST_SCHEMA 登记，不影响冻结基线。 |
| Rev-I2 | 2026-08-12 | 按当前代码修正 epoch 依赖描述（零侵入裁决）：§0 贯穿约束与 §7 侵入等级中「vendor 补丁 #1 epoch getter」的旧表述失效——PATCHES #1 已移除并回滚（fiber.ts / lib/index.js / fiber.d.ts 零残留，vendor/PATCHES.md 标记已移除），原生 fiber epoch 无公开入口；mygo 控制面细 epoch（§1.1 EB-D10 / §4.1）落地口径改为 **FineEpochRegistry 自有记账**（挂载时导出快照 + 提供者观测 + 政策事实记账），与原生 epoch 解耦。见 expected-behavior.md R3（EB-N12/EB-D14/A9 现行描述）。 |
