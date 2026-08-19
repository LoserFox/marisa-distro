# DEV-GUIDE：mygo 开发者指南

> 面向要在 mygo 上开发插件、改 mygo 核心或接入生态接口的开发者。
> 本文拆解 mygo 在 Cordis 之上补充的全部逻辑：依赖管理、停用/启用、符号快照、
> 打包分发、报告、运行期治理、持久化与扩展点。事实以本仓库当前 HEAD 为准；
> 冻结基线见 `expected-behavior.md`（FROZEN，只追加修订）。

> **next 分支（2026-08-13 范围重塑）**：强耦合依赖分析体系已退役——
> resolver（跨插件约束求解）、dsh.lock/v1 lockfile、不可变 package-store、
> 激活求解器（solveActivation 级联启停）均已删除；pnpm 安装状态是唯一真相源，
> mygo 账本降级为治理视图（P3 落地）。本文 §3/§6 已按新口径改写；
> 旧体系存档见 main 分支 `43bb296`。

## 0. 一句话模型

Cordis 给你 fiber/effect/事件/服务注入/loader 组合；**mygo 在这之上补充了
「受管插件生命周期 + 包治理」**：插件不再简单经过 load/registry 路径自己 import 加载，
而是经过 manifest → 版本选择 → 落盘还原 → 挂载 → 运行 → 替换/停用/卸载 的受管管线，
每一步都有确定性与可审计账目。

## 1. 架构分层

```text
外部工具/插件作者
   │  SHOULD 只依赖
   ▼
@r05en1cu/dsh-mygo-api（契约层，Cordis-free）
   │  fromCordisPlugin / toCordisPlugin / PluginError / definePlugin
   ▼
@r05en1cu/dsh-mygo（实现层，Cordis 桥接）
   ├── package/*       包治理：manifest/版本选择/还原/扫描/打包
   ├── loader-adapters.ts  LoaderAdapter 注册表（P5）
   ├── lifecycle.ts    生命周期引擎（七步替换、恢复、政策闸、提供表）
   ├── dispatch.ts     事件派发机（emit/waterfall/parallel/serial）
   ├── service.ts      PluginManagerService（ctx.pluginManager）
   └── bom/session-reader/capabilities/audit/persistence/...
   ▲                        ▲
扩展：mygo-cli（命令面）   扩展：dsh-mygo-panel（web 面板）、
      loaders/mygo-loader-profile（P5 默认执行面）、
      loaders/mygo-loader-hub（P5 hub 市场适配器）、
                             extension/mygo-rdb（外部存储）
```

### 1.1 模块地图

| 文件 | 职责 | 关键导出 |
|---|---|---|
| `package/manifest-v2.ts` | manifest v3 解析/校验（B1） | `parsePackageManifest`、`PluginManifestV3` |
| `package/version-select.ts` | 单插件确定性版本选择（钉定/区间/最高版） | `selectVersion` |
| `package/hash.ts` | 内容哈希工具（sha256/sha512/integrity 解析） | `sha256File`、`sha512File`、`integritySha512Hex` |
| `package/package-restore.ts` | 普通落盘还原（B10 路径安全；调用方指定目录） | `restorePackage`、`readRestoredPackage` |
| `package/package-manager.ts` | 安装编排（registry→版本选择→还原） | `resolveInstall`、`preview`、`buildPack`、`installPack` |
| `package/pack.ts` | `mygo-pack/v1` 打包/还原（B20-B24） | `buildPluginPack`、`installPluginPack` |
| `package/fine-epoch.ts` | 挂载时符号快照注册表与前置门（B13） | `FineEpochRegistry`、`preGate`、`captureExports` |
| `package/requires-gate.ts` | requires 政策闸（B6） | `evaluateRequiresGate`、`requiresGateReport` |
| `package/provider-observations.ts` | 服务提供者观测记录（B19） | `ProviderObservationRegistry` |
| `package/report.ts` | 结构化报告 schema（B7；code 取自 PluginError 闭表） | `ResolutionReport`、`ServiceResolutionReport` |
| `package/bundle-scan.ts` | 内嵌包扫描 + KF-1 分类（B26） | `detectUndeclaredBundles` |
| `package/symbol-verify.ts` | 符号级校验（导入投影 vs 运行时 exports） | `verifyPluginSymbols` |
| `package/harvester.ts` | npm 元数据信号归一（B11） | `harvestPackageMetadata` |
| `package/dual-presence.ts` | 双存在告警（B12） | `detectDualPresence` |
| `package/legacy-mapping.ts` | `dsh.plugin.json` 只读映射（B15） | `mapLegacyPluginFile` |
| `package/template-align.ts` | 官方模板对齐检查（B16） | `checkTemplateAlignment` |
| `package/bundle-expand.ts` | `dsh.bundle.patch` 展开（B14） | `expandBundlePatch` |
| `package/loader-registry.ts` | loader 契约注册表（v1: standard/mixin） | `BUILTIN_LOADERS` |
| `package/mount-orchestrator.ts` | 挂载相位（patch/mixin 顺序） | `MountOrchestrator` |
| `package/patch-table.ts` | patch 冲突检测/确定性排序 | `detectPatchConflicts` |
| `package/mixin-engine.ts` | mixin loader 的 AST 改写管线 | — |
| `package/paths.ts` | `$DSH_HOME/mygo` 路径（不变量 6/7） | `resolveMygoPaths` |
| `lifecycle.ts` | 引擎：七步替换/恢复/政策闸/提供表/快照记账 | `LifecycleEngine`、`wrapProvidedValue` |
| `dispatch.ts` | 事件派发机（模式/分支/否决） | `DispatchMachine` |
| `service.ts` | Cordis 服务面（ctx.pluginManager） | `PluginManagerService` |
| `bom.ts` | `dsh.bom/v1` 导出/对账（P4） | `buildBom`、`checkBom` |
| `governance.ts` | 治理视图（P3：pnpm 安装状态实时重建） | `readGovernanceView` |
| `instances.ts` | 用户级实例登记处（P4：实例 = $DSH_HOME，§13.1） | `registerInstance`、`listInstances`、`unregisterInstance` |
| `pack-cache.ts` | 跨实例只读共享缓存（P4：内容寻址，§13.3） | `cachePack`、`importCachedPack` |
| `loader-adapters.ts` | LoaderAdapter 注册表（P5，§14.1） | `LoaderAdapterRegistry`、`BUILTIN_LOADER_ADAPTERS` |
| `extensions.ts` | extension 登记表（P6，§15.1） | `ExtensionRegistry`、`extensionViews` |
| `update-state.ts` | 热重载状态保持（P7-A5，§16.1） | `preserveStateAcrossUpdate` |
| `capabilities.ts` | 能力面与配额（fs/vars/llm/exec/http/fetch） | `createPluginFs` 等 |
| `session-reader.ts` | jsonl/rdb/sqlite 会话读取 | `JsonlSessionReader` 等 |
| `sqlite-store.ts` / `persistence.ts` / `store.ts` | 注册表持久化与 `RegistryStore` 契约 | `SqliteRegistryStore`、`RegistryStore` |
| `audit.ts` / `snapshots.ts` | 审计日志 / 世代快照 | `AuditLog`、`SnapshotStore` |
| `plan.ts` / `order.ts` | 操作计划（纯求值预览）/ 派发顺序推导 | `planOperation`、`deriveOrders` |
| `event-vocabulary.ts` | 托管事件词汇（模式/分支） | `EVENT_VOCABULARY` |
| `config.ts` | 管理器配置默认值 | `resolvePluginManagerConfig` |
| `bundle-rail.ts` | bundle 轨（官方 CLI 转发 + companion 块 + 成员图） | `BundleRail`、`patchFactsFromText` |
| `row-config.ts` | patch 层行 config 整行读写与卸载清理 | `upsertRowConfig`、`removePatchRows` |
| `patch-io.ts` | patch 层统一写盘通道（r7：串行 + 原子写 + 空回落 `[]`） | `mutatePatchFile` |
| `live-rail.ts` | live 轨运行期装卸（r7；docs/live-rail.md） | `liveInstall`、`liveUninstall`、`verifyEntryState` |

## 2. 插件契约（manifest v3）

插件作者只需在 `package.json` 写 `dsh.mygo` 块（或 legacy
`dsh.mygo.compatibility`），并 import `@r05en1cu/dsh-mygo-api`：

```jsonc
"dsh": { "mygo": {
  "formatVersion": 1,
  "id": "my-plugin", "version": "0.0.1", "entry": "lib/index.js",
  // 插件级兼容词汇（2026-08-13 起只读直通：告警/预检面，不参与安装求解）
  "compatibility": { "depends": { "other-plugin": "^1.0.0" }, "breaks": { "legacy": "<2.0.0" } },
  "requires": { "voice-chat": "^1.0.0" },     // 服务级（运行期政策闸，INACTIVE）
  "core": "^0.0.1-rc.1", "loader": { "id": "standard", "range": "^1.0.0" },
  "provides": ["my-capability"], "grants": { "fs": "..." }
}}
```

顶层 `depends` / `breaks` 已从 manifest v3 移除（安装期约束求解已删除）：
存量声明会被显式拒绝（`dsh.mygo.depends` / `dsh.mygo.breaks` 问题项），
请改写为 `compatibility` 块或删除。

运行期 `PluginEnv`（mygo-api `PluginEnv`，types.ts:247）给插件：`on/onHost/emit`、
`effect/hostEffect`、`provide/get`（服务隔离，未声明返回 undefined）、
`fs/vars/llm/exec/http/skills/commands/fetch`、`scope(agentId)`、
受权管理面（`plugins/install/uninstall/updateConfig`）。生命周期钩子
`PluginHooks`：`setup → activate → deactivate/captureState/restoreState/dispose`。

### 2.1 manifest 字段参考（作者向，来自 `package/manifest-v2.ts`）

| 字段 | 语义 | 示例 |
|---|---|---|
| `recommends` | 可选推荐依赖：只校验不选择、只警告不阻断、永不自动安装（design-r3 §2.6） | `"recommends": { "ui-helper": "^1.0.0" }` |
| `bundles` | 内嵌包声明（id + version + 包内路径），扫描校验对象 | `"bundles": [{ "id": "dep-x", "version": "1.2.0", "path": "vendor/dep-x" }]` |
| `patches` | mixin loader 的 patch 目标声明（module/filePath/symbol/operation） | `"patches": [{ "id": "p1", "target": { "module": "host", "symbol": "run", "operation": "around" }, "file": "patch.js" }]` |
| `symbolAliases` | 符号别名/兼容映射（`b: alias of c`，EB-D19）：改名可经别名解析，未声明别名按破坏性变更走删除路径 | `"symbolAliases": { "oldName": "newName" }` |
| `environment` | 只读环境元数据（如 `{platform:"web"}`）：不设硬门、仅报告展示（design-r3 §2.5） | `"environment": { "platform": "cli" }` |
| `grants` | 能力授权表达式（fs/network/vars/llm/exec/http 等）；默认拒绝 | `"grants": { "fs": "..." }` |
| `provides` / `loader` / `shared` / `entrypoints` | 服务能力声明 / loader 契约（v1: standard/mixin）/ 显式共享状态标记 / 入口贡献表 | — |

## 3. 依赖管理（mygo 在 Cordis 之上补充的核心之一）

Cordis 的组合是「行 + patch 层」；mygo 在其上补充「manifest 校验 + 确定性
版本选择 + 落盘还原 + 扫描/符号校验」。**pnpm 安装状态是唯一真相源**
（2026-08-13 范围重塑）：mygo 不再做跨插件约束求解、不写 lockfile。

### 3.1 单插件版本选择（`package/version-select.ts`）

输入：带有效 manifest 的候选版本集 + 可选请求区间 + profile 钉定（精确版本）
+ core 版本。输出：确定性全序（semver 降序 + 字典序兜底）的最高匹配版本；
钉定为硬选择（不在候选集 → 失败）；`core` 区间不满足只告警不阻断。
同输入必同输出。

### 3.2 落盘还原（`package/package-restore.ts`）

`$DSH_HOME/mygo/packages/<id>/<version>/`（普通目录语义，调用方指定目标），
还原原子化（staging → rename），事实文件 `.mygo-package.json`
（`dsh.mygo-package/v1`，含 manifest 快照与内容哈希）供幂等复用与 BOM/治理
视图消费。路径安全（B10）：entry/bundles/patches 禁逃逸，安装期校验。
已无「store 唯一真相」语义（目录生命周期归调用方）。

### 3.3 扫描与收割

- `bundle-scan`：整包扫描内嵌 `dsh.bundle` 声明 + npm 元数据分类（KF-1 裁决：
  dependencies/peerDependencies/optionalDependencies + 自身包名归一，未声明
  specifier 硬错）。
- `harvester`：`engines.dsh` / `cordis` peer / `@deepseek-ai/dsh-tools` peer →
  core 区间归一；无法映射 → 告警（EXT-1 锚定）。
- `dual-presence`：同一包既是插件又被 npm 嵌套依赖 → 告警不阻断。
- `symbol-verify`：静态收集导入投影，对照目标包运行时 exports；缺失硬阻断、
  不可解析告警放行（B13）。

### 3.4 版本谓词

`semver-range.ts` 是零依赖最小实现：`*`、精确、`= > >= < <= ^ ~`、空格 AND、
`||` OR；预发布按 npm 规则（区间必须对同一 tuple 显式带预发布比较符才匹配）。

## 4. 生命周期与启停（mygo 补充的第二块核心）

### 4.1 状态模型

两个正交维度：

- `status`（持久化指针）：`enabled | disabled | quarantined | shadowed | uninstalled`
- `policyStatus`（运行期政策，requires 闸求值）：`active | inactive | policy-rejected`

优先级：**disabled（用户显式关闭）> policy-rejected（政策拒绝）> INACTIVE
（依赖缺失）**——三态分立（EB-D16；expected-behavior §6 矛盾 2 裁决），三种停用都记账。

### 4.2 操作与七步替换协议（`lifecycle.ts` §14）

`install/enable/disable/uninstall/updateConfig` 都走 replace 协议（HMR 语义，
不重启宿主）。核心不变量：

1. 先持久化、后运行态生效（T3 规则：status 指针写在 generation 之后）；
2. 新一代 staging 全部成功才提交，失败整体回滚；
3. `swapPolicy`：`immediate`（直接换）/ `drain`（事件排空）/ `next-idle`
   （Agent 空闲）——有界等待；`drain` 为事件驱动（订阅受影响事件的
   idle 信号，任一事件空闲即复查合取，deadline 兜底 swap-timeout），
   不再 5ms 忙轮询（next-hmr R1）；
4. dispose 有界（`disposeTimeoutMs` 默认 5000ms，0..30000 可配，EB-D21 /
   design-r3 §1.7）：超时 = **停止等待并放弃所有权**（JS 无法中止运行中的
   异步生成器，诚实声明）——不再 await 剩余 disposables，计入
   `dispose-abandoned` 报告（显式警告可能资源泄漏），释放过渡队列，
   后续过渡（含 P1-global 回滚与 P2 停用）不被阻塞。

**释放顺序（HMR 体验，R2）**：旧代释放先等事件排空（onIdle，保住旧代
直到在飞处理器结束），但等待有界 = `swapTimeoutMs`——常驻事件流（周期
事件/长事务）永不排空时按 deadline 强制释放旧代并告警
`deferred-dispose-abandoned`（与 dispose-abandoned 同口径），杜绝换代后
旧代无限滞留（`releaseGeneration`，lifecycle.spec 新增常驻事件流用例）。

`updateConfig` 只允许改配置（EB-D22：任何代码/exports 变更必须 remove+create，
物理不能换模块）；patch 与当前代 resolvedConfig deep-equal 时**空操作短路**
（不 bump generation、不重跑 apply、不发 `plugin/replaced`，与 adoptStatic
同代幂等守卫同口径，next-hmr R1）。

### 4.3 requires 政策闸（`package/requires-gate.ts` + `lifecycle.reconcileRequiresGates`）

`requires` 不进依赖图；运行期求值三种违例：

- `service-missing`：当前无提供者 → INACTIVE；
- `provider-version-mismatch`：提供者版本不满足区间；
- `symbol-missing`：消费方被用符号不在提供者挂载时快照中。

提供者出现/消失时自动重算（EB-D16：INACTIVE 在提供者出现后自动激活）；
候选集来自 `ProviderObservationRegistry`（B19：谁在何时 provide 过什么，
随 fiber 清理，只读不阻断）。

> 已知边界：政策闸无法表达「要求管理器自身」（管理器 provides 仅
> `service:mygo-core`，requires 键禁 `service:` 前缀）——CLI 因此 requires 置空 +
> `ctx.get('pluginManager')` 惰性解析（design-r5 C5，用户追认）。

### 4.4 恢复（T4）

启动 `recover()`：读注册表行 → 校验 → `restored` / `quarantined`（损坏/不可解析）
→ GC 孤儿代；恢复顺序按注册表行序（lockfile 拓扑序已随 dsh.lock/v1 删除）。

## 5. 挂载时符号快照与反应式 reload

### 5.1 快照注册表（`package/fine-epoch.ts`）

`FineEpochRegistry`：能力 → 提供者符号投影快照（挂载时缓存导出键集 +
`symbolAliases`），纯内存比较（EB-D20：微秒~亚毫秒预算，reload 路径禁磁盘
I/O）。独立细 epoch 指纹函数已删除（无生产消费者，2026-08-13）。

### 5.2 notify 双源与前置门

每次 provide/unprovide 即时 + ACTIVE 状态翻转都触发一次政策闸重算（一个批次）；
`preGate` 用消费方导入投影对照提供者快照（含 `symbolAliases`）。动态访问
`core[name]()` 静态投影扫不到 → 运行时代理记录 `ProvidedAccessRegistry` 兜底
（A11）。

### 5.3 Proxy 桥接与 exports 冻结（EB-D8）

- 桥接路径：provide/ctx.get 处 Proxy 包装（原始对象不逃逸），
  `set/deleteProperty` 拒绝（exports 冻结）；
- 直连路径：契约外行为（后果自负），定期快照传感器为后续候选（本轮不实现）。

### 5.4 失败策略（P1/P2）

失败策略为两档：**P1-global 默认**（回滚 MUST 产与 P2 同规格结构化报告：
失败过渡、原因、回到哪一代）、**P2 硬约束**（不可回滚的强约束）。P1-local
已按裁决删除（正确性依赖内存管理行为，悬空风险堵不死）。

## 6. 打包与分发（pack 体系）

### 6.1 `mygo-pack/v1`

```text
<name>.mygo-pack (tar.gz)
├── mygo-pack.json   # 唯一清单（成员序固定第一位）
└── files/<i>.tgz    # vendored 插件 tarball（i = files[] 下标）
```

清单：`format/formatVersion/name/version/generated/plugins（id+version+
packageName）/files（pluginId+version+sha512+fileSize+integrity）/
communityDeps/manifestSha256`（2026-08-13 起不再内嵌 dsh.lock/v1 载荷，
版本钉死在 plugins[]/files[] 上）。
`manifestSha256` 对规范键序语义 JSON 计算；`generated.at` 归一 `<t>`。

**P8 成员二态（兼容扩展，formatVersion 仍为 1）**：新增可选顶层
`references[]`（npm 引用式成员：`{pluginId, version, packageName, spec,
integrity, tarball}`——spec 钉死 `name@version`，integrity/tarball 打包时
从 registry 元数据固化）。plugins[] 仍列全部成员；一一对应口径变为
`plugins[] == files[] ∪ references[]`（两集不重叠）。取舍说明：不升 v2
是因为 files[]/plugins[] 语义未变，旧还原端遇到含 references 的 pack 会
以「不一一对应」干净拒绝（fail closed），新还原端对无 references 键的
旧 pack 完全兼容；规范载荷仅在 references 非空时纳入该键，旧 pack 的
manifestSha256 验证口径逐字节不变（空数组不落盘）。

### 6.2 确定性打包（B21）

`buildPluginPack`：枚举还原根（`<installRoot>/<id>/<version>/`）重打包
（`tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` +
`gzip -n` 语义的 Node zlib），排除 `.mygo-package.json`，transform `./` →
`package/`；工具能力探测（不支持 `--sort=name` 报错）。P8 新增
`references` 选项（id 列表或 'all'）：列入的成员不内嵌，改从 registry
（`--registry`/NPM_CONFIG_REGISTRY，缺省官方）元数据固化引用。

### 6.3 离线还原（B22/B23）与引用拉取（P8）

`installPluginPack`：清单自校验 → 自实现 tar 头部预检（精确成员集白名单，
防换行文件名绕过）→ vendored sha512+fileSize 校验 → 内层 tarball 预检 →
普通落盘还原（原子、可回滚）。一坏多好 → 整体拒绝、零写盘（T42）。
无求解、无 lockfile 读写。P8：references[] 成员在落盘前统一在线拉取
（fetch 注入面 `fetchImpl`；integrity 与清单固化值不符硬失败），拉取/
校验全部先于任何写入，失败点名缺失成员并整体拒绝（离线 fail-loud）；
落盘与内嵌成员同路径同语义，事实文件尾部记 `origin:
pack-embedded|pack-reference`（不进事实哈希）。CLI restore 默认随后自动
注册进目标 profile（等价 `dsh plugin add`：pnpm add + bundle 对账；
`--no-register` 关闭），幂等且与手工 add 混装不撞行。

### 6.4 CLI（扩展插件，`packages/cordis/mygo-cli`）

`dsh --profile <p> mygo install|uninstall|enable|disable|pack|restore|init`
（L0：`ctx.cmdlineArgs`/`appExit`，手写最小解析器；`--json` 直通结构化报告；
退出码 0/1/2）。P5 起 install/uninstall/enable/disable 经 profile
LoaderAdapter 调用（执行面收敛进 @r05en1cu/dsh-mygo-loader-profile；
pnpm + dsh.bundle 对账 / patch 层 disabled 块语义不变）。`init` 以
plugin-template@2da8230 资产生成骨架，写盘前过
B1 + `checkTemplateAlignment` 双校验（含 7 skills + lockfile，
`verify:self-contained` 硬性要求）。P4 新增多实例接管命令
`instances|adopt|clone`（不依赖管理器挂载，见 §13.4）；P5 新增
`hub search|info|install|collections`（dsh-hub 市场面，见 §14.3）；
P7 新增 `config <id> [--set '<json>']`（patch 层行 config 整行读写，
见 §16.1-2）。

> 已知宿主限制（P3 实测）：web profile 的 web-startup 参数解析器为严格
> 模式，`dsh --profile web mygo ...` 的内层参数目前到不了 cmdlineArgs
> 消费方（host 缝隙，待 host 补丁提案）；CLI 面语义由 cli-e2e 进程内测试
> 覆盖。

## 7. 报告与错误

CD-1 已裁决统一（2026-08-13）：**一套词汇**——mygo-api `PluginError` 闭表
39 码七组；结构化报告（`package/report.ts`）的 `code` 直接取自该表
（组 7 报告码：`resolve-failed / bundle-invalid / symbol-missing /
policy-rejected / pack-invalid / pack-hash-mismatch`），`manifest-invalid`
特指 mount 期 schema 校验（安装期 bundles 声明问题改名 `bundle-invalid` 消歧）。

- **结构化报告**（`package/report.ts`）：`ResolutionReport` 含 `scope`
  （package/service/pack）、`cycles`、`conflicts`（约束/链路/候选集/建议动作）；
  `generation` 字段与 `lockfile-mismatch / dependency-cycle / dispose-timeout`
  三码随求解/lockfile 体系删除。
- **PluginError**（mygo-api error.ts）：挂载/权限/运行时接线/配额/能力拒绝 +
  组 7 报告码；零生产者死码（grant-missing / install-denied / ceiling-exceeded /
  source-not-allowed / provenance-rejected / fs-denied / network-denied /
  vars-denied / http-denied / emit-denied）已删除。

## 8. 运行期治理

- **能力面**（`capabilities.ts`）：fs/vars/llm/exec/http/fetch 都由
  `grants` 授权表达式把关，拒绝 → 对应 `*-denied`；配额：cpuBudgetMs
  （服务配置默认 100ms，超限自动禁用）、限流日志 1000 行/分钟、code/registry
  字节上限（config.ts 默认）。
- **事件派发**（`dispatch.ts` + `event-vocabulary.ts`）：`emit | waterfall |
  parallel | serial` 四模式；`@mode` 上限（`mode-ceiling-exceeded`）、分支
  （`undeclared-branch`）与否决（`undeclared-veto`）由词汇表管辖。
- **BOM**（P4）：`dsh.bom/v1` intent+lock 导出/对账；管理器自身作为
  `dsh-mygo` 成员提供 `service:mygo-core`。
- **审计**：`AuditLog` 追加式，容量/保留可配（50MB / 5 文件），面板可读
  `auditSince/auditByPlugin/auditTail`。

## 9. 持久化与外部存储

- `RegistryStore` 契约（store.ts）：`listIds/readGenerations/writeGeneration/
  deleteGeneration/readStatus/writeStatus/deletePlugin/usage/check?`。
- 内置：storage-domain sqlite（unit `plugin_registry_<profile>`，表
  `u_plugin_registry_web_gens/status`）。
- 外部：`extension/mygo-rdb` 经 `mygoRegistryStore` 宿主服务注入（根上下文），
  支持 sqlite/postgres；`check()` 启动自检。
- 迁移：外部 store 提供 `migrated_from_sqlite` 标记，manager init 做一次性
  sqlite→rdb 迁移（面板/扩展约定）。

## 10. 扩展点

| 扩展面 | 契约 | 现有实现 |
|---|---|---|
| loader | `LoaderDeclaration {id, range}`（v1: standard/mixin） | mixin-engine |
| 存储 | `RegistryStore` | sqlite 内置 / mygo-rdb |
| CLI 命令 | `ctx.cmdlineArgs`/`appExit`（L0） | mygo-cli |
| web 面板 | `ctx.httpServer` 路由 + `settings.section` 客户端槽 | dsh-mygo-panel |
| 配置卡片 | `settings.plugin.item` 槽聚合卡片（r6：有 Config schema 的受管插件通用配置表单） | dsh-mygo-panel（ConfigCards + config-cards.ts 内省面；槽契约本地声明合并镜像） |

## 11. 测试与开发纪律

- 套件：`tests/`（T1-T51，含 e2e 真实语料 + T50/T51 webui spike）、
  `test/eb/`（EB 假设 13 项，独立 vitest config）。
- 计数口径（2026-08-15 rc8 npmrc auth 后）：全量 86 文件 / 782 用例
  （mygo-api 6/39 + mygo 63/644 + mygo-cli 10/50 + mygo-loader-profile
  3/14 + mygo-loader-hub 3/25 + mygo-ext-fabric 1/10；含 mygo-rdb 本地
  未提交修正，见 docs/next 备忘录）；EB 套件 11 文件 / 13 用例；
  面板套件 7 文件 / 45 用例（rc8 起计：live-events / client-live-rail /
  credential-route）。
- 测试池实务（2026-08-13 实录）：本机 vitest forks 池在 54 文件规模下
  间歇挂起/崩溃（基线 stash 复核同现象，环境性）；`--pool=threads` 同
  负载稳定全绿。串行分包纪律不变，包内可加 `--pool=threads`。
- 面板包测试（rc.3 起）：`packages/extensions/mygo-panel` 不装 vitest
  （dsh-client-* devDeps 的传递依赖 404 未公开发布，任何解析变动都会
  撞墙），test 脚本走根级提升的 vitest 二进制 shim，vitest.config.ts
  为 plain object（不 import 'vitest/config'——面板解析链无 vitest
  顶层链接）。纯函数面（bridge-rows.ts 桥接装配、workspace-packages.ts
  整仓枚举/构建形态、config-cards.ts 内省与导入导出，r6）直测；
  卸载路由经 routeBundleUninstall 导出函数 + 临时 profile fixture 测。
  面板模块 HOME_ROOT 在 import 时定型——测试须先于动态 import 设
  临时 DSH_HOME（r6 实测事故：先 import 后设 env 会打到真实实例，已修复）。
- 离线：全量回归在 `NODE_OPTIONS=--require block-net.cjs` 下（仅放行
  127.0.0.1/localhost）；确定性断言字节级（T19/T22）。
- 故障分类：impl-bug / design-gap / fixture-issue 三分类，验证文档记录。
- vendor 零补丁（PATCHES.md 登记制度随 install.sh 一并退役，2026-08-13；
  host 补丁提案仍走 `patches/`）。
- 冻结文档（expected-behavior / design-r3 / two-tier）只追加修订记录。

## 12. 发布与安装形态

- `scripts/publish-mygo.mjs`：仓内构建 + prepack 自检 + dry-run 门禁；发布面
  mygo-api / mygo / mygo-cli / mygo-panel。包均为 `publishConfig.access:
  restricted`（发布留作 handoff）。
- 仓库自包含（P3）：pnpm workspace + 根 tsconfig.base.json；`@deepseek-ai/*`
  依赖全部从公开 registry 解析（cordis ^4.0.1 / loader ^1.0.2 / dsh-*
  0.0.1-rc.1 线 / dsh-home-paths 0.1.0-rc.x）；内部包间维持 `workspace:^`
  （守则例外 #2 过渡态）。
- 安装形态（P3 落地）：mygo / mygo-cli 是标准 `dsh.bundle` 包（包内
  cordis.patch.yml 层，profile 名由服务从 loader baseUrl 推导）；安装 =
  `dsh plugin --profile <p> add <tarball|git-spec>`（profile 目录 pnpm +
  dsh.profile.bundles 对账）；`mygo install/uninstall/enable/disable`
  命令面同语义（enable/disable 写 profile patch 层 id 定向 disabled 块）。
  install.sh 已退役（2026-08-13）；开发验证全部在仓库内进行，不再同步
  任何 checkout。

## 13. 多实例接管与 HOME 隔离（P4）

**实例 = $DSH_HOME。** mygo 数据根 `$DSH_HOME/mygo/`（paths.ts）。P4 落地
多实例发现/接管面与隔离红线：

### 13.1 用户级实例登记处（`src/instances.ts`）

- 位置 `~/.dsh-mygo/instances.json`（**用户级目录，非任何实例 HOME**，写它
  不算跨实例污染；测试经 `MYGO_USER_DIR` 环境变量重定向）。
- 每条记录仅 `{home, dshVersion, lastSeenAt}`（`dsh.mygo-instances/v1`，
  按 home 字典序），**不存插件账**（插件账 = pnpm 安装状态，唯一真相源在
  各实例 HOME 内）。
- API：`registerInstance`（upsert，刷新 lastSeenAt；dshVersion 缺省保留
  既有值）/ `listInstances` / `unregisterInstance` / `isInstanceRegistered`；
  服务 init 自动登记当前实例（失败不阻断启动）；`ctx.pluginManager.instances()`
  为只读面。
- 写入 = staging → rename 原子发布；读-改-写经 mkdir 自旋锁互斥
  （P7-B10：等待上限 2s，陈旧锁 30s 接管，超时 fail-open——登记处只
  承载发现面，不允许残留锁砖掉启动；fail-open 窗口内仍是
  last-writer-wins）。
- 跨版本不共享可写状态：`dshVersion` 只是治理事实记录面（治理视图
  `GovernanceView.dshVersion` 同步记录），可写状态全部落在各实例 HOME 内。

### 13.2 HOME 隔离红线

写路径审计结论（P4）：现有写面全部落在 `$DSH_HOME` 内——还原根
（`$DSH_HOME/mygo/packages/`）、mygo-self.json、快照/审计（stateRoot /
dshHomePath）、BOM 导出（dshHomePath('mygo-boms')）、profile 目录
（profiles/<p>，pnpm + patch 层）。**HOME 外写面仅两个用户级例外**：
实例登记处与共享缓存（`~/.dsh-mygo/`）。CLI `init` 写用户显式 `--dir`
（工作区语义）、`pack -o` 写用户显式产物路径，均为调用方指定的输出，
不属实例数据。

隔离闸：`assertInsideHome(home, target)`（paths.ts，与 package-restore.ts
的 B10 assertInside 同模式）——写操作前 assert 目标在目标 HOME 内，
**跨 HOME 写被拒绝**（抛出「目标路径逃出实例 HOME」）。落闸点：
install.ts `ensureProfile`（profile 目录必须在目标 HOME 内）、
`clonePlugin`（B 侧 packagesRoot/tmpDir 全部过闸）、共享缓存寻址键格式
校验（`cachedPackPath` 拒绝非 128 位 hex，防路径逃逸）。防污染测试：
`tests/instances.spec.ts`（跨 HOME 写被拒绝用例）。

### 13.3 跨实例只读共享缓存（`src/pack-cache.ts`）

- 位置 `~/.dsh-mygo/cache/packs/`；内容寻址（整个 pack 文件的 sha512 hex
  作文件名），只存不可变 mygo-pack。
- 发布（`cachePack`）：先复用 pack.ts 现有校验（清单自校验
  manifestSha256 + vendored 成员 sha512/fileSize 逐条复核），不合法拒绝
  入缓存；staging → rename 原子发布；同内容第二次发布命中
  （`cached: true`，零写盘）。
- 导入（`importCachedPack`）：hardlink 优先、copy 兜底（跨设备 EXDEV 等）；
  目标已存在同内容文件直接复用。

### 13.4 CLI 接管命令（mygo-cli）

- `mygo instances`：列出登记处全部实例（当前实例 HOME 标注 `*`）。
- `mygo adopt --home <path>`：登记另一个实例 + 首次对账（只读扫描
  profiles / mygo-self.json / dsh 版本），**不写对端插件状态**。
- `mygo clone --from <homeA> --to <homeB> <plugin>`：A 侧把指定插件确定性
  重打包（buildPluginPack `plugins` 过滤项）→ 发布共享缓存 → B 侧 tmp
  导入（hardlink/copy）→ installPluginPack 还原安装进 B 的还原根。
  两侧 HOME 都必须已登记；from = to 拒绝；B 侧落盘全过隔离闸。
- 三命令不依赖管理器挂载（操作对象是 HOME 与用户级登记处）。

### 13.5 双 HOME e2e 实录（2026-08-13）

脚本留 `/tmp/mygo-p4-e2e/run.mjs`（产物不进仓库）：mktemp 两个临时
DSH_HOME + 临时 MYGO_USER_DIR；两侧各经 P3 冒烟形态装 mygo/mygo-cli
（pnpm pack tarball + profile pnpm-workspace.yaml overrides file: 姿态）；
随后 adopt 双登记 → instances 列表 → A 侧 restorePackage 装 demo 插件
（B 侧 packagesRoot 不存在，隔离前提成立）→ clone A→B（首次缓存新发布，
hardlink 导入，B 还原成功）→ 第二次 clone 缓存命中零写盘 → 红线复核
（未登记 HOME 拒绝 / 同一 HOME 拒绝 / assertInsideHome 跨 HOME 写拒绝）。
逐行实录见该目录 transcript.txt。

## 14. Loader 扩展体系与 dsh-hub 适配器（P5）

### 14.1 LoaderAdapter 注册机制

- 契约（mygo-api `loader.ts`，P2 落地）：`LoaderAdapter {id, resolve, install, list?}`；
  `InstallIntent` 三态（pnpm / pack / display）；`InstallTarget {home, profile}`；
  `InstallReceipt` 回执。
- 注册表（mygo `src/loader-adapters.ts`，对齐 BUILTIN_LOADERS 形态）：
  `LoaderAdapterRegistry`（register 重复 id 拒绝、返回幂等注销器、list 按 id
  字典序、resolve 逐适配器试解析）；`BUILTIN_LOADER_ADAPTERS = ['profile']`。
- 治理面：`pluginManager.registerLoaderAdapter(adapter)` 注册（受管插件
  activate/apply 时调用，注销器随 fiber 清理 = 启停走治理面）；
  `pluginManager.loaderAdapters()` 为发现面。mygo-cli 在首个 mygo 命令
  时注册 profile adapter（被动语义：非 mygo 首 token 零副作用，故注册
  不在 apply 顶层发生）；hub adapter 以受管插件形态（bundle 行）挂载即
  注册（绑定 vendored 快照，boot 期零网络 I/O）。

### 14.2 默认 loader：@r05en1cu/dsh-mygo-loader-profile

P3 安装执行面从 mygo-cli 收敛进 `packages/loaders/mygo-loader-profile`
（face.ts 原样搬迁 + adapter.ts 契约化）：

- `resolve` 接受四种 spec：npm 包名（可带区间）/ git spec（git+https、
  https .git、github:）/ tarball（.tgz/.tar.gz，可 file: 前缀）/ 本地目录
  （file:、相对、绝对路径）；不识别返回 null。
- `install` 只执行 pnpm intent（display/pack 明确拒绝），落 profile 目录
  pnpm add + dsh.bundle 对账；扩展面 `uninstall` / `setEnabled`（契约
  只覆盖 install，卸载/启停是 profile 执行面自有语义）。
- **它是所有其他 loader 的最终执行面**：来源适配器翻译出 pnpm intent
  后统一由它执行。mygo-cli 的 install/uninstall/enable/disable 已改经
  adapter 调用（CLI 面行为不变，install-face.spec 不回归）；cli
  src/install.ts re-export 执行面保持既有引用兼容。

### 14.3 hub loader：@r05en1cu/dsh-mygo-loader-hub

dsh-hub 市场（`omdsh-registry/v1` 静态 JSON）适配器：

- **拉取/验签**（registry.ts）：双 origin 故障转移
  （hub.omdsh.dev → hub.0.org.cn）；本地快照降级（`--snapshot` file:///
  路径，或远程全挂时 vendored `assets/registry-v1.json` 兜底 + 告警；
  NDA 期远程 OAuth 门禁 404 即走此路径）。snapshotId = canonical JSON
  （键排序递归序列化，registry-core.ts 同算法）payload 的 sha256，默认
  强制校验；signature 非 null 时强制 Ed25519 验签（`HUB_BUILTIN_KEYS`
  内置常量当前为空——官方公钥待部署环境公布，轮换窗口结构按 keyId
  预留；运行时 keys 选项可注入）。`--insecure-no-verify` 只允许本地
  快照（远程使用直接报错）。
- **intent 翻译**（intent.ts）：`profile-bundle` → pnpm intent（精确
  semver 归一 `name@version`；钉 40 位 commit git spec 原样）交 profile
  执行面；`guided/*` → display（无可执行 intent，拒绝安装并说明）；
  `repository-plugin` → 默认拒绝（该安装轨 0812 已删除，待官方态度），
  除非探针（raw.githubusercontent 钉 commit 取 .dsh-plugin/package.json）
  发现 `dsh.bundle` 声明 → 实验性放行（标注 warn，走 git 子目录 spec）。
  本地快照（离线验证/内网镜像）额外允许 file:/绝对路径 spec。
- **可安装判定**（assess.ts）：`listing.state === 'blocked'` 或 release
  缺失为硬门；risk 分级 / vulnerabilityScan / nativeCode / installScripts /
  maintenance / relations / capabilities 进安装前提示（建议式，不强制；
  relations/capabilities 为 catalog 源维度，registry 快照暂未释放，
  防御性消费）。本面即 hub 治理元数据的兼容性报告消费维度（CLI
  `hub info` / `hub install` 前置输出）。
- **collections**（collections.ts）：整组顺序安装，任一项失败逆序回滚
  已装项、整组丢弃（对齐 hub 语义）。
- **CLI 面**：`mygo hub search <query>` / `hub info <id>[@release]` /
  `hub install <id>[@release]`（id 命中 collection 时整组原子安装）/
  `hub collections`；`--json` 信封对齐现有命令风格。

### 14.4 P4 遗留 #3 评估登记：clone 不提升到 InstallIntent 语义

评估结论（2026-08-14）：**不提升**。理由：InstallIntent/InstallTarget
契约是 profile 粒度的单实例语义；clone 的目标面是另一实例的 mygo 还原
根（`$DSH_HOME/mygo/packages/`，installPluginPack 承担），且必须过
InstanceRegistry 登记闸与 HOME 隔离闸——适配器契约的 sync
`resolve(spec)` 与单实例 target 模型装不下跨实例对账。clone 维持 P4
形态（mygo-cli install.ts 自有实现），复用 pack/共享缓存原语已足够。
若 P6/P7 出现第三个跨实例搬运面，再评估抽象。

## 15. fabric 安装层 extension 化与 host 补丁提案（P6）

### 15.1 extension 登记表

mygo 核心 `src/extensions.ts`：`ExtensionRegistry`（登记
`{id, kind:'extension', source, blockMarker, packages}`；重复 id 拒绝，
注销器幂等随 fiber 清理）+ `extensionViews()` 纯函数——启用态从
profile patch 层受管块标记推导，版本取 profile dependencies 子集
（pnpm/patch 文件为唯一真相源，表内不存状态）。服务面：
`pluginManager.registerExtension()` / `pluginManager.extensions()`。
首条登记 = fabric（@r05en1cu/dsh-mygo-ext-fabric）。

### 15.2 mygo-fabric 治理壳（packages/extensions/mygo-fabric）

- fabric 组合缝（cordis-fabric + cordis-fabric-dsh 两行）由 mygo 治理层
  接管：`enableFabric(target, {specs?})` = 经 profile loader 执行面安装
  两包 + 向目标 profile 的 cordis.patch.yml 写受管块（幂等标记块
  `# --- mygo managed extension (id:fabric) ---`，P3 启停块同机制）；
  `disableFabric(target)` = 移除受管块（包保留在 dependencies，卸载经
  profile loader 另行执行）。patch 路径前做 profile 名硬校验 +
  assertInsideHome 隔离闸。
- 依赖形态：默认 git 子目录 spec 白名单过渡（守则例外 #6 登记）；push
  禁令未解除，验证一律用本地路径 spec（pnpm link 安装，零网络）。
- 包根是 mygo 受管插件形态（bundle 行）：挂载即登记，fiber 清理注销。

### 15.3 host 补丁提案（patches/fabric-host.patch）

从 fabric 仓 patch（17 文件，baseline 0812 快照）收编，剔除两条组合缝
（web-app 插行 + app-boot profile init 模板预声明），只留三条硬缝 +
必需接线（15 文件）；基线重钉公开版 deepseek-harness-public @ 47f9438，
`git apply --check` 干净通过。逐文件漂移表与再生成步骤见
patches/README.md。fabric 仓的 patch 不动（独立演进），差异在
patches/README.md 说明。

> runtime 激活依赖 host 合入提案（profile-boot 挂钩安装必须早于目标
> 模块 import）；P6 验收口径 = 受管块写入正确 + 提案 apply --check
> 干净 + fabric 包自身测试在 fabric 仓内绿。

## 16. P7：0812 机会面落地与遗留收口

### 16.1 机会面五项

1. **git 安装双门槛一键化**（loader-profile face.ts）：pnpm 输出捕获 +
   政策检测（`detectIgnoredBuildKeys` / `isBuildPolicyBlock` /
   `isExoticSubdepBlock`）→ 治理层一键写 profile pnpm-workspace.yaml
   （`ensureProfilePnpmSettings`：allowBuilds 键置 true，覆盖 pnpm 自追加
   的占位值；blockExoticSubdeps 按需追加）→ 重试一次 + `pnpm rebuild`
   实际执行构建脚本。对齐官方 plugin.ts:150-155 的引导语义，落地为
   mygo 治理操作。回执 `allowedBuilds` 透出到 CLI 输出。
2. **`mygo config <id>`**（cli src/config.ts）：patch 不 deep-merge 的
   补救——文本级行定位（保留注释/行序）+ js-yaml 子块解析，`--set
   '<json>'` 浅合并后写回整行 config。
3. **模块解析失败早期响亮化**（governance.ts `checkBundleResolution`）：
   服务 init 预检「dependencies 内的 bundle 行」能否从 profile 目录解析
   （覆盖 profiles/node_modules 回退链），拼错/缺失直接抛错点名；
   模板自带未进 dependencies 的行不预检。
4. **pack 离线分发链路**（tests/package/pack-offline.spec.ts）：pack 导出
   → P4 共享缓存（内容寻址）→ 目标实例 hardlink 导入 → installPluginPack
   离线还原 → 事实文件逐条对账 → 第二次导入缓存命中，全离线用例坐实
   「git 安装的 pack 替代路径」。
5. **热重载状态保持**（mygo `src/update-state.ts`）：评估结论——**无需
   host 缝**。cordis `fiber.update()` 重启前先跑 `internal/update` 瀑布
   （官方注释明示 update hooks 可否决/替换重启），插件层 capture →
   next() → restore 即交接状态；helper
   `preserveStateAcrossUpdate(ctx, {key, capture, restore})` 收敛该模式
   （重启失败回滚时暂存槽回补）。真实 cordis 用例坐实。

### 16.2 遗留收口六项

- **B6 fine-epoch 定论**：保持独立模块不并入 requires-gate（消费方不止
  政策闸，lifecycle 同时持有注册表所有权；requires-gate 是纯求值面）。
  模块头 TODO 已改写为定论。
- **B7 F1 语料**：e2e corpus F1 从 fabric 根载包遗留 lib 切到
  `fabric/packages/cordis-fabric`（包内 lib + node_modules 自包含），
  versionOverride 钉 0.0.2 保持语料契约。
- **B8 fabric 去重**：enableFabric 写块前检测层内不受管的 fabric 载体行
  （`findStrayFabricRow`），命中即拒绝（重复插行互斥）。
- **B9 blockExoticSubdeps**：并入 16.1-1 的一键放行（git 子依赖拦截检测
  + 按需写 `blockExoticSubdeps: false`）。
- **B10 InstanceRegistry 并发**：mkdir 自旋锁（等待上限 2s / 陈旧 30s
  接管 / 超时 fail-open——登记处只是发现面，不允许残留锁砖掉启动）。
  P4 的 last-writer-wins 已知限制随之收窄为 fail-open 窗口。
- **B11 mygo-rdb 归属定论**：extension/mygo-rdb 维持用户既有 ignore
  裁决（三件套永不提交、不打包）；定位 = 外部存储扩展的本地演进线，
  收口条件 = 用户决定是否纳入主线（进 packages/extensions 并补三件套）
  或拆独立仓。当前不进发布面、不进计数口径说明之外的任何承诺。

## 17. 配置注入与面板功能面定型（r6）

### 17.1 配置注入（webui 插件页）

- **卡片枚举**（面板 node half `/api/mygo/config-cards`）：bridge 轨
  （mygo-plugins 安装物，fresh import 读 `Config` 导出）+ bundle 轨
  （profile bundle 成员，包目录经 profile node_modules / 兜底链解析）；
  schema 走 config-cards.ts 的结构化内省（ConfigSchemaLike →
  ConfigSchemaInfo{description, fields, template}，JSON 安全）；无 Config
  的插件静默跳过。bundle 行 id = bundle 自带 cordis.patch.yml 首个
  insert 行 id（bundleRowIdOf），回退成员 id。
- **读写**：`/api/mygo/config` GET/PUT——bridge 经
  `pluginManager.updateConfig` + 桥接行回写（HMR 生效）；bundle 经
  `upsertRowConfig` 写 profile 用户 patch 层（行不存在则追加 id 定向
  覆盖行，宿主 watchUserPatches 重载生效）。row-config 基础设施在 mygo
  核心 `src/row-config.ts`（cli `mygo config` 共用，re-export 兼容）。
- **卡片呈现**：client half 聚合卡片（`settings.plugin.item` 槽，id
  `mygo-configs`）逐插件渲染通用表单（ConfigFields 共享组件，Panel 的
  配置编辑器提取面）。槽契约以官方 slot-contract 同形状本地声明合并
  承载（dsh-client-ui-settings-plugins 暂不作 devDep，解析墙见 §11）。

### 17.2 配套配置导入导出（整 profile 粒度）

`dsh.mygo-configs/v1` 单文件：`{format, profile, exportedAt, configs}`。
导出 = patch 全部行 id 的 config 快照；导入 = parseConfigImport 格式
校验 + partitionImportTargets 受管集分面（patch 行 ∪ 卡片 ∪ bridge
集外 id 拒绝并指认）→ bridge 经 updateConfig、其余经
upsertRowConfig。pack 清单可选 configs[]（--with-config）为后续项。

### 17.3 面板功能面定型与 bundle 卸载路由

- 定型三区：bundle 插件安装（npm/git/hub/pack 引用式）、整合包导入
  导出、配套配置导入导出；版本获取/更新/自更新保留。面板安装面收敛见
  §17.6（npm bundle 默认 / 单个 tar 包；整合包安装预留卡片）。
- 已退役：外部应用管理全部面（API/函数/类型/UI）。
- 卸载路由（routeBundleUninstall）：bundle 轨 → profileUninstall
  （pnpm remove + reconcile，官方同路径）；守卫 = 面板自身拒绝、
  dsh-mygo 需 force、plan 预览前置；桥接轨维持引擎 uninstall。

### 17.4 面板 UI 重做（r7）与 API 增强

- **client 组件化**：Panel.tsx 拆为壳层 + 四标签页（插件/安装/更新/助手）
  与共享组件（ConfigEditor 抽屉、ConfirmDialog 弹窗、api.ts 类型化客户端、
  ConfigFields 共享字段编辑器）；现代卡片风样式，全部基于 --dsw-alias-*
  设计变量（color-mix 着色，深浅主题自动适配）。
- **/plugins 增强**：bridge 轨行新增 policyStatus / reason（政策状态展示）。
- **GET /api/mygo/status**（新增）：概览端点——mygo 自身版本
  （@r05en1cu/dsh-mygo package.json）与自更新 commit/ref、插件状态计数
  （total/bridge/bundle/enabled/disabled/quarantined/shadowed）、BOM 落盘
  状态（$DSH_HOME/mygo-boms/<profile>/dsh.bom.json，fail-soft，无网络）。
- **POST /api/mygo/updates/plugins**（新增）：批量更新——body.ids 可选，
  缺省 = 全部带远程来源的插件；顺序执行单条失败不中断，返回
  {results: [{id, ok, updated?, message?, error?}], message}。
  枚举逻辑抽取为 remoteInstallEntries() 与 listUpdates 共用。
- 面板头部：mygo 版本 chip、启用/停用/隔离/遮蔽/bridge/bundle/BOM 统计
  chips、可更新数角标（更新标签页）、刷新/检查更新/导出 BOM/配置导入导出
  全局按钮。

### 17.5 插件配置合并（r7.1/r7.2）

- **决策**：受管插件配置与默认插件配置层（官方 settings.plugin.item 卡片 +
  settings-file 写路径）存在重复定义/修改风险，统一按 mygo 核心方法为准。
- **实现**：撤销 settings.plugin.item 的聚合卡片（mygo-configs），改为
  轮询 /api/mygo/config-cards（8s）差异注册——每个受管插件一张独立卡片
  （id mygo-config-<pluginId>，order 70，排在官方 bash/agent-loop/
  web-search 之后）；schema/当前配置读 config-cards，保存经
  PUT /api/mygo/config（bridge 轨 HMR、bundle 轨 patch 层），
  与默认配置层零重复。
- **卡片形态（r7.2）**：外壳对齐官方 ui-settings-plugins PluginCard——
  头部按钮折叠/展开、未保存徽章、chevron、放弃修改/保存 footer（官方
  同款 token 与中文文案），标题旁带 "mygo" 小标；官方包未发布且只导出
  类型，无法直接复用组件，形态为自实现对齐（字段区沿用 ConfigFields
  通用编辑器）。动态集合由轮询拾取，注入回调返回组合 disposer 随声明
  生命周期/插件卸载整体拆除。
- **配套**：整 profile 配置导入/导出从聚合卡片迁入 mygo 面板头部
  （ConfigTransfer：导出下载 /api/mygo/config-export，导入弹窗
  PUT /api/mygo/config-import）；ConfigCards.tsx 移除。

### 17.6 安装面收敛与整合包预留（r7.3）

- **插件安装收敛为两方式**：npm bundle（默认，引用式安装，spec 如
  @pkg/name@^1.0.0 / github:owner/repo#ref，POST /bundles/install）与
  单个 tar 包（.tgz / .tar.gz，method archive 解压安装，经 install-plan
  + /install）；GitHub URL / 文件夹 / 压缩包(zip) 方式从面板移除
  （后端 /install 的 github/folder 分支保留，CLI 与既有安装物不受影响）。
- **整合包安装独立卡片（预留）**：PackInstallCard 与插件安装并列但独立
  ——说明 mygo-pack 格式与 CLI 路径（dsh mygo pack / restore），输入与
  按钮为禁用预留态；功能在后续版本接入（届时走 mygo restore 等价面）。
- 面板安装面的配置 JSON / 自动构建依赖 / plan 预览确认 / 进度指示不变。

## 18. 常见任务速查

```sh
# 仓内全量 gates（无网拦截）
pnpm -r run verify:self-contained && pnpm -r run typecheck && pnpm -r test && pnpm -r run build
# EB
NODE_OPTIONS="--require /tmp/block-net.cjs" npx vitest run --config packages/cordis/mygo/test/eb/vitest.config.ts --maxWorkers=2
# 安装到临时 profile（冒烟形态）
dsh plugin --profile <tmp> add <dsh-mygo.tgz>
# 打包/还原/初始化
dsh --profile web mygo pack -o out.mygo-pack --json
dsh --profile web mygo restore out.mygo-pack
dsh --profile web mygo init @scope/my-plugin
```
