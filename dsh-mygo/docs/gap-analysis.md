# mygo 插件包管理体系 Gap 分析（对照《收敛任务》规范）

> 生成时间：2026-08-11 · 范围：`dsh-mygo` 0.2.1 现状 vs 任务规范全部 MUST。
> 证据列一律给文件:行；成本估计：S ≈ 0.5 天，M ≈ 1–3 天，L ≈ 1–2 周。

## 1. 术语与 manifest（规范：插件/库分线；manifest 五字段）

### 1.1 插件与库分线治理

- **现状**：插件线 = mygo 注册表（`gens/status`，`store.ts:12`），库线 = pnpm
  node_modules（bundle 轨转发 `dsh plugin add`，`bundle-rail.ts:287`）。两条线
  已经分开，但插件线的版本解析尚未实现（见 2.1）。
- **差距**：分线方向正确，插件线的“候选版本集/选版/落盘”缺失，导致插件线实际
  退化为“装什么用什么”（面板装的就是最终版本）。
- **成本**：M–L（实现插件线版本解析 + 安装存储）。

### 1.2 manifest 字段

| 字段 | 现状 | 证据 | 差距 |
|---|---|---|---|
| id | 运行时 manifest 有；分发侧借 npm `name` | `manifest.ts:31`；`manifest-v1.md` | 基本满足；需统一为 `dsh.mygo.id` 可选覆盖 |
| version（含预发布） | 有，semver 形状校验 | `manifest.ts:32`；`semver-range.ts` | 满足 |
| entry | 无独立字段；宿主入口 = 包 main / `dsh.plugin.json main`；client 入口 = `client.main` | `manifest.ts:55`；panel `dsh.plugin.json` | **缺失**：规范要求 manifest 显式携带 entry |
| depends（id→区间） | `compatibility.depends/requires` 存在，值为区间字符串 | `manifest.ts:22`；`compatibility.ts` | 字段名与位置不同（在 `compatibility` 下）；**不禁止裸写包名**（非空字符串即可，`"*"` 也放行） |
| breaks | `compatibility.breaks` 存在 | `manifest.ts:24` | 满足语义，位置需对齐顶层 |
| core | 无 | `manifest-v1.md`「未决项」：`hostPackages` 空注入 | **缺失**：无 dsh 核心版本区间字段与校验 |

- **成本**：M（manifest v2：顶层 `entry/depends/breaks/core`，兼容旧 `compatibility`
  别名；校验器禁止裸包名）。

### 1.3 依赖声明版本区间

- **现状**：`semver-range.ts` 支持 `>= ^ ~ ||` 空格 AND、通配、预发布排序；但
  `isValidRange('*')` 为真，且 schema 只要求非空字符串 → 裸写包名/`"*"` 未被拦截。
- **差距**：规范要求“不允许裸写包名不带区间”；需在 manifest 校验层强制区间语法。
- **成本**：S。

## 2. 求解与 lockfile（规范不变量 1/2）

### 2.1 版本求解（resolve）

- **现状**：**没有版本求解器**。版本选择交给 pnpm/`dsh plugin`
  （`activation.ts:6`、`compatibility.ts:6` 注释）；`PluginSource.npm` 在真实服务
  中直接 reject（`service.ts:263`）；面板安装源为 GitHub/本地/zip/tgz
  （`panel/src/index.ts:1`）。
- **差距**：规范要求“给定依赖图与候选版本集，取满足全部 depends 且不在 breaks
  的最高版本，确定性输出”。现有激活求解器（`activation.ts`）只做 enable/disable
  动作规划，不做版本选择。
- **成本**：L（候选版本枚举来自 npm registry 元数据 + 确定性回溯求解 + 冲突全量
  报告）。

### 2.2 lockfile

- **现状**：注册表持久化 `gens/status`（版本事实 = manifest.version），BOM
  `intent/lock` 是只读快照且 lock 不含内容哈希（`bom.ts:27`；`p4-bom-design.md`
  Plan B 明确无生命周期）。snapshot 文件有 sha256（`snapshots.ts:48`），但那是
  插件状态快照，不是安装内容哈希。
- **差距**：无“每 id 精确版本 + 内容哈希”的安装级 lockfile；加载时没有对照
  lockfile 验证磁盘（版本+哈希），而是从注册表 manifest 直接恢复挂载
  （`lifecycle.ts:1566`）。
- **成本**：M–L（lockfile 格式 + 写入时机 + 加载校验 + 哈希计算）。

### 2.3 安装时求解、加载时校验

- **现状**：安装时没有求解（2.1）；加载时也没有重新求解，但从注册表恢复后做
  `reconcileCompatibility()`（`lifecycle.ts:1749,2047`）——这是“加载后校验约束”，
  不是“对照 lockfile 验证版本+哈希”。
- **差距**：需要把恢复路径改为：读 lockfile → 校验磁盘（版本+哈希）→ 全过才
  挂载；校验失败才允许显式重解或报错。现有 reconcile 保留为约束兜底。
- **成本**：M。

## 3. 加载行为（规范不变量 3/4）

### 3.1 挂载顺序 = 依赖图拓扑序

- **现状**：恢复按注册表行序逐个挂载（`lifecycle.ts:1660` 循环，注释明说
  “mounts rows in list order”）；事件派发序是 Kahn 拓扑序（`order.ts:1`），但
  挂载序不是依赖拓扑序。`install(autoResolve)` 会先 enable 依赖（`lifecycle.ts:852`），
  仅保证“依赖先激活”，不保证全局拓扑挂载。
- **差距**：需把依赖图（depends 边）拓扑序作为挂载顺序；被依赖者先初始化。
- **成本**：M。

### 3.2 环依赖拒绝

- **现状**：事件派生图的环会被检测为 `ordering-cycle`（`conflicts.ts:66`）；
  **depends 环没有专门检测**，激活求解器用 `MAX_ROUNDS=64` 防死循环
  （`activation.ts:37`），环内成员若都已启用则静默通过。
- **差距**：规范要求环依赖 MUST 拒绝并显式报错，禁止尽量加载。
- **成本**：S–M（depends 图 DFS 环检测 + 拒绝报告）。

## 4. 错误报告（规范不变量 5）

- **现状**：`compatibility-conflict` 带约束链（`compatibility.ts:432`）与建议动作
  （advisory install/suggest-update，`activation.ts`）；但 `planOperation` 拒绝时
  只报**第一个**冲突（`plan.ts` 各分支 `rejectedFromIssue(issues[0])`），激活求解
  失败也只返回一个 error。
- **差距**：规范要求一次性报告全部冲突：断点节点 + 完整冲突链 + 候选版本集及
  各自拒绝原因 + 建议动作（升级/降级到哪个区间）。
- **成本**：M（结构化 `ResolutionReport`：全量冲突收集、候选拒绝原因、建议动作
  推导）。

## 5. 路径与持久化（规范不变量 6/7）

- **现状**：
  - 持久化目录已统一在用户级 `$DSH_HOME`：注册表
    `storages/plugin_registry_<profile>`、状态 `plugin-state`、插件
    `mygo-plugins`、应用 `mygo-apps`、BOM `mygo-boms`（`config.ts:40`、
    `panel/src/index.ts:32-49`）——满足“不写 dsh 安装目录/npx 缓存”。
  - 但**安装/构建/桥接管线依赖 checkout**：`service.ts:224,560`
    `resolveCheckout` 找源码树，`bundle-rail.ts:283` 用 `checkout/bin/dsh`，
    panel `CHECKOUT` 硬编码 vendor 布局并在 checkout 里写 bridge、跑 pnpm/tsc
    （`panel/src/index.ts:32,424,1005,2048`）——npm 布局下不可用，且桥接包写进
    dsh checkout 的 node_modules（违反“插件数据不写 dsh 安装目录”的精神）。
  - `process.cwd()` 只作 `env.exec` 默认 cwd（`service.ts:176`），无定位依赖；
    未用 `__dirname`，但 `import.meta.url` 向上找 checkout 标记属于同款硬编码。
- **差距**：P0。路径解析必须改为相对 mygo 分配的基路径（`$DSH_HOME/mygo/...`）；
  bridge/安装落点迁出 checkout。
- **成本**：L（布局迁移 + 回归）。

## 6. npm 发版兼容（规范 npm 约束）

- **现状**：
  - 动态加载：入口形状正确（mygo `export default PluginManagerService`，面板
    `name/inject/apply`），但 lib 依赖裸 `cordis` 与 `@deepseek-ai/* ^0.0.1`
    （`lib/index.js:12`；三份 package.json），与 npm 生态
    （`@deepseek-ai/cordis@4.0.1-rc.1`）不匹配。
  - 依赖声明：`@deepseek-ai/*` 在 peer 且 `^0.0.1`；panel 有 `workspace:^` 与
    裸 `cordis`；官方 profile `autoInstallPeers: false` → 运行时必然缺依赖。
  - `.d.ts`：`files` 含 `lib/types/**/*.d.ts`，但 `lib/` 被 `.gitignore` 排除、
    package.json 无 prepare/prepack、panel `lib/` 不存在 → 直接发布缺产物。
  - `PluginSource.npm` reject（2.1）也属于 npm 轨缺口。
- **成本**：P0 四项合计 M–L（依赖契约 S–M、发布流水线 S–M、路径迁移 L、npm
  source M）。

## 7. 测试覆盖差距

- **现状**：453 例测试覆盖求解、plan、冲突、恢复、HMR、store 等
  （`docs/development-memo.md:589`），但无以下规范要求场景：
  1. 干净目录 + 模拟 npx 环境完整流程（安装→加载→运行）；
  2. 依赖缺失/区间不满足/breaks/环 各触发一次并断言报告格式；
  3. 钻石依赖裁决确定性（同输入两次字节级一致）；
  4. lockfile 锁定后 registry 新版本不影响启动；
  5. 持久化数据在 dsh 本体目录删除后存活。
- **成本**：L（新测试套件 + 隔离环境夹具）。

## 8. 汇总优先级

| 优先级 | Gap | 成本 |
|---|---|---|
| P0-a | 路径/布局迁移（checkout 依赖 → mygo 基路径） | L |
| P0-b | 依赖契约与发布流水线（cordis/deps/.d.ts/prepack） | S–M |
| P0-c | npm source 落地（候选版本 + 安装） | M |
| P1-a | manifest v2（entry/depends/breaks/core + 禁止裸包名） | M |
| P1-b | 版本求解器 + lockfile（含哈希）+ 安装时求解 | M–L |
| P1-c | 全量冲突报告 | M |
| P2-a | 加载时 lockfile 校验（版本+哈希），失败才重解/报错 | M |
| P2-b | 依赖拓扑挂载序 + depends 环拒绝 | M |
| P3 | 新测试套件（5 个规范场景）+ 验收报告 | L |
