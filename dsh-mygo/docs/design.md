# mygo 插件包管理体系设计（v1）

> 生成时间：2026-08-11 · 对应《收敛任务》全部 MUST；每个 MUST 的满足位置见
> 第 10 节追溯表。实现语言 TypeScript，运行时 Node ≥ 22（ESM），不依赖 tsx。

## 1. 总架构与双线治理

### 1.1 两条治理线

- **插件线（mygo 管理）**：以 `id` 为单位，同一 id 同一时刻只有一个版本实例。
  插件包安装进 mygo 专属 store，版本由 mygo 求解器裁决，结果写入 lockfile。
- **库线（npm 管理）**：插件声明在自身 `package.json.dependencies` 的普通 npm 包，
  由 pnpm/node_modules 解析（可多版本共存）。mygo 只负责在安装插件后把库依赖
  交给 `dsh plugin add`/pnpm 安装，绝不把库依赖放进插件求解域。

### 1.2 mygo 基础路径

一切路径解析相对 `MYGO_BASE`，定义为：

```text
MYGO_BASE = $DSH_HOME/mygo        # DSH_HOME 缺省为 ~/.dsh
```

`MYGO_BASE` 下目录约定（第 8 节）。运行时禁止使用 `process.cwd()`、
`__dirname` 或向上查找源码树定位；`import.meta.url` 只允许用于“定位本包内资源”，
不允许用于定位 dsh checkout。

## 2. manifest v2（`dsh.mygo` 段）

### 2.1 规范字段

```jsonc
{
  "dsh": {
    "mygo": {
      "id": "optional-kebab-id",          // 缺省 = package.json name（scope 剥离）
      "version": "0.0.1-rc.1",            // 缺省 = package.json version
      "entry": "lib/index.js",            // MUST：插件入口，相对包目录
      "depends": {
        "other-plugin": ">=1.0.0",
        "service:voice-chat": "^0.1.0 || ~0.2.0"
      },
      "breaks": {
        "legacy-plugin": "<2.0.0"
      },
      "core": ">=0.0.1-rc.1",             // 兼容的 dsh 核心版本区间
      "provides": ["service:voice-chat"], // 保留（v1 已有）
      "entrypoints": { ... }              // 保留（v1 已有）
    }
  }
}
```

### 2.2 校验规则（`manifest-v2.ts`）

1. `id`：`/^[a-z][a-z0-9-]*$/`；缺省取包名去 scope。
2. `version`：semver 形状，允许预发布段（`0.0.1-rc.1`）。
3. `entry`：非空字符串；不得以 `../` 开头（禁止逃出包目录）。
4. `depends` / `breaks`：值是 **semver 区间**，必须通过 `isValidRange`（现有
   `semver-range.ts`，支持 `>= ^ ~ ||`、空格 AND、通配与预发布排序）；**裸写
   包名（非区间）直接拒绝**（`manifest-invalid`，field 指向具体键）。
5. `core`：必填校验；缺失时按规范“未声明兼容区间”**警告放行**（向后兼容 v1
   插件），但写入 lockfile 时标记 `core: "*"`。
6. 兼容旧字段：`compatibility.requires/depends` → `depends`，
   `compatibility.breaks` → `breaks`；两者同时声明同名键 → `manifest-invalid`
   （沿用 `normalizeCompatibility` 语义）。

### 2.3 预发布匹配语义（需要修正现有 `semver-range.ts`）

按 npm semver 规则：预发布版本只有在该区间对同一
`major.minor.patch` 三元组显式带预发布比较符时才可匹配
（如 `^0.0.1-rc.1` 可匹配 `0.0.1-rc.2`；`>=1.0.0` 不匹配 `1.0.1-rc.1`）。
现实现用纯版本序比较，需要增加“预发布门”：

```text
matchesVersionRange(v, r):
  if v 是预发布 && r 未显式引用相同三元组的预发布比较符:
      return false
  return 现比较逻辑
```

## 3. 候选版本与 registry 客户端

### 3.1 候选来源

- npm registry 元数据：`GET https://registry.npmjs.org/<name>`（私有 scope 走
  `_authToken` 环境注入），取 `versions` 中所有合法 semver，作为远端候选。
- mygo store 中已安装版本（`MYGO_BASE/packages/<id>/`），作为本地候选。
- 同一版本出现在多个来源时按固定来源序（registry 先、本地后）去重。

### 3.2 候选排序

按 semver **降序**（预发布按 semver 规则低于同三元组正式版）；版本相同按
来源序。排序完全确定性。

## 4. 求解算法（resolve）

### 4.1 输入

```text
requests: Map<id, { range?, source? }>   // 本次要安装/变更的插件
installed: Map<id, { version, entry, depends, breaks, core }>  // store/注册表现状
candidates: Map<id, Version[]>            // 由 3.1 汇总
coreVersion: string                       // dsh 核心版本
```

### 4.2 算法伪代码

```text
resolve(requests, installed, candidates, coreVersion):
  graph = buildDependsGraph(requests ∪ installed)      // 节点=id，边=depends
  cycle = findCycle(graph)                              // DFS
  if cycle: return FAIL(report.cycles=[cycle])          // MUST 拒绝，不妥协

  universe = {}                                          // id -> chosen version
  order = deterministicTopoOrder(graph)                  // Kahn + min-heap（按 id）
  reports = []

  function pick(id):
    for version in candidates[id] (降序):                // 最高者优先
      reasons = []
      for (depId, depRange) in depends(id):
        if depId not in universe: continue               // 交给后续节点
        if not matches(depId.version, depRange):
          reasons += "depends {depId}={depId.version} 不满足 {depRange}（路径 {chain}）"
      for (brId, brRange) in breaks(id):
        if brId in universe and matches(brId.version, brRange):
          reasons += "breaks {brId}={brId.version} 命中 {brRange}"
      if not matches(coreVersion, core(id)):
        reasons += "core {coreVersion} 不满足 {core(id)}"
      if reasons 为空:
        universe[id] = version
        return OK
      reports[id][version] = reasons
    return FAIL(id, reports[id])                          // 该 id 无可用候选

  for id in order:
    result = pick(id)
    if FAIL: 继续收集其余节点冲突，不中断        // MUST 一次性报告全部冲突

  if any FAIL: return FAIL(report=merge(reports))
  return OK(resolvedGraph=universe)
```

裁决规则（MUST）：满足全部 `depends`、不在任何 `breaks` 区间、`core` 满足的候选中
取版本号最高者；同输入必同输出（候选序、图序、报告序全部确定性）。

### 4.3 环依赖

`depends` 有向图 DFS 检测；发现环 → 立即整体拒绝，报告环路径
（`["A","B","A"]`），**禁止尽量加载**。事件派发层的 `ordering-cycle` 检测保留。

## 5. lockfile

### 5.1 文件

```text
MYGO_BASE/lockfiles/<profile>.dsh.lock.json
```

### 5.2 格式（`dsh.lock/v1`）

```jsonc
{
  "format": "dsh.lock/v1",
  "generated": {
    "by": "dsh-mygo",
    "version": "0.2.1",
    "profile": "web",
    "core": "0.0.1-rc.1",
    "at": "2026-08-11T00:00:00Z"
  },
  "plugins": {
    "dsh-tool-calculator": {
      "version": "1.2.0",
      "entry": "lib/index.js",
      "core": ">=0.0.1-rc.1",
      "depends": { "dsh-base": ">=1.0.0" },
      "breaks": {},
      "entrySha256": "hex…",        // 入口文件内容哈希
      "manifestSha256": "hex…",     // 安装清单（.mygo-package.json）哈希
      "integrity": "sha512-…",       // npm dist.integrity（有则保留，用于安装期校验）
      "source": "npm"
    }
  }
}
```

`plugins` 以 id 为键，记录精确版本、入口、依赖/breaks/core、内容哈希。
库依赖**不进入本 lockfile**（归 pnpm lockfile 管理）。

### 5.3 写入时机与原子性

- 求解成功、包安装完成、哈希计算完成后写 lockfile；temp + rename 原子替换，
  旧文件保留 `.bak`。
- 安装/升级/降级/卸载都重写 lockfile。

## 6. 安装流程（install）

```text
install(source npm|path|github, request):
  1. 收集候选（3.1）；若指定 range 则先过滤
  2. resolve()（第 4 节）
  3. 失败 → 返回结构化报告（第 7 节），零副作用
  4. 下载选定版本 tarball（npm integrity 校验）
  5. 解压到 MYGO_BASE/tmp/<uuid>，校验 entry 存在且不逃逸包目录
  6. 原子移入 MYGO_BASE/packages/<id>/<version>/，写 .mygo-package.json
     （含 manifest、entry、sha256、source）
  7. 计算 entrySha256 / manifestSha256，写 lockfile
  8. 插件包内声明的库依赖（package.json.dependencies）转交
     dsh plugin add / pnpm（bundle rail），不进入插件求解域
  9. 注册表持久化（现有 gens/status）记录安装事实
  10. 按第 6 节挂载
```

“安装时求解、加载时校验”：

- 求解只发生在 install/update/remove/reinstall 命令。
- 加载（recover）只做 6.1 的 lockfile 校验，**不接触 registry、不重新求解**。

## 7. 加载时校验与挂载

### 7.1 校验（load-time verify）

```text
verifyLockfile(lockfile, coreVersion):
  for id, lock in lockfile.plugins:
    pkgDir = MYGO_BASE/packages/<id>/<lock.version>
    errors = []
    if pkgDir 不存在: errors += "包目录缺失"
    if entry 文件不存在: errors += "入口缺失"
    if sha256(entry) != lock.entrySha256: errors += "入口哈希不匹配"
    if sha256(.mygo-package.json) != lock.manifestSha256: errors += "清单哈希不匹配"
    if not matches(coreVersion, lock.core): errors += "core 不满足"
    // 不重新求解；仅对照 lockfile 与磁盘
  if errors: return FAIL(structured report)
```

### 7.2 挂载顺序（MUST = 拓扑序）

- 从 lockfile 重建 `depends` 图（使用 lock 中记录的 depends）。
- Kahn 拓扑排序，同层按 id 字典序（确定性），被依赖者先初始化。
- 环 → 硬拒绝（load-time 报告 `dependency-cycle`），不挂载任何成员。
- 现有事件派发序（`order.ts`）保持独立，不参与挂载序。

### 7.3 确定性启动

- lockfile 是启动唯一权威；registry 新版本不影响启动（不查询 registry）。
- 只有校验失败或用户显式 `mygo update` 才允许重新求解。

## 8. 目录结构约定

```text
$DSH_HOME/mygo/
  packages/<id>/<version>/          # 不可变插件 store（内容 + .mygo-package.json）
  lockfiles/<profile>.dsh.lock.json
  config/<id>.json                  # 插件配置（schemastery 校验后落盘）
  tmp/                              # 安装暂存（原子 rename 源）
$DSH_HOME/mygo-plugins/             # 保留：旧桥接安装目录（迁移期只读兼容）
$DSH_HOME/plugin-state/             # 保留：运行时状态/快照/审计
$DSH_HOME/storages/plugin_registry_<profile>/   # 保留：注册表 sqlite
```

全部相对 `$DSH_HOME`（缺省 `~/.dsh`），与 dsh 安装目录、npx 缓存无耦合。

## 9. npm 发版兼容约束的满足方式

1. **动态加载**：入口统一经 `pathToFileURL(join(pkgDir, entry))` 动态
   `import()`（ESM）或 `createRequire(join(pkgDir, 'noop.js'))`（CJS）；lib 产物
   与 bundler 处理下均为普通字符串路径 + Node 标准机制，无 tsx。
2. **依赖声明**：mygo 自身全部运行时 import 进 `dependencies`（发布前用
   `lib` import 图自动校验）；`cordis` → `@deepseek-ai/cordis`；peer 版本改
   `^0.0.1-rc.1`；去掉 `workspace:^`。
3. **.d.ts**：`tsc -b` 产出 `lib/types/**/*.d.ts`，`files` 白名单保留；新增
   `prepack` 构建脚本与 CI 产物存在性检查。
4. **路径**：删除 `resolveCheckout` / `checkout/bin/dsh` / panel `CHECKOUT`
   硬编码；dsh 核心版本经 `@deepseek-ai/dsh` 包版本解析（`createRequire` 于
   mygo 安装锚点），测试可注入 `DSH_CORE_VERSION`。

## 10. MUST 追溯表

| MUST | 设计节 | 实现文件（规划） | 测试 |
|---|---|---|---|
| 插件/库分线 | 1.1 | `package-manager.ts`、`bundle-rail.ts` | `package-lines.spec.ts` |
| manifest 五字段（id/version/entry/depends/breaks/core） | 2.1–2.2 | `manifest-v2.ts` | `manifest-v2.spec.ts` |
| 区间支持 `>= ^ ~ ||`、禁裸包名 | 2.2 | `semver-range.ts`（门修正） | `semver-range.spec.ts` |
| 求解裁决：最高版本、确定性 | 4.2 | `resolver.ts` | `resolver.spec.ts`（钻石用例） |
| lockfile：精确版本 + 内容哈希 | 5 | `lockfile.ts` | `lockfile.spec.ts` |
| 安装时求解、加载时校验、加载不重解 | 6/7.1 | `lifecycle.ts` 集成 | `load-verify.spec.ts` |
| 同安装确定性启动（新版本不影响） | 7.3 | `resolver.ts`/`lockfile.ts` | `determinism.spec.ts` |
| 挂载序 = 依赖图拓扑序 | 7.2 | `mount-order.ts` | `mount-order.spec.ts` |
| 环依赖拒绝 | 4.3/7.2 | `resolver.ts` | `cycle.spec.ts` |
| 全量冲突报告（断点/链/候选拒绝原因/建议） | 7（下节） | `report.ts` | `report.spec.ts` |
| 持久化/配置目录统一分配，不依赖安装位置 | 1.2/8 | `paths.ts` | `paths.spec.ts`（删 dsh 目录存活） |
| 不依赖 cwd/__dirname | 1.2/9.4 | `paths.ts` | `paths.spec.ts` |
| 动态加载在 lib/bundler 下工作 | 9.1 | `entry-loader.ts` | `entry-loader.spec.ts` |
| 依赖全在 dependencies | 9.2 | package.json + 校验脚本 | `publish-check.spec.ts` |
| .d.ts 随包发布 | 9.3 | prepack/CI | `publish-check.spec.ts` |

## 11. 错误报告格式（resolve/load 共用）

```jsonc
{
  "code": "resolve-failed" | "lockfile-mismatch" | "dependency-cycle",
  "summary": "3 个冲突，1 个环",
  "cycles": [["A", "B", "A"]],
  "conflicts": [
    {
      "plugin": "A",
      "constraint": { "kind": "depends", "target": "B", "range": ">=2.0.0" },
      "chain": ["A", "B", "C"],                    // 完整依赖路径
      "candidates": [
        { "version": "1.0.0",
          "rejected": [
            "depends B=1.5.0 不满足 >=2.0.0",
            "breaks B=1.5.0 命中 <2.0.0",
            "core 0.0.1-rc.1 不满足 >=0.1.0"
          ] }
      ],
      "actions": [
        "升级 B 到 >=2.0.0 <3.0.0",
        "降级 A 到 <1.0.0 以解除与 B 的 breaks"
      ]
    }
  ]
}
```

规则：

- 一次输出全部冲突（每个失败 id 的每个候选的全部拒绝原因），禁止只报第一个。
- `chain` 从声明者沿约束链到断点节点。
- `actions` 由启发式推导：目标区间与候选区间求交/并集，给出升级/降级建议；
  建议不承诺可解（求解器仍可拒绝）。
- 未声明兼容区间（无 core/depends 约束的一方）→ 警告放行，不进入 conflicts。

## 12. 向后兼容与破坏性变更

保留：`PluginSource.inline`、`adoptRaw`、`compatibility` v1 别名、面板
GitHub/本地/zip 安装、BOM、事件派发序。

破坏性变更（单独列出）：

1. `PluginSource.npm` 从“恒拒绝”变为真实安装（预期行为，旧调用方不受影响）。
2. 加载路径从“注册表直接恢复”变为“lockfile 校验后拓扑挂载”；存量无 lockfile
   的 profile 首次升级时执行一次迁移求解并生成 lockfile。
3. 面板桥接包落点从 checkout node_modules 迁到 `MYGO_BASE/bridges/`（旧目录
   停止写入，存量可继续被宿主加载直到手动迁移）。
4. 依赖区间校验变严（裸包名拒绝），存量 manifest 若不满足会在安装期报
   `manifest-invalid` 并给出字段定位。
