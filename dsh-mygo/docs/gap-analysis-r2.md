# 第二轮增量 Gap 分析（嵌套包 / 版本钉定 / 可插拔挂载）

> 生成时间：2026-08-11 · 对照《第二轮增强》13 条强约束审查第一轮产出与现有代码。
> 证据列给文件:行；成本：S ≈ 0.5 天，M ≈ 1–3 天，L ≈ 1–2 周。

## 增强一：嵌套包（bundled 依赖）治理

### 1.1 manifest 新增 `bundles` / `provides`

- **现状**：`manifest-v2.ts` 有 `provides`（数组，v1 已存在），**无 `bundles` 字段**；
  分发侧 schema 也未见内嵌包声明。fabric 的 patch 声明在组合配置
  （`config.fabric.patches`），不在 manifest。
- **差距**：缺 `bundles`（id+version+内部路径）字段与校验；`provides` 已有但
  求解器尚未消费（见 1.3）。
- **成本**：S–M（schema + 校验 + 扫描器）。

### 1.2 加载时递归扫描 bundles 并纳入求解图

- **现状**：无。求解器只吃 registry/lockfile 候选（`resolver.ts`），包 store
  安装时只校验入口，不递归扫描包内嵌套包。
- **差距**：需要“解包后递归扫描 `bundles` 指向的 manifest → 作为候选（source
  `bundle:<owner>`）→ 参与去重与 depends/breaks 校验；落选副本 MUST NOT 加载”。
- **成本**：M（扫描器 + 候选注入 + 去重裁决 + 加载侧“只用胜者”约束）。

### 1.3 三类包禁止“求解器不可见”打包

- **现状**：无检测。插件可以任意内联 dsh 核心 API 调用、跨插件共享状态或另一个
  插件，mygo 无法发现。
- **差距**：需要静态检测：内嵌包本身是插件（有 `dsh.mygo`）、import 任何
  `@deepseek-ai/*`（调用 dsh 核心 API）、或显式标记共享状态（建议新增
  `dsh.mygo.shared: true`）→ 必须经 `bundles` 声明，否则 `manifest-invalid`。
- **成本**：M（静态 import 扫描 + 规则判定 + 报错）。

### 1.4 纯叶子库允许自由内联

- **现状**：符合（无任何扫描，自然放行）。
- **差距**：无；需文档明确定义“叶子库 = 无 dsh.mygo、无 @deepseek-ai/* import、
  无 shared 标记”。
- **成本**：0。

## 增强二：profile 版本钉定语义修正

### 2.1 钉定作为求解器输入约束（非后处理替换）

- **现状**：第一轮把 profile 的 npm 依赖交给 pnpm/`dsh plugin` 处理，mygo
  **没有**“profile 钉定”概念；若用户用 pnpm overrides 强制替换，发生在 mygo
  求解之后，正是规范指出的 bug 路径。
- **差距**：需要 profile 根 manifest（`dsh.profile.pins` / 现有 profile
  package.json 依赖）→ 求解器输入 `pins: Map<name, {version}>`，被钉包以
  唯一候选（`pinned` 标记）入图。
- **成本**：M（pins 解析 + resolver 改造 + 报告归因）。

### 2.2 校验作用于钉定后版本

- **现状**：resolver 对 depends/breaks 的校验在选定候选后立即做（已是最终
  版本），但**没有钉定输入**，因此 profile 替换后的真实运行版本不在校验域内。
- **差距**：把 pins 作为候选唯一来源后，现有 finalCheck 天然满足“校验作用于
  最终版本”；需补“钉定冲突硬阻断”与归因。
- **成本**：S（在已有 finalCheck 上扩展）。

### 2.3 符号级校验作为最终事实源

- **现状**：无符号校验；加载只验 lockfile 版本+哈希（`lockfile.ts
  verifyLockfile`），不知道插件实际 import 了哪个符号。
- **差距**：新增 `symbol-verify.ts`：静态扫描插件入口（及包内文件）的外部
  import 具名符号 → 对照实际加载包版本的运行时 exports / .d.ts；缺失硬阻断，
  区间不满足但符号存在 → 警告放行。
- **成本**：L（import 图扫描 + exports 探测 + 报告）。

### 2.4 钉定冲突报告归因与双向建议

- **现状**：冲突报告里 constraint 只有 depends/breaks/core/entry，无 `pin`；
  actions 建议只面向插件侧。
- **差距**：新增 `pin` 约束类型，冲突方包含 profile 钉定，actions 双向
  （提升 profile/core 钉定版本 / 换兼容当前钉定的插件版本）。
- **成本**：S。

## 增强三：loader 无关的可插拔挂载架构

### 3.1 manifest `loader` 字段与契约版本

- **现状**：无 loader 字段；挂载语义硬编码在 lifecycle（`activate` hooks）。
- **差距**：新增 `loader { id, range }`；内置 loader 注册表
  （`standard@1`、`mixin@1`）；加载期按 depends 逻辑校验区间。
- **成本**：S–M。

### 3.2 相位化挂载（0 收集 patch / 1 transform / 2 拓扑挂载）

- **现状**：无相位概念；recover 按 `recoverOrder` 顺序挂载，mixin 无入口。
  fabric 的 host 集成要求“boot 准备阶段先 bootstrap”，npm rc.1 未提供该 seam。
- **差距**：mount orchestrator 增加 phase0/1/2；patch 在目标模块加载前应用；
  目标已加载后注册 patch → 显式报错。
- **成本**：L（编排器 + 目标加载追踪 + 时序错误）。

### 3.3 patch 目标冲突检测与确定性顺序

- **现状**：无。fabric 自身对 patch id 全局唯一有校验，但 mygo 层没有跨插件
  目标冲突检测；fabric 的 patch 顺序语义未接入 mygo。
- **差距**：冲突键 `module#filePath#symbol`；冲突硬阻断并报告双方与位置；
  顺序 = 拓扑序优先 + id 字典序兜底，两次运行字节级一致。
- **成本**：M。

### 3.4 锚点规范与产物约束请求

- **现状**：fabric 用 `functionQuery.functionName`（符号名）而非行号，方向正确；
  mygo 无锚点校验层。
- **差距**：统一导出符号路径锚点（如 `dsh-core#Session.start`），禁止行号/语句
  位置；在文档/issue 向核心团队提出“lib 不 minify、导出符号名稳定”约束请求。
- **成本**：S（规范 + 校验）。

### 3.5 v1 mixin 引擎内置、loader 插件化留 v2

- **现状**：fabric 是独立仓库/包（`dsh-cordis-fabric`），含完整 transform 引擎
  （`src/browser-transform.ts` 等）；mygo 核心不含任何 AST 能力。
- **差距**：v1 需把 mixin 引擎内置进 mygo（vendor 移植或直接依赖），fabric 变成
  声明 loader=mixin 的普通插件；禁止实现 loader 插件自举。
- **成本**：L（引擎移植 + 契约接线 + fabric 改造为测试主体）。

## 测试覆盖差距

- 现有 494 用例覆盖 R1；R2 新增六类场景全部缺失（内嵌去重、未声明 bundles 检出、
  钉定冲突硬阻断、符号缺失/区间说谎、patch 迟注册报错、patch 目标冲突+确定性）。
- mixin 验收必须以真实 fabric 插件在 npm lib 生产模式实测，现有 fabric 尚未以
  loader=mixin 声明接入 mygo。

## 汇总优先级

| 优先级 | Gap | 成本 |
|---|---|---|
| P0-a | 钉定作为求解输入 + 冲突归因（修 profile 替换 bug） | M |
| P0-b | 符号级校验（最终事实源） | L |
| P1-a | bundles 字段 + 递归扫描 + 去重 + 三类禁止内联检测 | M |
| P1-b | loader 契约 + 相位化挂载编排（mixin 内置） | L |
| P1-c | patch 冲突检测 + 确定性顺序 + 锚点规范 | M |
| P2 | fabric 插件化改造 + npm lib 实测验收 | L |
