# Agent Note: P2 激活求解提案（Fabric 式激活闭包 + 提供者选择）

Status: 已实现（2026-08-10：solver + plan + lifecycle + API + 面板
provides/disable-force + plan 确认 UI；P3 bundle 轨未做）

把 P1 的 check-only 升级为**激活求解**：给定当前集合与期望变更，产出最小
合法激活集 plan（连带启用 depends 目标、停用冲突方、提供者选择、版本建议），
应用仍写配置/行，版本选择仍归 pnpm。引入 `provides` / 替代目标（P1 刻意留
出的部分），并保持官方 config-only 与 HMR last-good 语义。

## 0. 目标

1. 装/换/启用时不再“拒绝并让用户自己排雷”，而是给出一份可确认的动作 plan：
   `enable B（required-by: A depends B）`、`disable W（conflict-resolution: A breaks W）`、
   `install C（advisory: 缺失依赖）`、`更新 D 到 >=2.0.0（advisory: 版本建议）`。
2. depends 目标支持服务/能力别名（`service:<id>` / `cap:<id>`），由 enabled
   集合中的 provider 满足；多候选时确定性选择。
3. 纯校验原语（P1 `evaluateCompatibility`）保留，求解器在其上做图遍历与
   候选枚举；求解器不直接改状态，只产 plan，apply 仍走现有协议。

## 1. 问题域

- 激活状态：enabled 集合（bridge 轨 = 记录 status；bundle 轨 P3 = 层栈）。
- 操作：install / replace / enable / disable / uninstall / updateRaw。
- 输入：installed 集合（含 disabled）、enabled 集合、声明（五级 +
  `provides`）、期望变更。
- 输出：`ActivationPlan`（动作列表 + 理由链 + warnings + 拒绝原因）。

## 2. 求解语义

### 硬约束（求解域）

- `depends`：传递闭包，目标必须是 enabled 且版本满足；缺失目标记
  `install` 建议（仅在 installed 集合外且来源已知时，否则纯文本建议）；
  已安装但停用记 `enable` 连带动作。
- `breaks`：单层互斥；两方同时 enabled 即违例。
- 派生 provider 唯一性：同一 `service:` 默认至多一个 enabled provider
  （与 P1 派生警告同源；P2 把它从警告升级为求解的默认偏好，可被
  `claims`/显式声明覆盖）。
- 用户请求优先：用户明确请求的变更方默认不自动让步；连带启用的依赖在
  冲突时优先换 provider 或禁用冲突方（最小变更）。

### 软约束（不参与求解）

- `recommends` / `suggests` / `conflicts` 只进 plan.warnings；`conflicts`
  命中时在确认项中提示，不自动禁用。

### 提供者选择（provides）

`dsh.mygo.provides` 顶层新增（与 `entrypoints` 平级）：

```jsonc
{
  "dsh": { "mygo": { "provides": ["service:session-persistence", "cap:vision"] } }
}
```

`depends` 的 key 支持三类命名空间：

- 插件 id（现状）：`{ "beta": ">=1.0.0" }`；
- 服务别名：`{ "service:session-persistence": ">=1.0.0" }`——由 enabled 集合
  中 `provides` 含该 service 的插件满足，版本锚定提供者自身的 version；
- 能力别名：`{ "cap:vision": ">=1.0.0" }`——同上，命名空间独立于服务。

多候选确定性规则：按**安装序**（installed 集合中的顺序）选第一个满足的
provider；`plan` 里列出其余候选为 `advisory`（“也可启用 X 满足同一依赖”），
用户可在确认时改选。

### 版本建议

已安装目标版本不满足范围、且无其他已装版本可换时，只输出文本建议
（`更新 D 到满足 >=2.0.0 的版本`），执行走 pnpm / `dsh plugin`，求解器不
下载、不安装、不升级。

### 求解算法

1. **闭包**：从变更目标沿 `depends`（含 service:/cap: 解析到 provider）收集
   必须 enabled 集合；
2. **冲突消解**：对闭包内 breaks/互斥对枚举方案——换 provider、禁用冲突方、
   拒绝变更方；按“保留已 enabled 优先 → 动作数最少 → id 稳定序”选最优；
3. **可行性**：用 P1 `evaluateCompatibility` 验证候选激活集；
4. **输出**：动作列表（每个动作标注 `user-requested` / `required-by` /
   `conflict-resolution` / `advisory`）+ 理由链 + warnings。

候选数在 bridge 轨为几十量级，用确定性回溯即可，不引入 SAT；P3 bundle 轨
候选变大后再评估。

## 3. 求解器接口

```ts
interface ActivationRequest {
  readonly op: 'install' | 'replace' | 'enable' | 'disable' | 'uninstall'
  readonly id: string
  readonly version?: string
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
}

interface ActivationAction {
  readonly op: 'enable' | 'disable' | 'install' | 'suggest-update'
  readonly id: string
  readonly kind: 'user-requested' | 'required-by' | 'conflict-resolution' | 'advisory'
  /** 人读理由；硬动作带约束链。 */
  readonly reason: string
  readonly chain?: readonly CompatibilityEdge[]
}

interface ActivationPlan {
  readonly accepted: boolean
  readonly actions: readonly ActivationAction[]
  readonly warnings: readonly string[]
  readonly error?: { readonly code: PluginErrorCode; readonly message: string }
}
```

## 4. 检查点集成

- `plan()`：现有四操作返回 `actions`（连带 enable/disable），面板安装预检
  改为“预览 plan + 确认连带动作”。
- lifecycle install/replace/enable：apply 前调用求解器；默认策略
  `autoResolve: false`（拒绝并给 plan），面板/API 带 `autoResolve: true`
  时才执行连带动作。install 的 `required-by` 动作（先装依赖）默认拒绝——
  用户应先装依赖或确认后由求解器按序执行。
- reconcile：维持 P1 级联禁用（恢复期无变更方，按边归因声明者）。
- updateRaw：换版本前用新版本集模拟求解，硬违例拒绝、软违例进确认项。
- HMR：求解失败保留 last-good 并广播 `hmr/config-update-failed`（P3 层栈
  同语义）。

## 5. 需要拍板的决策点

1. **自动连带启用的默认策略**：推荐 `autoResolve: false`（安装/启用只给
   plan，确认后才动），因为自动改 enabled 集合是 P1 没有的新副作用；
2. **service: 多 provider 处理**：推荐默认启用第一个（安装序）、其余保持
   disabled + 派生警告；不做自动多开；
3. **disable 是否开始检查下游**：现状 disable 不检查依赖者（P2 前行为）；
   推荐改为“有 enabled 下游时拒绝并给链（--force 级联禁用）”，与
   uninstall 一致——这是行为变更，需要确认。

## 6. 验收

- A depends B（B disabled）→ enable A 的 plan 含
  `enable B（required-by）`，确认后两步生效；
- A depends `service:session-persistence`，候选 P1/P2 均 disabled → plan
  确定性选择其一并说明其余候选；
- breaks 冲突：请求启用 A，B breaks A → plan 拒绝并给链；A 为连带依赖时
  尝试换 provider 或最小变更禁用冲突方；
- 同输入同输出（确定性）；现有 400 用例全绿。

## 7. 不做（P3+）

- 版本求解（pnpm 负责）；bundle 轨接线（P3）；BOM/套件；软级别自动处理。

## 8. 文件改动清单（预估）

- `mygo-api/types.ts`：`ActivationRequest/Action/Plan`、`PluginCompatibility`
  的 service:/cap: key 解析、`provides` 顶层段；
- `mygo/src/activation.ts`（新）：闭包 + 冲突消解 + 提供者选择 + 确定性回溯；
- `mygo/src/plan.ts`：`actions` 并入 `PluginOperationPlan`；
- `mygo/src/lifecycle.ts`：install/replace/enable/disable 接入求解器 +
  `autoResolve` 执行；
- `mygo/src/compatibility.ts`：暴露 service:/cap: 边解析给求解器复用；
- `vendor/dsh-mygo-panel`：安装/启用预检展示 plan 与确认项；
- `tests`：activation 闭包 / provider 选择 / breaks 消解 / disable 下游拦截
  新用例。

## 9. 实现记录（2026-08-10）

- `activation.ts`：`solveActivation` 纯求解器——depends 硬闭包
  （required-by 连带 enable）、capability（`service:`/`cap:`）确定性选
  第一个已装 provider、breaks 最小变更消解（用户请求方不自动让步）、
  缺失/版本不满足给 advisory 动作、最终用 P1 `evaluateCompatibility` 复验。
- `PluginCompatibility` 的 capability key 解析下沉到 `evaluateCompatibility`
  （checkEdge + 幸存者双向检查）；**幸存者约束只看 enabled**（修掉
  “已停用插件的 breaks 仍算数”的 bug）。
- `dsh.mygo.provides` 顶层段：面板读取 + `RawPluginDeclaration.provides` +
  `mergeRawDeclaration` 合并进 definition.provides。
- `plan()` 返回 `actions`（user-requested / required-by /
  conflict-resolution / advisory）；disable 由求解器做下游保护
  （dependent-exists），`force` 级联停用。
- `InstallOptions.autoResolve`：`true` 时 install 先执行 required-by
  enable 再装（默认 `false`，保持 P1 拒绝语义）。
- 面板：安装/禁用 API 支持 `force` body；声明式 provides 读取。
- **面板 plan 确认 UI（2026-08-10 追加）**：新增 `/api/mygo/install-plan`
  预览 declarative 安装；install 支持 `autoResolve`（确认后先连带启用
  required-by 再 adopt）；客户端安装/启用/停用三路都先预览 plan——有连带
  动作或软警告时在插件卡片下方**内联展开**确认信息（动作列表 + 警告 +
  仅一个“取消”），按钮字样切换为“确认安装 / 确认启用 / 确认停用 /
  确认卸载”，**二次点击按钮本身即确认执行**，不使用弹窗；停用被下游
  保护拦截时“确认停用”走 force 级联；卸载为两次点击确认（被依赖者阻止
  时内联显示错误，卸载本身不可 force）。
- 测试：新增 activation.spec（8 用例：autoResolve、缺失拒绝、disable
  拦截/级联、capability 选择/无提供者、breaks 消解、确定性），compatibility
  两个旧用例改为 P2 plan 语义；全量 mygo-api 39 + mygo 369 = 408 全绿。
- 同步：0809 / dsh-mygo / 0809-fresh / staging（3080）四位置源码与 lib；
  3080 已实测 disable 保护与 force 级联。
- 未做：面板 plan 确认 UI（安装/启用时展示 actions 并确认）、disable
  级联的 audit 事件明细、bundle 轨（P3）。
