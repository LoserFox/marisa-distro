# 预期行为推导总结（第三轮核验基线）

> 生成时间：2026-08-11 · 来源：cordis-paper 分析会话全部推导（含追问）。
> 本文件是整理任务产物：只收敛会话中已出现的结论，禁止新推导。

> **假设消化状态**：经验假设已全部消化（0 条未验证）；剩余 7 条为
> [设计决策]（EB-D10/D13/D15/D17/D19/D20/D21），待 design-r3 拍板，
> 不属未验证假设。原 20% 警告因占比降至 15.9%（7/44）且无经验假设残留而解除。

## 0. 关键修正记录（epoch 语义）

会话中途，epoch 语义被源码证据修正：

- **旧表述（作废）**：epoch 是“依赖解析值元组”；“值变了就 reload”。
- **新表述（权威）**：epoch 是“已解析提供者实例 uid 的拼接字符串”，任一依赖缺失为
  INACTIVE；比较是全等字符串比较（fiber.ts:611-627）。

受影响的早期结论与处理：

| 早期结论 | 处理 |
|---|---|
| “epoch 含服务绑定值，值变化触发 reload” | 作废。重述：同实例换值不改变 epoch（EB-N7） |
| “版本不变静默替换时版本分量失效、投影分量工作” | 需重述。原生无版本分量；静默替换走重装 → uid 变 → 原生 epoch 变；同实例原地改 → 原生全盲（EB-D7/D8） |
| “notify 每次 set/provide 变化都发” | 需重述。实现只在提供者 ACTIVE↔非 ACTIVE 翻转时 notify（EB-N6） |

本文档所有条目一律使用修正后模型；不存在修正前后表述并存。

### 0.1 冻结前修订（用户裁决与补充）

| 修订 | 内容 |
|---|---|
| EB-D19 新增 | 符号别名/兼容映射（b: alias of c）设计选项落条 |
| EB-D20 新增 | reload 前置校验的同步性约束（纯内存快照比较、禁磁盘 I/O） |
| EB-D4 措辞加强 | “错误可见” → “硬告警 + 结构化报告（失败的过渡、原因、回到哪一代）” |
| EB-D3 作废 | 矛盾 1 裁决选 (a)，删除 P1-local；保留作废记录、不计入统计 |
| A11 新增 | 动态访问对静态投影失明的盲区假设 |
| 矛盾 1 裁决 | 选 (a) 删除 P1-local（见 §6） |
| 矛盾 2 裁决 | 选 (c) 三态分立：disabled > 政策拒绝 > INACTIVE（见 §6） |

### 0.2 假设消化结果（见 docs/assumption-verification.md）

| 假设 | 判定 | 影响 |
|---|---|---|
| A1 | CONFIRMED | — |
| A2 | PARTIAL（异步步边界成立；同步无 guard；永挂生成器 dispose 挂起） | EB-D9 含边界 |
| A3 | CONFIRMED | EB-D16、§6 矛盾 2 兑现依据 |
| A4 | CONFIRMED（remove+create 新 uid；config-only update 复用） | EB-D1/D7 地基 |
| A5 | CONFIRMED（10k 符号亚毫秒） | EB-D20 前提 |
| A6 | CONFIRMED（候选清单） | 传感器设计 |
| A7 | PARTIAL（桥接可包装；直连不可） | EB-D8 边界 |
| A8 | OBSOLETE（P1-local 已删除） | EB-D3 已作废 |
| A9 | PARTIAL（inertia 公开；epoch 在私有 _runner） | EB-D14 边界 |
| A10 | PARTIAL（notify 双源：provide 即时 + ACTIVE 翻转） | EB-N6 补 N13 |
| A11 | CONFIRMED（含盲区：先解构再代理不可见） | EB-D1/D5/D6/D12 前提 |

### 0.3 冻结前收尾修订（本批）

| 修订 | 内容 |
|---|---|
| EB-D21 新增 | dispose/unload 超时与强制终止政策 |
| EB-D22 新增 | 变更路径契约（代码/exports 变更必须 remove+create） |
| EB-D8 修订 | 按 A7 分路径：桥接强制冻结/Proxy；直连为契约外行为 |
| EB-D20 升级 | 前置门同步廉价升级为生死线（按 notify 双源复核触发频率） |
| 证据框架升级 | 新增第五档 [已证-含边界]；剩余 [假设] 二分标注 [设计决策] |

## 1. 原生机制事实清单（[原生现状] · [源码已证]）

- **EB-N1**：GIVEN 一个 fiber 有 inject 声明，WHEN `_refresh` 执行，THEN epoch 被重算为每个已解析提供者 `impl.fiber.uid` 的 `':' + uid` 拼接串；任一 inject key 无提供者时 epoch=INACTIVE。`[源码已证: vendor/cordis/src/fiber.ts:611-623]`
- **EB-N2**：GIVEN 重算 epoch 与旧 epoch 相等，WHEN `_setEpoch` 比较，THEN 不发起任何迁移（neutral 无害）。`[源码已证: fiber.ts:627-628]`
- **EB-N3**：GIVEN epoch 变化且无 inertia 在飞，WHEN `_setEpoch` 分派，THEN INACTIVE→非 INACTIVE 启动 `_reload()`（LOADING），否则启动 `_unload()`。`[源码已证: fiber.ts:629-640]`
- **EB-N4**：GIVEN inertia 在飞（过渡未完成），WHEN epoch 再次变化，THEN 只更新 epoch、不打断当前过渡；完成后按最新 epoch 链式接续。`[源码已证: fiber.ts:281-294, 632-633]`
- **EB-N5**：GIVEN reload 完成，WHEN 比较 `runner.epoch` 与启动时 `oldEpoch`，THEN 不等则链入 unload，相等则稳定 ACTIVE。`[源码已证: fiber.ts:357, 390]`
- **EB-N6**：GIVEN 提供者 fiber 状态在 ACTIVE↔非 ACTIVE 间翻转，WHEN `_updateState` 检测到变化，THEN 对其提供的每个服务名调用 `reflect.notify([impl.name])`。`[源码已证: fiber.ts:588-596]`
- **EB-N7**：GIVEN 同一提供者 fiber 在 ACTIVE 期间更换绑定值或原地修改导出，WHEN 无状态翻转，THEN 不发 notify、不触发 refresh，对消费者不可见。`[源码已证: fiber.ts:578-596 与 EB-N1]`
- **EB-N8**：GIVEN 原生 notify→refresh 链路，THEN epoch 比较是 uid 指纹字符串全等比较；版本、绑定值、导出符号都不在原生 epoch 中。`[源码已证: fiber.ts:104, 611-627]`
- **EB-N9**：GIVEN loader entry 配置，THEN 支持 id/name/config/group/disabled/inject 字段，isolate/intercept 选项由独立模块实现且 loader 默认挂载。`[源码已证: vendor/loader/src/config/entry.ts:1-24; config/isolate.ts:70-99; index.ts:159]`
- **EB-N10**：GIVEN HMR 事务性 reload 中任一 stale entry 失败，THEN 存在缓存恢复与回滚路径（rollback 实现）。`[源码已证: vendor/hmr/src/index.ts:482-534]`
- **EB-N11**：GIVEN ctx.isolate/ctx.intercept 与 entry 级 isolate/intercept 选项已实现，THEN dsh 0811 运行时包未使用这些选项（仅 mygo 测试/工具目录引用）。`[源码已证: vendor/cordis/src/context.ts:121,139; packages 搜索无 isolate: 使用]`
- **EB-N12**：GIVEN fiber 暴露 inertia/state（公开）与 epoch（lib 中仅存于私有 `_runner`），THEN loader entry 持有 fiber 引用可被外部只读观察；epoch 需公开 getter 或私有访问。`[源码已证: fiber.ts:200,577-596; vendor/loader/src/config/entry.ts:56; lib 无 epoch 公开字段（A9）]`
- **EB-N13**：GIVEN 服务被 provide/unprovide，THEN reflect 层即时调用 `notify([name])`（独立于 fiber 状态翻转通知）。`[源码已证: vendor/cordis/src/reflect.ts:295,299]`

## 2. mygo 设计预期行为清单（[设计预期]）

- **EB-D1**：GIVEN B 依赖 A 的符号 {A}，WHEN A 0.0.1→0.0.2 重装且 exports 变为 {A', B}（A 改名 A'、新增 B），THEN A 新实例 → 原生 epoch(B) 变化 → B 进入 RELOADING；细符号校验 `{A}⊄{A',B}` 失败。`[推导-基于已证: EB-N1..N8 + A4]` `[设计预期]` → R2-7 扩展（前提 A11 PARTIAL：动态访问盲区由运行时代理兜底）
- **EB-D2**：GIVEN EB-D1 失败且采用 P2，THEN B 收敛 INACTIVE 并产出结构化报告（断点 B、链 A→B、候选 A@0.0.2 拒绝原因“A 缺失”、建议迁移到 A' 或回退）。`[推导-基于已证]` `[设计预期]` → R2-5/R2-6 扩展
- **EB-D3**（作废·已裁决删除）：GIVEN EB-D1 失败且采用 P1-local，THEN B 保持 ACTIVE 于旧 A 实现（旧模块缓存），A 保持新版本，产出告警；存在“提供者新、消费者旧”的混合态。`[推导-基于假设: A8]` `[设计预期]` → 已裁决删除，不计入统计
- **EB-D4**：GIVEN EB-D1 失败且采用 P1-global，THEN A、B 整体回滚旧状态，升级不生效，并产出与 P2 同规格的硬告警 + 结构化报告（失败的过渡、原因、回到哪一代）。`[推导-基于已证: EB-N10 + paper Algorithm 9]` `[设计预期]` → 待 R3 新增
- **EB-D5**：GIVEN B 的声明已同步迁移为 A'，WHEN EB-D1 的 A 更新发生，THEN 投影 `{A'}⊆{A',B}` → reload 成功 → B ACTIVE，细 epoch 收敛到 (0.0.2, {A'})。`[推导-基于已证]` `[设计预期]` → R2-7（前提 A11 PARTIAL）
- **EB-D6**：GIVEN 新符号 B 被插件 C 使用，WHEN A 更新加入 B，THEN C 细 epoch 变化 → reload 校验通过 → C ACTIVE；未使用 B 的插件不受影响（投影过滤）。`[推导-基于已证]` `[设计预期]` → R2-7 扩展（前提 A11 PARTIAL）
- **EB-D7**：GIVEN 版本不变静默替换走重装路径，WHEN A 以同版本新模块替换，THEN 新 fiber → uid 变化 → 原生 epoch 变化 → reload；符号校验可抓 A→A'；版本层（range/pin/lockfile version）全部失明，内容哈希仅在安装路径有效。`[推导-基于已证: A4]` `[设计预期]` → R2-7 / R1 lockfile 扩展
- **EB-D8**：GIVEN 版本不变且同实例原地改导出（不重装），THEN 分路径处理：桥接路径 MUST 强制执行 exports 冻结/Proxy 包装；直连路径声明为契约外行为（后果自负），预留定期快照比对传感器（A5 成本数据支持）作为后续可选增强，本轮不实现。`[已证-含边界: A5 CONFIRMED / A7 桥接可强制、直连不可]` `[设计预期]` → 待 R3 新增
- **EB-D9**：GIVEN reload 期间依赖/符号连续变化，WHEN 多次变化到达，THEN 惯性合并为 reload→unload→reload 链，最终收敛到最新 epoch，无半激活中间态。`[已证-含边界: EB-N3..N5 + A2 步边界]` `[设计预期]` → 待 R3（沿用原生惯性，无新机制）
- **EB-D10**：GIVEN 细 epoch 模型，THEN epoch = (uid 元组, 版本元组, 符号投影元组, 政策事实)，原生粗 epoch 是其投影；细变粗必变，粗变细不必。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增
- **EB-D11**：GIVEN 政策闸，THEN breaks/pins/符号缺失作为需求函数一项参与细 epoch 求值，不是外部刹车；reload 前置校验失败 → INACTIVE/回滚 + 报告。`[推导-基于已证: EB-N8]` `[设计预期]` → R2-6/R2-7 扩展
- **EB-D12**：GIVEN 方法更新语义，THEN 方法增删改名可对齐为符号增删；删除是唯一直接导致 consumer INACTIVE 的符号事件；改名=删旧+增新，终态取决于声明是否迁移。`[推导-基于已证: EB-D1/D5/D6]` `[设计预期]` → R2-7 扩展（前提 A11 PARTIAL）
- **EB-D13**：GIVEN 细粒度需求，THEN 维护者侧最小粒度=(semver 版本, 导出符号路径) 按发布离散；运行侧最小粒度=(fiber, 依赖边, 被用符号投影) 按变更批次重算。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增
- **EB-D14**：GIVEN mygo 控制面，THEN 通过 loader entry 内省 fiber.inertia/state/epoch（epoch getter 已落地，见 PATCHES.md #1）做 BOM 运行期对账、报告实况、行变更时机（等 inertia 静默）。`[已证-含边界: A9]` `[设计预期]` → R1 BOM 扩展
- **EB-D15**：GIVEN 原生反应式与 mygo 细语义，THEN 两者是同一需求满足自动机的两种粒度（粗=调度执行，细=需求函数+传感器+前置门），不冲突。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增
- **EB-D16**：GIVEN disabled / 政策拒绝 / INACTIVE 三态分立，THEN 优先级为 disabled > 政策拒绝 > INACTIVE；disabled 与政策拒绝不因依赖恢复自动激活，INACTIVE 依赖恢复后自动激活（已裁决，见 §6 矛盾 2）。`[推导-基于已证: A3]` `[设计预期]` → 待 R3 新增
- **EB-D17**：GIVEN P1-local 与 R1“同一时刻同 id 唯一版本实例”不变量冲突（旧 A 实现与 A@0.0.2 并存），THEN 已裁决删除 P1-local（矛盾 1 选 a），冲突消失。`[假设]（[设计决策]）` `[设计预期]` → 已裁决（见 §6）
- **EB-D18**：GIVEN 静默替换的两种路径，THEN 安装路径由内容哈希兜底、运行路径由符号投影兜底；两者覆盖不同时机，不能互相替代。`[推导-基于已证: EB-N1/N7 + R1 lockfile]` `[设计预期]` → R1 lockfile / R2-7
- **EB-D19**：GIVEN manifest 声明符号别名/兼容映射（如 `b: alias of c`），WHEN 提供者把符号 b 改名为 c，THEN 消费者可按别名解析通过校验（reload 成功）；未声明别名时，改名一律按破坏性变更走删除路径（INACTIVE）。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增
- **EB-D20**：GIVEN reload 前置校验，THEN 校验必须基于挂载时缓存的导出快照做纯内存比较，reload 路径禁止磁盘 I/O（同步性约束，避免异步门与惯性冲突）；触发频率假设 MUST 按 notify 双源（provide/unprovide 即时 + 状态翻转）复核，每次触发成本 MUST 保持在微秒~亚毫秒级。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增（A5 CONFIRMED：10k 符号亚毫秒；A10 双源）
- **EB-D21**：GIVEN dispose/unload 的 effect 任务永不结束（A2 边界），THEN dispose/unload MUST 有超时与强制终止政策：超时后将该 fiber 强制置 FAILED、释放过渡队列、并产出结构化报告；MUST NOT 无限等待。超时值与强制终止语义由 design-r3 定义。`[假设]（[设计决策]）` `[设计预期]` → 待 R3 新增
- **EB-D22**：GIVEN 涉及代码/exports 的变更，THEN 必须走 remove+create（新 fiber）；config-only 路径 MUST 被限制为只能改配置、物理上不能替换模块。`[推导-基于已证: A4 + loader update Omit<'name'> + entry diff 仅 config → fiber.update]` `[设计预期]` → 待 R3 新增

## 3. 场景行为表

| 场景 | 触发 | 原生 epoch 变化 | 细校验 | P1-local 终态 | P1-global 终态 | P2 终态 |
|---|---|---|---|---|---|---|
| 版本升级 + 方法改名（B 未迁移） | A 重装 0.0.1→0.0.2，exports {A}→{A',B} | [OK] uid 变 | `{A}⊄{A',B}` 失败 | 已删除 | A、B 整体回滚旧版 + 硬告警/报告 | B INACTIVE + 报告 |
| 版本升级 + 方法改名（B 已迁移） | 同上，B 声明用 A' | [OK] uid 变 | `{A'}⊆{A',B}` 通过 | —（成功） | — | B ACTIVE |
| 新增符号 B | A 更新加入 B | [OK] uid 变 | 投影外消费者无变化；投影内 C 通过 | — | — | C ACTIVE；无关者不动 |
| 版本不变静默替换（重装） | A 同版本新模块 | [OK] uid 变 | 符号校验可抓 | 已删除 | 回滚旧模块 + 硬告警/报告 | B INACTIVE + 报告 |
| 版本不变同实例原地改导出 | A 对象上 A→A'，不重装 | [x] uid 不变、无 notify | 原生全盲；需结构性比较/替换契约 | — | — | 不可见（未解） |
| reload 期间连续变化 | 依赖/符号多次变化 | epoch 多次更新 | 前置校验按最新 epoch | 惯性链合并 reload→unload→reload，收敛最新态 | 同左 | 同左 |
| disabled 与 INACTIVE 并存 | 管理性关闭 + 依赖恢复 | epoch 可恢复 | 优先级已裁决（三态） | — | — | 待实现（§6 矛盾 2） |

> 注：P1-local 已按矛盾 1 裁决删除，失败策略为干净两档（P1-global 默认、P2 硬约束）。

## 4. 假设清单（消化后判定）

> 实验与判定详见 docs/assumption-verification.md；实验代码 packages/cordis/mygo/test/eb/。

- **A1** CONFIRMED：entry `name` 即模块说明符（等价 paper 的 url），无 url 字段；`tree.import(name)` 加载（entry.ts:9-20；tree.ts:145-161）。`[源码已证]`
- **A2** PARTIAL：异步迭代器步边界 guard + 已累积逆 LIFO 恢复成立；同步迭代器无 guard；永不结束的异步生成器 dispose 会挂起（fiber.ts:356-397、415-560）。`[已证-含边界]`
- **A3** CONFIRMED：disabled 期间依赖上线不自动激活；enable 后反应式恢复（eb-a03）。`[源码已证]`
- **A4** CONFIRMED：remove+create 每次新 fiber/uid（3 轮）；config-only update 复用同一 fiber（eb-a04；registry.ts:330）。`[源码已证]`
- **A5** CONFIRMED：10k 符号冻结+Set 差比较亚毫秒（eb-a05）。`[源码已证]`
- **A6** CONFIRMED：候选方案清单成立（实例替换/快照指纹/代理/混合，成本依据 A5/A11）。`[源码已证]`
- **A7** PARTIAL：桥接路径 mygo 经 importEntry 加载可包装；直连行交给原生 loader 不可包装（eb-a07）。`[已证-含边界]`
- **A8** OBSOLETE：P1-local 已裁决删除，不做实验（eb-a08 断言基线文档）。`[假设]`
- **A9** PARTIAL（已落地修复）：entry.fiber 可达、inertia 公开字段；epoch 原在 lib 私有 `_runner`，收尾已实现公开 getter（PATCHES.md #1，eb-a09 复测通过）。`[已证-含边界]`
- **A10** PARTIAL：notify 双源——provide/unprovide 即时通知（reflect.ts:295,299）+ ACTIVE 翻转通知（fiber.ts:588-596）；曾 provide 的失败会通知，未 provide 的失败不产生插件服务名通知（eb-a10）。`[已证-含边界]`
- **A11** CONFIRMED（含盲区）：Proxy 可记录动态缺失符号访问，1e6 次 get 数十毫秒级；盲区=先解构再代理（eb-a11）。`[源码已证]`

## 5. R1/R2 映射

| 设计预期条目 | 映射 |
|---|---|
| EB-D1, D5, D6, D7, D12, D18 | 修改/扩展 R2 第 7 条（符号级校验）为运行期细 epoch 与 reload 前置门 |
| EB-D2, D11 | 扩展 R2 第 5/6 条（硬阻断 + 结构化报告）至运行期失败路径 |
| EB-D4 | 待 R3 新增（P1-global 默认失败策略 + 硬告警/报告） |
| EB-D8 | 待 R3 新增（实例替换契约 / 结构性符号比较） |
| EB-D9 | 待 R3（沿用原生惯性；对应 R1 HMR 语义，无新机制） |
| EB-D10, D13, D15 | 待 R3 新增（细 epoch 模型 / 粒度定义 / 统一自动机表述） |
| EB-D14 | 扩展 R1 BOM/对账为运行期事实源 |
| EB-D16 | 待 R3 新增（disabled vs INACTIVE 优先级） |
| EB-D17 | 已裁决（删除 P1-local），见 §6 |
| EB-D19 | 待 R3 新增（符号别名/兼容映射） |
| EB-D20 | 待 R3 新增（同步前置门约束） |

## 6. 矛盾与裁决记录

**矛盾 1：P1-local 与 R1 单实例不变量**

- 冲突：P1-local 让 B 继续引用旧 A 实现，同时 A@0.0.2 为激活实例——同一 id 两个版本实现并存，违反 R1“同一时刻同 id 唯一版本实例”。
- 选项：
  - (a) 禁止 P1-local，失败策略只允许 P1-global / P2；
  - (b) 放宽不变量为“同一时刻只有一个激活实例，旧代仅作为缓存引用供回滚”（与 HMR backup 语义一致，需修订 R1 措辞）；
  - (c) P1-local 仅允许桥接消费者（mygo 控制绑定），直连插件禁止。
- **裁决（已定）**：选 (a)。删除 P1-local（EB-D3 作废）；失败策略为两档：P1-global 默认、P2 硬约束。

**矛盾 2：disabled（管理性）与 INACTIVE（反应式）优先级**

- 冲突：依赖恢复时反应式自动激活，可能绕过用户显式 disabled；反之若 disabled 优先，则“依赖恢复自动恢复”语义失效。
- 选项：
  - (a) disabled 优先：disabled 插件即使依赖满足也不自动激活，需显式 enable；
  - (b) 反应式优先：disabled 只是初始化门，依赖满足后自动激活；
  - (c) 新增“管理性暂停（paused）”状态，与 disabled（永久关闭）和 INACTIVE（依赖性）三者区分。
- **裁决（已定）**：选 (c)。三态分立，优先级 disabled > 政策拒绝 > INACTIVE（对应 EB-D16）；“用户显式关闭 / 政策拒绝 / 依赖缺失”三种停用分别记账。

## 7. 结论统计

| 证据状态 | 数量 |
|---|---|
| [源码已证] | 19（EB-N1..N13 + A1, A3, A4, A5, A6, A11） |
| [推导-基于已证] | 11（EB-D1, D2, D4, D5, D6, D7, D11, D12, D16, D18, D22） |
| [已证-含边界] | 7（A2, A7, A9, A10 + EB-D8, D9, D14） |
| [假设]（[设计决策]） | 7（EB-D10, D13, D15, D17, D19, D20, D21） |
| 合计 | 44 |

> EB-D3 已作废（矛盾 1 裁决删除）与 A8（OBSOLETE）不计入统计。

未验证经验假设：0；[设计决策] 7 / 44 = 15.9% < 20%，头部警告已解除。

## 8. 冻结声明与修订记录

> **FROZEN**：本文档自 2026-08-11 起正式冻结，作为第三轮（Fabric/Modrinth 对核）
> 与 design-r3 的唯一基线。冻结后任何修改 MUST 以修订记录形式追加
> （修订编号 + 日期 + 原因），禁止原地改写条目。

| 修订编号 | 日期 | 原因 |
|---|---|---|
| R1 | 2026-08-12 | 守则合规轮（零侵入裁决）：删除 vendor epoch getter 补丁（PATCHES.md #1 已移除，fiber.ts / lib/index.js / fiber.d.ts 三处回滚，git 核验零残留）。EB-D14 中「epoch getter 已落地」随之失效：原生 epoch 仅存私有 _runner（诊断用），mygo 控制面细 epoch 由 FineEpochRegistry 自有记账维持；EB-A9 断言同步更新。 |
| R2 | 2026-08-12 | 守则 emoji 清理轮：本文档 5 处状态标记（原 U+2705 x4、U+274C x1）原地替换为文字标记（[OK]/[x]），仅格式化、无语义变更。 |
| R3 | 2026-08-12 | 按当前代码把 epoch 依赖描述全面修正为**自维护口径**（取消对本体 fiber epoch 的依赖；正文条目按冻结纪律不改写，以下为受影响条目的现行权威描述）：① **EB-N12** 旧表述「epoch 需公开 getter 或私有访问」作废——原生 fiber 无 epoch 公开入口（lib 仅存私有 `_runner`），mygo 不经此路径内省；② **EB-D14** 旧表述「（epoch getter 已落地，见 PATCHES.md #1）」失效——现行描述：mygo 控制面经 loader entry 内省 fiber.inertia/state（公开字段）做 BOM 对账与行变更时机，细 epoch（provider uid / 版本 / 符号投影 / 政策事实，EB-D10）由 **FineEpochRegistry 自有记账**维持，与原生 epoch 解耦；原生 epoch 仅诊断用（无公开入口）；③ **A9**（§0.2 表与 §4 表）边界重述：entry.fiber 可达、inertia 公开；原生 epoch 无公开入口；自维护细 epoch 落地于 FineEpochRegistry（eb-a09 复测通过，断言改为「无公开入口 + `get epoch()` 零残留」）。上游 API 请求（官方公开只读 epoch 入口）仅作为后续可选增强保留于 compliance-closeout，不影响本基线。 |
