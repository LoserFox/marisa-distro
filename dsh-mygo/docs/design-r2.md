# 第二轮增强设计（嵌套包治理 / 版本钉定修正 / 可插拔挂载）

> 生成时间：2026-08-11 · 本设计覆盖《第二轮增强》13 条强约束，第 7 节逐条追溯。

## 0. 分层与术语

```text
mygo 核心（固定语义）
  获取（npm registry 语义） / 求解（pins + 嵌套候选 + depends/breaks/core）
  / 符号校验 / 编排（相位化挂载）/ 路径分配
        │
        ▼
loader 契约层（可插拔，v1 只注册两个内置实现）
  standard@1：动态 import 挂载（现有 lifecycle）
  mixin@1：相位0/1/2 + patch 冲突/时序检测（v1 内置引擎，禁止插件化自举）
```

- 内嵌包（bundled）：插件发行包内携带独立 manifest 的完整包。
- 内联代码（inlined）：经 bundler 编译、无独立 manifest 的代码。
- 钉定（pin）：profile 根 manifest 对某包版本的硬约束；被钉包是求解图根节点的
  唯一候选（标记 `pinned`）。

## 1. manifest v2.1（新增字段）

```jsonc
{
  "dsh": {
    "mygo": {
      "id": "dsh-fabric",
      "version": "0.0.2",
      "entry": "lib/index.js",
      "depends": { "dsh-base": ">=0.0.1-rc.1" },
      "breaks": {},
      "core": ">=0.0.1-rc.1",
      "provides": ["service:fabric"],
      "bundles": [
        { "id": "code-transformer", "version": "0.18.1", "path": "vendor/code-transformer" }
      ],
      "loader": { "id": "mixin", "range": ">=1.0.0 <2.0.0" },
      "shared": false
    }
  }
}
```

### 1.1 字段语义

- `bundles`：本发行包携带的全部内嵌包，**MUST 全量声明**。
  - `id`：内嵌包 manifest 的 id（package.json `dsh.mygo.id` 或去 scope 包名）；
  - `version`：内嵌包精确 semver；
  - `path`：相对本包根目录的内部路径，禁止 `../` 逃逸。
- `provides`：本包对外等价提供的 id 列表（桥接/分叉）；求解器把
  `depends: { "<provided-id>": range }` 解析到 provider。
- `loader`：`{ id, range }`；`id` 必须是已注册 loader（v1：`standard`/`mixin`），
  `range` 是 loader 契约版本区间（逻辑同 depends，不满足硬阻断）。
- `shared`：显式共享状态标记；为 true 或命中 1.3 检测规则的内嵌包 MUST 经
  `bundles` 声明。

### 1.2 校验规则（manifest-v2.ts 扩展）

1. `bundles` 每项：id 合法、version 为 semver、path 非空且不逃逸；
   同一 id 重复声明 → `manifest-invalid`。
2. `loader`：id ∈ 内置 loader 集合；range 通过 `isValidRange`。
3. 三类禁止内联检测（对包内所有非 node_modules 文件做静态扫描）：
   - 文件 import 任何 `@deepseek-ai/*` → 调用 dsh 核心 API；
   - 存在带 `dsh.mygo` 的嵌套 manifest → 本身是插件；
   - `dsh.mygo.shared === true` → 共享状态。
   任一命中且未在 `bundles` 声明 → `manifest-invalid`（字段指向具体文件）。

## 2. 嵌套包扫描与去重

### 2.1 扫描算法

```text
scanBundles(root, declared):
  for each declared in root.dsh.mygo.bundles:
    dir = resolveInside(root, declared.path)          // 防逃逸
    pkg  = parsePackageManifest(dir/package.json)     // 必须带 dsh.mygo（否则 invalid）
    if pkg.id != declared.id or pkg.version != declared.version:
      manifest-invalid（声明与实际不一致）
    candidates[id].push({ version, constraints, source: "bundle:<owner>" })
    scanBundles(dir, pkg.bundles)                     // 递归，visited 防环
```

- 递归深度上限 8、visited 集合防环；环 → `manifest-invalid`。
- 未声明但命中的内嵌包（1.2-3）→ 在安装/加载期硬报错。

### 2.2 去重裁决

- 嵌套包进入求解图后与 registry/lockfile 候选同规则裁决：满足全部约束的最高
  版本胜出；同一版本多来源按固定序（pinned > registry > locked > bundle）。
- lockfile 记录胜者；加载时**只加载胜者副本**，落选副本 MUST NOT 被 import
  （包 store 校验 + entry 加载器按 lockfile 指向）。

## 3. profile 版本钉定（修正语义）

### 3.1 输入

```text
pins: Map<name, { version, source: "profile" | "core" }>
```

- 来源：profile package.json 的 `dsh.profile.pins`（显式）＋核心包
  `@deepseek-ai/dsh` 及其 host-bound 包版本快照（自动）。
- 求解器把 pins 作为**根节点硬约束**：被钉包在候选集里只有钉定版本
  （`pinned: true`），不可被 registry/bundle 候选替代。

### 3.2 校验时机

- 安装/变更时求解：`resolve({ pins, ... })` 全程使用钉定版本做 depends/breaks
  /core/符号校验（现有 finalCheck 直接消费最终候选）。
- 加载时：lockfile 记录 `pins` 快照；`verifyAtBoot` 对照当前 profile 实际钉定，
  不一致 → 硬阻断（structured report），**禁止“校验声明版本、运行替换版本”**。

### 3.3 冲突归因

- 新增约束类型 `pin`：冲突报告 `constraint: { kind: "pin", target, range }`，
  `plugin` 为被钉包，`chain` 含 profile 根；actions 双向：
  - “提升 profile/core 钉定版本到满足 <range>”；
  - “改用兼容当前钉定版本 <version> 的插件版本”。
- 禁止单方面归责插件。

## 4. 符号级校验（最终事实源）

### 4.1 静态 import 扫描

```text
collectImports(pluginDir):
  for each .js/.mjs/.cjs/.ts 文件（排除 node_modules / bundles 路径）:
    解析 import/export-from 的具名符号（ESM）
    解析 require(...).name / destructure（CJS，尽力而为）
  → Map<外部包名, Set<具名符号>>
```

### 4.2 比对规则

- 对每个外部包名：先按 pins 解析实际加载版本，动态 `import()` 其入口
  （或读 .d.ts 导出声明）得到运行时 exports 集合：
  - 符号缺失 → **硬阻断**（`symbol-missing`，报告包名+版本+缺失符号+引用文件），
    无论版本区间是否满足；
  - 符号存在但版本区间不满足 → **警告放行**（版本可能因 backport 说谎，
    符号是事实源）。
- 比对结果写入 lockfile（`symbols` 段），加载校验复用；宿主包符号由 pins 快照
  提供。

## 5. loader 契约与相位化挂载

### 5.1 loader 契约接口

```ts
interface LoaderContract {
  readonly id: string            // 'standard' | 'mixin'
  readonly version: string       // 语义化版本
  mount(plugin: Mountable, ctx: MountContext): Promise<Disposer>
  unmount(disposer: Disposer): Promise<void>
  capabilities(): readonly string[]
}
```

- mygo 核心持 `LoaderRegistry`（v1 只注册 `standard@1.0.0`、`mixin@1.0.0`）。
- 插件 `loader.range` 在加载期校验（逻辑同 depends）；不满足 → 硬阻断。

### 5.2 相位化挂载编排器（MountOrchestrator）

```text
phase 0  collect:
  对 loader=mixin 的插件收集 patch 声明（manifest.patches 或 entry 导出）
  构建冲突表 key = module#filePath#symbol
  冲突 → 硬阻断（报告双方 + 目标位置）
  顺序 = 拓扑序（depends 图）优先，id 字典序兜底 → 确定性强序

phase 1  transform:
  按 phase0 顺序安装内置 mixin 引擎的 instrumentation
  目标模块加载前必须全部就绪；引擎记录“目标已加载”事件
  目标加载后才注册/到达的 patch → 显式错误（patch-late-registration）

phase 2  mount:
  按依赖拓扑序挂载普通插件（现有 recoverOrder 语义）
```

### 5.3 确定性

- patch 应用顺序两次运行字节级一致：输入（插件集合、pins、bundles）相同 →
  冲突表、phase0 序、instrumentation 序列化完全确定；测试用
  `JSON.stringify(记录)` 断言。

## 6. mixin 引擎内置（v1）

- v1 把 fabric 的 transform 核心（`browser-transform.ts` / `node-loader.ts` /
  `runtime.ts` 的纯函数部分）vendor 进 `packages/cordis/mygo/src/mixin/`，
  保留来源注释与许可；fabric 仓库不再作为运行时引擎依赖，只作为“使用 mixin
  loader 的插件”参与验收。
- 锚点规范：`module#exportPath`（如 `dsh-core#Session.start`），底层仍经
  `functionQuery.functionName` 命中；**禁止行号/语句位置**作为锚点；manifest
  层锚点校验拒绝结构特征。
- 对核心团队的约束请求（写入 docs 并在 issues 提交）：
  dsh lib 发布产物 MUST NOT minify；导出符号名 MUST 作为稳定契约维护。

## 7. MUST 追溯表（13 条）

| # | 强约束 | 设计节 | 实现文件（规划） | 测试 |
|---|---|---|---|---|
| 1 | manifest 新增 bundles/provides | 1.1 | `manifest-v2.ts` | `manifest-v2.spec.ts` |
| 2 | 加载时递归扫描 bundles 入求解图、去重、落选不加载 | 2 | `bundle-scan.ts`、`resolver.ts`、`package-manager.ts` | `bundles.spec.ts` |
| 3 | 三类包禁止求解器不可见打包 | 1.2 | `manifest-v2.ts`（静态扫描） | `bundles.spec.ts` |
| 4 | 纯叶子库自由内联 | 1.2/1.4 | 扫描规则排除 | 同上 |
| 5 | 钉定作为求解器输入、pinned 唯一候选 | 3.1 | `resolver.ts`、`profile-pins.ts` | `pins.spec.ts` |
| 6 | 校验作用于钉定后版本，冲突加载期硬阻断 | 3.2 | `resolver.ts`、`verifyAtBoot` | `pins.spec.ts` |
| 7 | 符号级校验：缺失硬阻断、区间说谎警告 | 4 | `symbol-verify.ts`、`lockfile.ts` | `symbol-verify.spec.ts` |
| 8 | 钉定冲突归因含 profile + 双向建议 | 3.3 | `report.ts` | `pins.spec.ts` |
| 9 | manifest loader 字段 + 契约版本校验 | 5.1 | `manifest-v2.ts`、`loader-registry.ts` | `loader.spec.ts` |
| 10 | 相位0/1/2 + 目标加载后注册显式报错 | 5.2 | `mount-orchestrator.ts`、`mixin/` | `orchestrator.spec.ts`、fabric 实测 |
| 11 | patch 目标冲突检测 + 确定性顺序 | 5.2/5.3 | `patch-table.ts` | `patch-conflict.spec.ts` |
| 12 | 锚点 = 导出符号路径；不 minify 请求 | 6 | 锚点校验 | `anchor.spec.ts` |
| 13 | v1 mixin 内置、禁止 loader 自举 | 6/5.1 | `mixin/`、`loader-registry.ts` | 代码审查 + 测试 |

## 8. 破坏性变更

1. manifest v2.1：`bundles`/`loader` 为新增可选字段；命中 1.2-3 检测而未声明的
   存量插件升级后安装/加载报 `manifest-invalid`（预期）。
2. 求解器新增 `pins`：profile 钉定不再由 pnpm overrides 后处理；存量 overrides
   需迁移为 `dsh.profile.pins`（脚本迁移）。
3. 加载校验新增符号与钉定快照：lockfile v1 → v2 字段追加，旧 lockfile 首次
   升级执行一次迁移校验。
4. mixin 挂载语义从“fabric 独立包”迁移为“mygo 内置引擎 + fabric 插件声明”；
   fabric 的组合行 `cordis-fabric` 不再直接挂载引擎。
