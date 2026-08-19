# CD 裁决材料（CD-1 错误词汇分岔 / CD-2 台账分岔）——只调查，不修复

> 生成时间：2026-08-13 ｜ 前置：修复批次 1-4 收口（HEAD a2b725e，66 文件 /
> 659 用例全绿）。本批零代码改动，产物仅本文档。
> 证据纪律：每条事实主张带 file:line；负证据附 grep 模式 + 范围；
> [事实] 与 [推断] 分列；冻结承诺全部原文摘录、零转述。

## CD-1：错误词汇分岔（ResolutionReport 9 码 vs PluginError 43 码 6 组）

### 1.1 报告词汇 9 码逐码清单（生产者 / 消费者 / 死活）

联合定义：`packages/cordis/mygo/src/package/report.ts:42-45`（code 联合）、
`:48`（scope）、`:50-53`（generation 字段）。

| 码 | 生产者（构造点） | 消费者 | 死活（批次 1-4 后） |
|---|---|---|---|
| resolve-failed | resolver.ts:525（求解失败）；package-manager.ts:115/134/181/191/308 | service.ts:134-144、360-395（包 PluginError 上抛）；CLI render.ts:25 | 活 |
| dependency-cycle | resolver.ts:248/262；package-manager.ts:541（mountOrder） | service.ts:145-154（boot 硬阻断） | 活 |
| lockfile-mismatch | package-manager.ts:451/472/495（verifyAtBoot）；pack.ts:490/1018（批次 3 显式拒绝） | service.ts:134-144；CLI render | 活（批次 3 获得形状校验生产者） |
| manifest-invalid | package-manager.ts:232（bundles/声明问题） | CLI render；service 包 PluginError | 活（报告面仅 1 处；throw 面另有 adapter.ts:376 等 7+ 处——两侧同名，见 1.3） |
| symbol-missing | package-manager.ts:254（安装期符号校验）；requires-gate.ts:139-141（运行期闸，批次 2） | engine.policyReportOf（lifecycle.ts:1868）；测试 | 活（批次 2 获得运行期生产者） |
| policy-rejected | requires-gate.ts:141（批次 2） | engine.policyReportOf；测试 | 活（批次 2 前为死码） |
| dispose-timeout | **零生产者**（grep `'dispose-timeout'` 全 src 仅 report.ts:44 联合声明） | — | **死码复核确认**（批次 2 任务书登记维持不构造；design-r3 §1.7 承诺的「超时→FAILED+结构化报告」未实现，lifecycle.ts:3071-3098 仅 logger.warn） |
| pack-invalid | pack.ts:421（packReport 统一构造） | CLI render.ts:9/25/38（PACK_CODES） | 活 |
| pack-hash-mismatch | pack.ts:668（hashReport） | CLI 同上 | 活 |
| generation（字段） | resolver.ts:50/250/264/527 条件展开；**零调用方传 input.generation**（grep `resolve({` 全部调用点均无 generation 参数） | — | **死字段复核确认**（EB-D4「回到哪一代」报告面未接线；P1-global 回滚语义本身也未实现——仅批次 1 报告的回议 1 登记） |

### 1.2 PluginError 43 码 6 组逐组清单

定义：`packages/core/mygo-api/src/error.ts:15-107`（6 组 43 码，组 1 声明校验 7 /
组 2 权限授权 6 / 组 3 关系冲突 9 / 组 4 协议操作 9 / 组 5 dispatch 边界 5 /
组 6 能力拒绝 7）；模板 `:147-238`；类 `:116-133`；`formatPluginError`
`:248-250`。抛出点普查：`throw fail(` 全 src 62 处（grep 模式
`throw fail\(`，范围 packages/cordis/mygo/src，分布 manifest.ts / mount.ts /
capabilities.ts / dispatch.ts / lifecycle.ts / service.ts）。catch 点：
service.ts:410/438（`instanceof PluginError` 透传不重包）、lifecycle.ts
多处 catch → fail 包装（staging-failed / persist-failed 等）。

组 6 口径（与 DG-3 文档批对齐，批次 3 普查复核）：
- llm-denied / exec-denied：抛出点仅 capabilities.ts:201/227，且仅
  **host seam 缺失**时抛（host-unavailable），非 grants 拒绝；
- fs-denied / network-denied / vars-denied / http-denied / emit-denied：
  **零抛出点**（grep 各码全 src 仅 error.ts 声明 + 模板出现；.d.ts 类型声明除外）。
- 根因 = DG-3(a) 裁决：权限核心永久移除，Proxy=访问记录面（本矩阵 §3 引用）。

### 1.3 交叉面：同一失败事件是否双发？

[事实] **不双发——「单源双通道」**。报告面与 throw 面的衔接点是
service.ts 的两处包装：

- service.ts:134-144：`verifyAtBoot` 产出 lockfile-mismatch 报告 →
  `new PluginError('package-not-resolvable', …)`，报告作为
  `details: { package: 'lockfile', report: bootVerify.report }` **搭车**；
- service.ts:360-395（resolveNpmSource）：resolveInstall 的 resolve-failed/
  manifest-invalid/symbol-missing 报告 → 同款 PluginError 包装
  （details.report 搭车）。

分工边界证据：
- **CLI（mygo-cli）**：直接消费报告面（pack/restore 调 buildPack/
  installPack，outcome.report → render.ts:25 渲染），不经 PluginError；
- **面板（vendor/dsh-mygo-panel）**：只消费 throw 面——全部操作经
  `ctx.pluginManager.<method>`（throw PluginError），渲染 `error.message`
  （panel index.ts:3575-3579 catch → json 400），**不读 ResolutionReport**
  （grep `report` 于 panel src 无 report.ts 类型消费点）；
- **插件作者**：可 catch 的只有 PluginError（mygo-api 导出；runtime 能力
  拒绝走 env.* 同步 throw，error.ts 组 6 注释「同步 throw，先于任何实际操作」）；
- **FakePluginEnv**（mygo-api fake.ts:9/665-667）：抛 PluginError
  （setup-registration 模拟），即测试面只覆盖 throw 词汇。
- `manifest-invalid` 两侧同名：PluginError（error.ts:16；adapter.ts:376/416/
  438/456/479/547/579 共 7+ 处抛出）与报告码（package-manager.ts:232）——
  同名异面，CD-1 登记原文已点名。

### 1.4 消费者盘点（C.1-4 结论表）

| 消费方 | 读哪套 | 证据 |
|---|---|---|
| CLI（pack/restore/render） | 报告面（ResolutionReport + ServiceResolutionReport） | mygo-cli/src/render.ts:9/25/38；index.ts:139-197 |
| 面板（vendor panel /api/mygo/*） | throw 面（PluginError.message；details 透传 json） | panel index.ts:3575-3579 |
| 插件作者（catch 面） | throw 面（PluginError；错误码 + details + pluginId） | mygo-api error.ts:116-133 |
| FakePluginEnv（测试面） | throw 面 | fake.ts:665-667 |
| 引擎政策报告（policyReportOf） | 报告面（service scope；当前生产零消费方，仅测试/未来面板） | lifecycle.ts:1868 |

### 1.5 冻结承诺摘录（原文，零转述）

expected-behavior.md:85（EB-D2）：
> 「GIVEN EB-D1 失败且采用 P2，THEN B 收敛 INACTIVE 并产出结构化报告（断点 B、链 A→B、候选 A@0.0.2 拒绝原因“A 缺失”、建议迁移到 A' 或回退）。」

expected-behavior.md:87（EB-D4）：
> 「GIVEN EB-D1 失败且采用 P1-global，THEN A、B 整体回滚旧状态，升级不生效，并产出与 P2 同规格的硬告警 + 结构化报告（失败的过渡、原因、回到哪一代）。」

expected-behavior.md:94（EB-D11）：
> 「reload 前置校验失败 → INACTIVE/回滚 + 报告。」

expected-behavior.md:104（EB-D21）：
> 「dispose/unload MUST 有超时与强制终止政策：超时后将该 fiber 强制置 FAILED、释放过渡队列、并产出结构化报告；MUST NOT 无限等待。超时值与强制终止语义由 design-r3 定义。」

design-r3.md:111（§2.1 depends 违例）：
> 「违例行为：安装期求解失败 → 结构化报告（断点/链/候选/建议，R1 §11 + C1）；运行期提供方消失 → 政策闸按包级事实处理（EB-D11），P2 INACTIVE 或 P1-global 回滚。」

design-r3.md:118（§2.1 requires 违例）：
> 「运行期政策闸（EB-D11）覆盖服务粒度——服务缺失 → INACTIVE（P2）或 P1-global 回滚，报告 `service-missing`……提供者版本不满足区间 → `provider-version-mismatch`；消费者被用符号不在提供者符号投影 → `symbol-missing`（EB-D12）。」

design-r3.md:129（§2.1 观测记录）：
> 「报告候选集 MUST 来自 mygo 运行期维护的服务提供者观测记录……只读、不阻断，仅用于报告与诊断。」

design-r3.md:131（§2.1 身份标注）：
> 「`provider-version-mismatch` 与 `symbol-missing` 为**作者愿景级决策**，超出 requires 最小语义（最小语义 = 声明 + INACTIVE + 报告）……若该套语义被现实证明过度建设，可按此标注砍掉版本/符号维度，仅保留最小语义，砍除时无心理负担。」

design-r3.md:97（§1.7 dispose 超时）：
> 「超时后：该 fiber 强制置 FAILED，释放过渡队列，后续过渡（含 P1-global 回滚与 P2 停用）不得被其阻塞；产出结构化报告（含仍未完成的 effect 名单）。」

two-tier-contract.md:11（§7 体系内）：
> 「受依赖图全套约束：安装期求解、lockfile、pins、符号校验、加载门、反应式编排、结构化报告。」

two-tier-contract.md:25（§8 担保矩阵）：
> 「状态观察 / 报告可见 | [OK]（BOM 对账 + fiber 内省 + 结构化报告） | [OK]（只读观察：fiber 状态、BOM 版本/peer 告警）」

two-tier-contract.md:61（§12 mixin 免责）：
> 「mygo 结构化报告不覆盖其失败。」

CD-1 登记原文（docs/next/2026-08-12-mygo-api-surface.md §10）：
> 「现状：两套错误词汇共存——`PluginError` 43 码（throw 面，error.ts:15-115）与 `ResolutionReport.code/scope`（结构化报告面，mygo `package/report.ts`）。`manifest-invalid` 两侧同名……候选方向：(a) 映射表；(b) 「错误 vs 报告」分工原则（建议倾向）：挂载期/治理期失败 MUST 走结构化报告……运行时能力拒绝走 PluginError。」

### 1.6 裁决选项空间 + 三轴初评（成本 / 可逆性 / 风险）

**选项 (a) 分层定型**（DEV-GUIDE §7 建议倾向的细化）：
- 归属表（[推断]，基于 1.1-1.4 事实）：
  | 失败类 | 建议面 | 现状 | 迁移量级 |
  |---|---|---|---|
  | 安装期求解（resolve/依赖/环/pack/manifest） | 报告 | 已报告 ✓ | 无 |
  | 加载期校验（lockfile/符号 import 集） | 报告 | 已报告（service 包装上抛）✓ | 无 |
  | 运行期治理（requires 闸/service 报告） | 报告 | 已报告（policyReportOf）✓ | 面板接 policyReportOf 显示 |
  | 运行期能力拒绝（env.fs/llm/exec 等） | PluginError | 现状 llm/exec 仅 seam 缺失抛；其余无门（DG-3(a)） | 语义已被裁决移除，无需动作 |
  | 挂载期/契约违规（manifest 形状、事件词汇、conflicts、staging/persist/配额） | PluginError | 现状 PluginError ✓ | 无 |
  | dispose-timeout / generation | 报告（EB-D21/EB-D4 承诺） | 死码 | 未来实现或正式宣布不实现（需冻结文档 Rev） |
- 迁移影响面：核心面零代码；① lifecycle disposeGenerationBounded（3071-3098）可选接报告（若裁决实现 EB-D21）；② 面板加 policyReportOf 展示（vendor panel 1 处）；③ DEV-GUIDE §7 与 mygo-api-surface.md §6（43 码 5 组笔误）文档对齐。冻结文档零改动。
- 三轴：成本=低（现状 80% 已符合）；可逆性=高（无词汇变更）；风险=低（边界表显式化，唯一新增面=面板报告展示）。

**选项 (b) 报告收口**（PluginError 降为传输壳）：
- 含义：所有失败统一产 ResolutionReport，PluginError 仅承载 `details.report`。
- 迁移影响面：lifecycle.ts 62 处 fail 站点全部需配报告构造（或包装层映射）；dispatch 5 码（next-missing 等运行时吞没语义）无自然报告形状，需造 shape 或豁免——**量级最大**；mygo-api error.ts 43 码与 fake.ts 全部保留（契约面 semver 只增不删）。
- 三轴：成本=高；可逆性=低（一次大改）；风险=中高（挂载期高频路径全部换面，面板/插件作者 catch 面行为变化）。

**选项 (c) 维持并存 + 文档化分工**：
- 含义：零代码，文档写明 1.3 的「单源双通道」边界 + 1.6(a) 归属表。
- 迁移影响面：仅 docs（DEV-GUIDE §7 / mygo-api-surface.md / 本材料落定）。
- 三轴：成本=近零；可逆性=最高；风险=低但保留同名异面（manifest-invalid）的困惑面。

### 1.7 调查者倾向（[推断]）

**选 (a) 分层定型**，实质 = (c) 的文档化 + 两个小增量（面板报告展示、
EB-D21/EB-D4 死码的正式定案）。理由：现状已是 (a) 的 80%；(b) 的 62 处
改造与 dispatch 吞没语义冲突，收益不成比例；唯一必须补的裁决点是
dispose-timeout / generation 两个死码的去留（实现或经冻结文档修订记录
宣布不实现），否则 DEV-GUIDE §7 与实现长期矛盾。

---

## CD-2：台账分岔（面板 adoptRaw 静态账 vs dsh.lock/v1 账本）

### 2.1 登记原文回放

EXT-CD-index.md:19（CD-2 行）：
> 「面板 folder 安装静态账（桥接行+安装目录+静态记录）vs `dsh.lock/v1` 账本分叉；候选：(a) 统一走 lockfile；(b) 静态账为合法一等路径；(c) 两账并表标注来源 ｜ 仅登记，待独立小轮裁决」

cli-verification.md:156-158（T50 如实标注）：
> 「**如实标注**：面板 folder 安装 = `adoptRaw` 静态路径（webui-spike.spec.ts 断言面），不写 pack 期 `dsh.lock/v1`、不写 registry 行（registry 表保持 0 行）；`dsh.lock/v1` 账由 npm-source/pack 路径承担（T33/T44 已证）。」

docs/next/2026-08-12-cd-2-panel-adoptraw-ledger.md:8-14（现状段）：
> 「面板 folder 安装（`POST /api/mygo/install` → `installFromRoot` → `pluginManager.adoptRaw`）走**静态装载路径**：账目 = `cordis.patch.yml` 桥接行 + `mygo-plugins/<id>/` 安装目录 + `.mygo-install.json` + `plugins()` 静态记录（origin static / rail bridge）；**不写** pack 期 `dsh.lock/v1`，**不写** registry 行……pack/npm 安装路径（`installPluginPack` / `resolveInstall`）写 `dsh.lock/v1` + 不可变 store + registry 持久化。两套账本并存：同一插件可能「面板账有、lockfile 账无」（或反之）。」

design-r5-cli.md:455-459（§7.2 路线 2 行）：
> 「**能跑（子集）**：源码态 panel 已先例；需 npm rc.1/0811 profile 实测 lockfile 落账与报告可见……需要 mygo 包可发布/可装入官方 profile（依赖发布流水线，非本轮）。」

### 2.2 adoptRaw 语义取证

[事实] 面板 folder/GitHub 安装链：
- panel index.ts:2337-2489（installFromRoot）：写 `.mygo-install.json`
  （:2471，MANIFEST=InstallManifest 含 id/method/source/entry/installedAt/
  config）+ SKILL.md 同步（:2453-2470）→ `pluginManager.adoptRaw(raw,
  resolvedConfig, id, declaration)`（:2479）→ `ensureProjectedBridge`
  （:2480，cordis.patch.yml 桥接行）→ `syncBridgeRows`（:2481）。
- adoptRaw（lifecycle.ts:1158-1166）= mergeRawDeclaration +
  `adoptStatic`；adoptStatic（lifecycle.ts:1020+）建 record 时
  `origin: 'static'`（lifecycle.ts:1064），持久化走 registry store 状态行
  （writeGeneration/writeStatus），**不经 package-manager，不写 lockfile**
  （grep `readLockfile|writeLockfile|installPackageToStore` 于 lifecycle.ts
  adoptStatic 路径零命中）。
- 结论 [事实]：adopt 的是「Cordis raw 插件经 mygo 托管面（facade/adapter）
  挂载的运行时记录」，账目=桥接行+安装目录+静态记录；与 lockfile 台账
  （npm/pack 源）结构分叉。

集合差异场景枚举 [事实]：
- 面板可见但不在 lockfile：adoptRaw 静态插件（folder/GitHub 安装）、
  bundle rail 成员（panel plugins() 经 engine 记录可见）、桥接行插件；
- lockfile 有但运行/面板态不一致：npm/pack 插件经面板 uninstall 后
  （见 2.3，engine.uninstall 不写 lockfile）→ lockfile 残留条目，
  且批次 1 的 restore merge（pack.ts 合并逻辑）会**保留**未出现在 pack 内
  的既有条目——幽灵条目可跨 restore 存活；反向（lockfile 有但面板完全
  不可见）仅存在于 boot 恢复失败/跳过场景（verifyAtBoot 硬阻断则不启动，
  或 tombstone 跳过静态行，lifecycle.ts:999-1017）。

### 2.3 面板写操作面（每个操作作用在哪个台账）

[事实] 面板全部写操作（panel index.ts）：
| 操作 | 面板代码 | 作用系统 | 台账 |
|---|---|---|---|
| 安装（folder/github/archive） | installFromRoot:2337-2489 | engine.adoptRaw + 桥接行 + 安装目录 + .mygo-install.json | 静态账（不写 lockfile/registry 行） |
| 启用/停用 | :3543-3544 → pluginManager.enable/disable | engine（registry 状态行 + 运行时） | registry 状态行；lockfile 无关 |
| 卸载 | :3553-3560 → pluginManager.uninstall + rm 安装目录 + removeProjectedBridge + skill 清理 | engine.uninstall（record 删除 + tombstone）+ 静态账清理 | **lockfile 不更新**（engine.uninstall 全链 grep 无 lockfile 调用） |
| 配置 | :3285 → pluginManager.updateConfig | engine replace（registry 代） | registry；lockfile 无关 |
| bundle | :3525 → pluginManager.bundleUninstall | bundle rail | rail 账 |
| 依赖解析计划 | :2399-2416 → planInstall/enable | engine（plan 预览） | 只读 |
- **绕过 mygo 治理的写路径** [事实]：不存在——面板全部操作经
  pluginManager（service 面），无直写 lockfile/store/registry 的路径
  （grep 面板 src `readFile.*lock|writeFile.*lock` 零命中）；但「治理面
  内部的两账不同步」本身就是分岔（面板操作的 lockfile 面零同步）。

### 2.4 差异后果场景表

| # | 场景 | 面板视角 | mygo 治理（lockfile）视角 | 后果 |
|---|---|---|---|---|
| 1 | 面板卸载 npm/pack 插件 | 已卸载（record 删除 + tombstone） | lockfile 条目残留（store 目录未删） | 下次 boot verifyAtBoot 仍通过；插件不挂载但 BOM/lockfile 仍列；restore merge 保留幽灵条目（pack.ts 合并） |
| 2 | 面板 folder 安装插件 | 已安装（静态 record） | lockfile 无此 id | `dsh mygo pack` 不含它（buildPack 读 lockfile，pack.ts:485-491）→ restore 到新 profile 丢失该插件；分发集与面板视角不一致 |
| 3 | 面板 enable/disable 静态插件 | 状态翻转 | lockfile 无关 | 分发/对账面无影响（静态插件本就不在 lockfile），与场景 2 叠加时判定规则缺失 |
| 4 | npm 安装后未进面板 | — | lockfile + store | boot 后 engine.recover 挂载 → 面板 plugins() 可见；正常收敛（此方向无分岔） |
| 5 | 面板重装已存在 npm 插件 | `plugins().some` 判定「已安装」拒绝（panel:2367-2368） | lockfile 仍有条目 | 用户无法经面板修复 npm 插件的损坏安装（须 CLI/restore），错误文案不指向 lockfile 路径 |

### 2.5 two-tier 设计承诺摘录（原文，零转述）

two-tier-contract.md:8-9（§7 分层）：
> 「**体系内插件（in-system）**：走 mygo 桥接路径 + 携带 mygo manifest（id/version/entry/depends/breaks/core/bundles/loader/patches/grants）。受依赖图全套约束：安装期求解、lockfile、pins、符号校验、加载门、反应式编排、结构化报告。」

two-tier-contract.md:12-14（§7 社区）：
> 「**社区插件（community）**：走直连路径 + 仅有 npm 元数据（package.json name/version/main/peerDependencies/dependencies），由原生 loader 直接加载。mygo 不做任何阻断性介入，只提供只读观察与告警级信息。」

two-tier-contract.md:18-25（§8 担保矩阵）：
> 「安装期求解 / lockfile | [OK]（mygo 控制面） | —（npm/pnpm 原生解析）｜ depends/breaks 硬阻断 | [OK]（插件图约束） | —（仅 npm peer 告警，见 §9）……运行期反应式启停 | [OK]（原生惯性 + mygo 政策闸） | [OK]（原生反应式直接享有）｜ 状态观察 / 报告可见 | [OK]（BOM 对账 + fiber 内省 + 结构化报告） | [OK]（只读观察：fiber 状态、BOM 版本/peer 告警）」

two-tier-contract.md:53-54（§11 直连承诺）：
> 「任何版本 MUST NOT 强制社区插件迁移至桥接路径，也不得强制要求 mygo manifest。直连路径是永久一等路径，不是过渡态。」

### 2.6 裁决选项空间 + 三轴初评

**选项 (a) 面板切 lockfile 台账驱动**：
- 含义：面板安装改走 resolveInstall/lockfile 路径（需本地 tarball 候选 +
  身份归一），卸载同步 lockfile。
- 迁移影响面：panel installFromRoot（2337-2489）重写为本地 tarball →
  installPackageToStore/resolve 变体（package-store 已有 localTarballBytes
  接口，批次 1）；engine.uninstall 需增 lockfile 同步（lifecycle ↔
  package-manager 新耦合面，跨层）；folder/github 插件需生成 manifest 全量
  字段（id/version/entry/depends/breaks/requires/core——folder 安装的社区
  插件多数无 mygo manifest，需「静态账」语义保留面）；面板为 mygo 自有
  vendored 包（vendor/ 目录，属本仓库正常提交面，不触 DSH 源码纪律）。
  EXT-3 依赖：无直接依赖（不涉官方窗口）。
- 三轴：成本=高（安装/卸载/身份归一三面 + 跨层耦合）；可逆性=中
  （可回退但桥接行语义需重做）；风险=中高（社区直连插件失去安装入口，
  与 two-tier §11 直连永久一等承诺张力）。

**选项 (b) 静态账为合法一等路径 + 文档化判定规则**：
- 含义：明确「folder/github 安装 = 静态账（桥接行+安装目录）一等路径；
  lockfile 只覆盖 npm/pack 源」；判定规则成文（何时走哪条路径）。
- 迁移影响面：零代码（或 README/docs 判定规则 + 面板文案一处：场景 5 的
  错误文案指向 lockfile 修复路径，panel index.ts:2368 一处字符串）；
  冻结文档零改动（two-tier §7/§11 已给依据）。
- 三轴：成本=极低；可逆性=最高；风险=低（分岔仍存，但显式化；打包/
  restore 语义边界写死）。

**选项 (c) 两账并表标注来源**：
- 含义：保留静态账，bomExport/对账把两账并表 + 「治理外」分组标注。
- 迁移影响面：bom.ts buildBom 输入增加静态账来源（lifecycle bundleList/
  静态 record 已可枚举，service.ts bomExport:563 一处接线）；面板 plugins
  列表加来源标注（panel index.ts:2693 一处映射字段）；pack buildPack 的
  静态插件排除逻辑显式化（pack.ts:485-491 读取 lockfile 本就不含静态账）。
- 三轴：成本=低；可逆性=高；风险=低（并表口径需定义：静态账 id 与
  lockfile id 冲突时的去重/标注规则）。

### 2.7 调查者倾向（[推断]）

**选 (b) 为主 + (c) 的轻量子集**：静态账一等路径 + 判定规则成文（b），
bomExport/面板列表加来源标注（c 的展示层，不含并表去重新语义）。理由：
(a) 的统一在「folder 安装的社区插件多数无 mygo manifest」这一事实上与
two-tier §11 直连永久一等承诺冲突，且跨层耦合（lifecycle↔package-manager
新增锁同步面）成本高；(b)+(c) 把分岔从「结构性缺陷」转为「显式双账
（各有判据）」，迁移面 2-3 处文案/标注，可逆性最高。场景 1/2/5 的
具体误操作路径应在判定规则文档中逐条给出指引（场景 2 的「pack 不含
静态插件」写明为设计行为）。

---

## 3. 调查中新发现登记（不修，供后续轮）

1. [事实] **pack merge 保留幽灵条目**：批次 1 的 restore 合并逻辑
   （pack.ts merge）会把「目标 profile 既有 lockfile 中、pack 未包含」的
   条目保留——与场景 1（面板卸载 npm 插件后 lockfile 残留）叠加时幽灵
   条目跨 restore 存活。已登记（本材料 §2.4 场景 1；与 CD-2 裁决联动）。
2. [事实] **场景 5 面板重装文案**不指向 lockfile 修复路径（panel
   index.ts:2368），CD-2 (b) 裁决后应随判定规则文档一并修正文案。
3. [事实] mygo-api-surface.md:64「43 个，5 组」与 error.ts 实为 6 组不符
   （批次 4 矩阵 B3 已登记，DG-3 文档批）。

## 4. 产出说明

本文档为 docs/next 工作备忘录；零代码改动（git status 与开工一致，见交付
报告）。全部冻结承诺为原文摘录；[推断] 部分已标注。
