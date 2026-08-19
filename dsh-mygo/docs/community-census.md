# 社区插件模板仓库普查（two-tier 契约的现实校验）

> 生成时间：2026-08-11 · 任务：对 `docs/two-tier-contract.md` 与 `docs/expected-behavior.md`
> （FROZEN）社区侧边界（A7/A11、EB-D8）做只读静态普查。
> 方法：只读静态分析，未执行任何第三方仓库的 npm install / build / 插件代码。
> 每条结论附证据（仓库:文件:行号 或命中计数）；统计类结论附样本支撑度，禁止把单仓库行为泛化。

## 1. 样本说明

### 1.1 普查总体与静态样本

| 层 | 数量 | 说明 |
|---|---|---|
| 官方目录总体 | 241 个仓库 | `dsh-external/hub` `catalog.json`（生成于 2026-08-11T15:00:48Z，`/tmp/hub-GwIAgc/hub/catalog.json`） |
| 静态样本 | 90 个仓库 | `/home/rosen/workspace/dsh_dev/dsh-external-src/` 仓库快照（14 个为 git 克隆、remote 均为 `github.com/dsh-external/*` 且与上游同步；其余 76 个为无 `.git` 的本地快照目录，无法推送） |
| 含根 package.json | 80 个仓库 | 用于 npm 元数据统计 |
| 无根 package.json | 10 个仓库 | 其中 4 个为嵌套 monorepo（dsh-github-integration / dsh-subagent-tree / dsh-working-activity / tg-bot，嵌套 package 未计入 80 统计但源码统计包含）；6 个无 npm 形态（DSH-UI4A、dsh-advisor、dsh-llm-fallbacks、dsh-remote、dsh-web-workflow-visualizer、scan） |

目录结构：152 个 plugin、21 个 collection、35 个 infra、10 个 skill、7 个 channel、4 个 community、3 个 research、9 个未分类；`bundle: true` 92 / false 149；manifest 分布：`package.json` 145、`dsh.plugin.json` 27、null 69；managers：`bundle,cordis` 78、`marisa` 27、`marisa,cordis` 34、`repository` 6、`skill` 8、`cordis` 1、空 87（`catalog.json` 统计）。

### 1.2 模板样本

- **官方模板仓库已确认**：`https://github.com/dsh-external/plugin-template.git`，HEAD commit `2da8230d25a4cb100c2287bda7471ff4ddf1b165`（2026-08-11 23:18 +0800，**今日**提交「refactor: make plugin template fully self-contained」）。结构：`package.json`（占位名 `@your-scope/dsh-plugin-template`、`private: true` 默认、peers `cordis ^4.0.0-rc.7` + `schemastery ^3.18.0`、`dsh.bundle.patch` → `cordis.patch.yml`、exports `.` / `./invariant` / `./src/*` / `./package.json`）、`src/{index,config,runtime,invariant}.ts`、`docs/dsh-plugin-contracts.md`、`scripts/{prepare,verify-self-contained}.mjs`、`tests/`、`.agents/skills/`。
- **npm 强兼容 = 今日官方建议的改动（模板即证据）**：今日提交把模板改为完全自包含——README 明令「Do not add local-path `link:` or `file:` dependencies」「A DSH host is a runtime consumer of the finished package, not a source or build input」「Set `private` to `false` only when the package's public dependencies and distribution artifacts are ready」（`README.md`）；新增 `scripts/verify-self-contained.mjs`（153 行）检查仓库边界——禁止绝对路径、文档父目录导航、外部 Markdown 链接、代码路径越出仓库、符号链接逃逸（`scripts/verify-self-contained.mjs:1-153`）；新增 `scripts/prepare.mjs` 自包含 prepare 构建（tsc + tsdown，仅用本地 node_modules，`scripts/prepare.mjs:1-39`）；`docs/dsh-plugin-contracts.md` 写明插件形态（函数插件导出 `name/inject/Config/apply` 命名空间、**无 default export**）、生命周期归属、bundle 组合与证据/分发要求。
- **公开 npm 官方模板包仍未发现**：public npm 上 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-plugin-template`、`@deepseek-ai/create-dsh-plugin` 均为 404（registry API 取证）；`@deepseek-ai/*` 私仓是否存在模板包无法在未认证下核实（未核实项 1）。
- **`create-dsh-plugin` 曾发布后撤回**：public npm 记录 0.1.0 于 2026-08-08 发布、2026-08-11 撤回（registry metadata，unpublished 时间 2026-08-11T13:32:02Z）。
- **官方模板事实来源 = 官方文档与官方示例**：`docs/cordis-tutorial/01-first-plugin.md`（插件三形态：函数/对象/Service 子类，loader entry 的 `name` 即模块说明符）；`docs/cookbook/extension-cookbook.md`（工具/钩子/UI/协议驱动四类形状，均基于 `ctx.tools` / `ctx.on` / `ctx.agents`，无 AST 改写）；`docs/user/develop/basic/publish.md`（bundle 打包与 `dsh plugin add`）；`packages/examples` / `examples` 为官方示例目录（acp/headless/jsonrpc 等，非插件模板本身）。

### 1.3 偏差声明

- 静态样本全部来自 **dsh-external 单一组织**且经 hub 目录策展，不是开放社区的随机抽样；计数只代表该样本。
- 模板与实际插件分开统计：官方模板仓库 `dsh-external/plugin-template` 作为独立样本（不计入 90 仓库统计，见 §1.2）；全部 90 个仓库按实际插件/工具/研究仓库计（hub 分类）。
- 源码统计口径：每个仓库取 `src/`（存在时）与根级源码文件；排除 `node_modules/.git/dist/out/coverage/vendor/assets/public/build`、`tests/test/__tests__`、`*.spec.*`、`*.test.*`；**仓库有 `src/` 时排除编译产物 `lib/`**（避免 TS 与 JS 双计）。共 1116 个文件。

## 2. 普查统计表

### M1. npm 元数据画像（80 个根 package.json）

| 字段 | 命中数/80 | 备注 |
|---|---:|---|
| version | 79 | |
| main | 75 | |
| exports | 70 | |
| types | 46 | |
| dependencies | 27 | |
| peerDependencies | 52 | |
| engines.dsh | 6 | 全部为 `>=0.0.1`（dsh-artifact / dsh-evolve / dsh-session-search / dsh-vision / zotero-harvest / zotero-wave-rag，`engines` 字段） |
| private: true | 66 | npm publish 对 `private: true` 拒绝发布（https://docs.npmjs.com/cli/v10/configuring-npm/package-json#private），即当前 66/80 不具备直接 npm 分发形态 |
| 非标准顶层键 `dsh` | 35 | 其中 33 个为 `dsh.bundle.patch`，1 个 `dsh.client`（save-intp），1 个 `dsh.client+mygo`（dsh-vibe-mode） |
| 非标准顶层键 `dshClient` | 30 | 客户端半区声明，形如 `{"platform":"web","inject":["@deepseek-ai/dsh-client-runtime",…]}` |
| 非标准顶层键 `dshx` | 4 | `{"contributes":{"tools":[...],"skills":[]}}`（dsh-artifact / dsh-evolve / dsh-session-search / dsh-vision） |

证据：`/tmp/dsh-pkg-stats.jsonl`（对 80 个 package.json 的 jq 逐字段统计）；代表性样例 `dsh-tool-csv/package.json`（main/exports/types/peerDependencies/dsh.bundle.patch 齐备）、`dsh-vibe-mode/package.json`（dsh.client+mygo）、`zotero-wave-rag/package.json:5-12`（engines.dsh + peerDependencies）。

### M2. peerDependencies 中的核心/宿主声明（52 个声明过 peer 的仓库）

| 声明对象 | 命中/52 | 范围写法分布 | 证据 |
|---|---:|---|---|
| `cordis` | 50 | `^4.0.0-rc.7` ×39、`*` ×10、`4.0.0-rc.7` ×1 | 逐 package.json `peerDependencies.cordis` 统计 |
| `@deepseek-ai/dsh-tools` | 35 | `^0.0.1` ×20、`*` ×15 | 同上 |
| **dsh 核心（`dsh` / `@deepseek-ai/dsh`）** | **0** | — | 全部 80 个 package.json 无此 peer 键 |
| 其他 @deepseek-ai/dsh-* 服务包 peer | 44 | `*` 与 `^0.0.1` 为主，见 M2 全文 | `dsh-101/package.json` peer 列表（16 个 @deepseek-ai 服务包 + cordis + react/react-dom）等 |

**判定（§9 收割价值）**：`peerDependencies` 中声明 dsh 核心的写法在样本中为 0/80——§9 原样收割在**现网是空白（0 命中）**，需按官方今日 npm 强兼容方向扩展信号（见 §3/§5）；现实的核心版本声明载体是 `engines.dsh`（6/80，均 `>=0.0.1`）与 `cordis`/`@deepseek-ai/dsh-tools` peer（50/35）。另注：npm rc.1 兼容报告确认官方 profile `pnpm-workspace.yaml` 设 `autoInstallPeers: false`（`ext-compat-reports-2026-08-11-npm-rc1.md` §1），peer 不会被自动安装。

### M3. 服务访问模式（1116 个源码文件，90 仓库）

| 模式 | 命中 | 仓库数 | 判定 |
|---|---:|---:|---|
| `ctx.<prop>` 属性访问 | 1403 | 79 | **主流**；cordis Context 为 Proxy，属性读走服务解析（0811 快照 `test-r05En1cU-0811/vendor/cordis/src/context.ts:38-74`、`reflect.ts:135-180`），与 `ctx.get` 同一解析路径 |
| `this.ctx.<prop>` | 157 | 14 | 类封装插件（bot bridge 类） |
| `ctx.get('name')` 显式 | 109 | 30 | 次主流；bind-then-use 为主 |
| `ctx.get(...)` 同语句解构（`const {x} = ctx.get(...)`） | 0 | 0 | **A11「先解构」盲区在本样本为 0 命中 = 边缘** |
| `ctx.get(...)` 绑定后再解构（`const {x} = svc`） | 0 | 0 | 同上 |
| `ctx.get('x').y` 单行链式 | 0 | 0 | 全部走先绑定 |
| `ctx.get(动态变量)` | 3 | 2 | 1 个真实现（dsh-evolve/src/index.ts:192 `ctx.get(service)`），2 个注释（dsh-gh-bridge/src/types.ts:5、dsh-skill-stats/src/stats.ts:258） |
| `ctx[...]` 动态属性 | 0 | 0 | 仅测试文件 1 处（dsh-memory-evolve/tests/skills-manager.test.js:96，已排除） |
| `ctx.inject(['svc'], cb)` 服务作用域挂载 | 23 | 15 | 真实模式（dsh-change-ledger/src/index.ts:33-34、dsh-stickers/src/index.ts:69、dsh-ui-progress/src/client/index.ts:52 等） |
| `ctx.provide(...)` | 4 | 4 | 2 个真插件（dsh-pty-windows/index.mjs:109、dsh-shell-windows/index.mjs:132）+ 2 个探针脚本（distill/probe.mjs:89、telegram/probe.mjs:45） |
| 模块级 import `@deepseek-ai/dsh-*`（非 client、非 type） | 162 | 46 | 服务/工具函数经模块导入消费（静态可见，但对象身份不经 ctx 解析路径） |
| 模块级 `import type` @deepseek-ai/dsh-* | 211 | — | 类型层 |
| 模块级 import @deepseek-ai/dsh-client-* | 24 | — | 客户端半区 |

证据样例：`dsh-cc-tui/src/channel.ts:659,896,899,1296,1592`（bind-then-use）；`dsh-auto-approval/src/index.ts:133,197`；`DSH-better-sidebar/src/client/Sidebar.tsx:202`；`dsh-a2a/src/tools.ts:132-133`；`dsh-grok-tui/src/acp-server.ts`（`ctx.llm` 属性访问）；`dsh-pi-adapter/src/compat/ExtensionApi.ts:489-494,627-628,1100-1105`（显式 ctx.get 探测可选缝）。

**判定（A11/EB-D8 水位）**：A11 的「先解构再代理」盲区在样本中是边缘（0 命中）；主流可被「provide/ctx.get 处包装 + Context 代理路径」覆盖（1403 属性访问与 109 ctx.get 同路径）。「import 期解构」在本样本即 162+211 处命名导入（`import { … } from '@deepseek-ai/dsh-*'`）——它们对静态投影可见（import 是静态的），但若插件把服务实例从包模块导入并直接使用，则不经 ctx 解析路径；本样本中导入对象以函数/类型/常量为主，服务实例访问仍以 ctx 为主（逐仓库对象身份未逐一核实，见未核实项 5 邻近说明）。运行时代理兜底需明确此边界。

### M4. 状态与导出行为（EB-D8 风险水位）

| 模式 | 命中 | 仓库数 | 证据 |
|---|---:|---:|---|
| 模块级可变状态（`let` 顶层声明） | 多仓库命中（含脚本目录，精确数需 AST 级解析） | 多仓库 | dsh-auto-approval/src/audit.ts:77,84（`let logReady`/`let writeChain`）；ego-browser/src/index.ts:133（`let egoLockChain`）；dsh-web-terminal/src/client/git-review-format.ts:18（`let activeBridge`）；dsh-memory-evolve/src/client/*.tsx 多处（`let persistedFeature` 类） |
| 模块级 const 对象/集合/数组（粗检，含函数内声明） | 1703 | 78 | 该计数含函数内声明，不能作为模块级状态直接证据；代表性模块级常量如 `chat-width/client.js:173 PRESETS`、`DSH-better-sidebar/src/client/locales.ts:8` |
| 提供对象挂载后原地改 | 0 | 0 | 4 处 `ctx.provide` 均为构造期对象（factory const / new WindowsPlatformShell），未见提供后属性赋值 |
| CJS `exports.x =` / `module.exports.x =` | 15 | 5 | 全部为编译产物 `client.js` 的导出语句（chat-width/client.js:752-757、save-intp/client.js:830-832 等），非运行期原地改导出 |
| `Object.assign(exports, …)` | 0 | 0 | — |

**判定**：跨调用可变状态真实存在（EB-D8 直连契约外声明有现实对象）；「挂载后改提供对象」直接证据未在样本出现。统计上模块级状态需解析器级证据才能精确化（本普查为粗检，标为近似）。

### M5. AST/hook 行为（§12 免责覆盖面）

| 模式 | 命中 | 说明 |
|---|---:|---|
| 源码 `require.extensions` / `Module._compile` / `Module._load` / `process.binding` | 0 | 1116 文件全样本 |
| 源码 `unplugin` / `createUnplugin` / `acorn.parse` / `babel.transform` / `esbuild.transform` / `swc.transform` | 0 | 同上 |
| 运行时依赖级 loader hook | 1 仓库 | dsh-pi-adapter 依赖 `jiti`（dsh-pi-adapter/package.json dependencies，运行时 TS 加载器，用于加载用户扩展文件；证据见 `dsh-pi-adapter/src/compat/ExtensionApi.ts` 的 jiti e2e 说明） |
| package.json 顶层 `loader` / `transform` 字段 | 0 | 非标准顶层键仅 `dsh`(35)/`dshClient`(30)/`dshx`(4)/`pnpm`(2)/`peerDependenciesMeta`(1)/`omp`(1)/`directories`(1) |
| 宿主配置级改写 | 33 | `dsh.bundle.patch`（cordis.patch.yml 插入/禁用行）是配置组合，非 AST 改写 |

**判定**：§12 免责条款在当前样本近乎空载（0 直接 AST 命中；1 个 loader-hook 依赖）；条款保留，另建议把 loader-hook 依赖纳入只读报告（design-r3 可选）。

### M6. 插件间 npm 依赖（§10 双存在触发率）

| 场景 | 命中 | 证据 |
|---|---:|---|
| dependencies 中出现「本身也是插件」的包 | 1/27 个声明 dependencies 的仓库 | dsh-cc-tui/package.json:68 `"@deepseek-ai/dsh-working-activity": "workspace:^"`；该包即 catalog 插件仓库 dsh-working-activity 的 package（`dsh-working-activity/packages/activity/working-activity/package.json` name=`@deepseek-ai/dsh-working-activity`、private:true） |
| mygo 需求声明引用其他插件/服务 | 1 | dsh-vibe-mode/package.json `dsh.mygo.compatibility.requires = {"dsh-voice-chat": ">=0.1.0", "service:voice-chat": ">=0.1.0"}`；catalog 存在插件仓库 dsh-voice-chat |

**判定**：§10 双存在检测有现实触发对象（样本内 2 例，其中 1 例在 npm dependencies、1 例在 mygo 需求声明）；社区侧告警级处理正确，不得阻断。

### M7. 加载形态（§7 分层与现实吻合度）

| 形态 | 命中/80 | 说明 |
|---|---:|---|
| profile bundle（`dsh.bundle.patch` → `cordis.patch.yml`） | 33 | 当前官方分发主路径：`dsh plugin --profile <name> add <pkg>` 转发 pnpm，识别 `dsh.bundle.patch`（`ext-compat-reports-2026-08-11-npm-rc1.md` §1；官方 `packages/ui/app-boot/README.md:36`；`docs/user/develop/basic/publish.md:57-135`） |
| 直连 entry 组合（根 `cordis.yml`） | 3 | dsh-cc-tui/cordis.yml、dsh-live-stats/cordis.yml、dsh-tps/cordis.yml；形态为 `- id / name / config` 行（`dsh-cc-tui/cordis.yml:1-30`），与 loader entry 字段（id/name/config/group/disabled/inject，基线 EB-N9）一致 |
| legacy `dsh.plugin.json` | 22 个本地文件（hub 目录总体 27） | 旧 repository-plugin 分发（0811 已移除）仍在样本中广泛残留；字段 id/version/main/engines.dsh/contributes/client（`dsh-pty-windows/dsh.plugin.json`、`chat-width/dsh.plugin.json`） |
| 客户端半区声明 `dshClient` | 30 | web 平台 + `inject` 列表（chat-width、dsh-101、dsh-change-ledger 等） |
| npm 直连（rc.1 私仓） | 起步 | 官方 `@deepseek-ai/dsh@0.0.1-rc.1` 已发布（私有），关键子包 rc.1 已发布；社区插件多数 `private:true` 未发布（见 M1） |
| 官方模板（今日 npm 强兼容改动） | 1 个模板仓库 | `dsh-external/plugin-template@2da8230`：自包含仓库、禁 `link:`/`file:` 依赖、`prepare` 自包含构建、`verify-self-contained` 仓库边界校验、`private→false` 发布门（§1.2） |

**判定**：§7「社区插件 = 直连路径 + 仅 npm 元数据」的描述与现状**部分吻合但缺一环**——当前社区插件主流分发是「GitHub 仓库 + profile bundle patch」，npm 直连仅 rc1 起步；但**今日官方模板已按 npm 强兼容重构（自包含、可发布）**，官方迁移方向与契约 §9/§11 一致，现网字段空白（private/peer）属于过渡态而非方向错误；loader 直连 entry 是底层通用形态（bundle 展开后仍是 entry 行）。

## 3. 判定矩阵（契约条款 → 现实 → 落点）

| 条款 | 判定 | 现实证据 | 收敛落点 |
|---|---|---|---|
| two-tier §7 分层定义 | **需修订** | 社区插件当前主分发 = repo catalog + `dsh.bundle.patch`（33/80）+ legacy `dsh.plugin.json`（22）；npm 直连为 rc1 起步但**今日官方模板已按 npm 强兼容重构**（dsh-external/plugin-template@2da8230）；已有 1 例社区 mygo manifest（dsh-vibe-mode） | 契约修订 Rev-1/Rev-5/Rev-6 + design-r3 D4/D5/D7 |
| two-tier §8 担保矩阵 | 部分确认 | 社区侧仅「运行期反应式 + 只读观察」为 [OK] 与现实一致（无安装期求解/lockfile/depends 硬阻断现实载体）；「npm/pnpm 原生解析」应补充 `autoInstallPeers:false` 事实 | 契约修订 Rev-1（矩阵备注） |
| two-tier §9 npm 元数据收割 | **需修订（现网空白 + 官方迁移目标已定）** | peer dsh 核心 0/80；现实信号 = engines.dsh（6，均 `>=0.0.1`）+ cordis peer（50）+ @deepseek-ai/dsh-tools peer（35）；private 66/80；**官方今日模板即 npm 强兼容形态（自包含、可发布、禁 link:/file:）**，§9 收割是迁移目标而非死路 | 契约修订 Rev-2/Rev-6 + design-r3 D2/D7 + 测试 T2/T7 |
| two-tier §10 双存在检测 | 确认 | 1/27 dependencies + 1 mygo requires（service: 前缀） | 契约修订 Rev-3 + 测试 T1/T4 |
| two-tier §11 直连路径永久支持承诺 | 需修订叙事 | 条款本身保留；现状是 GitHub+p npm/bundle 分发、npm 直连起步；官方模板今日已把「npm 强兼容」定为模板默认 | 契约修订 Rev-1/Rev-6 |
| two-tier §12 mixin 免责 | 确认（空载但保留） | 0 直接 AST 命中；1 个运行时 loader hook 依赖（jiti） | 无需动作 + design-r3 D6（loader-hook 只读报告，可选） |
| expected-behavior A7/A11（Proxy 包装覆盖） | 确认 | 主流 = `ctx.<prop>`(1403) + `ctx.get`(109)，同一 Context 代理解析路径；「先解构」0 命中；模块级 import 162 处为另一绕行面（静态可见） | design-r3 D1 + 测试 T3 |
| expected-behavior EB-D8（直连契约外风险） | 确认 | 跨调用可变状态存在（模块级 let 样本）；「挂载后改提供对象」未直接观察到 | 无需动作（维持契约外声明）+ 测试 T6（可选回归） |
| expected-behavior EB-D11（政策闸/服务需求） | 部分确认 | 社区已有 `service:voice-chat` 服务级需求写法（dsh-vibe-mode） | design-r3 D3 + 测试 T4 |

## 4. 反向发现（契约/基线未覆盖的真实行为）

| # | 发现 | 证据 | 评估 |
|---|---|---|---|
| R1 | profile bundle（`dsh.bundle.patch`）是当前社区分发主流，契约未建模该分发层 | 33/80；`packages/ui/app-boot/README.md:36` | 需契约修订 Rev-1；bundle 展开后仍为 entry 行，mygo 政策层作用于展开后行（D4） |
| R2 | 客户端半区维度（`dshClient` 30、`dsh.plugin.json` client、`dshx` 4）契约未覆盖 | M1/M7 | 契约修订 Rev-5（映射说明）；client-half 托管属 design-r3 范围 |
| R3 | 社区已出现 mygo manifest 词汇 `dsh.mygo.compatibility.requires` 与 `service:` 前缀 | dsh-vibe-mode/package.json | 与 two-tier §7 词汇表（depends/breaks/core/bundles/loader/patches/grants）不一致；design-r3 D3 归一 |
| R4 | `private: true` 66/80 → npm 分发现状占比低；GitHub+p npm 是主分发 | M1；npm 兼容报告 | 契约 §9 需写明收割现实覆盖率 |
| R5 | peer 信号不在 dsh 核心而在 cordis / @deepseek-ai/dsh-* 服务包 | M2 | Rev-2 / D2 |
| R6 | 模块级 `@deepseek-ai/dsh-*` 运行时 import（162/46 仓库）绕行 ctx 解析路径 | M3 | D1 边界说明；静态投影可见（import 静态），运行时代理不覆盖此路径 |
| R7 | legacy `dsh.plugin.json`（22 本地）在 0811 移除 repository-plugin 分发后仍广泛残留 | M7 | D5 迁移/兼容策略 |
| R8 | 脚手架工具不稳定：`create-dsh-plugin` 发布 3 天后撤回；公开 npm 无官方模板包（GitHub 官方模板仓库存在） | §1.2 | 契约/文档补充「模板现状」；不实现 |
| R9 | 跨调用可变状态真实存在（模块级 let） | M4 | EB-D8 契约外声明有现实对象 |
| R10 | 插件依赖插件：dsh-cc-tui → @deepseek-ai/dsh-working-activity（workspace:^） | M6 | §10 触发率 1/27；测试 T1 |
| R11 | mygo 需求声明引用插件与服务（dsh-vibe-mode requires voice-chat / service:voice-chat） | M6 | Rev-3 / D3 / T4 |
| R12 | 运行时 loader-hook 依赖（jiti）存在但极少（1/27） | M5 | §12 免责现状空载；D6 可选只读报告 |
| R13 | **今日官方 npm 强兼容改动**：`plugin-template@2da8230`（2026-08-11）把模板改为完全自包含——禁 `link:`/`file:` 依赖、`prepare` 自包含构建、`verify-self-contained` 仓库边界校验、`private→false` 发布门；与普查发现的现网缺口（private 66/80、link: 依赖、裸 cordis import）互证，官方迁移目标已定 | §1.2；`ext-compat-reports-2026-08-11-npm-rc1.md` §6 迁移清单 | 契约修订 Rev-6；design-r3 D7；测试 T7 |

## 5. 汇总

### 5.1 two-tier-contract.md 修订记录（追加形式，正文不改）

- **Rev-1（2026-08-11）**：§7/§8/§11 补社区分发现实——当前社区插件主分发为 GitHub 仓库 + profile bundle（`dsh.bundle.patch`）+ legacy `dsh.plugin.json`；npm 直连为 rc1 起步；`autoInstallPeers: false` 事实入担保矩阵备注。
- **Rev-2（2026-08-11）**：§9 收割信号扩展——peer dsh 核心声明现实为 0/80，收割器 MUST 同时读取 `engines.dsh`、`cordis` peer、`@deepseek-ai/dsh-tools` 等服务包 peer，统一归一为 core 区间；写明 `private:true` 覆盖率的报告口径。
- **Rev-3（2026-08-11）**：§10 双存在检测扩展——mygo `compatibility.requires` 中 `service:` 前缀需求（dsh-vibe-mode 先例）纳入检测与报告，仍为告警级。
- **Rev-4（2026-08-11）**：§12 补充——运行时 loader-hook 依赖（jiti 类）纳入只读报告信息，不阻断。
- **Rev-5（2026-08-11）**：新增反向词汇映射说明——`dshClient` / `dsh.plugin.json` / `dshx` / `dsh.bundle.patch` 与本契约分层及 legacy 状态的关系（迁移叙事）。
- **Rev-6（2026-08-11）**：官方 npm 强兼容方向入契约——今日 `dsh-external/plugin-template@2da8230` 以自包含模板确立 npm 强兼容为官方默认（禁 `link:`/`file:` 依赖、`prepare` 自包含构建、`verify-self-contained` 边界校验、`private→false` 发布门）；§7/§9/§11 以该模板形态为参考目标，收割与担保按此形态校准。

### 5.2 design-r3 任务

- **D1**：Proxy 包装规则覆盖 `ctx.get` / `ctx.<prop>` / `ctx.inject` 三条路径（样本支撑：1403 属性访问 + 109 ctx.get + 23 ctx.inject 同走 Context 代理/作用域解析）；明确模块级 import（162 处）不在运行时代理覆盖范围、由静态投影可见性兜底。
- **D2**：收割器归一核心区间信号（engines.dsh、cordis peer、@deepseek-ai/dsh-* peer；样本范围样式 `*` / `^4.0.0-rc.7` / `^0.0.1`），§9 告警按归一结果输出。
- **D3**：`dsh.mygo.compatibility.requires` 词汇归一（`service:` 前缀 → 服务/符号依赖声明），与 EB-D11（政策闸）和 EB-D19（符号别名）对齐；先例 dsh-vibe-mode。
- **D4**：profile bundle 展开语义——`dsh.bundle.patch` 展开为 entry 行后仍属直连 entry；mygo 政策层作用于展开后的行，不新设分发层。
- **D5**：legacy `dsh.plugin.json`（22 个本地仓库）迁移/兼容策略；0811 已移除 repository-plugin 分发，直连/桥接映射需成文。
- **D6**（可选）：loader-hook 依赖（jiti 类）只读报告字段。
- **D7**：官方模板契约对齐——以 `plugin-template` 的 package.json 形态（exports `.`/`./invariant`/`./src/*`、peers `cordis`+`schemastery`、`dsh.bundle.patch`）作为 mygo manifest 生成/校验参考输入；模板 `verify-self-contained` 的仓库边界检查（绝对路径/父目录导航/外部链接/符号链接逃逸）作为安装期路径安全约束的对照实现。

### 5.3 新增测试场景

- **T1**：§10 双存在检测——dsh-cc-tui 场景（依赖包 @deepseek-ai/dsh-working-activity 同时为插件仓库）输出告警、不阻断。
- **T2**：§9 收割扩展——engines.dsh（`>=0.0.1`）、cordis peer（`^4.0.0-rc.7`/`*`）、dsh-tools peer（`^0.0.1`/`*`）三种信号归一为 core 区间并告警。
- **T3**：Proxy 覆盖回归——`ctx.<prop>` 属性访问（1403 主流路径）与 `ctx.get` 在桥接路径下均返回包装对象；`ctx.inject` 作用域内同样生效。
- **T4**：`service:` 前缀需求解析——dsh-vibe-mode `compatibility.requires` 样例的解析与告警。
- **T5**：bundle patch 展开→entry 行的加载形态测试（33/80 主分发形态的展开正确性）。
- **T6**（可选）：跨调用可变状态插件（dsh-auto-approval audit.ts 类）在直连路径下 P1-global/P2 回滚后的状态残留回归。
- **T7**：官方模板自包含校验场景——`verify-self-contained` 同款规则（绝对路径、`../` 文档导航、外部链接、越出仓库的代码路径/符号链接）作为安装期路径安全（C8 方向）的对照用例；`prepare` 自包含构建产物可作为「无宿主 checkout 也能 build/pack」的 npm 强兼容回归。

### 5.4 无需动作

- two-tier §12 mixin 免责：确认空载但保留（0 直接 AST 命中；不因样本空载而删除条款）。
- EB-D8 直连契约外声明：维持（风险有现实对象但无「挂载后改提供对象」直接证据，不新增硬机制）。

## 6. 未核实项

1. `@deepseek-ai` 私仓是否存在官方插件模板包（public registry 404；GitHub 官方模板仓库已确认，私仓包仍无法在未认证下核实）。
2. `@deepseek-ai/dsh-working-activity` 与 `dsh-voice-chat` 是否已在私仓发布（package 均 `private:true` 或未见 npm 元数据）。
3. `create-dsh-plugin` 撤回原因（registry 只有时间戳）。
4. 第三方工具对 legacy `dsh.plugin.json` 的兼容行为（repository-plugin 分发已移除，遗留文件的行为未核实）。
5. 模块级状态精确计数需 AST 级解析（本普查为粗检，标注为近似）。

## 7. 样本支撑度声明

全部计数基于 dsh-external 单一组织的 90 个仓库快照（hub 目录 241 仓库中的子集，14 个 git 克隆 + 76 个本地快照），代表该组织的插件生态现状；官方模板仓库（`dsh-external/plugin-template`）为独立样本，不计入 90 仓库统计。**不得将任何单仓库行为或该组织比例泛化为开放社区普遍情况**。若需开放社区结论，需扩大抽样（npm 全量 @deepseek-ai 依赖图 + 多组织仓库）。
