# design-r5：mygo CLI 用户面（dsh extension 形态）— Phase A 设计说明

> 生成时间：2026-08-12 · 任务：第五轮「mygo CLI 用户面（dsh extension 形态）」。
> 性质：Phase A 设计说明，**交付后停下，等待用户放行后再动工 Phase B**（任务书 §0/§2 闸门；
> 第四轮违规记录于 plugin-pack-verification.md §7，本轮严格执行）。
> 输入：任务书（第五轮）/ design-r4.md / design-r4-backlog.md / two-tier-contract.md /
> design-r3.md（§2 词汇）/ expected-behavior.md（FROZEN）/
> 官方证据：0811 dsh 快照 `test-r05En1cU-0811`（apps/cli、packages/boot/cmdline、
> packages/client/ui-plugin-config、packages/bundle/web-app）、npm 发布物 rc.1
> （`@deepseek-ai/dsh` / `@deepseek-ai/dsh-cmdline`）、plugin-template@`2da8230`。
> 纪律：零新增治理语义；发现需要新语义 → 冲突上报（§9），禁自行扩张；L0-L3 侵入分级；
> 禁新增第三方依赖；冻结文档仅追加；确定性断言字节级；Phase B 代码全部入库。

## 0. 现状盘点与证据基线

### 0.1 既有能力（B20-B29 已实现，本轮只翻译为命令面）

| 能力 | 实现 | 证据 |
|---|---|---|
| 确定性打包 `buildPluginPack` | `src/package/pack.ts`（B21） | T32（同输入两次 sha256 相等） |
| 离线安装 `installPluginPack` | 同文件（B22/B23） | T33/T37（RT5 fetch 计数 0） |
| 结构化报告 `ResolutionReport` | `src/package/report.ts`（B7/B24） | code/scope/cycles/conflicts/generation |
| manifest v3 校验 | `src/package/manifest-v2.ts`（B1） | `parsePackageManifest` 通过判定 |
| 官方模板对齐检查 | `src/package/template-align.ts`（B16） | `checkTemplateAlignment` |
| 公开 API | `PluginPackageManager.buildPack/installPack`（B27） | package-manager.ts:546/554 |

> **状态风险（入库不完整）**：dsh-mygo 仓库当前跟踪树只含 B1-B18 时代的
> `src/package/*`（45 个 src 文件），pack 时代新增的 `pack.ts / fine-epoch.ts /
> requires-gate.ts / provider-observations.ts / template-align.ts / legacy-mapping.ts /
> dual-presence.ts / harvester.ts / bundle-expand.ts` 及 T32-T43 测试**未跟踪**；
> 完整实现位于 `test-r05En1cU-0811`（untracked）。「234db44 mygo 全量入库」提交只覆盖了
> 包清单与 EB 测试，未达到其提交信息的范围。Phase B「全部代码 MUST 入库」前必须先补
> 同步（§9 C3），否则 Phase B 代码无从入库。

### 0.2 官方 CLI 扩展点（0811 快照 + npm rc.1，L0 证据）

**结论：官方 `dsh` 启动器不提供「插件贡献 CLI 子命令」机制；它提供的是
「把 `--profile` 之后的内层参数原样交给 profile 树，由应用插件自解析」的机制。**

证据链（均为本地权威源码/发布物）：

1. `apps/cli/src/args.ts:5-7`：启动器只解析自己拥有的 `--profile`/`--patch`/config dumps，
   「hands **everything after its own flags** to the booted tree verbatim」。
2. `apps/cli/src/args.ts:139-140`：未给 `--profile` 直接报错
   `error: --profile <name> is required` —— 字面 `dsh mygo pack` 无 L0 入口。
3. `apps/cli/src/args.ts:156/171`：`web` 是硬编码别名，`plugin` 是 pnpm forwarder；
   两者都不是插件注册面。
4. `packages/boot/cmdline/src/index.ts`（npm rc.1 即 `@deepseek-ai/dsh-cmdline`）：
   - `provideCmdline(ctx, {args, exit})`（:67）在树挂载前把内层参数快照提供为
     `ctx.cmdlineArgs` + `ctx.appExit`；
   - `parseCmdline(ctx, program, plan)`（:103）让任意应用插件用自带 commander program
     解析、自带 `--help` 与退出码。
5. `apps/cli/src/profile-boot.ts:263`：`dsh` 启动器确实在挂载前调用 `provideCmdline`。
6. 官方消费者范例 `packages/bundle/web-app/src/startup.ts`（:17 `inject=['cmdlineArgs']`，
   :82 `parseCmdline(ctx, webCommand(), planWebStartup)`）——web 自己的
   `--host/--port/--trusted-host` 就是这么实现的。
7. npm rc.1 发布物 `@deepseek-ai/dsh/lib/bin.js` 与 `@deepseek-ai/dsh-cmdline/lib/index.js`
   与上述源码一致（发布面已含该机制）。

### 0.3 官方 webui 插件管理窗口（0811 快照，Phase C 前置调研）

**结论：官方「插件配置」窗口 = 设置页一个 section（`id: 'plugins'`），只做配置，
没有安装/挂载/还原操作。**

证据链：

1. `packages/client/ui-plugin-config/src/client/index.ts:2-6`：官方窗口声明子 slot
   `settings.plugin.item`，渲染各插件注册的卡片；section 自身不知道任何命名空间。
2. `packages/client/ui-plugin-config/src/client/index.ts:77-84`：向 `settings.section`
   slot 注册 `id: 'plugins'` 的 section。
3. 官方自带三张卡片 Bash/AgentLoop/WebSearch（`BashCard.tsx` 等），每张卡绑定一个
   settings 命名空间（`settingsScope.bind({namespace})`）——即 changelog 的
   「shell 命令、搜索工具、AgentLoop 插件配置」。
4. 全包检索：ui-plugin-config 无 install/mount/uninstall/pnpm 调用；rc.1 host
   apiproxy RPC 面只有 commands/settings/credentials/goals/llm 等，无 plugin RPC；
   `dsh plugin` 仍是 CLI-only pnpm forwarder。→ 官方窗口**不承载安装/挂载**。
5. mygo 既有先例：`vendor/dsh-mygo-panel` 已通过 `ctx.httpServer` 注册 `/api/mygo/*`
   （install/plan/bom/config 等）并作为 `settings.section`（id `mygo-plugins`）跑在设置页
   ——「mygo 能力经 webui 跑起来」有源码态先例（未在 npm rc.1 profile 上复验，Phase C 项）。

## 1. 形态：CLI 本体是一个 mygo 体系插件

### 1.1 包与身份

- 包名（设计选用）：`@dsh-external/dsh-mygo-cli`（沿用 dsh-mygo-panel 的
  `@dsh-external` 前缀先例；核心包 `@deepseek-ai/dsh-mygo` 保持不动）。
- **manifest id（冲突上报 C2）**：任务书暂定 `dsh.mygo.cli` 含 `.`，违反 B1
  `ID_RE = /^[a-z][a-z0-9-]*$/`（manifest-v2.ts:81），会直接 `manifest-invalid`。
  设计选用 `dsh-mygo-cli`（与 `MYGO_MANAGER_ID = 'dsh-mygo'` 同风格）。
- 插件形态：Cordis function plugin（`name`/`inject`/`Config`/`apply`，无 default export），
  与 plugin-template 2da8230 形态一致；由 mygo 管理器从 store 装载
  （`loadPluginEntry` + `extractPlugin`，service.ts:371-372）。

### 1.2 manifest 词汇（design-r3 §2，零新语义）

```jsonc
{
  "name": "@dsh-external/dsh-mygo-cli",
  "version": "0.0.1-rc.1",
  "main": "lib/index.js",
  "dsh": {
    "mygo": {
      "formatVersion": 1,
      "id": "dsh-mygo-cli",
      "version": "0.0.1-rc.1",
      "entry": "lib/index.js",
      "depends": {},
      "breaks": {},
      "requires": {},
      "core": "^0.0.1-rc.1",
      "loader": { "id": "standard", "range": "^1.0.0" },
      "environment": { "platform": "cli" }
    }
  }
}
```

- `requires: {}`（Rev-A2 修正）：CLI 需要运行期读取当前 profile（管理器行配置
  `PluginManagerServiceConfig.profile`，service.ts:69），但 B6 政策闸无法表达
  「要求管理器自身」——管理器 provides 只有 `service:mygo-core`
  （lifecycle.ts:2152/3732），而 requires 键禁止 `service:` 前缀
  （manifest-v2.ts 规范），声明 `pluginManager` 会导致 CLI 永久 INACTIVE。
  修正：requires 置空，CLI 在 apply 内以 `ctx.get('pluginManager')` 惰性解析，
  缺失时输出操作错误（退出码 1），零新增治理语义（§9 C5）。
- `depends: {}`：CLI 对 `dsh-mygo` 库 API（buildPack/installPack）是 npm 包依赖
  （dependencies），不是插件图 depends；不声明包级硬耦合（§2.1 选用指引）。
- `core`：按 npm rc.1 锚点（B11 归一：`@deepseek-ai/dsh` rc.1 ↔ `^0.0.1-rc.1`）。
- 不声明 `dsh.bundle.patch`：CLI 是纯 mygo 管理插件，避免双存在（two-tier §10 告警级）。
  目标 profile 的原生侧只装 mygo 管理器 bundle（`@deepseek-ai/dsh-mygo`），CLI 由
  lockfile 挂载。

### 1.3 自举链（吃自己的狗粮，B 阶段测试口径）

定义（全部复用既有机制，无新治理语义）：

1. 源 profile Q：树 = mygo 管理器 bundle（原生）+ CLI 插件（mygo 管理，已在 Q 的
   lockfile 中；Q 的种子安装复用既有 `resolveInstall`/panel 安装路径，**不新增命令**）。
2. `dsh --profile Q mygo pack` → pack 的 `plugins[]`/`files[]` 含 CLI 插件自身。
3. 目标 profile R：空 store + 空 lockfile + **原生预置 mygo 管理器 bundle 行**
   （`dsh plugin --profile R add @deepseek-ai/dsh-mygo` 或 profile patch 预置；
   mygo 不代写 profile 组合，零新语义）。注：`@deepseek-ai/dsh-mygo` 尚未发布，
   真实 npm 侧预置依赖发布流水线（既有外部依赖，非本轮范围）；测试用
   `file:`/`link:` 或 profile patch 预置。
4. `dsh --profile Q mygo restore <pack> --profile R` → installPack 写入 R 的
   store + lockfile（含 CLI 插件）。
5. `dsh --profile R mygo pack -o /tmp/r.mygo-pack` → R 启动时管理器按 lockfile 挂载
   CLI 插件，CLI 解析 `cmdlineArgs` 执行成功（退出码 0 + 合法 pack）。

验证项（Phase B，T47）：步骤 5 成功即证明「restore 后 CLI 可用」；另断言
`dsh --profile R mygo` 无子命令时**不阻塞 profile 正常启动**（见 §2.4 被动语义）。

## 2. 命令面定义

### 2.0 总语法与选用方式（C1 冲突，见 §9）

正式命令面（L0 合规形式）：

```text
dsh --profile <profile> mygo <command> [args...]
```

- `<profile>`：装载 mygo CLI 插件的 profile（其树含 mygo 管理器 + lockfile 含
  dsh-mygo-cli）；`mygo` 是 CLI 插件 commander program 的一级子命令。
- 任务书字面 `dsh mygo pack` 无法按字面实现（0.2 证据 2）；不 hook apps/cli。
- 帮助：`dsh --profile <profile> mygo --help`（CLI 自绘）。

### 2.1 `pack` —— 从当前 profile 打包

```text
dsh --profile <profile> mygo pack [-o|--output <path>] [--no-community-deps] [--json]
```

| 项 | 定义 |
|---|---|
| `-o/--output <path>` | 产物路径；缺省 `./<profile>-plugins.mygo-pack`（相对调用者 cwd） |
| `--no-community-deps` | 关闭 communityDeps 收割（B25 `includeCommunityDeps: false`） |
| `--json` | 机器可读输出（§3.3） |
| 退出码 | 0 = 成功；1 = 操作失败（产出结构化报告）；2 = 用法错误 |

成功输出（human）：

```text
✓ 已打包 N 个插件 → ./web-plugins.mygo-pack
  sha256 349e6476b132d0775399a85e2444c8a3e456efc48ec127d1b5f6442f9dde96a1
  社区依赖声明 M 条（--json 查看明细）
```

失败输出（human）：`✗ <code>：<summary>` + 报告渲染（§3.1）；`--json` 直通
`{"ok":false,"report":{...}}`。

### 2.2 `restore <pack>` —— 还原到 profile

```text
dsh --profile <profile> mygo restore <pack> [--profile <target>] [--json]
```

| 项 | 定义 |
|---|---|
| `<pack>` | 必填；本地 `.mygo-pack` 路径 |
| `--profile <target>` | 还原目标；缺省 = 当前 profile（CLI 读取 pluginManager 行配置） |
| `--json` | 机器可读输出 |
| 退出码 | 0 = 成功（含告警）；1 = 失败（报告）；2 = 用法错误 |

成功输出（human）：

```text
✓ 已还原 <pack> → profile <target>：N 个插件
  ⚠ 社区依赖（告警级）：@deepseek-ai/dsh-tool-time peer ^0.0.1-rc.1（dsh-tool-time）
```

说明：目标 profile 可不同于当前 profile（跨 profile 还原）；还原只写目标
`$DSH_HOME/mygo/...` 的 store + lockfile，**不写 profile 组合**（C1/§1.3）。

### 2.3 `init <name>` —— 生成官方模板对齐的新插件骨架（B16 候选落地）

```text
dsh --profile <profile> mygo init <name> [--id <id>] [--dir <dir>] [--json]
```

| 项 | 定义 |
|---|---|
| `<name>` | 必填；合法 npm 包名（`@scope/pkg` 或 `pkg`；校验规则见 §5.3） |
| `--id <id>` | manifest id；缺省 = 包名末段 slug（`dsh-sdk` 同款推导，create-plugin.ts:34-41） |
| `--dir <dir>` | 输出目录；缺省 `./<包名末段>`；已存在且非空 → 拒绝 |
| `--json` | 机器可读输出 |
| 退出码 | 0 = 成功；1 = 失败（含 manifest 校验失败）；2 = 用法错误 |

成功输出（human）：

```text
✓ 已生成插件骨架 → ./my-plugin（N 个文件）
  manifest：id=my-plugin version=0.0.1 entry=lib/index.js（B1 校验通过）
  下一步：cd my-plugin && pnpm install && pnpm run build（联网由用户自行执行）
```

### 2.4 被动语义（关键约束）

CLI 插件的 `apply` 只在**内层参数首 token 是 `mygo`** 时接管解析；否则 MUST 完全
无副作用返回（不打印、不 exit、不吞参）。理由：

- 同一参数快照可被多个应用插件解析（web-startup 与 mygo-cli 可能同 profile）；
- `dsh --profile web --port 8080` 不能让 mygo-cli 误报/误退；
- CLI 程序禁用自身 `-h/--help`（`helpOption(false)`），帮助只在 `mygo` 子命令内生效，
  避免抢占其他应用插件的 `--help`。

### 2.5 退出码分类（统一）

| 码 | 含义 | 说明 |
|---|---|---|
| 0 | 成功 | 含 restore 带告警成功 |
| 1 | 操作失败 | 已产出结构化报告（pack-invalid / pack-hash-mismatch / resolve-failed / manifest-invalid / lockfile 缺失等） |
| 2 | 用法错误 | 未知子命令/缺参/非法包名；commander error，无结构化报告 |
| 130 | 信号中断 | 复用既有进程关闭语义（不新增） |

## 3. 报告渲染（B7 结构化报告 → 终端）

### 3.1 人类可读映射规则

输入：`ResolutionReport`（report.ts:50-73）与 `ServiceResolutionReport`（:76-92）。

```text
✗ <code>：<summary>
  作用域 <scope>      世代 <from> → <to>（有则显示）
  依赖循环 N 条：a → b → c（每条一行）

  冲突 i/M · 插件 <plugin>
    约束 <kind> <target>（<range>）
    链路 <chain.join(' → ')>
    候选集：
      <version> — <rejected[0]>；<rejected[1]>…
    （scope=service 时：<plugin>@<version> [<state>]）
    建议 <actions.join('；')>
```

规则：

1. **建议词汇保留**：`actions[]` 原文透出，不重写、不翻译（B7 已含
   add/remove/replace 语义的 安装/升级/降级/替换 建议词汇；未来生命周期命令复用同一
   渲染器时继续保留）。
2. **pack 指认文件**：`code ∈ {pack-invalid, pack-hash-mismatch}` 时，把
   `constraint.target`（`mygo-pack.json` / `files/<i>.tgz` / `<pack>`）作为行内
   文件指针渲染，且置于摘要下一行：`  文件 <target>`。
3. **服务级报告**：`scope: 'service'` 时冲突块渲染服务名 + 提供者候选
   （`plugin@version [state]`），actions 照旧。
4. **世代**：`generation.from → to` 仅在 P1-global 回滚/P2 停用类报告出现
   （EB-D4 硬告警口径）；本轮回滚报告若经 CLI 暴露必须渲染。
5. 全部冲突一次输出（不截断）；human 模式写 stdout，进度/警告写 stderr。

### 3.2 渲染示例（pack-hash-mismatch）

```text
✗ pack-hash-mismatch：vendored 文件哈希校验失败
  文件 files/0.tgz

  冲突 1/1 · 插件 <pack>
    约束 pack files/0.tgz（sha512）
    链路 <pack>
    候选集：
      <manifest> — sha512 失配（期望 0a2c…，实际 9f31…）
    建议 重新打包或从可信来源获取 pack
```

### 3.3 机器可读模式（`--json`）

所有命令失败时 stdout 输出**唯一 JSON 文档**，`report` 字段直通结构化报告原样：

```jsonc
{ "ok": false, "command": "restore", "report": { /* ResolutionReport 原文 */ } }
```

成功时：

```jsonc
// pack
{ "ok": true, "command": "pack", "packPath": "./web-plugins.mygo-pack",
  "sha256": "…", "plugins": [{ "id": "…", "packageName": "…" }],
  "communityDeps": [{ "name": "…", "range": "…", "kind": "peerDependency", "owner": "…" }] }
// restore
{ "ok": true, "command": "restore", "profile": "<target>", "plugins": 5, "warnings": ["…"] }
// init
{ "ok": true, "command": "init", "dir": "./my-plugin", "id": "my-plugin",
  "manifest": { /* 生成的 dsh.mygo 块 */ } }
```

human 模式的所有正文只走 stdout/stderr 文本；`--json` 时 stdout 除该文档外不得出现
任何其他字节（快照断言基础）。

## 4. 注册机制（CLI 扩展点：调研结论 + 选用方式）

### 4.1 结论

官方 dsh（0811 源码 + npm rc.1）**没有插件贡献 launcher 子命令的注册面**；唯一
官方 CLI 扩展点是把 `--profile` 之后的内层参数交给 profile 树的应用插件，由
`@deepseek-ai/dsh-cmdline` 的 `parseCmdline` 自解析（§0.2 证据 1-7）。除此之外
官方还有三个与 CLI 相邻的 L0 面：`ctx.commands`（会话内 slash 命令）、
`ctx.httpServer`（web 路由）、`ctx.settings`（配置命名空间）——本轮不新增使用。

### 4.2 选用方式

CLI 插件 `inject: ['cmdlineArgs']`，`apply` 中按 §2.4 被动语义调用
`parseCmdline(ctx, mygoCommand(), plan)`；program 形态：

```text
dsh --profile <profile> mygo
├── pack [-o <path>] [--no-community-deps] [--json]
├── restore <pack> [--profile <target>] [--json]
└── init <name> [--id <id>] [--dir <dir>] [--json]
```

- 参数解析：**手写最小解析器**（Rev-A2 修正；任务书 §0 明确允许「参数解析手写最小
  实现或复用 dsh 既有 CLI 框架」）。理由：commander 未出现在 0811 顶层
  node_modules（pnpm 非提升布局），复用会引入测试环境的解析依赖；手写解析器
  零第三方依赖，命令面固定为三个子命令 + 有限旗标，风险可控。
- 执行：`pack`/`restore` 直接调用 `PluginPackageManager.buildPack/installPack`
  （pack.ts:476/653；package-manager.ts:546/554），PackContext 由
  `resolveMygoPaths(profile)` + 当前管理器版本（`MYGO_MANAGER_VERSION`）构造；
  `init` 调用新的模板生成器（§5，B16 候选落地，实现只写文件不装依赖）。
- 退出：解析后的结果通过 `ctx.appExit(code)` 请求进程退出（cmdline 契约）；
  成功路径走既有 bounded shutdown（process-shutdown 5s 语义，零新增）。

## 5. `init` 产物（与 plugin-template 2da8230 对齐）

### 5.1 模板来源与离线约束

- 来源：`dsh-external-src/plugin-template@87acac8`（2da8230「refactor: make
  plugin template fully self-contained」npm 强兼容形态之上，追加
  「split patches/ contract into dependency and DSH host patches」；
  Rev-A4）。
- 交付方式：构建期把模板骨架 vendored 进 CLI 包 `assets/plugin-template/`（记录
  源 commit 与校验和）；运行期 `init` 只从本地资产复制 + 替换，**不触网、不执行
  install/prepare**（任务书 §2 离线纪律）。

### 5.2 骨架内容清单

复制（含替换）：`package.json`、`cordis.patch.yml`、`src/{index,config,runtime,
invariant}.ts`、`tests/{harness.ts,plugin.spec.ts}`、`scripts/{prepare.mjs,
verify-self-contained.mjs}`、`tsconfig{,.base,.prepare,.prepare.dts,.vitest}.json`、
`tsdown{,.prepare}.config.ts`、`vitest.config.ts`、`pnpm-workspace.yaml`、
`.gitignore`、`README.md`、`AGENTS.md`、`LICENSE`、`docs/dsh-plugin-contracts.md`、
`patches/README.md`、`src/README.md`、`tests/README.md`、`tests/snapshots/README.md`、
`.agents/skills/**`（7 个 skill 目录，各含 SKILL.md + agents/openai.yaml）、
`pnpm-lock.yaml`。

> Rev-A2 修正：`verify-self-contained.mjs`（2da8230）硬性要求 `.agents/skills`
> 恰有 7 个 skill 且 `pnpm-lock.yaml` 存在，两者缺一骨架即无法通过模板自检；
> 故 init 复制上述两项（`pnpm-lock.yaml` 内容与包身份绑定，用户 `pnpm install`
> 时会重建，复制仅为满足模板自检契约）。

不复制：`.git`（新仓库由用户初始化）。

身份替换点（照 2da8230 README「Create your plugin」清单）：package.json 的
`name/description`、`src/index.ts` 的 `name`、`cordis.patch.yml` 的 row id/name、
`src/{config,runtime,invariant}.ts`、`tests/plugin.spec.ts`、README/AGENTS.md 中的
包名；**不做全局替换**（skill 目录不被复制，无污染面）。

### 5.3 生成内容与校验

package.json 在模板形态之上**增量补 mygo 词汇**（two-tier §13，不重写既有声明）：

```jsonc
{
  "name": "<name>",
  "version": "0.0.1",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": { ".": …, "./invariant": …, "./src/*": …, "./package.json": … },
  "peerDependencies": { "cordis": "^4.0.0-rc.7", "schemastery": "^3.18.0" },
  "scripts": { "build": "tsc -b && tsdown", "test": "vitest run",
               "typecheck": "…", "verify:self-contained": "…", "prepare": "…" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "mygo": {
      "formatVersion": 1, "id": "<id>", "version": "0.0.1",
      "entry": "lib/index.js", "depends": {}, "breaks": {},
      "core": "^0.0.1-rc.1", "loader": { "id": "standard", "range": "^1.0.0" }
    }
  }
}
```

校验（init 内联执行，失败 → 退出码 1 且不落盘）：

1. npm 包名规则（手写最小校验，禁第三方依赖）：小写、URL 安全、不以 `.`/`_` 开头、
   scope 形态 `@scope/name`；非法 → 用法错误（码 2）。
2. `parsePackageManifest(pkg)` 必须返回 `value`（B1 schema，manifest-v2.ts）且
   `problems.length === 0`；生成时显式声明全部 MUST 字段（formatVersion/id/version/
   entry/depends/breaks/core/loader），目标零 warning。
3. `checkTemplateAlignment(pkg)`（template-align.ts）必须 `aligned: true`
   （main/types/exports/peers/scripts/dsh.bundle.patch 全套）。
4. 骨架可打包：Phase B 用 `buildPack` 对 init 产物（预构建 lib 后）做往返验证
   （T46：init → build → pack → restore）。

## 6. 离线纪律

- `pack`：只读 `$DSH_HOME/mygo` store + lockfile + 系统 tar/gzip，复用 RT5 口径
  （T37：fetch 拦截计数 0）。
- `restore`：installPack 全程离线（B23；registry 不参与；pack 内自包含）。
- `init`：只读 CLI 包内 vendored 资产 + 写文件；MUST NOT 触发 pnpm/npm/网络。
- 三个命令的测试均沿用无网 fetch 拦截（`--require /tmp/block-net.cjs` 重建口径见
  e2e-verification.md §0）。

## 7. webui 管理窗口接入 spike（Phase C，探索性）

> 本节为 Phase A 交付的一部分（调研先行）；Phase C 是否执行、以何种结论收尾，
> 与 Phase B 一样等待用户放行后单独推进（任务书 §5）。

### 7.1 调研结论（0811 快照证据，§0.3）

官方 webui 插件管理窗口 = 配置窗口（`settings.plugin.item` 卡片 + settings
命名空间），**无安装/挂载/还原操作**。安装/挂载仍只存在于 CLI（`dsh plugin` pnpm
forwarder）与 mygo 自身 API（`/api/mygo/*`、pluginManager）。

### 7.2 三条合规路线与预判（如实记录，Phase C 实测）

| 路线 | 内容 | 预判（本地证据） | 断点 |
|---|---|---|---|
| 1. webui 既有扩展/注册点 | 向 `settings.plugin.item` 注册 mygo 配置卡片；或复用 `settings.section` | **部分能跑**（配置面） | 官方窗口无安装/还原操作，管理操作仍需 mygo 自身 section/API |
| 2. mygo 提供服务/API，webui 透传 | `/api/mygo/*`（ctx.httpServer）+ settingsScope 透传（design-r3 §2.5 环境裁决） | **能跑（子集）**：源码态 panel 已先例；需 npm rc.1/0811 profile 实测 lockfile 落账与报告可见 | 需要 mygo 包可发布/可装入官方 profile（依赖发布流水线，非本轮） |
| 3. 官方窗口操作落到 PluginManagerService | 验证 mygo 拦截/治理在调用路径生效 | **不能跑**：0811 官方窗口调用链不经过 PluginManagerService（无此调用） | 若官方后续把安装/挂载做进窗口，需 EXT-2 重新评估 |

### 7.3 Phase C 产出判定

按任务书：能跑 / 部分能跑 / 不能跑 三选一，如实记录到
`docs/cli-verification.md §webui-spike`；**伪造「能跑」是唯一失败**。若结论需要
官方侧提供新能力（如窗口内安装/挂载操作、插件配置 schema 直通），登记 EXT-2 并停止。

## 8. Phase B 测试计划（T44+，放行后执行）

| # | 场景 | 断言要点 |
|---|---|---|
| T44 | CLI E2E 往返 | 真实语料 profile → `mygo pack` → 空 profile `mygo restore --profile` → lockfile **plugins 语义载荷**逐字节一致（RT1 口径经 CLI 复验；`generated` 为安装侧事实，D-A5）；全程无网 |
| T45 | 篡改 pack 经 CLI restore | 非零退出 + 指认文件（`files/0.tgz`）+ human 报告可见；`--json` 直通 `pack-hash-mismatch` |
| T46 | init 产物 | 通过 B1（零 problems）+ 模板对齐（aligned）+ 可 pack/restore；id/name 替换正确 |
| T47 | 自举 | §1.3 步骤 5：`dsh --profile R mygo pack` 成功；R 无 `mygo` 参数时 profile 正常启动 |
| T48 | 报告渲染快照 | 每个 code 至少一个渲染用例（resolve-failed / pack-invalid / pack-hash-mismatch / manifest-invalid / service 报告）；快照字节级 |
| T49 | 被动语义 | `--profile web --port 8080` 场景 mygo-cli 不打印不退出 |
| 回归 | 全量 + EB | 无网拦截下既有 60 文件 / 606 用例 + 新增用例全绿；EB 13/13；typecheck |

交付：`docs/cli-verification.md`（场景矩阵 + 实测 + impl-bug/design-gap/fixture-issue
三分类故障统计 + webui-spike 章节）；代码与文档全部 git 提交（入库状态先修复 C3）。

## 9. 冲突上报 / 待裁决（Phase A 不自行扩张）

| # | 冲突 | 事实 | 建议 | 状态 |
|---|---|---|---|
| C1 | 字面 `dsh mygo pack` vs 官方 L0 | rc.1/0811 launcher 无插件子命令注册面，`--profile` 必填（args.ts:139-140） | 正式命令面采用 `dsh --profile <p> mygo …`；字面语法记为 EXT-2（需官方 launcher 扩展点），不 hook apps/cli | 待用户确认 |
| C2 | 暂定 id `dsh.mygo.cli` vs B1 | 含 `.` 违反 `ID_RE`，直接 manifest-invalid | 用 `dsh-mygo-cli` | 待用户确认 |
| C3 | dsh-mygo 仓库入库不完整 | 234db44 未含 B19+ 源码与 T32-T43（§0.1） | Phase B 前补齐同步（含 PATCHES.md 与 tests），全部入库 | 待确认（状态问题） |
| C4 | 官方插件配置窗口无安装/挂载 | 0811 ui-plugin-config 全包检索无 install/mount；host RPC 无 plugin 面 | Phase C 按「部分能跑/不能跑」如实记录；官方侧需要时登记 EXT-2 | 待 Phase C 实测 |
| C5 | requires.pluginManager 不可行（实现轮发现） | B6 政策闸无「要求管理器自身」表达；manager provides 仅 `service:mygo-core`，requires 键禁 `service:` 前缀 | requires 置空 + `ctx.get('pluginManager')` 惰性解析（§1.2）；零新增语义；报错文案 MUST 含「需要 mygo 管理器」且无裸 stack（cli-verification §4.2） | 用户追认（2026-08-12）；程序违规追记于 cli-verification §4.1 |

## 10. 修订记录

| 修订编号 | 日期 | 原因 |
|---|---|---|
| Rev-A1 | 2026-08-12 | 初版：Phase A 设计说明（命令面/报告渲染/注册机制/init 产物/离线纪律/webui 调研），交付后等待放行 |
| Rev-A2 | 2026-08-12 | Phase B 实现轮修订：① requires 置空（C5，B6 无法表达管理器自身）；② 参数解析改手写最小实现（任务书允许；0811 pnpm 非提升布局）；③ init 复制 `.agents/skills`（7）+ `pnpm-lock.yaml`（verify-self-contained 硬性要求）；④ T44 语义载荷口径 = plugins 段（generated 为安装侧事实）；⑤ mygo `package/index.ts` 补导出 ServiceConflictEntry/ServiceResolutionReport 类型（CLI 渲染器消费） |
| Rev-A3 | 2026-08-12 | Phase B 裁定后收尾：C5 用户追认 + 程序违规追记（cli-verification §4.1）；附带代价记录（§4.2）；管理器缺失报错文案明确「需要 mygo 管理器」且无裸 stack（src/index.ts + T49b） |
| Rev-A4 | 2026-08-12 | 用户裁决采纳官方 DSH host 补丁语义（patches/README @87acac8）：模板资产基线 2da8230 → 87acac8（7 文件同步，逐字节一致）；init 产物随之携带官方双补丁契约；AGENTS.md 措辞精确化为「零写入/禁 apply，允许 host 补丁提案」；vendor/PATCHES.md 仅登记已落地修改 |

---

**Phase A 交付完成。按闸门纪律（任务书 §0），本文件即交付物；Phase B / Phase C
均未动工，等待用户放行。**
