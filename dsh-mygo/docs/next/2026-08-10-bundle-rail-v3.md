# Agent Note: P3 bundle 轨管理提案（官方 profile bundle 接入 mygo）

Status: 已实现并真实 bundle 验收（2026-08-10：BundleRail + 统一依赖图 +
面板 rail 徽标/Bundle 安装入口 + opt-in enable 块 + install 校验回滚 +
host-conflict 确认清单 + host 替换 companion）

把 mygo 的依赖词汇、激活求解与 plan 确认 UI 管到官方 bundle 轨：profile
依赖（pnpm）+ `dsh.profile.bundles` 层栈 + bundle `cordis.patch.yml` 合成。
管理器本体保持寄生（只写 `$DSH_HOME`），遵守官方 config-only 立场（不建
第二个安装数据库），并复用 P1/P2 的同一套兼容性/求解/报告语义。

## 0. 目标

1. 面板可安装/停用/卸载官方 bundle 插件（`dsh.bundle.patch` 包），与现有
   bridge 轨插件共用同一列表、同一 plan 确认 UI、同一依赖图。
2. 需要“替换组合行”的深层 bundle（如 session-persistence-rdb）也能管理：
   安装/停用前预览其 patch 对宿主行的改写，二次确认；卸载/停用时自动还原
   宿主行。
3. 全部变更走 `$DSH_HOME` 下的 profile 配置（依赖、bundles 列表、用户
   patch 层），不修改 dsh checkout；HMR 失败保留 last-good。

## 1. 现状与缺口

- 官方 bundle 轨 = `$DSH_HOME/profiles/<name>/package.json`（pnpm 依赖 +
  `dsh.profile.bundles` 有序列表）+ bundle 包内的 `cordis.patch.yml`
  （app-boot 按 bundles 顺序叠层，再叠用户 patch）。
- `dsh plugin --profile web add/remove <spec>` = pnpm 转发器 + 层栈对账。
- mygo 目前只认识 bridge 轨（mygo-plugins + 桥接行 + adoptRaw），对 bundle
  轨没有任何管理面；P1 的 `CompositionFactProvider.patchedRows()` 是空实现，
  P2 的求解器只作用于 bridge 记录集合。

## 2. 设计

### 2a. 双轨统一依赖图

`solveActivation` 的输入扩展为“激活集合”适配器，包含两类成员：

```ts
interface ActivationMember {
  readonly rail: 'bridge' | 'bundle'
  readonly id: string
  readonly version?: string
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
  readonly enabled: boolean
  /** bundle 轨：包名（npm spec 的解析名）。 */
  readonly packageName?: string
  /** bundle 轨：patch 行事实（由 cordis.patch.yml 解析）。 */
  readonly patchRows?: readonly { readonly rowId: string; readonly action: 'insert' | 'override' | 'disable' }[]
}
```

- bridge 轨：现有记录（不变）。
- bundle 轨：读 `~/.dsh/profiles/<profile>/package.json` 的
  `dependencies`（已装）与 `dsh.profile.bundles`（激活），每个 bundle 读其
  package.json 的 `dsh.mygo.compatibility` / `dsh.bundle.requires` /
  `dsh.bundle.breaks`（三源合并，冲突报 manifest-invalid）。
- 依赖边可以跨轨：bridge 插件 depends bundle 插件（按 id/包名解析），
  bundle 插件 depends bridge 插件，同一求解器输出统一 actions。

### 2b. 安装/更新/卸载（转发官方 CLI）

- `bundle install <spec>`：spawn
  `<checkout>/bin/dsh plugin --profile <profile> add <spec>`（0 侵入，pnpm
  对账交给官方），成功后读回依赖与 bundles 列表，注册到 mygo 的 bundle
  索引（`$DSH_HOME/mygo/bundle-registry.json`，仅记录“我管过谁”，不重复
  官方配置身份）。
- `bundle update <id> <spec>`：转发 `dsh plugin update` 语义（`add` 新 ref
  + `remove` 旧名，或按官方命令形态）；更新前用新版本集跑一遍
  P2 `solveActivation` 模拟，硬违例拒绝。
- `bundle uninstall <id>`：先检查依赖者（统一图），再转发
  `dsh plugin --profile web remove <pkg>`，最后清理 mygo 索引与**配套
  patch 块**（见 2c）。
- 面板的 folder/github/archive 安装仍走 bridge 轨；bundle 轨安装入口为
  “包名/git spec”输入（复用现有 GitHub 输入框，加一个“作为 profile bundle
  安装”开关）。

### 2c. 宿主行改写（companion patch 块）

解析 bundle 的 `cordis.patch.yml`，把行动作分成三类：

| 动作 | 示例 | mygo 处理 |
|---|---|---|
| insert 新行 | 新增 service 行 | 直接信任，计入 patchRows 事实 |
| override 宿主行 | 改 `session-persistence-jsonl` 的 config | 标记 `host-conflict`，安装/启用需二次确认 |
| disable 宿主行 | `- id: session-persistence-jsonl disabled: true` | 标记 `host-conflict` + 卸载/停用时自动移除该 disable 行（还原宿主） |

- 需要“替换内置行”的 bundle（rdb 模式）：用户在面板确认后，mygo 在
  profile 用户 patch 层写入 **companion 块**（`# mygo bundle companion:
  <bundle-id>`，原子写 + 快照），把 bundle 自身 patch 里声明的
  override/disable 行落到用户层；卸载/停用 bundle 时整块移除，宿主行还原。
- bundle 自身 patch 不含 override/disable 时（纯 insert），无需 companion
  块，禁用 = 从 `dsh.profile.bundles` 移除。
- `CompositionFactProvider.patchedRows()` 在 bundle 轨启用：两 bundle 改写
  同一宿主行 → 派生冲突警告（P1 预留的接口在这里落地）。

### 2d. 启用/停用语义

- **HMR 路线确认（2026-08-10 代码核对）**：dsh 的正常 HMR 只监听两个
  patch 文件（profile `cordis.patch.yml` 与 home 级 `cordis.patch.yml`，
  经 `hmr.registerConfig` 精确路径注册）；`dsh.profile.bundles` 与
  dependencies 在 `package.json` 中**不参与 HMR**，官方 `dsh plugin`
  同样只对启动器侧生效。因此 bundle 的激活/停用不能走“改 bundles 列表”。
- 落地：bundle 安装后**常驻层栈**（package.json 一次性写入，重启生效）；
  启用/停用改由**用户 patch 层 managed 块做行级控制**：
  - 纯 insert 的 bundle：停用 = 为其每个插入行写
    `- id: <row> disabled: true`；启用 = 删这些行（HMR 实时）；
  - 需宿主行改写的 bundle（rdb）：companion 块同时管理“bundle 行
    disabled”与“宿主行 disable 的还原”（HMR 实时）；
  - override 型 patch 行（仅改宿主行 config、不 insert）：行级 disabled
    不适用，需 companion 记录原值反向覆盖——**受限支持**，P3 中单独标注。
- 所有 patch 层写入均原子（temp + rename + 前后快照），失败回滚并依赖
  HMR last-good；依赖增删（安装/卸载 bundle）仍走 `dsh plugin`，重启后
  由 mygo reconcile 对齐。
- 有 enabled 下游时停用被拦（复用 P2 保护），面板“确认停用”= force 级联
  （级联动作 = 写一串行级 disabled + 移除对应 companion 块）。

### 2e. 面板与确认 UI

- 插件列表加 `rail` 徽标（bridge / bundle），bundle 行显示包名与层序；
- 安装、启用、停用、卸载全部复用现有内联确认（按钮二次点击 + 仅“取消”）；
- bundle 卸载在确认区额外说明：“将移除 profile 依赖并还原宿主行（如有
  companion 块）”；
- `host-conflict` bundle 安装/启用时确认区显示其 patch 对宿主行的改写清单。

## 3. 检查点

- 安装/更新/启用/停用/卸载前：统一图 `solveActivation` 预览 + 派生冲突 +
  host-conflict 清单；确认后执行，任何一步失败回滚配置快照并保留
  last-good（Loader HMR 侧已有 last-good 语义，mygo 保证自己写的配置
  可整体还原）。
- reconcile：启动时把 profile manifest/bundles 状态与 mygo bundle 索引对账
  （用户手工 `dsh plugin` 改过 → 采纳并更新索引；行缺失 → 标记 broken）。
- 卸载保护/disable 保护与 bridge 轨共用同一 dependent-exists / force 语义。

## 4. 需要拍板的决策点

1. **转发官方 CLI vs 自管 pnpm**：推荐转发 `dsh plugin`（0 侵入、对账逻辑
   官方维护）；缺点是依赖 `dsh` 可执行文件在 PATH/checkout 可定位。
2. **companion patch 块的落地位置**：推荐 profile 用户 patch 层（官方合成
   顺序的最外层，且被 HMR 监听），用 managed 标记注释包裹；手工编辑会被
   mygo 覆盖。
3. **host-conflict bundle 的卸载策略**：推荐“可卸载但卸载即还原宿主行”
   （companion 块随卸载移除），而不是“面板不可卸载”——后者留给真正的
   系统保护组件（`protected`）。

## 5. 验收

- 用 `dsh plugin --profile web add` 装一个纯 insert bundle（如 marisa 或
  cordis-fabric 类）→ 面板可见、可停用/启用（bundles 列表原子改写）、可卸载；
- 用 rdb 类 bundle → 安装预览列出宿主行改写清单，二次确认；停用/卸载后
  宿主行还原（jsonl 恢复）；
- bridge 插件 depends bundle 插件 → 统一图求解出 required-by enable；
- 手工 `dsh plugin` 改状态后重启 → reconcile 采纳并更新索引；
- 全量 408+ 用例无回归。

## 6. 不做（P4+）

- BOM/套件版本矩阵、repository-plugin 轨（`.dsh-plugin`）、市场/发现、
  版本自动升级。

## 7. 文件改动清单（预估）

- `mygo/src/bundle-rail.ts`（新）：profile manifest/bundles 读写（原子 +
  快照）、`dsh plugin` 转发、companion 块管理、patch 行解析。
- `mygo/src/activation.ts`：`ActivationMember.rail` 扩展 + 统一图。
- `mygo/src/compatibility.ts`：`CompositionFactProvider.patchedRows()` 接入
  bundle 轨；`dsh.bundle.requires/breaks` 合并源。
- `mygo/src/lifecycle.ts` / `service.ts`：bundle 索引与对账、reconcile 扩展。
- `vendor/dsh-mygo-panel`：bundle 安装入口、rail 徽标、确认区 host-conflict
  清单。
- `tests`：bundle 读写、companion 还原、跨轨依赖、host-conflict 清单新用例。

## 8. 两层 HMR 分工（2026-08-10 已确认，不做简化）

mygo 不使用第二个 loader；宿主 Loader 的 patch HMR 与 mygo 的七步替换协议
分层分工，保持原方向：

| 层 | 变更类型 | 路由 | 保留/退役 |
|---|---|---|---|
| 配置级 | install / enable / disable / uninstall、P3 bundle 行级开关 | 写 profile/home patch → 宿主 `hmr.registerConfig` 事务性重放 | 原生 HMR，mygo 只做求解器预检 + adoptStatic 幂等 + 原子写/回滚 |
| 代码级 | replace / updateRaw / mygo 自更新（同 id 换版本） | mygo 七步协议：capture → stage → drain → swap → restore | **保留**（ESM 缓存绕过、stateful 捕获/恢复、in-flight 排水、失败回滚原子性） |

- **不做简化**：不把代码级更新降级为“写配置 + 重启/全树 HMR”——那会丢掉
  进行中 session 的连续性，违背最初 HMR 设计目标。
- 边界含义：P3 bundle 轨只新增“配置级”管理面（装/启/停/卸走原生 HMR）；
  bundle 包代码更新仍走 `dsh plugin` + 重启（官方边界），不承诺热替换。

## 9. 实现记录（2026-08-10）

- `bundle-rail.ts`：profile manifest 原子读写（temp + rename + 快照）、
  `dsh plugin` CLI 转发（add/remove）、bundle patch 解析（insert /
  override / disable 三类事实，`!!js` 容忍）、companion 块（行级 disabled
  宿主行还原）、成员列表与启停。
- **in-box 排除**：`dsh-base` / `dsh-web-app` 通过 profiles fallback 也能在
  profile 锚点解析到，用 realpath 判断落在 checkout 内即跳过——mygo 只管理
  profile 自装的 bundle。
- 统一依赖图：`planState` / `compatibilitySet` / `installedVersions` 合并
  bundle 成员（`rail: 'bundle'`）；`enable/disable` 对 bundle id 走
  BundleRail（连带 required-by / force 级联跨轨）；跨轨依赖（bridge 插件
  depends bundle 插件）求解与执行已验证。
- `CompositionFactProvider.patchedRows()` 接入 bundle 事实（派生冲突警告
  数据源落地）。
- 面板：`/plugins` 合并双轨（rail 字段 + hostConflicts）、
  `/bundles/install`、status 路由按 rail 分发；客户端 Bundle 安装 tab、
  rail 徽标、宿主行改写提示行。
- 测试：`bundle-rail.spec` 6 用例（patch 解析、companion、CLI 转发、
  dsh.bundle 合并、跨轨求解、disable 保护/级联）；全量 417 用例绿
  （author-guide 单独跑过，环境老毛病）。
- 简化：不做持久化 bundle 索引——成员实时读磁盘 profile 状态，天然
  reconcile（用户手工 `dsh plugin` 改动直接可见）。
- **opt-in enable 块（2026-08-10 收尾）**：bundle 自带 `disabled: true`
  的 insert 行（fabric 类）启用时写 enable 块（`disabled: false`），停用时
  移除；disable/enable 双 companion 块模型，`members().enabled` 仍以
  disable 块为准。
- **install 校验回滚（2026-08-10 收尾）**：`dsh plugin add` 后立即把新
  bundle 作为 incoming 跑激活求解（`solveActivation` install），硬违例自动
  `remove` 回滚并抛约束链；面板 `/bundles/install` 返回 plan。
- **host-conflict 确认清单（2026-08-10 收尾）**：Bundle tab 安装含
  plan actions / warnings / hostConflicts 时走内联确认（按钮二次点击 +
  仅“取消”），确认后执行 required-by 连带启用；行内列出宿主行改写清单。
- 未做：真实 bundle 的 3080 端到端验收（建议：纯 insert 用 dsh-tool-json、
  opt-in 用 fabric、host-conflict 用 dsh-101）。

## 10. host 替换 companion（2026-08-10）

- mygo 内置宿主行替换默认表（`HOST_REPLACEMENT_DEFAULTS`）：
  `session-persistence-rdb` → 禁用 `session-persistence-jsonl`；bundle 也可
  用 `dsh.mygo.hostDisables` 显式声明。
- 启用/安装时写 host 块（`- id: <宿主行> disabled: true`），停用/卸载时
  移除并还原宿主行；与 disable/enable 双块并存。
- 真实 bundle 验收（staging checkout + 临时 home，端口 41783）：
  rdb 经 Bundle tab 安装 → host 块禁用 jsonl、树正常（HTTP 200）、rdb
  enabled；停用 → host 块移除（jsonl 还原）+ disable 块写入；启用 → host
  块恢复；卸载 → 全部块移除、依赖删除。闭环全部通过。
