# 第三轮对核：Fabric Loader / Modrinth（mrpack）校验机制 vs mygo 基线

> 生成时间：2026-08-11 · 任务：第三轮（Fabric/Modrinth 对核）
> 基线：`docs/expected-behavior.md`（FROZEN，2026-08-11）+ `docs/two-tier-contract.md`
> 本文件是证据核验产物，不是设计文档。只收敛为「规范条款变更 / 新增测试场景 / 无需动作」三选一，禁止悬空结论。

## 0. 证据来源与方法

证据优先级遵守：Fabric Loader 源码 > 官方规范/文档 > 行为实验。无出处的推断一律标注「假设」；查不到的条目标「未核实」，不猜。

### 取证对象

| 对象 | 版本/提交 | 说明 |
|---|---|---|
| Fabric Loader 源码 | `b907c5b292fc062d75b6d8bf8255ac200109b992`（本地 `/home/rosen/workspace/dsh_dev/fabric-loader`） | 下文简称 `fabric-loader/…`，行号基于该提交 |
| Modrinth 官方 monorepo（Theseus 桌面应用 + Labrinth） | `2a43792fd97ac8ad4bbc7bd09334acd0fe0785ae`（`/tmp/theseus-lkLCeY/theseus-src`） | 下文简称 `theseus/…`，行号基于该提交 |
| fabric.mod.json 官方规范 | https://docs.fabricmc.net/develop/loader/fabric-mod-json | 26.2 版本文档 |
| mrpack 官方规范 | https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack | |
| Modrinth API 文档 | https://docs.modrinth.com/api/operations/getversion/ | version 对象字段 |
| packwiz 官方文档 | https://packwiz.infra.link/tutorials/creating/getting-started/ | 仅作外部对照，非主取证对象 |

### 范围

- 纳入：fabric.mod.json 校验字段（depends/recommends/suggests/conflicts/breaks、版本谓词、environment、jars、provides）、Fabric 求解器行为与报错、mrpack 格式（files/hashes/dependencies/env/overrides）、Modrinth 注册表版本元数据与启动器依赖解析。
- 排除：mod 的实际注册与加载执行路径（entrypoint 实例化、mixin 应用、类加载）——已由 cordis 分析覆盖，本文件不重复核验。

## 1. 结论摘要

1. **重要确认**：Fabric 与 Modrinth 均不存在运行期依赖变化响应机制（核验点 10）。运行期反应式（惯性/HMR/细 epoch/前置门）是 mygo 因 cordis 反应式而独有的设计域。
2. **重要确认**：Fabric 与 Modrinth 均无失败恢复语义——只有「拒绝启动/安装中止」；无回滚、无降级、无显式拒绝态（核验点 7）。P1-global / P2 / 三态（disabled > 政策拒绝 > INACTIVE）是差异化设计。
3. **机制不同**：Fabric 每次启动重新发现+求解（无安装期求解、无 lockfile、无内容哈希）；Modrinth 在安装期做依赖解析与 SHA1 校验、启动期不重验（核验点 5/6）。mygo 的「安装期求解 → 加载期验证 → 运行期反应式」三段分工介于两者之间且为超集。
4. **反向缺口集中**：environment/profile、manifest schema 版本、安装路径安全、双哈希 + fileSize、provides（id 别名）、optional/recommends 依赖词是生态有而我们规范未覆盖的维度，本文件逐一给出纳入/不纳入裁决（§3）。

## 2. 核验矩阵

| # | 核验点 | 判定 | 落点 |
|---|---|---|---|
| 1 | depends/breaks/conflicts 违例行为与报错内容 | 机制不同（三者均有安装/启动期硬阻断；Fabric 报错结构最接近，但无链无回滚） | 规范条款变更 C1 + 测试场景 T1 |
| 2 | 版本谓词语义与宿主版本参与 | 机制不同（Fabric 范围语言、Modrinth 精确枚举；宿主同构于 core 字段） | 规范条款变更 C2 + 测试场景 T2 |
| 3 | 嵌套包治理（jars）与去重裁决 | 确认（Fabric）/ 无对应（Modrinth）；裁决非「纯最高版本」 | 规范条款变更 C3 + 测试场景 T3 |
| 4 | provides 语义与解析顺序 | 无对应（我们无 id 别名；EB-D19 只有符号别名选项） | 规范条款变更 C4 + 测试场景 T4 |
| 5 | 可复现安装：哈希清单与 lockfile | 机制不同（mrpack 双哈希安装期校验；两生态均无 lockfile） | 规范条款变更 C5 + 测试场景 T5/T6 |
| 6 | 安装期求解 vs 加载期校验分工 | 部分确认（Modrinth 印证安装期求解；Fabric 相反，每次启动重解） | 规范条款变更 C10 + 测试场景 T10/T11 |
| 7 | 失败恢复语义 | 确认（两者均无运行期恢复；无回滚/降级/拒绝态） | 无需动作（EB-D4/D16/D21 已覆盖） |
| 8 | 未建模校验维度（environment/java 等） | 无对应（多个维度缺失） | 规范条款变更 C6/C7/C8/C9 + 测试场景 T7/T8/T9 |
| 9 | 单实例约束与多版本候选选择 | 确认（双方均单实例；选择规则不同） | 规范条款变更 C3 + 测试场景 T3/T4 |
| 10 | 运行期反应式 | 确认（两生态均无；mygo 独有域） | 无需动作（EB-D9/D15 已覆盖） |

## 2.1 核验点 1：depends/breaks/conflicts 违例行为与报错内容

**基线主张**：依赖违例是硬阻断（EB-D11）；失败产出结构化报告——断点、链、候选、原因、建议（EB-D2）；P1-global 回滚产出硬告警 + 结构化报告（EB-D4）；P2 收敛 INACTIVE + 报告（EB-D2）。

**Fabric 证据**：
- 五类依赖 Kind：`DEPENDS("depends", true, false)`、`RECOMMENDS("recommends", true, true)`、`SUGGESTS("suggests", true, true)`、`CONFLICTS("conflicts", false, true)`、`BREAKS("breaks", false, false)`（`fabric-loader/src/main/java/net/fabricmc/loader/api/metadata/ModDependency.java:63-68`）。
- depends/breaks 硬阻断：求解失败 → `ModResolutionException`；`FabricLoaderImpl.load()` 将其包装为 `FormattedException.ofLocalized("exception.incompatible", …)`（`FabricLoaderImpl.java:194-205`），即拒绝启动。
- recommends/conflicts 仅警告：`ResultAnalyzer.gatherWarnings` 只处理 `RECOMMENDS` 与 `CONFLICTS`（`ResultAnalyzer.java:222-262`）；suggests 纯元数据（官方规范「Use this as a kind of metadata」）。
- 报错内容：`ResultAnalyzer.gatherErrors` 对每个 `Explanation`（mod + dep）调用 `addErrorToList`，输出：目标 mod 名/版本、依赖 id、区间、候选集（`getVersions(matches)` + `matches.size`）、原因（missing / mismatch / invalid / envDisabled）、建议动作（suggestion 行）；存在可行修复时另输出 `solutionHeader` 与 add/remove/replace 清单（`ResultAnalyzer.java:50-118`、`266-305`；`ModResolver.java:135-148`）。
- **无完整冲突链**：`Explanation` 是扁平记录（error + mod + dep + data），无 A→B→C 递归回溯（`fabric-loader/.../discovery/Explanation.java:21-63`）。即 Fabric 有「直接断点 + 候选集 + 建议动作」，但没有我们 EB-D2 定义的传递链，也没有「回到哪一代」。

**Modrinth 证据**：
- mrpack 依赖在安装期应用：`set_instance_information` 遍历 `dependencies`，`minecraft` 缺失 → `InputError("Pack did not specify Minecraft version")` 硬错；loader 版本在安装期经 `get_loader_version_from_profile` 解析（`theseus/packages/app-lib/src/api/pack/install_from.rs:538-600`）。
- 注册表依赖解析：安装内容时递归解析 `Required` 依赖；失败返回 `Error`（`ProjectNotFound` / `VersionNotFound` / `NoCompatibleVersion` 等），安装中止（`theseus/packages/modrinth-content-management/src/install.rs:14-32`、`model.rs:15-24`）。
- optional / incompatible / embedded 不阻断：解析器只处理 `DependencyType::Required`（`install.rs:108-125`）；非 required 直接跳过，无「拒绝」语义。
- 失败报告：安装失败带 `InstallErrorContext`（project/version/file path/urls/expected hash/expected size）供 UI 持久化（`install_mrpack.rs:769-783`），但无候选集、无依赖链、无建议动作。

**判定：机制不同。** 三生态都有「安装/启动期硬阻断」；Fabric 报错结构最接近我们的结构化报告（断点+候选+建议），但无链无回滚；Modrinth 报告最弱（上下文 + 错误类型）；我们的报告规格（链 + 回到哪一代 + 候选/建议）是超集。

**落点**：
- 规范条款变更 **C1**：EB-D2/D4 的报告规格显式增加「候选集 + 建议动作（add/remove/replace）」字段，与 Fabric `ResultAnalyzer` 词汇对齐；保留「链 + 回到哪一代」作为差异项。对应 design-r3 结构化报告 schema。
- 新增测试场景 **T1**：报告渲染测试——「直接断点 + 候选集 + 建议动作」与「完整链」共存，两者都不缺失。

## 2.2 核验点 2：版本谓词语义与宿主版本参与

**基线主张**：细 epoch 含版本元组（EB-D10）；维护者侧最小粒度 = (semver 版本, 导出符号路径)（EB-D13）；two-tier §9 将 npm `peerDependencies` 中 dsh 核心区间映射为 core 字段；R1 有 lockfile/pins。

**Fabric 证据**：
- 语法：按空格拆分 AND；`*` 跳过；操作符 `>= <= > < = ~ ^`（按最长匹配）；`.x` 通配在等式下转换为 `~`（3 段）或 `^`（2 段）；非 semver 且使用排除界 → `VersionParsingException`；非 semver 含包含界 → 降级为 `=`；多条件 AND 组合为 `MultiVersionPredicate`（`fabric-loader/.../util/version/VersionPredicateParser.java:38-100`）。
- 操作符语义：`~`=SAME_TO_NEXT_MINOR、`^`=SAME_TO_NEXT_MAJOR（`api/metadata/version/VersionComparisonOperator.java:85,103`）。
- 官方文档完整表：`*`、精确、`>`/`>=`/`<=`/`<`、`~26.1-rc.2`=`>=26.1-rc.2 <26.2-`、`^26.2`=`>=26.2 <27-`、`26.1.x`=`~26.1-`、数组 OR、`-` 后缀匹配预发布、构建元数据忽略、非 semver 仅支持 `=` 与 `*`（https://docs.fabricmc.net/develop/loader/fabric-mod-json#semantic-versioning）。
- 宿主版本作为普通候选参与校验：
  - `minecraft`：`MinecraftGameProvider.getBuiltinMods()` 以规范化游戏版本创建 builtin mod，并向 `java` 声明 `>=classVersion-44` 依赖（`minecraft/src/main/java/.../MinecraftGameProvider.java:118-133`）。
  - `java`：`ModDiscoverer.createJavaMod()` 以 `java.specification.version` 创建 builtin mod（`ModDiscoverer.java:241-246`）。
  - `fabricloader`：loader 自带 `fabric.mod.json`（id `fabricloader`，version 构建期注入 `${version}`，`src/main/resources/fabric.mod.json`）；生产模式由 `ClasspathModCandidateFinder` 将 `UrlUtil.LOADER_CODE_SOURCE` 加入候选（`ClasspathModCandidateFinder.java:72-74`），与普通 mod 同一求解路径。
  - 即「宿主 = 特殊依赖」在我们的语境对应 `core` 字段：与 `minecraft`/`fabricloader`/`java` 三类宿主同构。

**Modrinth 证据**：
- mrpack `dependencies` 是精确版本串（`"minecraft": "1.18.2"`、`"fabric-loader": "…"`），无范围语言（官方 mrpack 规范）。
- 注册表版本元数据：`game_versions` / `loaders` 为字符串数组；`dependencies` 为 `version_id`+`project_id`+`dependency_type`（https://docs.modrinth.com/api/operations/getversion/）。
- 客户端匹配是精确字符串相等：`version.game_versions.iter().any(|candidate| candidate == game_version)`（`theseus/packages/modrinth-content-management/src/install.rs:287-296`）。

**判定：机制不同。** Fabric 使用范围谓词语言，Modrinth 使用精确枚举；我们采用 npm semver 范围（two-tier 已映射 `peerDependencies`），表达力介于两者之间，且 lockfile pin 提供精确覆盖。

**落点**：
- 规范条款变更 **C2**：core 约束显式采用 npm semver 范围语义（`>=x <y`、`~`、`^`、`*`），并允许 lockfile 精确 pin 覆盖范围；design-r3 需定义「范围满足 + pin 固定」的裁决顺序（Fabric 无 pin，Modrinth 全精确，二者都不直接对应）。
- 新增测试场景 **T2**：版本范围边界用例——`~`/`^`/`.x` 等价、预发布匹配、构建元数据忽略、非 semver 只允许 `=`/`*`（移植 Fabric 语法表的 npm semver 等价测试）。

## 2.3 核验点 3：嵌套包治理（jars）与去重裁决

**基线主张**：mygo manifest 有 `bundles` 字段（two-tier §7）；R1「同一时刻同 id 唯一版本实例」不变量（EB-D17 裁决依据）；候选方案清单（A6）。

**Fabric 证据**：
- `jars` 字段解析：`readNestedJarEntries`（`V1ModMetadataParser.java:332-368`）。
- 嵌套递归读取：`ModDiscoverer` 对 `metadata.getJars()` 递归 `computeNestedMods`，嵌套 jar 自身再展开其 `jars`；缺失嵌套 jar 仅 dev 环境警告（`ModDiscoverer.java:341-378`、`414-462`）。
- 嵌套包参与求解：嵌套候选与根候选进入同一候选池，带 parent 链与 nestLevel（`ModDiscoverer.java:190-215` 的 BFS 建 parent；`ModPrioSorter` 以 nestLevel 参与排序）。
- 裁决规则：SAT 求解（sat4j）保证硬约束，优先级排序决定偏好——root 优先、id 升序、**版本降序**、嵌套浅优先、parent 优先（`ModPrioSorter.java:151-179`）。即「满足全部约束」由 SAT 保证，选择不是简单「满足全部约束的最高版本」，而是带优先级的任一可行解。
- 同 id 至多一个：`Explanation.ErrorKind.UNIQUE_ID`（「Requirement to load at most one mod per id (including provides)」，`Explanation.java:126`）；`selectMod` 重复选中 → `ModResolutionException("duplicate mod %s")`（`ModResolver.java:199-216`）。

**Modrinth 证据**：
- mrpack 无嵌套包概念：`files` 是扁平下载清单（官方 mrpack 规范）。
- 注册表 `dependency_type: embedded` 存在（API 文档），但参考客户端解析器只处理 `Required`，embedded 不自动安装（`theseus/packages/modrinth-content-management/src/install.rs:108-125`）。

**判定：确认（Fabric）/ 无对应（Modrinth）。** 嵌套包递归读取并参与同一求解得到确认；裁决规则与「满足全部约束的最高版本」的表述有差异，需修正我们的口头表述（SAT + 优先级，而非纯最高版本）。

**落点**：
- 规范条款变更 **C3**：`bundles` 语义明确为「嵌套包与主包进入同一依赖图求解、参与同一单实例约束（同 id 至多一）」，并修正「候选裁决 = 满足全部约束的最高版本」表述为「SAT/优先级求解 + 版本降序偏好」（design-r3 求解器规格）。
- 新增测试场景 **T3**：bundle 与主包同 id 冲突（duplicate 等价错误）、嵌套循环、嵌套深度上限。

## 2.4 核验点 4：provides 语义与解析顺序

**基线主张**：EB-D19 只有「符号别名/兼容映射（b: alias of c）」设计选项；无 id 级别名机制。

**Fabric 证据**：
- 官方规范：`provides` 是 mod id 别名数组，「Fabric Loader will treat these IDs as if the respective mods exist. If any other mod uses one of them, it will not be loaded」（https://docs.fabricmc.net/develop/loader/fabric-mod-json#provides）。
- 源码机制：`provides` 解析进 metadata（`V1ModMetadataParser.java:124-125,231-243`）；`ModPrioSorter.sort` 把 provided id 也放入 `modsById` 分组并做重叠 id 优先级浮动（`ModPrioSorter.java:52-74,80-140`）；内置 mod 预选时 `preselectMod` 移除该 id（含 provided id）的全部候选（`ModResolver.java:199-207`）；`selectMod` 对主 id 与每个 provided id 做去重，重复 → `duplicate mod` 硬错（`ModResolver.java:210-216`）。
- 解析顺序：候选先按 root/id/version/nest/parent 排序，再对重叠 provided id 做插入式浮动（`ModPrioSorter.java:35-60` 文档注释 + `80-140` 实现），最终由 SAT 决定；别名被占用（两个候选同 id）时若同时选中即硬错，若一个落选则另一个生效——「提供者不加载」是文档级表述，源码侧对应「同 id（含别名）至多一」。

**Modrinth 证据**：mrpack 与注册表版本元数据均无 provides/别名字段（官方规范 + API 文档，无对应条目）。

**判定：无对应。** 我们没有任何 id 别名机制；EB-D19 的符号别名是不同层级（符号 vs mod id）。Fabric provides 是可引用的 id 级别名先例。

**落点**：
- 规范条款变更 **C4**：design-r3 新增「id 别名（alias of mod id）」候选条目，与 EB-D19 符号别名分层决策；不进入本轮实现。
- 新增测试场景 **T4**：两个提供者同 id → duplicate 等价错误；提供者与真实 mod 同 id → 单实例裁决 + 报告（候选集含别名候选）。

## 2.5 核验点 5：可复现安装——哈希清单与 lockfile

**基线主张**：R1 lockfile（安装期求解产物 + 版本 pin）；EB-D7/D18：安装路径由内容哈希兜底（entrySha256 / manifestSha256 加载期校验）；two-tier §9：社区包 version 纳入 BOM 对账。

**Fabric 证据**：
- 无内容哈希、无 lockfile：mod 目录/classpath 扫描后每次启动重新求解（`FabricLoaderImpl.setup()` → `discoverMods` → `ModResolver.resolve`，`FabricLoaderImpl.java:209-236`）。
- 版本/依赖覆盖是启动参数与配置文件（`VersionOverrides` / `DependencyOverrides`，`FabricLoaderImpl.java:209-232`；`SystemProperties.DEBUG_REPLACE_VERSION`，`SystemProperties.java:86`），非安装期锁定。

**Modrinth 证据**：
- mrpack 规范：`files[].hashes` MUST 含 sha1 + sha512（https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack#hashes）。
- 校验时机：下载后校验 SHA1——不匹配则重试（`FETCH_ATTEMPTS=2`），最终 `HashError(sha1, hash)`，且校验通过前不写盘（`theseus/packages/app-lib/src/util/fetch.rs:355,749-762`）；zip 条目读取时校验 CRC32（`install_mrpack.rs:228-258`）。
- **sha512 只解析不校验**：`PackFileHash::Sha512` 仅出现在 serde 解析（`install_from.rs:52-60`），客户端下载/安装/查询路径全部用 `PackFileHash::Sha1`；第三方启动器行为未核实。
- 无 lockfile：启动路径 `launch_minecraft` 无哈希/依赖复查（`theseus/packages/app-lib/src/launcher/mod.rs` 全文无 sha1/hash 引用）；最接近 lockfile 的是实例数据库对已装文件哈希的记录（`record_project_file` / `cache_file_hash`，`install_mrpack.rs:880-940`），性质是 BOM/对账数据而非锁文件。
- packwiz（外部对照，非 Modrinth 官方）：官方文档确认 `index.toml` 列出文件哈希用于完整性校验；`pack.toml` 含索引哈希形成信任链的细节来自社区仓库说明（https://git.sleeping.town/unascribed/unsup/wiki/commit/4c56377f535e5e39eee94fb564cf41d099141548），未以官方文档核实。

**判定：机制不同 / 部分确认。** mrpack 印证「安装期校验、启动期不重验」；但两生态都无 lockfile。我们「安装期求解 + 加载期 entry 哈希校验 + lockfile pin」是超集；packwiz 的哈希清单是最接近的第三方先例。

**落点**：
- 规范条款变更 **C5**：BOM/报告增加 sha512 + fileSize（mrpack 双哈希先例）；加载期主校验保持 sha256（entrySha256），多算法记录不改校验语义。
- 新增测试场景 **T5**：安装期哈希不匹配 → 不写盘、按策略重试、产出与 `HashError` 等价的失败报告。
- 新增测试场景 **T6**：加载期 entrySha256 漂移 → 走既有 P1-global/P2 路径（回归保护，确保与 T5 的安装期路径区分）。

## 2.6 核验点 6：安装期求解 vs 加载期校验分工

**基线主张**：安装时求解、加载时只验证（R1）；加载/运行期有反应式（EB-N3..N5、EB-D9）。

**Fabric 证据**：无安装期求解；每次启动重解（见 2.5）。严格说与我们「加载不重解」机制不同。

**Modrinth 证据**：
- 安装期：mrpack `dependencies` 应用到实例（游戏版本、loader、loader 版本在 install flow 解析，`install_from.rs:538-600`）；内容安装递归解析 required 依赖并选版（`modrinth-content-management/src/install.rs:14-32`）；文件下载期 SHA1 校验（2.5）。
- 启动期：`launch_minecraft` 路径无依赖重解析、无哈希复查（`launcher/mod.rs:788` 起，全文无 sha1/依赖解析引用）。
- 即「安装时求解、加载时只验证」被印证，且 Modrinth 连加载期验证都没有——校验完全集中在安装期。

**判定：部分确认。** Modrinth 印证安装期求解；Fabric 是「每次启动重解」，与我们机制不同；「加载期只验证」在我们语境还叠加了运行期反应式，超出两个生态。

**落点**：
- 规范条款变更 **C10**：design-r3 写入三段分工前提——安装期求解（对齐 Modrinth）、加载期验证（我们的 entry 哈希 + 前置门）、运行期反应式（独有）；Fabric「每次启动重解」作为对照机制记录。
- 新增测试场景 **T10**：安装期求解失败（required 缺失 / 无兼容版本）→ 中止 + 结构化报告（对齐 Modrinth `NoCompatibleVersion` 语义）。
- 新增测试场景 **T11**：运行中安装新插件并变更依赖、不重启 → 我们的反应式收敛到一致态；作为差异化回归（Fabric/Modrinth 无对应行为）。

## 2.7 核验点 7：失败恢复语义

**基线主张**：P1-global 默认（整体回滚 + 硬告警/报告，EB-D4）；P2 硬约束（INACTIVE + 报告，EB-D2）；三态 disabled > 政策拒绝 > INACTIVE（EB-D16）；dispose/unload 超时强制终止（EB-D21）。

**Fabric 证据**：求解失败 → `FormattedException` 拒绝启动（`FabricLoaderImpl.java:194-205`）；无回滚、无降级、无显式拒绝态；`recommends/conflicts` 仅警告。配置级 override（`DependencyOverrides`）是启动前用户干预，不是运行期恢复。

**Modrinth 证据**：安装失败 = 错误中止 + `InstallErrorContext` 上下文（2.1）；内容更新路径有 `remove_all_related_files` 清理（`install_mrpack.rs:1162-1297`）；解析器对非阻断情况记录 `SkippedReason`（AlreadyInstalled / DuplicateProject / ConflictingDependency / NoCompatibleVersion / MissingVersion，`model.rs:77-83`）——是「跳过/记录」而非「拒绝」。无运行期恢复。

**判定：确认。** 两者都没有运行期失败恢复；「拒绝启动/安装中止」是唯一失败语义。这一确认本身是重要结果：P1-global/P2/三态/超时强制终止都是 mygo 独有设计域。

**落点：无需动作。** 该结论已被 EB-D4/D16/D21 覆盖，不产生新条款或测试；design-r3 将其作为差异化前提引用即可。

## 2.8 核验点 8：未建模校验维度（environment/java 等）

**基线主张**：mygo manifest 无 environment/profile 门、无 java 等价物、无安装路径安全、无 schema 版本字段。

**Fabric 证据**：
- `environment`：`*` / client / server 解析（`V1ModMetadataParser.java:127-132,250-259`）；`loadsInEnvironment` 过滤，不匹配的 mod 进 `envDisabledMods` 而非候选（`V1ModMetadata.java:160-165`；`ModDiscoverer.java:190-215`）；硬依赖指向 env-disabled mod 时报 `envDisabled` 原因（`ResultAnalyzer.java:288-300`）。
- `java`：builtin java mod 参与版本范围校验（2.2）。
- `provides`：见 2.4。
- accessWidener / mixins（含 mixin 级 environment）属加载执行路径，按范围排除。

**Modrinth 证据**：
- mrpack `env`（client/server：required/optional/unsupported）：参考客户端跳过 `client=unsupported` 的文件；optional 文件未提示直接安装（代码内 TODO「Future update: prompt user for optional files」，`install_mrpack.rs:740-755`）。
- mrpack 路径安全：规范明确警告 path 不得 `..`、不得以盘符/`/` 开头（官方 mrpack 规范 #path）；客户端用 `SafeRelativeUtf8UnixPathBuf` 保证相对路径（`install_from.rs:40-46`）。
- mrpack `downloads` URL 白名单：cdn.modrinth.com / github.com / raw.githubusercontent.com / gitlab.com（官方 mrpack 规范 #downloads）。
- mrpack `formatVersion`（当前 1）与 `game`（仅 minecraft）：安装期校验 `game != "minecraft"` → `InputError`（`install_mrpack.rs:531-537`）。
- mrpack `overrides` / `server-overrides` / `client-overrides` 分层：规范定义（官方 mrpack 规范 #overrides）；客户端安装路径提取 `overrides/` 与 `client-overrides/`（`install_mrpack.rs:958-1031`），`server-overrides` 供服务端安装器使用（`list_content.rs:1337` 参与哈希记录，客户端不展开——第三方行为未核实）。
- 注册表版本元数据：`environment`、`dependency_type`（required/optional/incompatible/embedded）、`version_type`、`featured`、`files[].hashes`（sha1+sha512）、`files[].size`（API 文档）。

**判定：无对应。** 上述维度我们在规范中没有；逐条纳入裁决见 §3 反向缺口。

**落点**：规范条款变更 C6/C7/C8/C9（§3 裁决）+ 测试场景 T7/T8/T9（§5）。

## 2.9 核验点 9：单实例约束与多版本候选选择

**基线主张**：R1「同一时刻同 id 唯一版本实例」（EB-D17 矛盾 1 的裁决基础，P1-local 因此删除）。

**Fabric 证据**：同 id（含 provides 别名）至多一个被选中——`UNIQUE_ID` 错误种类 + `selectMod` duplicate 硬错（2.3/2.4）；候选优先级排序 root → id 升序 → **版本降序** → 嵌套浅优先 → parent 优先（`ModPrioSorter.java:151-179`），SAT 保证硬约束。

**Modrinth 证据**：安装解析器按 `date_published` 降序选「最新且匹配 game_versions/loaders」的版本（`theseus/packages/modrinth-content-management/src/install.rs:237-252,287-296`）；已装项目去重（`SkippedReason::AlreadyInstalled`）；计划内重复 → `DuplicateProject` / `ConflictingDependency` 跳过（`install.rs:126-151`）；同一项目更新走文件级替换（`switch_project_version_with_dependencies`，`apply_content_install.rs:227-296`）。

**判定：确认。** 两生态均执行单实例约束，与 R1 不变量一致；选择规则不同——Fabric 版本降序 + SAT 偏好，Modrinth 发布日期降序 + 精确匹配。我们的 lockfile 在安装期固定版本，运行期不重选，语义上更接近 Modrinth 的「安装期定版」。

**落点**：
- 规范条款变更 **C3**（同 2.3）：求解器规格记录两种选择规则作为 design-r3 参照，明确我们的规则 = lockfile 固定 + 冲突时走 P1-global/P2，不引入运行期重选。
- 新增测试场景 **T3/T4**：同 id 多版本候选（bundle/别名场景）的输出与裁决。

## 2.10 核验点 10：运行期反应式

**基线主张**：原生惯性/HMR 链式收敛（EB-N3..N5、EB-D9）；notify 双源（EB-N6/N13）；细 epoch 与统一自动机表述（EB-D10/D15）。

**Fabric 证据**：`FabricLoaderImpl` 有 `frozen` 标志，load 后禁止追加 mod（`FabricLoaderImpl.java:97,112-116,196`）；源码无任何运行期依赖变化响应路径。

**Modrinth 证据**：内容变更全部是显式安装/更新/切换版本操作（`apply_content_install.rs:159-296`，含 `resolve_install_plan` / `install_resolved_content_plan` / `switch_project_version_with_dependencies`）；启动与运行路径无依赖变化监听（`launcher/mod.rs:788` 起无依赖/哈希复查）。

**判定：确认。** 两生态均无运行期反应式；这是 mygo 因 cordis 反应式而独有的设计域，与 EB-D15「同一需求满足自动机的两种粒度」表述兼容。

**落点：无需动作。** 确认性结论，供 design-r3 差异化叙事与 EB-D9/D15 引用；不产生新条款。

## 3. 反向缺口清单（Fabric/Modrinth 有、mygo 规范未覆盖）

每条给裁决：纳入 / 明确不纳入（含理由）。

| # | 机制 | 证据 | 裁决 | 理由 / 落点 |
|---|---|---|---|---|
| G1 | environment（Fabric `*`/client/server）与 mrpack `env`（required/optional/unsupported） | 2.8 | **纳入（体系内硬门；社区只读告警）** | mygo 有 profile（web/headless）概念；体系内 manifest 增加 environment/profile 过滤与 env-disabled 报告原因；社区侧遵守双 tier 永不阻断（告警）。落点 C7 + T7 |
| G2 | java 版本（Fabric builtin java + 范围） | 2.2 | **不纳入（等价物只读报告）** | dsh 是 Node 运行时，无 Java 字节码版本约束；npm `engines.node` 作为报告字段可展示，不校验。 |
| G3 | provides（id 别名） | 2.4 | **纳入为 design-r3 候选** | 与 EB-D19 符号别名分层（id vs 符号）；本轮不实现。落点 C4 + T4 |
| G4 | accessWidener / mixins / entrypoint 环境 | 官方规范 + 范围排除 | **不纳入** | 属 register/load 执行路径，已由 cordis 分析覆盖；mixin 免责条款已在 two-tier §12。 |
| G5 | Fabric `DependencyOverrides` / `VersionOverrides`（配置覆盖） | `FabricLoaderImpl.java:209-232` | **候选纳入（design-r3 评估）** | 与我们的政策覆盖语义对照；本轮不实现，仅记录。 |
| G6 | mrpack `formatVersion` | `install_mrpack.rs:531-537`（game 校验）+ 规范 | **纳入 formatVersion；不纳入 game** | manifest schema 版本校验防解析漂移（我们至今无 schema 版本字段）；`game` 无对应概念。落点 C6 + T9 |
| G7 | mrpack path 安全约束（禁 `..`、绝对路径、盘符） | 官方规范 #path + `SafeRelativeUtf8UnixPathBuf` | **纳入** | 安装期路径校验：manifest/包内路径 MUST 相对、禁 `..`、禁绝对路径；作为安装求解器前置校验。落点 C8 + T8 |
| G8 | mrpack `downloads` URL 白名单 | 官方规范 #downloads | **不纳入** | 包源可信由 npm registry 职责承担；社区侧不引入新阻断。 |
| G9 | mrpack overrides 三层覆盖 | 官方规范 #overrides + `install_mrpack.rs:958-1031` | **不纳入** | 我们无「安装后文件覆盖层」需求；bundle 已覆盖文件分发。若未来需要再评估。 |
| G10 | mrpack fileSize | 官方规范 + `PackFile.file_size` | **纳入（报告信息）** | BOM 记录文件大小与哈希配套，便于进度与对账。落点 C5 |
| G11 | mrpack 双哈希（sha1+sha512 MUST） | 官方规范 #hashes + 客户端仅验 sha1 | **纳入（记录双哈希；校验主 sha256）** | 多算法记录有生态互操作价值；校验语义不变。落点 C5 |
| G12 | 注册表 dependency_type（required/optional/incompatible/embedded） | API 文档 + 解析器只处理 required | **纳入（词表补 optional/recommends；embedded≈bundles 已在）** | incompatible≈breaks、embedded≈bundles 已有对应；optional/recommends 缺失，体系内补词或映射 npm peerDependencies；社区侧 incompatible 对齐双存在检测告警（two-tier §10）。落点 C9 |
| G13 | 注册表 game_versions/loaders 精确枚举匹配 | `install.rs:287-296` | **不纳入** | 我们使用 semver 范围，表达力更强；精确枚举会降低可表达性。 |
| G14 | 注册表 date_published 最新优先选择 | `install.rs:237-252` | **不纳入** | lockfile 安装期固定版本；运行期不重选（与 2.9 一致）。design-r3 记录为参照即可。 |
| G15 | mrpack env optional 交互（对话框选择可选文件） | `install_mrpack.rs:740-755` TODO | **不纳入** | 我们安装期由 lockfile 决定内容；无安装对话框设计。 |

## 4. 规范变更清单（可直接并入 design-r3）

| 编号 | 变更 | 来源 |
|---|---|---|
| C1 | EB-D2/D4 结构化报告增加「候选集 + 建议动作（add/remove/replace）」字段；保留链与回到哪一代 | Fabric `ResultAnalyzer` |
| C2 | core 约束明确 npm semver 范围 + lockfile 精确 pin 覆盖 | Fabric 谓词 / Modrinth 精确枚举 |
| C3 | bundle 语义 = 同一求解 + 单实例约束；裁决表述修正为「SAT/优先级 + 版本降序偏好」 | Fabric jars / ModPrioSorter |
| C4 | 新增 id 别名（alias of mod id）候选条目，与 EB-D19 符号别名分层决策 | Fabric provides |
| C5 | BOM 增加 sha512 + fileSize；加载期主校验保持 sha256 | mrpack 双哈希 |
| C6 | manifest 增加 formatVersion / schema 版本校验 | mrpack formatVersion |
| C7 | manifest 增加 environment/profile 过滤（体系内硬门；社区只读告警） | Fabric environment / mrpack env |
| C8 | 安装期路径安全约束（相对路径、禁 `..`、禁绝对路径/盘符） | mrpack path 规范 + 客户端防护 |
| C9 | 体系内依赖词表补 optional/recommends（或映射 npm peerDependencies）；incompatible≈breaks、embedded≈bundles 显式对应 | Modrinth dependency_type |
| C10 | design-r3 三段分工前提：安装期求解（Modrinth 对齐）→ 加载期验证 → 运行期反应式（独有）；Fabric 每次启动重解作对照 | 2.6 |
| C11 | （可选）`engines.node` 作为只读报告字段，不校验 | Fabric java 等价物 |

## 5. 测试场景清单（可直接并入 design-r3）

| 编号 | 场景 | 对应 |
|---|---|---|
| T1 | 报告渲染：直接断点 + 候选集 + 建议动作 与 完整链共存 | 2.1 / C1 |
| T2 | 版本范围边界：`~`/`^`/`.x`/预发布/构建元数据忽略/非 semver 仅 `=`/`*` | 2.2 / C2 |
| T3 | bundle 同 id 冲突、嵌套循环、嵌套深度上限 | 2.3 / C3 |
| T4 | 别名占用裁决：双提供者同 id → duplicate 等价错误；提供者 vs 真实 mod → 单实例裁决 + 报告 | 2.4 / C4 |
| T5 | 安装期哈希不匹配 → 不写盘、重试策略、失败报告 | 2.5 / C5 |
| T6 | 加载期 entrySha256 漂移 → P1-global/P2 回归 | 2.5 |
| T7 | environment/profile 不匹配：体系内不挂载 + 报告；社区告警不阻断 | 2.8 / C7 |
| T8 | 路径穿越清单：`..`、绝对路径、盘符 → 安装拒绝 | G7 / C8 |
| T9 | formatVersion 不兼容 → 解析错误 + 报告 | G6 / C6 |
| T10 | 安装期求解失败（required 缺失 / 无兼容版本）→ 中止 + 结构化报告 | 2.6 / C10 |
| T11 | 运行中安装新插件并变更依赖、不重启 → 反应式收敛一致态（差异化回归） | 2.6 / 2.10 |

## 6. 未核实项声明

1. packwiz「pack.toml 含 index.toml 哈希的信任链」来自第三方社区仓库说明（unsup wiki），官方文档只确认 `index.toml` 存文件哈希；如需强证据需对 packwiz 源码做独立取证，本轮未做。
2. mrpack sha512 在第三方启动器（如 mrpack4server、packwiz-installer）中的校验行为未核实；参考客户端（Theseus）已确证只解析不校验。
3. Fabric 文档「provides 别名被其他 mod 占用则提供者不加载」的精确裁决依赖文档表述 + 源码「同 id（含别名）至多一」机制；两个候选同时选中时的用户可见行为未做运行实验，源码侧仅确认 duplicate 硬错路径。
4. mrpack `server-overrides` 在参考客户端中不展开（客户端安装路径只提取 overrides/client-overrides）；服务端安装器行为未核实。

## 7. 结论

- 核验清单 1–10 全部执行，无跳过；每条均收敛为三选一（C1–C11 / T1–T11 / 无需动作）。
- 最重要的两个确认：**运行期失败恢复不存在于 Fabric/Modrinth**（P1-global/P2/三态为独有域）、**运行期反应式不存在于 Fabric/Modrinth**（惯性/HMR/细 epoch 为独有域）。
- 最大的机制差异：Fabric 每次启动重解且无哈希/lockfile；Modrinth 安装期求解 + SHA1 校验但启动期不重验；mygo 的「安装期求解 → 加载期验证 → 运行期反应式」是两者之上的超集。
- 反向缺口 15 条全部裁决：纳入 7 项（G1/G3/G6/G7/G10/G11/G12）、候选 1 项（G5）、不纳入 7 项（G2/G4/G8/G9/G13/G14/G15）。
