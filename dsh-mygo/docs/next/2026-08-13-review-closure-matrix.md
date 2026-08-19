# 两评审全条目闭环矩阵（修复批次 4 交付）

> 日期：2026-08-13 ｜ 收工 HEAD：批次 4 提交（见 §5）
> 覆盖：review#2（本仓库独立审查报告 A1-A18 + B 区 + 追加验证 items 0-11）、
> review#1（按任务书引用 + 用户簿记勘误口径）、DG-1/2/3、批次 1-3 回议项。
> 状态词汇：已修（批次+commit）/ DG-3 文档批 / 登记-deferred（登记位置）/
> 证伪（证据指针）。

## 1. review#2 A 区（独立审查报告）

| # | 内容 | 终态 |
|---|---|---|
| A1 | requires 门标签-only | 已修：批次 2 `250a598`（policyStop/policyStart 执行面 + policyReportOf；DG-1 裁决=impl-bug） |
| A2 | 细 epoch 前置门无 reload 消费 | 已修：批次 2 `250a598`（verifyConsumerSymbolsAfterReplace；回议裁决 1 保留双检） |
| A3 | requires/symbolAliases 重启丢失 | 已修：批次 3 `340670c`（LockedPlugin 增补 + loadEntry 还原） |
| A4 | pack 还原到非空 profile 失败 + 部分写 | 已修：批次 1 `2e338c2`（消费侧过滤 + 1:1 预检 + 回滚） |
| A5 | pack JSON 裸抛 / pin 空指 cast | 已修：批次 1 `2e338c2`（JSON 包裹）+ 批次 4（resolver 不编造零约束候选 + package-manager 去 cast） |
| A6 | 内层 tarball 依赖系统 tar 单实现 | 登记-deferred → 本批关闭（任务 4.7）：design-r4 §6「第二道防线」裁决 + 批次 1 §3.5 登记落点齐全 |
| A7 | gunzip/成员数无上限 | 已修：批次 1 `2e338c2`（256MiB / 10000） |
| A8 | T39 冲突条目 kind 错位 | 已修：批次 4（resolver kind:'pin' 口径 + T39 断言 kind） |
| A9 | entrySha512 语义张冠李戴 | 已修：批次 3 `340670c`（DG-2 拆字段） |
| A10 | BOM sha512/fileSize 运行期缺位 | 已修：批次 3 `340670c`（attachBomFacts + 链测试） |
| A11 | Proxy 冻结不完整（defineProperty 等逃逸）+ symbol 记录缺口 | 已修（记录面）：批次 4 任务 4.2（defineProperty/has/ownKeys/getOwnPropertyDescriptor/symbol 入记录）；冻结缺口按 DG-3(a) 裁决不新增拒绝 → 登记（docs/next 本矩阵 §3） |
| A12 | 畸形 lockfile 崩溃 | 已修：批次 3 `340670c`（形状校验 + 显式 lockfile-mismatch） |
| A13 | 服务名别名映射方向无效（死代码） | 已修：批次 2 `250a598`（reconcile 重写时移除） |
| A14 | provide() 空 disposer | 已修：批次 2 `250a598`（removeProvidedValue） |
| A15 | 访问记录无归属 + 跨消费者泄漏 | 已修：批次 2 `250a598`（pluginId 归属 + 按代修剪；批次 4 补 traps 完整性） |
| A16 | captureExports 自有键 constructor 过滤 | 已修：批次 2 `250a598`（自有层全量 + 原型层过滤，镜像双测） |
| A17 | localeCompare 跨 locale 不确定性 | 坐实 + 已修：批次 4 任务 4.3/4.6（ICU 探针 tr=1/en=-1 + compareCodePoints 全库替换） |
| A18 | 空 pack 静默覆写（原预判） | 已修：批次 1 `2e338c2`（显式拒绝）；覆写路径经 A4 修复后被预检拦截 |
| A19 | grants 缺位（新增，冻结文档分叉） | DG-3 域：DG-3(a) 已裁决 grants 永久移除；文档轮待办（design-r3 修订记录 + DEV-GUIDE §8 + error.ts 组 6 注释） |

## 2. review#2 B 区 + DG + 验证 items

| # | 内容 | 终态 |
|---|---|---|
| B1 | tsdown 配置 6 份近似拷贝 | 登记-deferred：构建工具链变更需独立构建验证轮（本批验收不含 build 门禁）；登记位置=本矩阵 §3 |
| B2 | DEV-GUIDE PATCHES #1 过期引用 | 已修：`cd6f644` |
| B3 | error.ts「42 codes」/ 组数口径（43 码 6 组） | DG-3 文档批（error.ts 头注释属 mygo-api 包，批次 4 约束 4 零改动；DEV-GUIDE §7 + mygo-api-surface.md 同步归文档批） |
| B4 | dispose-timeout 死码 / policy-rejected 无生产者 | policy-rejected 已修：批次 2（真实生产者）；dispose-timeout 维持不构造（批次 2 任务书 + 裁决记录登记）→ 登记-deferred |
| B5 | resolveInstall/preview 重复 + validateLockfileShape 重复 | 后者已修：批次 3（统一收口）；前者登记-deferred（重构风险，无行为缺陷） |
| B6 | 测试质量（弱断言/假绿） | 已修：批次 2（T23-T25 行为断言 + 断线测试）+ 批次 3（BOM 链测试）+ 批次 4（T39 kind、pin 口径、locale 陷阱、Proxy 记录） |
| B7 | 错误处理一致性（裸 throw） | 已修：批次 1（JSON 包裹 + store 安装 try/catch 回滚）+ 批次 3（形状校验显式化） |
| B8 | 类型纪律（as 断言等） | 部分已修（批次 4 去 pin cast）；其余登记-deferred（低危） |
| B9/B10 | 注释真实性（entrySha512 语义 / INACTIVE 注释） | 已修：批次 2 + 批次 3（随实现同步改写） |
| B11 | legacy compatibility 数组区间静默丢弃 | 登记-deferred（manifest-v2 兼容层，无消费者报告需求） |
| B12 | DEV-GUIDE §8 grants 把关矛盾 | DG-3 文档批 |
| DG-1 | 标签-only 定性 | 已裁决（impl-bug HIGH）+ 已修：批次 2 |
| DG-2 | entrySha512 拆字段 | 已裁决 + 已修：批次 3 |
| DG-3 | grants 语义 | 已裁决 DG-3(a)（grants 永久移除；Proxy=记录面）；文档批待办 + mygo-api 演进候选（同会话 BOM 即时填充，批次 3 回议裁决 2） |
| 验证 items 0-11 | 逐条坐实结论 | 全部已修（item 0-1→批次 2；item 2/5-7/9→批次 1；item 3-4→批次 2；item 8→批次 2+4；item 10→cd6f644；item 11→DG-3 域） |

## 3. review#1 条目（按任务书引用 + 用户簿记勘误；库内无 review#1 原文）

| # | 内容（出处） | 终态 |
|---|---|---|
| A1 | requires-gate.ts:61 原型键污染（批次 2 任务书 2.5） | 已修：批次 2 `250a598`（hasOwn + null-prototype 聚合 + 镜像双测） |
| A2 | Proxy traps 逃逸（批次 2 排除项 → 批次 4 任务 4.2） | 已修：批次 4（记录完整性口径，无新增拒绝；约束 3 对照证据见批次 4 报告 §2） |
| A3 | 权限字段项（用户勘误，DG-3 域） | DG-3 域：DG-3(a) 已裁决；9 个声明字段零执行面由裁决吸收 |
| A4 | pack 非空 profile（批次 1 任务书引用） | 已修：批次 1（= review#2 A4 同源缺陷） |
| A5 | pack JSON（批次 1 任务书 1.4） | 已修：批次 1 |
| A6 | 系统 tar 单实现（批次 1 任务书边界 3） | 登记-deferred → 本批关闭（任务 4.7） |
| A7 | gunzip 上限（批次 1 任务书 1.3） | 已修：批次 1 |
| A8 | T39 kind（批次 4 任务 4.5 引用验证 item 8） | 已修：批次 4 |
| A9 | assertInside 项（用户勘误提及） | 指向复核：库内无原文；assertInside（package-store.ts:47-53）经批次 1-3 审查未见缺陷；若 review#1 A9 另有指向以原文为准 → 登记「待对照原文」 |
| A10 | integrity 项（用户勘误提及） | 同上：integrity 解析/透传已由批次 3 tarballSha512 归位；登记「待对照原文」 |
| A11 | localeCompare（批次 4 任务 4.3 锚，semver-range.ts:112） | 已修：批次 4（= review#2 A17 同源） |
| A12 | 畸形 lockfile（批次 3 任务书引用；用户提示复核指向） | 按批次 3 交付口径=畸形 lockfile → 已修：批次 3；原文缺失，若另有指向以原文为准 |
| A13-A15 | 原文缺失，无任务书引用 | 登记「待对照原文」：对应缺陷簇已由批次 1-3 覆盖（列 review#2 同源条目） |
| A16 | fine-epoch.ts:34-37 自有键过滤（批次 2 任务书 2.5） | 已修：批次 2 |
| A17/A18 + B 区 | 原文缺失 | 登记「待对照原文」 |

## 4. 批次回议项终态

- 批次 1 回议：① 同版本不同内容冲突——登记-deferred（批次 3 恢复路径已用 rollback 兜底；语义裁决待用户）；② 空 pack 时机——已按批次 1 交付口径落地，无新动作；③ A7 gzip 实际值不可测——维持诚实声明；④ batch9 /tmp 路径——**已修：批次 4 任务 4.8**；⑤ 用户侧 doc 修订——维持外部项。
- 批次 2 回议 1-5：全部裁决入档（`996c1ce`）。
- 批次 3 回议 1-3：全部裁决（本批任务书）：① 旧 pack 连带拒绝维持；② 同会话 BOM 暂缓（mygo-api 演进候选）；③ attachBomFacts 静默跳过维持。

## 5. 提交清单

- 批次 4 修复提交：见批次 4 交付报告 §提交清单。
- 本矩阵为 docs/next 工作备忘录（非冻结文档）。

## 6. 未竟登记（deferred 汇总，供后续轮领取）

1. B1 tsdown 共享化（构建验证轮）。
2. B3/B12 + DG-3 文档批（design-r3 修订记录、DEV-GUIDE §7/§8、error.ts 头注释、mygo-api-surface.md）。
3. B4 dispose-timeout 死码（或未来实现 EB-D21 报告面）。
4. B5 resolveInstall/preview 去重重构。
5. B8/B11 类型/兼容层低危项。
6. A11 冻结缺口（defineProperty 逃逸）：DG-3(a) 裁决后维持记录面口径，不做拦截。
7. review#1 原文缺失条目（A9/A10/A12-A15/A17/A18/B 区）：对照原文后复核指向。
8. 批次 3 回议 2（同会话 BOM 即时填充）= mygo-api 演进候选。
