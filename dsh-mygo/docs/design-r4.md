# design-r4：mygo plugin pack 分发体系设计定稿

> 生成时间：2026-08-12 · 任务：mygo plugin pack 分发体系（设计 + 实现 + 验证）
> 输入：expected-behavior.md（FROZEN）/ design-r3.md（含 Rev-I1）/ design-r3-backlog.md /
> two-tier-contract.md / ecosystem-verification.md / e2e-verification.md /
> 实现代码 `test-r05En1cU-0811/packages/cordis/mygo/src/package/*`。
> 约束：design-r3 / expected-behavior 正文不改（本轮只新增本文件与 backlog）；
> 新增机制一律标注「新决策」；每条决策引用既有证据编号或显式标注。

## 0. 前置闸门核查（2026-08-12）

1. **破坏测试抽查报告**：闸口轮 M1-M5 已交付并回滚（M1 发现并修复 T22 假绿；
   M2-M5 全部破坏后变红）；登记于 e2e-verification.md §4（fixture-issue #4）
   与 git 提交 `3732249` / `4f7ed64` / `797c920`。本轮不重跑，视为通过。
2. **docs 基线提交存在**：`663eca7`（设计轮+实现轮定稿快照）及后续 docs 提交
   均在 dsh-mygo 仓库；本轮文档变更 = 本文件 + design-r4-backlog.md，`git diff`
   可核验。
3. **重读完成**：ecosystem-verification.md（mrpack 部分：§2.1/§2.5/§2.6/§2.8/
   §3 G6-G15）、design-r3.md §3（BOM/路径安全/三段分工）、two-tier-contract.md
   （§7-§14）、e2e-verification.md（P-0/T21-T31/KF-1）。

## 1. D-A1 格式选型：自建最小格式（mygo-pack/v1）

**决策：自建最小格式，不选 mrpack 超集。** 容器 = tar.gz（与 npm tarball
同构），根含单一清单 `mygo-pack.json`。字段语义借用 mrpack：
`files`（vendored 清单）+ `hashes`（每文件 sha512 + fileSize，C5/G10/G11）+
元数据（name/version/formatVersion/generated）；`formatVersion` 必填
（C6/design-r3 §2.7 先例）。

**不选 mrpack 超集的论证**：
- dsh 是单服务端运行时（design-r3 §2.5 environment 裁决，C7 改写），mrpack 的
  `game`/`env`/`downloads` 白名单/`overrides` 均无对应概念（G6/G8/G9/G13/G15
  已裁决不纳入）；超集只会携带 dead schema。
- 我们与 mrpack 的本质差异在「插件治理」：mygo-pack 携带**求解产物快照
  （lockfile）**，接收方安装期仍走既有求解器（D-A3），这是 mrpack 没有的
  （C5/C10：mrpack 无 lockfile、安装期校验、启动不重验）。
- 零新增依赖：安装路径已依赖系统 tar 解包（`package-store.ts` 的
  `tar -xzf`），打包继续复用系统 tar + gzip（约束：禁用第三方依赖，见任务书
  §3；GNU tar 提供确定性选项，探针见 D-A5）。

**容器与成员布局（新决策）**：

```text
<name>-<version>.mygo-pack        # tar.gz
├── mygo-pack.json                # 唯一清单（成员序固定为第一位）
└── files/
    └── <i>.tgz                   # vendored 插件 tarball（i = files[] 下标）
```

`files/` 成员路径固定为 `files/<i>.tgz`（i 为 files[] 下标，files[] 按
`(id, version)` 字典序排序），不含 id/version 字符，天然避开路径逃逸面；
仍执行 B10 校验（D-A6）。

## 2. D-A2 包内容

**决策：四块内容，config overrides 不纳入。**

```jsonc
{
  "format": "mygo-pack/v1",
  "formatVersion": 1,
  "name": string,
  "version": semver,
  "generated": { "by": "dsh-mygo", "version": string, "profile": string, "at": "<t>" },
  "manifestSha256": string,
  "plugins": [ { "id": string, "packageName": string, "range"?: string } ],
  "lockfile": { /* dsh.lock/v1 语义载荷快照（D-A5） */ },
  "files": [ {
    "path": "files/0.tgz",        // files[] 按 (id, version) 字典序排序
    "pluginId": string,
    "packageName": string,
    "sha512": hex, "fileSize": number,
    "integrity"?: string          // packer 侧 lockfile 记录值（若有），透传保语义载荷
  } ],
  "communityDeps": [ { "name": string, "range": string,
                       "kind": "dependency" | "peerDependency", "owner": string } ]
}
```

- **插件集合声明** `plugins[]`：id + packageName + 可选版本区间；精确钉版由
  `lockfile` 快照承担（pins，R2 §3.1/design-r3 §3.1）。打包器默认生成精确钉版
  （range 省略），允许作者在生成后手写区间；安装期 pin 必须满足声明区间，
  否则 `resolve-failed`（constraint.kind = "pin"，T39）。
- **锁定载荷** `lockfile`：packer 侧 lockfile 的**语义载荷**（时间戳已归一，
  见 D-A5），即 BOM 全量（version/entry/core/depends/breaks/entrySha256/
  manifestSha256/entrySha512/entryFileSize/integrity/packageName/provides/
  bundles/symbols，C5/G10/G11/design-r3 §3.5）。
- **vendored 文件** `files[]`：每插件一个 tarball，sha512（hex）+ fileSize 复用
  B9/C5 口径；安装期先校验后放置（D-A3）。
- **config overrides：不纳入（决策 + 理由）**。mrpack `overrides` 三层覆盖是
  松散文件层，审计盲区（ecosystem-verification §2.8/G9 已裁决「无安装后文件
  覆盖层需求」）；profile 配置属于接收方环境，不随依赖解分发。若未来需要配置
  分发，走 manifest 配置字段或独立配置包，不在 pack 内（新决策，延续 G9）。

## 3. D-A3 安装流：解包 → 哈希校验 → 既有求解 → 加载期校验

**决策：pack 是求解器的输入形态，不是新的加载路径；MUST NOT 绕过既有三阶段**
（安装期求解 → 加载期验证 → 运行期反应式，C10/design-r3 §3.3）。

安装序（全部在 mygo 边界内，L1/L2）：

1. **清单自校验**：读取 `mygo-pack.json`，重算 `manifestSha256`（规范键序
   JSON，D-A5）比对；失败 → `pack-invalid`（scope pack），指认清单。
2. **成员清单前置校验**：**直接解析 tar 头部**（`node:zlib` gunzip +
   512 字节 ustar header 遍历，typeflag 仅允许 regular file/dir）得到精确
   成员名，B10 规则（禁 `..`、绝对路径、盘符；design-r3 §3.4/C8）逐一校验；
   **未知成员拒绝**（不在 `mygo-pack.json` 声明集合内的成员即恶意/损坏）；
   通过后实现直接把已校验成员写入 staging（外容器解包自实现，内存级精确
   控制；系统 tar 仍用于内层插件 tarball 的 store 安装，见 D-A3 步骤 5）。

   **为什么不用 `tar -tf` 文本解析（新决策，实证）**：文件名可合法包含换行，
   实测 GNU tar `tar -tf` 会把一个成员打印成两行——逐行白名单可被
   `mygo-pack.json\nfiles/0.tgz` 这类名字绕过（每行都在白名单内，实际成员
   却不在）。自实现最小 tar 头部遍历零新增依赖（任务书 §3 允许自实现最小
   读写），且只负责成员清单预检；实际解包仍用系统 tar（其 `..`/符号链接
   防护作为第二道防线，见下）。探针：`tar -tf` 换行成员 od 输出
   `./\n./evil\nname.txt\n`（1 成员 → 2 行）；自实现解析同一 pack 精确还原
   `package/`、`package/lib/`、`package/lib/index.js`。
3. **vendored 哈希校验（先于一切 store 写入，mrpack 先例）**：对每个
   `files[]` 条目计算 sha512 + fileSize，与清单比对；任一失配 →
   `pack-hash-mismatch`（scope pack），报告**指认具体文件**（files[].path）。
4. **喂入既有安装期求解（B5）**：requests = `plugins[]`（range 若声明）；
   pins = `lockfile.plugins`（id → 精确版本，source 'pack'）；候选 = vendored
   tarball 解析出的 manifest 约束（source 'pack'，D-A5 附全序扩展）；**离线**：
   本路径禁止任何 registry 请求（RT5 在 fetch 拦截下验证）。
5. **store 安装 + lockfile 写入**：新增本地 tarball 安装变体（
   `installPackageToStore` 扩展 `localTarball` + `expectedSha512Hex`，复用提取/
   manifest/路径安全/事实文件逻辑）；随后加载期校验（verifyAtBoot + pre-gate）
   与普通安装完全一致，MUST NOT 绕过。

**lockfile 语义细节（新决策）**：

- `LockedPlugin.source` 保持 `'npm'`：pack 是传输形态，不是包来源；否则接收侧
  与 packer 侧 lockfile 语义载荷不等（RT1 会红）。
- `packageName` 取自 pack 声明，安装时与 tarball 内 package.json name 核对，
  不一致 → `pack-invalid`。
- `integrity`（若有）由 pack 透传写入 lockfile，**不重算**：接收侧校验以
  `files[].sha512` 为准；透传只为保持语义载荷逐字节一致（S2/T22 口径）。

## 4. D-A4 双层语义（体系内 / 社区共存）

**决策：沿用 two-tier §7-§13 分层，pack 内同样双轨。**

- **体系内插件**（pack 主载荷）：桥接路径 + mygo manifest，受依赖图全套约束：
  安装期求解、lockfile、pins、符号前置门、exports 冻结、反应式编排、结构化
  报告（two-tier §7/§8 全 [OK] 列）。
- **社区依赖**（`communityDeps[]`，npm 语义）：仅元数据收割——version 纳入
  对账与报告、peerDependencies 中 dsh 核心区间复读比对（不满足 → 告警）、
  dependencies 摘要仅展示（two-tier §9 三原则：只读、告警级、永不阻断）。
  安装时输出告警但 MUST NOT 阻断（RT4）。
- **边界声明（新决策）**：本轮 pack 不承载社区插件可执行文件——mygo 不编排
  npm 安装（two-tier §8 社区行担保为「—」，由 npm/pnpm 原生解析）；vendored
  社区 tarball 记录为候选功能，不进入本轮。
- **双存在检测**：pack 安装时复用 B12/dual-presence——同一包既以插件身份被
  注册、又以 npm 依赖身份嵌套存在（含 communityDeps 声明）→ 告警不阻断
  （two-tier §10，T40）。

## 5. D-A5 确定性（接收侧 + 打包侧双口径）

**接收侧（S2 口径延伸）**：同一 pack 两次安装 → lockfile **语义载荷**逐字节
一致；语义载荷 = lockfile JSON 且 `generated.at` 归一为 `'<t>'`
（T22/S2 现有 normalize 口径，e2e-verification §2 T22）。同一 pack 字节 →
相同 candidates/pins/requests → B5 全序唯一解 → 相同 store 内容哈希 →
相同 lockfile。

**打包侧（新决策）**：

- vendored tarball 由 store 目录确定性重打包：`tar --sort=name --mtime=@0
  --owner=0 --group=0 --numeric-owner` + gzip 无时间戳（实现用 Node
  `zlib.gzipSync`，gzip 头不嵌文件名/时间戳，与 `gzip -n` 同归一语义）；**排除
  `.mygo-package.json`**（其 `installedAt` 是时间戳，包含会使重打包字节漂移）。
- 成员序固定：`mygo-pack.json` 第一位，`files/*` 由 tar `--sort=name`
  按路径字典序排列（确定性；files[] 数组的 `(id, version)` 排序与成员顺序
  解耦）。
- 清单不嵌入时间戳：`generated.at` 固定归一 `'<t>'`；`manifestSha256` 对
  规范键序的语义 JSON 计算（同 S2 修复口径：「确定性键序」，e2e-verification
  §4 impl-bug #1）。
- 实证探针（2026-08-12）：同一目录两次
  `tar -cf --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` +
  `gzip -n` 输出 sha256 完全一致（`25da7865…` ×2 / `a4e80dcf…` ×2）。

**约束记录**：确定性依赖系统 tar 为 GNU tar（本机 1.35）；bsdtar/Windows
变体选项行为未核实——实现时在打包器内做工具能力探测（`--sort=name` 支持检查），
不支持则报错而非产出不确定产物（新决策）。

## 6. D-A6 路径安全（B10 扩展）

**决策：B10 规则（design-r3 §3.4/C8）从 manifest 路径扩展到 pack 全链路。**

校验点与时机：

| 校验点 | 规则 | 时机 |
|---|---|---|
| tar 成员名（`tar -tf` 清单） | 相对、禁 `..`/绝对/盘符；未知成员拒绝 | 解包前 |
| `files[].path` | 同 B10 + 只允许 `files/<i>.tgz` 形态（i 为非负整数下标） | 清单解析时 |
| vendored tarball 内 entry/bundles/patches | 既有安装期校验（B10 双重执行） | store 安装时 |
| store 目标目录 | `packageDir` 内（assertInside 复用） | rename 前 |

实证（2026-08-12，GNU tar 1.35）：

- `..` 成员：`tar -xf` 硬拒，RC=2（`Member name contains '..'`），不落地；
- 符号链接 + 子路径成员：`tar -xf` 拒写，RC=2（`Cannot open: Not a directory`），
  不逃逸；
- 绝对路径成员：tar 默认剥离前缀（RC=0，警告）——**不构成硬拒**，因此前置
  清单校验 MUST 主动拒绝，不依赖 tar 行为（bsdtar/Windows 未核实，同上）。

RT3 测试覆盖：`..`、绝对路径、盘符、符号链接子路径、未知成员（T35/T41）。

## 7. D-A7 失败语义：整体拒绝（默认）

**决策：pack 内任一校验失败（清单哈希、文件哈希、路径逃逸、manifest 无效、
求解失败）→ 整体拒绝，无部分安装；报告复用 B7 schema，scope 增加 `pack`。**

理由：

- pack 是单一可复现产物，部分安装产生无法从该 pack 复现的状态；
- mrpack 安装失败 = 错误中止先例（ecosystem-verification §2.1）；
- 报告一次输出全部冲突（R1 §11/design-r3 §4.6），供接收方一次性修复。

报告扩展（新决策，B7 schema 追加而非改写）：

- `ResolutionReport.code` 增加 `'pack-invalid' | 'pack-hash-mismatch'`；
- `scope` 联合增加 `'pack'`；
- `ConstraintRef.kind` 增加 `'pack'`；`ConflictEntry.plugin` 用 `'<packName>'`，
  `target` 指认 `files[].path` 或 `mygo-pack.json`；
- 失败原子性：staging 与 store 零残留（断言测试 T42）。

部分安装模式（`--allow-partial`）记录为候选功能，本轮不实现。

## 8. 命令面与 API（新决策）

- 本轮实现程序化接口：`PluginPackageManager.buildPack({ output, … })` 与
  `PluginPackageManager.installPack(packPath, …)`；service 配置不加新字段
  （registry 注入已存在，pack 路径离线）。
- 用户可见命令（`dsh mygo pack` / `dsh mygo restore`）记录为候选功能（同
  mygo init 叙事，two-tier §13），本轮不实现；RT1-RT5 经 API + E2E 验证。

## 9. KF-1 裁决（D-A8）：bundle-scan 扫描范围

**背景**：KF-1（e2e-verification §4）待 design-r4 裁决；F1 打包含 src 时触发
「@deepseek-ai 未声明」告警，E2E 以只打包 lib 绕开。

**裁决：保持整包扫描（防夹带），但修正分类规则——按 npm 元数据声明分类**
（超出 KF-1 原文 (a)/(b) 二选一的第三路线，Phase B 动工前需用户确认）。

规则：

- `@deepseek-ai/*` import 的 specifier（按包名归一：scoped 取前两段、普通取
  第一段；子路径 import 归到其包名）若 ∈ package.json 的
  `dependencies / peerDependencies / optionalDependencies`，或 = 插件自身
  npm 包名（自身子路径引用），或 ∈ 已声明 `bundles` → **不算未声明**
  （普通 npm 依赖/自引用，two-tier §9 只读观察）；
- 否则（无任何声明）→ 维持硬错，文案带上 specifier 与建议：「在 npm 依赖/
   peer 声明该包，或经 dsh.mygo.bundles 声明内嵌包」。

理由与证据：

- F1 `package.json` peerDependencies 已声明其 src imports 的
  `@deepseek-ai/dsh-client-ui-command`、`dsh-client-ui-slots` 等；当前
  `detectUndeclaredBundles`（bundle-scan.ts:154-155）忽略 npm 声明，把
  「插件自己的、已声明 npm 依赖的源码」误判为「求解器不可见的内嵌包」。
- bundle-scan 的目的是抓**求解器不可见的内嵌包**（bundle-scan.ts 模块注释）；
  npm 声明依赖是求解器可见（npm 元数据）且属社区/直连观察域，不属该目的。
- 不收窄扫描范围：入口可达性分析是新机制且有 A11 同类盲区（动态 require/
  动态 import），整包扫描保留夹带检测力；分类修正零盲区代价。
- 与 pack 的关联：pack 重打包 store 全目录，若插件发布含 src 且 import 已声明，
  当前规则会硬失败阻断 pack 分发；修正后恢复可用，F1 语料可回全量打包
  （packParts 不再需要绕开 src）。

## 10. 故障分类学（沿用第三轮纪律）

- impl-bug：直接修；
- design-gap（design-r4 与现实冲突）：冲突上报，禁自行变通；
- 与 design-r3 / expected-behavior 冻结条款冲突：立即停（冻结基线问题）。
- 新增三处「新决策」扩展（source 'pack' 排序、报告 schema 追加、KF-1 分类
  修正）均不触碰冻结正文；若评审认为越界，属 design-gap，按上报处理。

## 11. 测试计划（T32+，编号接 design-r3 §6 / e2e §2）

| # | 场景 | 关键断言 | 承载 |
|---|---|---|---|
| T32 | 打包确定性 | 同一 store 两次 buildPack → pack 文件 sha256 相等 | RT 前置 |
| T33 | RT1 往返 | F1/F3/F4 + F2(dsh-tool-time) 打包 → 全新 profile 安装 → 两侧 lockfile 语义载荷逐字节一致（generated.at 归一） | RT1 |
| T34 | RT2 篡改 | vendored 单字节翻转 → pack-hash-mismatch 指认文件；manifest 翻转 → manifestSha256 失配 | RT2 |
| T35 | RT3 路径穿越 | `..`/绝对/盘符/符号链接子路径/未知成员 → pack-invalid + 零逃逸 | RT3 |
| T36 | RT4 社区混合 | communityDeps 告警可见、安装完成不阻断 | RT4 |
| T37 | RT5 离线分发 | fetch 拦截下本地文件拷贝 pack 安装成功 | RT5 |
| T38 | formatVersion 不兼容 | → pack-invalid | D-A1 |
| T39 | pin 与声明区间冲突 | → resolve-failed（kind pin，scope pack） | D-A2 |
| T40 | pack 内双存在 | 告警不阻断（B12 复用） | D-A4 |
| T41 | files[].path 逃逸 | → pack-invalid | D-A6 |
| T42 | 整体拒绝原子性 | 一坏多好 → 全部拒绝、store 零写入、全量冲突 | D-A7 |
| T43 | KF-1 回归 | F1 全量打包（含 src）不再误伤；未声明 specifier 仍硬错 | D-A8 |

## 12. 自验收（对照任务书）

| 任务书章节 | 本文件 | 覆盖 |
|---|---|---|
| 前置闸门 1-3 | §0 | [OK] |
| D-A1 格式选型 | §1 | [OK] |
| D-A2 包内容 + overrides 裁决 | §2 | [OK] |
| D-A3 安装流三段 | §3 | [OK] |
| D-A4 双层语义 + 双存在 | §4 | [OK] |
| D-A5 确定性双口径 | §5 | [OK] |
| D-A6 路径安全 + zip-slip 类测试 | §6 | [OK] |
| D-A7 失败语义 + 报告扩展 | §7 | [OK] |
| KF-1 裁决（e2e 指定 design-r4 裁决） | §9 | [OK] |
| 输出：design-r4-backlog.md | 见 [design-r4-backlog.md](design-r4-backlog.md) | [OK] |

## 13. 修订记录

| 修订编号 | 日期 | 原因 |
|---|---|---|
| Rev-P1 | 2026-08-12 | communityDeps 字段定型为 `{name, range, kind, owner}`：pack 构建面（store）不含 node_modules，社区依赖只记录 package.json 声明区间与来源，不虚构已装版本。 |
| Rev-P2 | 2026-08-12 | 外容器解包改为自实现（已预读内存 + 精确成员集校验后写盘），系统 tar 仅保留给内层插件 tarball 的 store 安装（既有路径）；gzip 用 Node zlib.gzipSync（与 gzip -n 同归一语义）。 |
| Rev-P3 | 2026-08-12 | KF-1 分类规则补充：specifier 按包名归一（子路径归包名），插件自身 npm 包名（自引用）不属未声明；F1 src 全量打包实证（src 自引用 + 已声明 peers 通过）。 |
| Rev-I1 | 2026-08-12 | Phase B/C 落地：B20-B29 全部完成，T32-T43（24 项）全绿，全量 60 文件/606 用例 + EB 13/13 + typecheck；详见 plugin-pack-verification.md。 |
| Rev-P4 | 2026-08-12 | 求解来源序以实现为准修正：`resolver.ts sourceRank` 实为 `pinned > registry > locked > bundle > 其他`（pack 候选归「其他」，rank 4）；pack 安装的精确版本经 `pins`（rank 0）生效。design-r4-backlog.md「求解器全序扩展（B23 附属）」段所称「sourceRank 插在 pinned 之后、registry 之前」与实现不符，该段描述以实现为准（DEV-GUIDE §3.1 已按实现表述）。 |
