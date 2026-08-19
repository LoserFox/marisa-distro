# design-r3 实现任务清单（backlog）

> 生成时间：2026-08-11 · 与 [design-r3.md](design-r3.md) 配套。
> 优先级：P0（本阶段先做）/ P1 / P2；每项标注依赖与验收测试（T 编号见 design-r3 §6）。

## P0

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B1 | **manifest 词汇定稿落地（schema v3）** | `manifest-v2.ts` → v3：新增 formatVersion/requires/recommends/provides/symbolAliases/patches/grants/environment(元数据)；`service:` 前缀规范内禁止；旧 `compatibility.requires` 兼容映射（裸键→depends、`service:`→requires）+ 告警；`normalizeCompatibility` 同名键冲突 → manifest-invalid | 无 | T2/T9/T15；vibe-mode 改写样例 |
| B2 | **vibe-mode 参考实现改写** | 把 `dsh.mygo.compatibility.requires` 改写为规范 `depends`+`requires`（design-r3 §2.3），作为首个参考实现 | B1 | T15/T18 |
| B3 | **Proxy 三处裸值发布点改造** | `lifecycle.ts:762/1851/2908/2937-2940` 统一经 `wrapProvidedValue` 发布包装值；原始对象不逃逸；覆盖 ctx.get / ctx.<prop> / ctx.inject 三路径 | 无 | T14 |
| B4 | **exports 冻结（桥接）** | `wrapProvidedValue` 的 Proxy：get 转发+动态符号记录、set 拒绝+政策报告（EB-D8 桥接实现）；直连不包装 | B3 | T14 |

## P1

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B5 | 求解器全序确定性 | 优先级总序（root > id 升 > 版本降 > 嵌套浅 > parent > 来源序 > manifest sha256 tie-break）；同输入两次求解字节级一致断言（**T19 在 B5 落地时立即执行，不推迟到 B17**）；bundles 同图 + 单实例 | B1 | T3/T4/T19 |
| B6 | requires 政策闸（服务粒度） | 运行期服务解析 + 版本/符号关联 + service-missing / provider-version-mismatch / symbol-missing + INACTIVE 自动激活；不进依赖图、安装期不阻断；报告候选集来自 B19 服务提供者观测记录 | B1/B5/B13/B19 | T15/T20 |
| B7 | 结构化报告扩展 | `scope`、`constraint.kind`（pin/requires/symbol/alias）、`generation.from/to`（回到哪一代）、add/remove/replace 建议词汇 | B5/B6 | T1/T10 |
| B8 | dispose/unload 超时与强制终止 | `disposeTimeoutMs`（默认 5000，0..30000，0=立即放弃）；超时 → FAILED + 释放队列 + `dispose-abandoned` 报告；回滚/停用不被阻塞 | 无 | EB-D21/A2 回归 |
| B9 | BOM sha512 + fileSize | lockfile 记录 sha512（hex）+ fileSize；npm integrity（sha512-SRI）解析转 hex；加载期主校验保持 sha256 | 无 | T5/T6 |
| B10 | 安装期路径安全 | entry/bundles.path/patches.file 相对路径、禁 `..`/绝对/盘符；安装期+加载期双重校验；对照模板 verify-self-contained | B1 | T8/T18 |
| B11 | 收割器信号归一 | engines.dsh / cordis peer / @deepseek-ai/dsh-tools peer → core 区间；cordis↔dsh 对照表（锚点 rc.1 ↔ 4.0.1-rc.1 ↔ ^4.0.0-rc.7）；无法映射 → 告警；**外部依赖 EXT-1**：对照表权威来源（vendor 元数据或核心团队） | 无 | T13 |
| B12 | 双存在检测 | npm 依赖嵌套 + requires（canonical）/`service:`（legacy）→ 告警不阻断 | B1/B6 | T12 |
| B13 | 细 epoch + 前置门 | 挂载时导出快照纯内存比较、禁磁盘 I/O、微秒~亚毫秒预算；notify 双源复核 | B3 | T14/T15 |
| B19 | 服务提供者观测记录 | 运行期记录谁在何时 provide 过什么服务（插件 id、服务名、时间、生命周期状态），随 fiber 清理；只读、不阻断，供 requires 报告候选集（design-r3 §2.1 记账机制） | B3 | T15（候选集部分） |

## P2

| # | 任务 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| B14 | bundle patch 展开语义 | `dsh.bundle.patch` → cordis.patch.yml 行展开为 entry 行；政策作用于展开后行；不新设分发层 | B1 | T16 |
| B15 | legacy `dsh.plugin.json` 只读映射 | id/version/main/engines.dsh/contributes/client → 规范字段映射 + 迁移警告（不阻断） | B1 | T16 扩展 |
| B16 | 官方模板对齐工具 | 以 plugin-template package.json 形态为参考的 manifest 生成/校验（mygo init 候选，本轮不实现安装） | B1 | T18 |
| B17 | 测试套件补齐 | T1..T20 全量落地（含确定性 JSON 断言、报告 schema 快照、vibe-mode 参考实现用例） | B1-B16 + B19（全部实现项） | T1..T20 |
| B18 | 文档修订记录 | two-tier-contract.md 追加 Rev-1..6（census 提议）+ design-r3 修订记录；expected-behavior.md 冻结后仅追加 | B1-B17 + B19（全部实现项） | 文档审计 |

## 外部依赖

| ID | 依赖 | 影响 | 未决状态 |
|---|---|---|---|
| EXT-1 | cordis 版本 ↔ dsh 版本对照表权威来源（vendor 元数据或核心团队） | B11 收割器映射精度 | 未定；无法确认时收割器对不可映射 peer 输出「无法归一」告警，不猜测 |

## 顺序建议

B1 → B2/B3 → B4 → B5（含 T19 确定性断言）→ B13/B19 → B6 → B7 → B8/B9/B10 → B11/B12 → B14/B15/B16 → B17/B18。
