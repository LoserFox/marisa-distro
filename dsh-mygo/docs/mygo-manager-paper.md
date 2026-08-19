# mygo-manager：插件包治理层的行为规范（paper 草稿）

> 状态：起草轮 3（背景与动机、行为枚举、不变量、分叉清单、epoch 自维护口径完成）· 2026-08-12
> 数据源：dsh-mygo 仓库 HEAD 源码（`packages/cordis/mygo/src/package/*`、
> `src/semver-range.ts`、`src/lifecycle.ts` 的闸口记账面）+ 冻结设计文档
> （expected-behavior FROZEN / design-r3 / design-r4 / design-r5-cli /
> two-tier-contract）+ review#1/#2 实测探针数据。
> 写作纪律：本文只描述**代码实际行为**；任何「设计承诺 vs 实现现状」的分叉
> 必须进入 §4 分叉清单，禁止在正文中粉饰。锚点一律 `文件:行号`。

## 摘要（草稿）

Cordis 的 ctx/effect/fiber 反应式模型为 DeepSeek Harness 带来了运行期层面的
细粒度扩展与生命周期管理能力，但插件的**分发与安装**仍停留在 npm 的弱耦合
包管理：没有跨插件约束求解、没有锁文件与内容哈希、没有 breaks 声明通道。
在 API 未冻结、迭代以天计的初期生态里，这种弱耦合集中兑现为版本冲突与静默
破坏（普查证据：dsh 核心 peer 声明 0/80、`engines.dsh` 仅 6/80 且全部
`>=0.0.1` 无上界）。mygo-manager 在 Cordis 之上补全包治理层：manifest v3
词汇 → 确定性全序求解 → `dsh.lock/v1` 锁文件 → 不可变内容寻址 store →
确定性打包/离线还原（`mygo-pack/v1`），并对社区侧保持只读告警的双层契约。
本文第 2 节把包管理器行为按 Cordis 语义分类并给出对应关系（代码锚点），第 3 节给出跨模块
不变量，第 4 节登记经探针实测确认的设计/实现分叉。

## 0. 背景与动机

### 0.1 底座：Cordis 的 ctx / effect / fiber 反应式模型

DeepSeek Harness 的宿主本身已具备很强的扩展与生命周期管理能力，这是
mygo-manager 的出发点而非替代对象：

- **插件即 fiber**：组合中每个插件行对应一个 fiber，effect 驱动生命周期
  收放；服务访问统一经 Context 代理路径（属性访问与 `ctx.get` 同一解析路径，
  普查样本 1403 处 `ctx.<prop>` + 109 处 `ctx.get`，census M3）。
- **依赖满足度有原生指纹**：epoch = 已解析提供者 fiber uid 的拼接串
  （EB-N1）；epoch 变化 → 反应式 reload/unload，惯性（inertia）链式过渡
  （EB-N3/N4/N5）；provide/unprovide 即时 + ACTIVE 翻转双源 notify
  （EB-N6/N13）；HMR 事务性替换含回滚（EB-N10）。
  **但原生 epoch 无公开入口**（仅存私有 `_runner`；曾落地的公开 getter
  补丁 PATCHES #1 已于 2026-08-12 零侵入裁决下移除回滚）——mygo 不消费它，
  细 epoch 为**自维护**口径，见 §2.4（类 D）。
- **但原生 epoch 只有服务名粒度**：版本、绑定值、导出符号都不在原生 epoch
  中（EB-N8）；且没有安装期求解、没有 lockfile、没有跨插件约束通道。Fabric
  与 Modrinth 均无运行期依赖变化响应机制（ecosystem-verification §1 结论 1），
  运行期反应式是 dsh 生态独有的底座——mygo 要补的是**包级治理面**，而不是
  重造运行期。

### 0.2 现状：dsh 插件分发仍是 npm 弱耦合

- `dsh plugin add` 在官方启动器里是 **pnpm forwarder**（design-r5 §0.2：
  `plugin` 为 pnpm 转发子命令，官方 rc.1 无插件安装/求解面）。
- npm/pnpm 的耦合模型：每个包在安装时**独立**解析自己的依赖树；跨插件之间
  只有 peer 约定（且官方 profile `autoInstallPeers: false`，census M2 注）；
  无跨插件约束求解、无 breaks 通道、无内容哈希、无失败回滚。
- 弱耦合在稳定生态里靠 semver 社会契约成立；但 dsh 生态正处在**初期多变、
  开发迭代快**的阶段：API 未冻结、官方模板仍在重构（plugin-template 于
  2026-08-11 当日改为完全自包含，census §1.2/R13）。

### 0.3 问题一：弱耦合在初期生态兑现为版本冲突

普查证据（census，dsh-external 组织 90 仓库快照）：

- **核心版本声明稀疏且无上界**：`engines.dsh` 仅 6/80 且全部 `>=0.0.1`；
  peerDependencies 中声明 dsh 核心的为 **0/80**；`cordis` peer 50/52
  （`^4.0.0-rc.7`×39、`*`×10）（M1/M2）——核心升级的破坏面不可预估。
- **插件间依赖已经出现**：dsh-cc-tui 在 dependencies 中嵌套
  `@deepseek-ai/dsh-working-activity`（1/27）→ 双模块实例/单例身份分裂
  风险；dsh-vibe-mode 已写出服务级需求 `service:voice-chat`（M6/R10/R11）。
- **分发形态过渡混乱**：legacy `dsh.plugin.json` 残留 22 仓库、bundle patch
  33/80、`private: true` 66/80（M1/M7）——同一生态里四种分发形态并存。
- **冲突的具体路径**（由 EB 基线推得）：同版本静默替换（EB-D7）、符号改名
  = 删旧增新（EB-D1/D12）、区间说谎（声明兼容但符号已删）——npm 层对这三者
  全部无感，爆炸点被推迟到运行期。

### 0.4 问题二：dsh 自身的依赖耦合也是弱耦合

- **插件 ↔ 核心**：约束载体缺失（peer 0/80）+ 稀疏无上界的 engines → 核心
  升级无法求解破坏面。
- **cordis 版本关系**：宿主 vendored cordis 与插件 peer cordis 的版本对照表
  权威来源未定（EXT-1）→ 同一 cordis 存在双实例风险，对照缺失时只能「不猜测、
  告警」。
- **dsh 自家包之间**：`@deepseek-ai/dsh-*` 服务包 peer 35/52 以 `^0.0.1`/`*`
  为主（M2），叠加 npm 嵌套 → dsh 生态内部同样走弱耦合，触发双存在
  （two-tier §10）。
- **发布流水线不成熟**：私仓 rc.1 刚起步；`create-dsh-plugin` 发布 3 天后
  撤回（census §1.2）；66/80 仓库 `private: true` 尚不具备 npm 分发形态。

### 0.5 mygo 的回应（引出正文）

- **三段分工**：安装期求解（定版锁进 lockfile + 内容哈希）→ 加载期校验
  （不重解、不触网）→ 运行期反应式。Fabric 每次启动重新求解、Modrinth
  安装期定版但启动不重验——mygo 是两者的超集（ecosystem-verification
  §1 结论 3）。
- **双层契约**（two-tier §7-§13）：体系内插件受强治理（depends/breaks/
  符号前置门/冻结面），社区插件只读观察、告警级、永不阻断，直连路径永久
  一等——治理层不强制迁移。
- **确定性是第一公民**：同输入 → 字节级一致（求解/打包/lockfile 语义载荷）。
- 本文结构：§2 行为分类与 Cordis 语义对应 → §3 跨模块不变量 → §4 实测分叉
  清单 → §5 待写章节。

---

## 1. 范围与方法

- **本文覆盖**：包治理面 = `src/package/*` + `semver-range.ts` + `paths.ts` +
  `entry-loader.ts` + 生命周期引擎中的运行时闸口记账面（fine-epoch /
  requires-gate / provider-observations 的**实际接线状态**）。
- **不覆盖**（生命周期引擎本体的七步替换、dispatch、capabilities、BOM、
  registry store 等属运行期治理层，另行成文）。
- 方法：逐模块读码 + 冻结文档对照 + 探针实测（review#2 的 10 项运行验证，
  全部用仓库真实代码执行）；凡实测结论均标注「[实测]」。

---

## 2. 行为分类与 Cordis 语义对应

> 组织原则：不按模块平铺枚举行为，而是把包管理器行为**分类并对应到 Cordis
> 的语义面**——每类说明它对 Cordis 哪个语义是「扩展 / 安装期对偶 / 治理化 /
> 只读观察」。锚点一律 `文件:行号`；实测确认的设计/实现分叉在 §4 集中登记。

### 2.0 分类总览

| 类 | Cordis 语义锚点 | mygo 对应关系 | 落点模块 |
|---|---|---|---|
| A 声明面 | 组合行（loader entry：id/name/config/group/disabled/inject，EB-N9） | 行 → manifest v3 可求解声明；inject → depends（id 区间）+ requires（服务名区间）双命名空间 | `package/manifest-v2.ts`、`src/semver-range.ts` |
| B 求解面 | inject 依赖满足（运行期 epoch 反应式的**安装期对偶**） | 服务名存在性 → id+版本区间可满足性；pins ≈ 固定行；全量冲突报告 | `package/resolver.ts`、`package/report.ts`、mygo-api `error.ts` |
| C 装载面 | loader 的 `tree.import(name)`（A1：name 即模块说明符）+ registry 行 | 模块来源/版本/哈希治理化；挂载序 ≈ 注册顺序约束；三相编排 ≈ patch 时机 | `package/lockfile.ts`、`package-store.ts`、`registry-client.ts`、`package-manager.ts`、`mount-order.ts`、`mount-orchestrator.ts`、`mixin-engine.ts` |
| D 运行期政策面 | epoch / reload / notify 双源 / provide 值发布（EB-N1..N8, N13） | 粗 epoch 的细粒度投影（**自维护**，零侵入）；provide 面单一收口包装 | `package/fine-epoch.ts`、`requires-gate.ts`、`provider-observations.ts`、`lifecycle.ts` 记账面 |
| E 分发面 | 无（对应 npm tarball / mrpack 语义） | mygo-pack/v1 确定性打包 / 离线还原；内嵌包治理 | `package/pack.ts`、`bundle-scan.ts`、`bundle-expand.ts` |
| F 社区观察面 | 只读（不进入 Cordis 语义） | 元数据收割 / 双存在 / legacy 映射 / 模板对齐 | `harvester.ts`、`dual-presence.ts`、`legacy-mapping.ts`、`template-align.ts` |
| G 确定性纪律 | 跨语义非功能面 | 同输入 → 字节级一致 | §3 I-1..I-8 |

三段分工（design-r3 §3.3，C10）：安装期求解（类 A+B）→ 加载期验证（类 C
的 verify 面）→ 运行期反应式（Cordis 原生面 + 类 D 记账面）。

### 2.1 类 A：声明面（组合行语义的扩展）

Cordis 的 entry 行只有 id/name/config/group/disabled/inject（EB-N9）；mygo
把「行」升级为**可求解的声明**（manifest v3，design-r3 §2 字段全集，
`formatVersion: 1`；模块文件名 `manifest-v2.ts` 为历史遗留，`PluginManifestV2`
现为 `PluginManifestV3` 的向后兼容别名，manifest-v2.ts:46-47）：

- **id 与 entry 直通 loader 语义**：id 沿用同一 `ID_RE /^[a-z][a-z0-9-]*$/`；
  Cordis 的「name 即模块说明符」（A1 CONFIRMED）由 `entry` 字段承接
  （缺省回退 package.json main，manifest-v2.ts:244）。
- **inject 拆成双命名空间**：`depends`（插件 id 区间，安装期求解）+
  `requires`（服务名区间，运行期政策闸，键禁 `service:` 前缀）；`breaks`
  是注入的反向声明（冲突区间）；`provides` 别名对应 provide 服务名，但进入
  安装期去重（EB-D19/C4 分层：id 别名入图、符号别名不入图）。
- **兼容层**：legacy `compatibility.requires` 归一（裸键→depends、
  `service:` 键→requires 去前缀；新旧同名键 → manifest-invalid，
  manifest-v2.ts:251-323）。
- **区间词汇**：npm semver 子集——`||` OR / 空格 AND / 预发布门（区间须对
  同一 major.minor.patch 显式带预发布比较符）/ 部分形式（`>1`→`>=2.0.0` 等）；
  无连字符区间等 npm 扩展形式（semver-range.ts）。
- **路径安全是对 Cordis entry 无路径概念的补强**：entry/bundles.path/
  patches.file 禁 `/` 开头、盘符、`..` 段，安装期+加载期双重执行（B10，
  manifest-v2.ts:86-111）。

已知出入：无 `dsh.mygo` 块的普通 npm 包也解析出 value（仅告警）——
与 design-r3 §2.2「id/version/entry 必选」的出入见 §4 G-4；`grants` 仅形状
校验、无消费方（§4 G-3）。

### 2.2 类 B：求解面（inject 满足语义的安装期对偶）

Cordis 在运行期求值「服务名是否有 ACTIVE 提供者」（EB-N1）；mygo 在安装期
求值「id+版本区间是否存在满足全部约束的赋值」——同一需求满足问题的两种粒度
（EB-D15：粗=调度执行，细=需求函数）：

- **候选全序裁决**：root 优先 → id 升序 → 版本降序 → 嵌套浅 → parent →
  来源序（pinned > registry > locked > bundle > 其他）→ manifest sha256
  字典序，全序闭合（resolver.ts:92-112, 214-224）。
- **pins ≈ 组合行的 profile 钉定**：pin 版本为唯一候选；`provides` 别名参与
  跨 id 归并（resolver.ts:279-291, 308-320）；回溯求解 + finalCheck 保证
  最终赋值满足全部 depends/breaks/core（385-404）。
- **环检测 ≈ 拓扑合法性的显式化**：Cordis 由 loader 顺序隐式承担，mygo
  显式 DFS 检测并整体拒绝（114-146）。
- **失败输出是对 INACTIVE 无解释面的补强**：全量结构化报告——断点 + 完整
  传递链 + 逐候选拒绝原因 + 建议动作 + 回到哪一代（report.ts:40-56；
  对应 Fabric 有断点/候选/建议但无链无回滚，ecosystem-verification §2.1）。

已知分叉：pin 与声明区间冲突时报告约束错位为 kind:'core'（§4 G-2）；
`resolved` 输出全部已赋值 id 而非仅请求集（§4 G-1 的根源）。

### 2.3 类 C：装载面（loader 导入语义的治理化）

Cordis loader 直接 `tree.import(name)`（A1）；mygo 在「拿哪个版本、从哪里拿、
字节是否可信」上加治理：

- **入口加载是 A1 语义的落地**：`loadPluginEntry` 以 `pathToFileURL` 动态
  import 入口（entry-loader.ts:11-21）。
- **lockfile = 行的持久化快照**：`dsh.lock/v1` 记录每 id 精确版本 + entry +
  约束 + 内容哈希（entrySha256/manifestSha256）；写入原子化（tmp+rename+
  .bak）；加载期只对照 lockfile 纯磁盘校验，**不重新求解、不查 registry**
  （lockfile.ts:98-177）。
- **store = 模块的不可变内容寻址仓库**：`packages/<id>/<version>/` +
  `.mygo-package.json` 事实文件；registry 下载（integrity 校验）或本地
  tarball（sha512 先校验后落盘）→ 解包 → 二次 manifest 校验 → staging→
  rename 原子安装（package-store.ts:68-160）。
- **挂载序 ≈ 注册顺序约束**：Kahn 拓扑序保证被依赖者先初始化（mount-order.ts）；
  **三相编排 ≈ patch 时机语义**：phase0 收集+冲突检测 → phase1 目标加载前
  应用 transform（晚注册报错）→ phase2 拓扑挂载（mount-orchestrator.ts；
  mixin 引擎生成符号级 facade，mixin-engine.ts:115-162）。

已知分叉：lockfile 无 requires/symbolAliases/entrypoints 字段、loadEntry
合成 manifest 硬编码空值（§4 G-7）；畸形 lockfile 裸抛 TypeError（§4 G-6）；
entrySha512 混语义（§4 G-8）；store 层错误裸抛不转报告（§4 G-9）。

### 2.4 类 D：运行期政策面（epoch / reload 语义的细粒度投影）

Cordis 的粗 epoch（提供者 uid 拼接串）驱动 reload/unload 与 notify 双源；
mygo 在此之上投影出细粒度事实，并且**不依赖、不读取原生 epoch**：

- **自维护细 epoch（零侵入口径）**：原生 epoch 仅存私有 `_runner`、无公开
  入口（曾落地的公开 getter 补丁 PATCHES #1 已于 2026-08-12 零侵入裁决下
  移除回滚）；mygo 细 epoch 四分量由自有记账面维持（下表 EM1-EM9，
  与文档修正轮 expected-behavior R3 / assumption-verification R1 /
  design-r3 Rev-I2 对齐）。
- **requires 闸 ≈ INACTIVE 语义的粒度升级**：服务名 → 服务名+版本+符号
  （service-missing / provider-version-mismatch / symbol-missing，
  requires-gate.ts:50-98）。
- **前置门 ≈ reload 前置校验的符号投影版**：消费者被用符号 ⊆ 提供者挂载时
  快照（symbolAliases 先解析），纯内存、禁磁盘 I/O（fine-epoch.ts:56-76）。
- **观测注册表 ≈ reflect notify 的历史记账**：谁在何时 provide 过什么服务、
  生命周期状态，随摘除清理，只读不阻断（provider-observations.ts）。
- **Proxy 包装 ≈ provide 值发布路径的单一收口**：get 转发并记录动态符号
  访问（A11 兜底）、set/delete 拒绝+政策告警（exports 冻结），提供表写入/
  读取/seam 发布三处均发布包装值（lifecycle.ts:67-93, 3104-3151）。

| # | 面 | 现行行为（锚点） |
|---|---|---|
| EM1 | 原生粗 epoch（dsh 自带） | 已解析提供者 fiber uid 的 `':'+uid` 拼接串，全等字符串比较（EB-N1/N8；DSH 源码 vendor/cordis/src/fiber.ts:611-623）；仅存私有 `_runner`，**无公开入口**；曾落地的公开 getter（PATCHES #1）已于 2026-08-12 零侵入裁决下移除并回滚（fiber.ts / lib/index.js / fiber.d.ts 零残留，dsh-mygo vendor/PATCHES.md:10 标记「已移除」） |
| EM2 | 原生反应式触发面 | 状态翻转 notify（EB-N6）+ provide/unprovide 即时 notify（EB-N13）仍由 cordis 自身维护；mygo 不读取、不依赖原生 epoch |
| EM3 | 自维护细 epoch 分量一：符号投影 | `FineEpochRegistry` 挂载时导出快照（captureExports）；`updateProvideTable` 时 set、摘除时 delete（lifecycle.ts:3104-3118、3121-3124） |
| EM4 | 分量二：提供者身份/版本 | 快照含 pluginId + 提供者 manifest 版本（lifecycle.ts:3106-3109）；`ProviderObservationRegistry` 观测 |
| EM5 | 分量三：政策事实 | `record.policyStatus` 标签 + `reconcileRequiresGates` 求值结果；disabled > policy-rejected > INACTIVE 三态（EB-D16） |
| EM6 | 分量四：动态符号访问 | `providedAccessRecords`（A11 运行时代理兜底，lifecycle.ts:832）；仅引擎 dispose 清空 |
| EM7 | 指纹函数 | `fineEpoch()` 四分量排序键序列化（fine-epoch.ts:82-94）——当前仅测试引用（§4 G-14） |
| EM8 | 解耦关系 | 细变粗必变、粗变细不必（EB-D10）的成立不再依赖读取原生 epoch：mygo 细 epoch 只存在于自有注册表；原生 epoch 仅在 cordis 内部驱动 reload/unload |
| EM9 | 现行边界 | 自维护口径与执行面缺口是两个正交事实：记账已自维护（EM3-EM6），但闸口仍标签-only（§4 G-12）、前置门无 reload 消费（§4 G-14） |

### 2.5 类 E：分发面（无 Cordis 对应；npm tarball / mrpack 语义）

Cordis 没有分发层（模块经 npm 原生解析）；`mygo-pack/v1` 对应 npm tarball
的确定性序列化 + mrpack 的安装期哈希清单，但携带**求解产物快照
（lockfile）**——接收方仍走既有求解器，不新设加载路径（design-r4 D-A3）：

- **确定性打包**：成员序固定、mtime/owner 归一、gzip 无时间戳；清单
  `manifestSha256` 对规范键序语义 JSON 计算、时间戳归一 `<t>`（pack.ts:262-308,
  440-465）。
- **离线还原**：全内存预检——清单自校验 → 自实现 tar 头部遍历 + 精确成员
  白名单（防换行文件名绕过）→ vendored sha512/size 校验（先于一切 store
  写入）→ 内层预检 → 既有求解器（pins=pack lockfile）→ store 安装 →
  lockfile 写入；全程零网络（pack.ts:653-976）。
- **内嵌包治理**：bundles 声明与实际一致 + 整包扫描「求解器不可见」打包
  （嵌套插件 / shared / 未声明 @deepseek-ai/* import，KF-1 分类规则）；
  profile bundle patch 展开为 entry 行，政策作用于展开后行（bundle-scan.ts,
  bundle-expand.ts）。

已知分叉：还原到非空 profile 中途失败 + 部分写盘（§4 G-1）；解压/成员数
无上限（§4 G-11）。

### 2.6 类 F：社区观察面（只读，不进入 Cordis 语义）

two-tier §9 三原则——只读、告警级、永不阻断；以下行为不改变任何 Cordis
组合/装载语义，仅产出观察信息：

- **收割**：`engines.dsh` / `cordis` peer / `@deepseek-ai/dsh-*` peer 归一
  为 core 区间；cordis↔dsh 对照表外置（EXT-1），无法映射 → 告警不猜测
  （harvester.ts）。
- **双存在检测**：同一包既被 loader 注册又被 npm 嵌套依赖 / 服务需求与
  插件 id 重叠 → 重复实例风险告警（dual-presence.ts）。
- **legacy 映射**：`dsh.plugin.json` 只读映射为规范字段 + 迁移告警
  （legacy-mapping.ts）。
- **模板对齐**：以官方 plugin-template 形态为参考的 package.json 对齐检查
  与发布门告警（template-align.ts）。

### 2.7 类 G：确定性纪律（跨语义非功能面）

类 A-F 的全部实现遵守「同输入 → 字节级一致」纪律（排序纪律 + 时间戳归一 +
无共享可变状态）；成立条件与锚点见 §3 跨模块不变量。

---

## 3. 跨模块不变量

| 编号 | 不变量 | 实现事实（锚点） |
|---|---|---|
| I-1 | 确定性：同输入两次执行字节级一致 | 求解器全部迭代按排序键/排序数组、无共享可变状态（resolver.ts:95/119/133/169/179/198/205/329/356）；pack 成员序/时间戳/gzip 头归一（pack.ts:440-465, 607-619）；lockfile 时间戳只在写入面出现（lockfile.ts:153-173 稳定载荷口径）；T19/T22/T32 字节级断言 |
| I-2 | 三段分工：加载期不重解、不触网 | verifyLockfile 纯磁盘校验（lockfile.ts:127-131）；verifyAtBoot 只对照 lockfile（package-manager.ts:408-447）；pack 路径离线（T37 实测 fetch 计数 0） |
| I-3 | 单实例：同 id 唯一版本 | store 目录 `packages/<id>/<version>`（paths.ts:57-59）；lockfile 按 id 键控；pins 唯一候选（resolver.ts:279-291） |
| I-4 | 路径安全 B10 双重执行 | 安装期 pathProblemsOf（manifest-v2.ts:95-111）+ assertInside（package-store.ts:47-53）；加载期 lockfile entry 校验（lockfile.ts:138-142） |
| I-5 | 原子写 | lockfile/store/pack 输出均 tmp+rename（lockfile.ts:98-105 / package-store.ts:140-141 / pack.ts:621-622） |
| I-6 | 哈希覆盖 | 加载期主校验 entrySha256/manifestSha256（lockfile.ts:153-173）；分发校验 tarball sha512+size（pack.ts:729-765）；BOM 记录 sha512/fileSize（lockfile.ts:21-24） |
| I-7 | 社区三原则 | harvester/dual-presence/legacy-mapping/template-align 全部只读告警（two-tier §9） |
| I-8 | pack 整体拒绝 | 全部校验先于 store 写入（pack.ts:653-976 安装序）；例外：目标 profile 非空（§4 G-1） |

---

## 4. 设计与实现分叉清单（review#1/#2 实测登记）

> 论文诚实性要求：以下条目为**实测确认**的「设计承诺 vs 代码行为」分叉，
> 正文行为描述以上述 §2 为准，本清单随修复进展更新。

| 编号 | 分叉 | 实测证据 | 状态 |
|---|---|---|---|
| G-1 | pack 还原到非空 profile 必然失败 + store 部分写盘 | 探针：合法 1 插件 pack → 带既有插件的 profile：`pack-invalid 求解结果缺少 vendored 文件：existing`，calc/1.0.0 已落盘、lockfile 未更新；空 profile 控制组 ok=true | 待修（review#2 A4 HIGH） |
| G-2 | pin 与声明区间冲突的报告 kind 错位 | 探针：conflict=`{kind:'core',target:'dsh',range:'*'}`，非 design-r3 §2.4-2 承诺的 kind:'pin' | 待修（A8） |
| G-3 | grants/能力授权门缺位 | capabilities.ts:1-7「permission-gate layer is removed」；env.fs/vars/fetch 无门透传；group-6 七码中 fs/network/vars/http/emit-denied 零抛出点；dsh.mygo.grants 零消费方 | 待裁决（DG-3：补 design-r3 修订记录或恢复执行面） |
| G-4 | 无 mygo 块的 npm 包可解析为有效 manifest | parsePackageManifest 仅告警放行（id=包名 slug、entry=main 回退路径，manifest-v2.ts:234/244） | 待裁决（宽松归一是否有意） |
| G-5 | localeCompare 跨 locale 不确定性 | semver-range.ts:117 | 推断待证实（A17） |
| G-6 | 畸形 lockfile 裸抛 TypeError | 探针：`entry:123` → `TypeError: lock.entry.startsWith is not a function` | 待修（A12） |
| G-7 | 重启后 requires/symbolAliases/entrypoints/bundles/loader 等丢失 | lockfile 无对应字段；loadEntry 合成 manifest 硬编码空值 | 待修（A3） |
| G-8 | entrySha512 混语义（tarball integrity ?? entry 文件） | package-store.ts:153 | 已裁决拆字段（DG-2） |
| G-9 | store 层错误裸抛不转报告 | package-store.ts:76/96/109/114/117/122；pack.ts:679 JSON.parse 无包裹 | 待修（A5/B7） |
| G-10 | pin 指向 registry 不存在版本 → cast 后 TypeError | package-manager.ts:174-175 | 待修（A5） |
| G-11 | 解压/成员数无上限 | 探针：306KB→300MB 炸弹通过；20 万成员全收 | 待修（A7） |
| G-12 | 运行时闸口标签-only | 探针：requires 违例插件 status=enabled、provide 可解析、照常运行；requiresGateReport 零生产调用 | 已裁决 impl-bug HIGH（DG-1），修执行面不改设计 |
| G-13 | captureExports 剔除自有键 constructor/__proto__ | 探针：`{constructor:1,foo:2}` → `["foo"]` | 待修（A16，两侧镜像约束已定） |
| G-14 | fineEpoch 指纹函数/前置门无 reload 消费点 | fineEpoch() 仅测试引用；replaceTables 无前置门 | 待修（A2，与 G-12 同根） |
| G-15 | `dispose-timeout` 报告码无生产者 | 全库 grep 零 throw/report 构造点 | 待修（B4） |
| G-16 | Proxy exports 冻结面不完整 | `wrapProvidedValue` 只 trap get/set/deleteProperty；`Object.defineProperty`/`Object.setPrototypeOf`/`preventExtensions` 走默认转发可原地改原始对象（lifecycle.ts:67-93）；另 get trap 不记录 symbol 键访问 | 待修（review#1 A11） |

---

## 5. 待写章节骨架（轮 2+）

1. 形式化模型：manifest/约束/候选/pin 的集合语义；求解函数 → 全序唯一解的
   论证（候选全序 + 回溯 + finalCheck 完备性，resolver.ts）。
2. 确定性论证：字节级一致性的成立条件（I-1 各环节的排序纪律 + 时间戳归一口径）。
3. 安全面：路径安全（B10）、pack 容器成员白名单与自实现 tar 头部遍历（pack.ts:322-370, 711-727）、哈希覆盖（I-6）、
   tar 解包的第二道防线依赖（GNU tar 实测；bsdtar/Windows 未核实）。
4. 评估：T1-T51 + EB 13 项 + RT1-RT5 的覆盖矩阵；性能数据（S2 求解耗时、
   S3 preGate 亚毫秒、打包/还原耗时）。
5. 相关工作：Fabric ModPrioSorter / Modrinth mrpack / npm/pnpm 语义对照。
6. 局限与威胁：§4 分叉清单的转写（threats to validity）。

## 附：本文件修订记录

| 修订 | 日期 | 内容 |
|---|---|---|
| R1 | 2026-08-12 | 起草轮 1：行为枚举 + 不变量 + 分叉清单（现 §2-§4）+ 骨架占位 |
| R2 | 2026-08-12 | 起草轮 2：新增 §0 背景与动机（Cordis 底座 / npm 弱耦合 / 版本冲突与 dsh 依赖问题 / mygo 回应，全部锚定 census 与 ecosystem 证据）；摘要占位改草稿；manifest schema 统一口径为 v3（模块文件名 manifest-v2.ts 为历史遗留）；章节重排 0-5 与交叉引用同步 |
| R3 | 2026-08-12 | 起草轮 3：epoch 自维护口径同步——§0.1 补充「原生 epoch 无公开入口、mygo 不消费」；新增 §2.15 epoch 模型（原生粗 epoch vs 自维护细 epoch，EM1-EM9 锚点），与文档修正轮（expected-behavior R3 / assumption-verification R1 / design-r3 Rev-I2）对齐 |
| R4 | 2026-08-12 | 起草轮 4：§2 从「按模块行为枚举」重组为「行为分类 → Cordis 语义对应」（类 A 声明面 / B 求解面 / C 装载面 / D 运行期政策面 / E 分发面 / F 社区观察面 / G 确定性纪律，2.0 分类总览表）；原 §2.15 epoch 模型并入类 D（EM 表）；新增 W1-W3（provide 值包装面）与 §4 G-16；交叉引用同步 |
| R5 | 2026-08-12 | 起草轮 5：删除 §2 全部行为事实表（原按模块枚举 M/V/R/L/S/C/P/K/B/H/D/G/T/O/X/F/E/W），只保留「分类 + Cordis 语义对应」叙述与 2.0 总览表（EM epoch 模型表保留，属 D 类权威口径）；§3 不变量表、§4 G-4、§5 骨架的引用同步改为直接代码锚点 |
