# design-r4 实现任务清单（backlog）

> 生成时间：2026-08-12 · 与 [design-r4.md](design-r4.md) 配套。
> 编号接 design-r3-backlog（B1-B19 已完成）；测试编号接 T31（T32+）。
> 优先级：P0（先做）/ P1 / P2；每项标注依赖与验收。
> 纪律：L0-L3 侵入分级 + PATCHES.md 登记；禁新增第三方依赖；冻结文档只追加；
> 确定性断言 MUST 字节级（T19/S2 口径）。

## P0

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B20 | **pack 清单 schema + 校验器（纯函数）** | `mygo-pack/v1`：format/formatVersion/name/version/generated/plugins/lockfile/files/communityDeps/manifestSha256；规范键序语义 JSON；manifestSha256 重算校验；B10 校验 files[].path；formatVersion 不兼容 → pack-invalid | B1（manifest 词汇已落地） | T38/T41 前置 |
| B21 | **确定性打包器（buildPack）** | 从 store 重打包 vendored tarball（排除 `.mygo-package.json`；`tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` + `gzip -n`）；固定成员序（manifest 首位 + `files/<i>.tgz` 按 files[] 下标）；清单 generated.at 归一 `<t>`；工具能力探测（不支持 --sort=name 则报错） | B20 | T32 |
| B22 | **解包 + 前置校验（extractPack）** | 自实现最小 tar 头部解析（node:zlib gunzip + 512B ustar 遍历，typeflag 仅 regular/dir）做成员清单 B10 校验 + 未知成员拒绝（防换行文件名绕过逐行白名单，design-r4 §3）；清单自校验；vendored 文件 sha512+fileSize 校验（先于 store 放置）；staging 隔离目录 | B20 | T34/T35/T38/T41 前置 |
| B23 | **pack 安装器（installPack）** | requests=pack.plugins；pins=pack.lockfile（source 'pack'）；候选=本地 tarball 解析（source 'pack'）；离线禁 registry；`installPackageToStore` 本地 tarball 变体（localTarball + expectedSha512Hex，integrity 透传）；lockfile source 保持 'npm'；加载期校验不变 | B5/B20/B21/B22 | T33/T37/T39/T42 |
| B24 | **pack 报告扩展** | ResolutionReport.code + `pack-invalid`/`pack-hash-mismatch`；scope + `pack`；ConstraintRef.kind + `pack`；全量冲突一次输出；失败原子性（staging/store 零残留） | B7/B22/B23 | T34/T35/T38/T39/T41/T42 |

## P1

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B25 | **社区依赖收割 + 告警（pack 内）** | communityDeps 只读元数据（version/peer 区间复读/dependencies 摘要）；安装时告警不阻断；双存在检测复用 B12/dual-presence | B11/B12/B22 | T36/T40 |
| B26 | **KF-1 裁决落地（分类修正）** | `detectUndeclaredBundles` 增加 npm 声明集合参数（dependencies/peerDependencies/optionalDependencies + 已声明 bundles）；声明内 specifier 不告警；未声明 → 硬错 + 文案带 specifier 与建议；F1 语料 packParts 恢复全量（含 src） | B1 | T43 + F1 全量打包回归 |
| B27 | **公开 API 面** | `PluginPackageManager.buildPack` / `installPack` 公开方法 + 类型导出；service 配置零新增；CLI 命令记录为候选不实现 | B21/B23/B25 | 类型/集成测试 |

## P2

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B28 | **测试套件补齐 + 全量回归** | T32-T43 落地；全量 T1-T31 + T32-T43 全绿（无网 fetch 拦截下）；EB 13/13；typecheck | B20-B27 | 58+ 文件 / 582+T 用例 |
| B29 | **plugin-pack-verification.md** | 场景矩阵（RT1-RT5/T32-T43）+ 实测数据 + 冲突清单（impl-bug/design-gap/fixture-issue 三分类） | B28 | 文档审计 |

## 求解器全序扩展（B23 附属，design-r4 §5）

`PluginCandidate.source` 增加 `'pack'`；`sourceRank` 插在 `pinned` 之后、
`registry` 之前（pack 自包含优先）。对既有非 pack 安装零影响（不存在 pack
候选）；同 id 同版本场景由既有 manifest sha256 字典序兜底，全序保持
（design-r3 §3.1-6 总序在 pack 场景不改变语义）。

## 顺序建议

B20 → B21/B22 → B24 → B23（含 T33 立即跑，不推迟）→ B25/B26 → B27 → B28/B29。

## 外部依赖

无新增第三方依赖；系统 tar/gzip 为既有工具链依赖（package-store 已依赖）。
确定性打包对 GNU tar 选项的依赖已在 B21 做能力探测（design-r4 §5）。

## 候选功能（本轮不实现，仅登记）

- `--allow-partial` 部分安装模式（design-r4 §7）；
- vendored 社区插件 tarball（design-r4 §4）；
- `dsh mygo pack` / `dsh mygo restore` CLI（design-r4 §8）；
- pack 签名/信任链（本轮无密钥基础设施，manifestSha256 仅防意外损坏/篡改可
  检出，不防恶意重建；记录为后续候选）。

## 实现完成状态（Phase B/C 落地，2026-08-12）

| # | 状态 | 验收证据 |
|---|---|---|
| B20 | [OK] | pack schema + 校验器（src/package/pack.ts）；单元 pack.spec（10 用例） |
| B21 | [OK] | buildPluginPack 确定性（T32 两次产物 sha256 相等；30.5/31.7ms） |
| B22 | [OK] | 自实现 tar 头部预检（防换行文件名绕过；T35/T41 + 单元） |
| B23 | [OK] | installPluginPack 离线求解 + 本地 tarball store 安装（T33/T37/T39/T42） |
| B24 | [OK] | 报告扩展 scope pack / pack-invalid / pack-hash-mismatch（report.ts） |
| B25 | [OK] | communityDeps 收割 + 告警 + 双存在（T36/T40） |
| B26 | [OK] | KF-1 分类修正（bundle-scan.ts + package-manager 调用 + T43） |
| B27 | [OK] | PluginPackageManager.buildPack/installPack + 类型导出（index.ts） |
| B28 | [OK] | T32-T43 全绿 + 全量 60 文件/606 用例 + EB 13/13 + typecheck |
| B29 | [OK] | plugin-pack-verification.md（本验证轮文档） |
