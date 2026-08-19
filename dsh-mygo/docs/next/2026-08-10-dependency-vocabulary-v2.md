# Agent Note: Fabric 五级依赖词汇 + 传递闭包（P1 提案）

Status: 已实现（2026-08-10：本地 400 用例全绿 + lib/面板构建通过；3080 未部署验证）

把 mygo v1 的 `requires`/`breaks` 两硬级扩展为 Fabric 五级词汇
（`depends` / `recommends` / `suggests` / `conflicts` / `breaks`），
并把依赖检查从扁平集合升级为**硬边传递闭包**，同时引入从组合事实派生的
**软冲突警告**。本提案只做校验与报告（check-only），不选版本、不自动启停、
不自动升级；激活求解与替代目标（provides）留给 P2。

## 0. 目标

1. 插件作者能表达完整的依赖关系：硬正（必须依赖）、硬负（必须互斥）、
   软正（推荐/建议）、软负（声明不兼容）——与 Fabric `ModDependency.Kind`
   的 positive/soft 双轴对齐。
2. `depends` 沿依赖图传递：A depends B、B depends C ⇒ A 的激活要求 C。
   违例报告给出完整约束链（Fabric `ResultAnalyzer` 思路），而不是只报
   “A 缺 C”这种丢失中间信息的单边错误。
3. 从组合事实派生“可能不兼容”警告（provider 重复、patch 行重叠），
   让未声明的坏组合也能被发现，同时保留“声明优先”的升级路径。
4. 存量兼容：`requires` 保留为 `depends` 别名，现有插件零迁移。

## 1. 词汇语义

五种 kind 用两个正交轴定义（与 Fabric `ModDependency.Kind` 一致）：

| kind | 轴 | 检查对象 | 违例效果 |
|---|---|---|---|
| `depends` | 硬正 | 目标已启用且版本满足 | 阻塞（install/enable/replace）或级联禁用（reconcile） |
| `breaks` | 硬负 | 目标已启用且版本命中区间 | 阻塞或级联禁用 |
| `recommends` | 软正 | 目标缺失 / 版本不满足 | warning，不阻塞 |
| `suggests` | 软正 | 同上 | warning（弱于 recommends，仅 UI/文案分级） |
| `conflicts` | 软负 | 目标已启用且版本命中区间 | warning（声明的不兼容） |

关键语义决策：

- **硬边检查 enabled 集合，不是 installed 集合**。停用的插件不提供能力，
  因此 `depends` 命中“已安装但停用”的目标时是违例，但消息必须区分三种状态：
  `missing`（未安装）、`installed-disabled`（已安装但停用，提示“先启用”）、
  `version-mismatch`（已启用但版本不满足）。P2 激活求解会把
  `installed-disabled` 变成自动连带启用，P1 只拒绝并给链。
- `breaks`/`conflicts` 对“已安装但停用”的目标不算命中。
- 软边（recommends/suggests/conflicts）**不传递、不参与硬闭包**，只做单层
  检查——与 Fabric 一致，也避免软依赖把激活图变成不可判定的偏好问题。
- `breaks` 不传递：只检查被检查者与目标两者同时激活的情况。但
  `A depends B` 且 `B breaks A` 是直接矛盾，必须报告为双边链
  （`A depends B`，`B breaks A`）。
- 版本范围复用 `semver-range.ts`；`"*"` 表示任意版本。

## 2. Schema

### 2a. Manifest（package.json 的 `dsh.mygo` 段）

```jsonc
{
  "dsh": {
    "mygo": {
      "compatibility": {
        "depends":    { "dsh-base": ">=0.4.0", "dsh-vision": "^1.2.0" },
        "recommends": { "dsh-chatlog": ">=1.0.0" },
        "suggests":   { "dsh-search": "*" },
        "conflicts":  { "dsh-old-memory": "<2.0.0" },
        "breaks":     { "dsh-rewind": "<2.0.0" }
      }
    }
  }
}
```

### 2b. API 类型（`@deepseek-ai/dsh-mygo-api`）

```ts
export interface PluginCompatibility {
  /** 硬正；`requires` 的规范名。 */
  readonly depends?: Readonly<Record<string, string>>
  /** 硬负。 */
  readonly breaks?: Readonly<Record<string, string>>
  /** 软正（强推荐；缺失只警告）。 */
  readonly recommends?: Readonly<Record<string, string>>
  /** 软正（弱推荐；缺失只警告）。 */
  readonly suggests?: Readonly<Record<string, string>>
  /** 软负（声明的不兼容；命中只警告）。 */
  readonly conflicts?: Readonly<Record<string, string>>
  /** 兼容别名：`requires` 归一化为 `depends`（v1 存量零迁移）。 */
  readonly requires?: Readonly<Record<string, string>>
}
```

- `manifest.ts` 的 `compatibilityBlock` 增加五字段（`requires` 保留）；
  **归一化规则**：解析时 `requires` 合并进 `depends`；同一 key 在
  `requires` 与 `depends` 同时出现 → `manifest-invalid`（避免歧义）。
- key 命名空间：managed plugin id（现状）；P3 起同一命名空间容纳 bundle id。
  `hostPackages` 版本注入维持 v1 预留状态，本提案不展开。
- 刻意不做 `provides` / 替代目标：纯校验时 alternatives 没有确定性受害方，
  属于 P2 激活求解的输入。

## 3. 传递闭包

定义依赖图 G：节点 = enabled 集合中的 managed plugin id + 被检查者；
边 = 各插件声明的五种约束（软边在 §1 已排除出闭包，只参与单层检查）。

### 硬闭包（depends）

从被检查者出发沿 `depends` 边走闭包，收集每条违例边的完整路径：

- 目标未安装：`chain = [A→B, B→C(missing)]`
- 目标已安装但停用：`chain + state: installed-disabled`
- 目标已启用但版本不满足：`chain + installed: <version>`
- **环**：用三色标记终止可达性；完整环且所有成员满足 → 不算违例；
  环内任一成员违例 → 报告整个环链（避免无限递归，也避免把环误报为缺失）。

### 硬负（breaks）

`breaks` 边不传递。直接矛盾（`A depends B` 且 `B breaks A`）报告双边链；
其余情况保持 v1 的单层检查。

### 受害方规则（延续 v1 的“声明者即受害者”）

- **install / replace / enable 预检**：被检查者（请求方）是受害方，报告其整条
  硬闭包链；同时保留现有“幸存者对新来者的双向检查”
  （`installCompatibilityViolations` 语义），并扩展到新词汇。
- **reconcile（启动/恢复后全量对账）**：逐边归因——`C` 缺失时 `B` 是
  `B depends C` 边的声明者，先禁用 `B`；随后 `A depends B` 违例，再禁用
  `A`。**级联禁用，每条记录 reason 相同但 violations 各自为该边的链**，
  避免把整条链错误归因到根请求方。
- **uninstall**：对每个幸存者跑一次硬闭包，阻止卸载会破坏任何幸存者闭包的
  节点（现有 `requiringPlugins` + `uninstallCompatibilityViolations` 保留，
  补充传递依赖者）。

### 复杂度

节点数 = 启用插件数（几十量级）。单次 BFS O(V+E)；reconcile 全量
O(V·(V+E))，可接受。环检测用三色标记。

## 4. 派生冲突（只出警告）

除声明式约束外，从组合事实派生“可能不兼容”：

- **provider 重复**：两个已启用插件声明提供同一 service id（现有
  `provides`）→ `derived-conflict` 警告，点名双方与 service。
- **patch 行重叠**：同一 row id 被两个 bundle patch 改写，或同一 service
  provider 行重复插入。P1 只定义事实来源接口，P3 接 profile 组合后启用。

```ts
/** 组合事实来源；bridge 轨用现有 provides 实现，bundle 轨 P3 实现。 */
export interface CompositionFactProvider {
  serviceProviders(): readonly { service: string; plugin: string }[]
  patchedRows(): readonly { rowId: string; plugin: string }[]
}
```

派生冲突**默认软**（警告）：两个插件都可能合法加载，只是顺序语义未定义；
作者可用 `conflicts`/`breaks` 把它升级为声明级。避免把“同一行的 config
覆盖”这种有意分层误报为硬冲突。

## 5. 报告格式（ResultAnalyzer 风格）

### 结构化 API

```ts
interface CompatibilityEdge {
  readonly declarer: string
  readonly kind: 'depends' | 'recommends' | 'suggests' | 'conflicts' | 'breaks'
  readonly target: string
  readonly range: string
}

interface CompatibilityViolation {
  readonly kind: 'depends' | 'breaks'
  readonly declarer: string
  readonly target: string
  readonly range: string
  readonly installed?: string
  readonly state?: 'missing' | 'installed-disabled' | 'version-mismatch'
  /** 从被检查者到违例边的完整路径。 */
  readonly chain: readonly CompatibilityEdge[]
}

interface CompatibilityWarning {
  readonly kind: 'recommends' | 'suggests' | 'conflicts' | 'derived-conflict'
  readonly declarer: string
  /** derived 时为 "service:<id>" 或 "row:<id>"。 */
  readonly target: string
  readonly range?: string
  readonly installed?: string
  readonly chain?: readonly CompatibilityEdge[]
  readonly detail?: string
}

interface CompatibilityReport {
  readonly plugin: string
  readonly action: 'install' | 'replace' | 'enable' | 'uninstall' | 'reconcile' | 'preflight'
  readonly violations: readonly CompatibilityViolation[]
  readonly warnings: readonly CompatibilityWarning[]
}
```

### 人读文本

message 保持单行可 grep（错误码不变：`compatibility-conflict`），details 换行渲染链：

```text
compatibility-conflict: dsh-a 无法启用：约束链 dsh-a depends dsh-b ">=1.3.0" → dsh-b depends dsh-c ">=2.0.0"；dsh-c 未安装（由 dsh-b 声明）
```

多行详情：

```text
插件 dsh-a@1.2.0 无法启用
  dsh-a depends dsh-b ">=1.3.0": 已装 dsh-b@1.2.4（由 dsh-a 声明）
  dsh-b depends dsh-c ">=2.0.0": dsh-c 未安装（由 dsh-b 声明）
  建议: 安装 dsh-c（>=2.0.0），或将 dsh-a 降至不要求 dsh-b >=1.3.0 的版本
```

软警告：

```text
warning: dsh-a recommends dsh-d ">=1.0.0": 未安装（由 dsh-a 声明）
warning: dsh-a 与 dsh-b 均提供 service "sessionPersistence"（derived-conflict）
```

### 出口

- `checkCompatibility()` 返回类型升级为 `CompatibilityReport`（破坏性 API
  变更，mygo-api 与面板同一提交同步升级）；
- 硬违例仍抛 `compatibility-conflict`；软警告不抛错，进 plan 确认项、
  面板预检展示、audit（`class: warning`）；
- `PluginOperationPlan` 新增 `warnings` 字段。

## 6. 检查点

现状挂点全部保留并扩展：

1. **planInstall / planReplace / planEnable**：入站硬闭包 + 幸存者双向检查；
   软警告进 `plan().warnings`。
2. **assertCompatibility**（lifecycle install/replace/updateRaw/adoptStatic）：
   同 plan，抛 `compatibility-conflict` 带 chain。
3. **checkSupport / 面板 checkCompatibility**：返回 `CompatibilityReport`。
4. **enable**：新增硬闭包预检（v1 只在 reconcile 后补查，启用前不拦）。
5. **uninstall**：对所有幸存者跑硬闭包（传递依赖者拦截）。
6. **reconcileCompatibility**：级联禁用（先叶子违例者，再沿 depends 反向
   传播），持久化 reason + audit 记录链。
7. **P3 bundle 轨**：同一 checker 对 layer stack 跑，违例保留 last-good 并
   广播 `hmr/config-update-failed`（本提案只定义 `CompositionFactProvider`
   接口，不实现）。
8. **更新模拟**：`updateRaw` 前用新版本集 dry-run 出报告；硬违例拒绝，
   软违例列入确认项。

## 7. 兼容性与迁移

- `requires` 归一化为 `depends`；两者同 key → `manifest-invalid`。
- 新字段全部 optional；存量插件（仅 `requires`/`breaks`）语义不变，
  消息文本从 `requires` 统一为 `depends`（既有测试断言同步更新）。
- `CompatibilityReport` 返回类型变化是唯一破坏性 API 变更，与面板同提交。

## 8. 测试验收

- 硬闭包：A→B→C，C 缺失 → install/enable/replace 全部拒绝且 chain 完整；
- 环：A↔B 互相 depends 且都满足 → 通过；A↔B 中 B breaks A → 双边链报告；
- 已安装停用：depends 目标 disabled → `installed-disabled` 违例 + “先启用”提示；
- 软边：recommends/suggests/conflicts 不阻塞，warnings 分级正确；
- uninstall：传递依赖者被拦截；
- reconcile：级联禁用顺序正确、reason 持久化、audit 含链；
- 派生：provider 重复警告出现且可升级为声明级；
- 存量 352+26 用例全绿（消息/类型同步调整）。

## 9. 不做（P2+）

- 激活求解 / 自动连带启停；
- `provides` / 替代目标（alternatives）；
- 版本建议自动执行（仍只给建议，执行走 pnpm）；
- bundle 轨接线（P3）、BOM/套件、hostPackages 注入；
- 软警告 UI（P1 只给数据面：plan.warnings / report.warnings / audit）。

## 10. 风险

- **级联禁用风暴**：一个根因（C 缺失）会沿 depends 反向禁掉整条链。缓解：
  链报告 + 逐边归因，且 P2 激活求解最终提供“自动修”而非“禁一排”。
- **breaks 不传递的误用**：作者可能认为 A depends B、B breaks C 会保护 A。
  文档必须写明单层语义。
- **软警告回归“无人理睬”**：P1 数据面先行，面板 UI 紧随；软警告按
  (kind, declarer, target, range) 幂等去重，避免 audit 刷屏。

## 11. 文件改动清单

- `packages/core/mygo-api/src/types.ts`：`PluginCompatibility` 五字段 +
  `CompatibilityReport` / `CompatibilityViolation` / `CompatibilityWarning` /
  `CompatibilityEdge` / `CompositionFactProvider`。
- `packages/core/mygo-api/src/error.ts`：约束链 message 模板。
- `packages/cordis/mygo/src/manifest.ts`：`compatibilityBlock` + `requires`
  归一化。
- `packages/cordis/mygo/src/compatibility.ts`：重写为闭包版（图遍历 + 环检测 +
  状态区分 + 软警告收集），保留 `install/uninstall` 双向检查函数名。
- `packages/cordis/mygo/src/plan.ts`：硬闭包入 plan + `warnings` 字段。
- `packages/cordis/mygo/src/lifecycle.ts`：enable 预检、reconcile 级联、
  `checkCompatibility` 返回报告、updateRaw 模拟。
- `packages/cordis/mygo/src/service.ts`：`checkCompatibility` 签名。
- `vendor/dsh-mygo-panel`：预检展示 violations + warnings。
- `tests`：closure / cycle / soft / derived / cascade 新用例。

## 12. 实现记录（2026-08-10）

- `PluginCompatibility` 五字段 + `requires` 别名；`normalizeCompatibility`
  合并别名、同 key 双写报 `manifest-invalid`。
- `evaluateCompatibility` 新引擎：`depends` 硬闭包（三色环检测、路径链）、
  `installed-disabled` / `missing` / `version-mismatch` 状态区分、软边单层
  检查、幸存者双向检查、派生 provider 冲突（`CompositionFactProvider`）。
- 报告化：`CompatibilityReport` / `Violation` / `Warning` / `Edge` +
  `compatibilityViolationLines` / `compatibilityWarningLines`；
  `checkCompatibility()` 返回类型升级为报告。
- 检查点：install / replace / enable 预检、传递卸载拦截、reconcile 级联
  禁用（逐边归因，fixpoint 收敛）、checkSupport、面板安装预检（硬违例拒绝、
  软警告 console.warn 不阻塞）；`readDeclarativeManifest` 补齐五字段读取
  （v1 只读 requires/breaks）。
- plan 预览新增 `warnings`（软/派生警告人读行）。
- 测试：compatibility.spec 8 → 17 用例（链、环、停用态、enable 预检、软边、
  传递卸载、派生、级联恢复）；全量 mygo-api 39 + mygo 361 = 400 全绿。
- 同步：0809 工作树 / dsh-mygo 仓库 / 0809-fresh / staging（3080）四位置
  源码与 lib 均已更新；3080 需重启后才生效。
