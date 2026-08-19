# 双 tier 契约（体系内插件 / 社区插件）

> 生成时间：2026-08-11 · 与 expected-behavior.md（FROZEN）配套。
> 本契约定义两种插件的分层、担保边界、元数据收割原则与迁移叙事。

## 7. 分层定义

- **体系内插件（in-system）**：走 mygo 桥接路径 + 携带 mygo manifest
  （id/version/entry/depends/breaks/core/bundles/loader/patches/grants）。
  受依赖图全套约束：安装期求解、lockfile、pins、符号校验、加载门、反应式
  编排、结构化报告。
- **社区插件（community）**：走直连路径 + 仅有 npm 元数据（package.json
  name/version/main/peerDependencies/dependencies），由原生 loader 直接加载。
  mygo 不做任何阻断性介入，只提供只读观察与告警级信息。

## 8. 担保矩阵

| 担保项 | 体系内插件 | 社区插件 |
|---|---|---|
| 安装期求解 / lockfile | [OK]（mygo 控制面） | —（npm/pnpm 原生解析） |
| depends/breaks 硬阻断 | [OK]（插件图约束） | —（仅 npm peer 告警，见 §9） |
| 符号前置门（细 epoch / reload 校验） | [OK] | — |
| exports 冻结 / Proxy 包装 | [OK]（桥接路径强制，EB-D8） | —（契约外行为，后果自负） |
| 运行期反应式启停 | [OK]（原生惯性 + mygo 政策闸） | [OK]（原生反应式直接享有） |
| 状态观察 / 报告可见 | [OK]（BOM 对账 + fiber 内省 + 结构化报告） | [OK]（只读观察：fiber 状态、BOM 版本/peer 告警） |

> 社区侧仅有“运行期反应式启停”与“状态观察/报告可见”两项为 [OK]，其余不担保。

## 9. npm 元数据收割（社区侧，只读 / 告警级 / 永不阻断）

三原则：

1. **只读**：mygo 只读 npm 元数据，不写不改；
2. **告警级**：所有发现以告警输出，永不阻断加载或运行；
3. **永不阻断**：任何元数据问题都不影响社区插件挂载。

具体收割：

- `package.json.version` MUST 纳入 BOM 对账与报告（版本漂移可见）；
- `peerDependencies` 中对 dsh 核心的区间声明 MUST 在加载观察时复读，与当前
  核心版本比对，不满足时输出告警（不阻断）；
- `dependencies` 摘要仅作报告信息展示，不参与任何校验。

## 10. 双存在检测（告警级）

发现同一包既以插件身份被 loader 注册、又以 npm 依赖身份嵌套存在于某插件
node_modules 时：

- MUST 输出警告（重复实例风险：双份模块实例、单例身份分裂）；
- MUST NOT 阻断。

## 11. 直连路径永久支持承诺

任何版本 MUST NOT 强制社区插件迁移至桥接路径，也不得强制要求 mygo
manifest。直连路径是永久一等路径，不是过渡态。

## 12. mixin 免责条款

未纳入 mygo 编排的 AST 改写行为（社区侧自带的 transform/loader hook）不受
mygo 的 patch 时机、冲突检测、顺序确定性任何担保；此类行为后果自负，且
mygo 结构化报告不覆盖其失败。

## 13. 迁移路径叙事

- **入体系 = 增量补词汇，不重写声明**：在 npm 元数据之上补充 mygo 词汇
  （breaks、插件图 depends、符号声明、grants、loader 字段），原有
  package.json 声明保持不变。
- **mygo init（候选功能，本轮不实现）**：从 package.json 生成 manifest
  骨架，含 `peerDependencies → core` 字段映射；仅记录为后续候选，不进入
  本轮交付。

## 14. 修订记录（实现轮追加，正文不改）

| 修订编号 | 日期 | 原因 |
|---|---|---|
| Rev-I1 | 2026-08-11 | design-r3 实现轮（B1-B18）落地确认：Rev-1..6 的契约修订由 B11（harvester 信号归一：engines.dsh / cordis peer / @deepseek-ai/dsh-tools peer → core 区间，EXT-1 锚定）、B12（双存在检测：npm 嵌套 + requires/service: 需求，告警级）、B15（legacy `dsh.plugin.json` 只读映射）、B16（官方模板对齐工具）承接；三原则（只读/告警级/永不阻断）在实现中保持。 |
| Rev-I2 | 2026-08-12 | **mygo-api 生态接口边界登记**（正文 §7-§13 不改）：契约层（`@deepseek-ai/dsh-mygo-api`，Cordis-free）/ 实现层（`@deepseek-ai/dsh-mygo`）/ 外部消费者三边关系——外部工具 SHOULD 只依赖契约层，不直触实现层；契约层与实现层同版本线同节奏（rc.1），公共类型面 semver 内只增不删。错误词汇分叉登记为候选决策 CD-1（PluginError 43 码 throw 面 vs ResolutionReport 报告面；建议倾向：挂载期/治理期失败走报告、运行时能力拒绝走 PluginError，待独立小轮裁决），详见 docs/next/2026-08-12-mygo-api-surface.md §10。 |

> 正文（§7-§13）仍为 frozen 契约；实现细节以 design-r3 与实现代码为准。
