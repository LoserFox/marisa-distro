# DSH `0.1.0-rc.8` 迁移研究：上游差异、插件兼容性与多模态插件评估

> 研究日期：2026-08-20
> 上游仓库：[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
> 方法：git 浅克隆（`-c http.sslBackend=openssl`，api.github.com 不可达、registry.npmjs.org 可用）、`git diff/log/show`、npm registry 元数据、上游 `.agents/notes` 一手笔记。没有使用博客或二手解读。没有跑上游测试，也没有把 Marisa `harness/` 对 rc8 做三方 merge。
> 本地对照：`maintenance/upstreams.json` 当前 `baseline: 99f6f02fe`、`dshVersion: 0.1.0-rc.7`（2026-08-18 同步）。

## 结论（TL;DR）

1. **rc8 已发布**：tag `dsh-v0.1.0-rc.8` = `141eb6fef83422698aef7a981029e843e8161534`（2026-08-19 23:11 +0800 merge PR #2783），就是当前 `master` HEAD；npm `next` 家族在 2026-08-19 15:27–15:42 UTC 整齐发布 `0.1.0-rc.8`，`latest` 仍是 rc.7。
2. **rc7→rc8 是大发布**：318 提交 / 36 first-parent（35 PR）/ 1604 文件 / +54,064 −10,533。对比 rc6→rc7 是 106 提交。这不是版本号级同步，是一次实质功能面扩张。
3. **Marisa 的 harness patch 接触面在 rc8 无 diff**（`apps/cli/src/` 全部 6 文件、`packages/host/webserver`、`pnpm-workspace.yaml` 均未变；`web.ts` 在公开 rc7/rc8 都不存在，web 命令由 `packages/bundle/web-app` 提供）——`--profile` 补丁与 `webServer` 别名重放风险低。`tsconfig.host.json` 有 12 行新增。
4. **必须处理的破坏面**：① 客户端 shell 包 `dsh-client-web-react` 被并入/改名 `dsh-client-web`（npm 上 `dsh-client-web-react` 停在 rc.7 不再发布），`client/schema-form` 删除；② settings client store 重构（#2613）；③ web 默认 locale 从 zh 改 en（#2628，浏览器派生）；④ `dsh web` 自动开浏览器，桌面壳要加 `--no-open`（#2410）；⑤ 构建管线换成 `scripts/build.ts` + `DSH_CLIENT_*` 环境注入（#2665/#2778），打包脚本要跟着换；⑥ 官方 `workflow`/`ralph` 工具在 rc7 base 就已挂载、rc8 补披露策略（#2607），与 Marisa 的 vendored `dsh_workflow` fork 撞名是**现状**，应借迁移一并清理；product subagent 改为可安装 Bundle（#2392 系列），YAS 挂载策略需重审。
5. **原生多模态已闭环**：rc8 直接 `deepseek-official` 适配器支持视觉模型收图（#2724），配合 rc7 已有的 Web 图片输入/持久附件与 rc8 的命令附件信封（#2623），原生能力覆盖了大部分第三方视觉插件场景；多模态插件去留结论见下文专门章节。
6. **迁移形态**：`harness/` 目前仍是主仓库普通目录（非 submodule，`git -C harness rev-parse HEAD` = 主仓 HEAD `39a31e46`），rc8 同步是「换树 + 重生成 profile/bundle + 重打包」的整链路操作，建议同时兑现 pinned submodule 计划。

## 精确 refs

| 对象 | 值 | 来源 |
|---|---|---|
| rc8 tag / commit | `dsh-v0.1.0-rc.8` → `141eb6fef83422698aef7a981029e843e8161534` | `git ls-remote --tags`（openssl 后端） |
| rc8 release merge | PR [#2783](https://github.com/deepseek-ai/deepseek-harness/pull/2783)，2026-08-19 23:11 +0800 | merge commit subject |
| master HEAD | `141eb6fef`（= rc8） | `git ls-remote --heads` |
| rc7（当前 pin） | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | `maintenance/upstreams.json` |
| rc8 npm 发布时间 | `@deepseek-ai/dsh@0.1.0-rc.8` 2026-08-19T15:41:29Z | registry packument `time` |
| npm dist-tags | `latest = 0.1.0-rc.7`，`next = 0.1.0-rc.8` | registry packument |
| 家族发布完整性 | 抽样的 `dsh-base`/`dsh-web-app`/`dsh-attachment`/`dsh-llm`/`dsh-tool-subagent`/`dsh-client-modules` 等 `next` 均 = `0.1.0-rc.8`（08-19 15:27–15:42 UTC 发布） | registry packument |
| **`dsh-client-web-react`** | `next` 停在 `0.1.0-rc.7`（08-17），**rc8 无新版** | registry packument |
| `dsh-tool-pwsh-persistent` | 新包，`latest`/`next` 均 = `0.1.0-rc.8` | registry packument |
| 仓库根版本 | `0.1.0-rc.8` | `git show 141eb6fef:package.json` |
| Node / pnpm | `engines.node: ^22.19.0 \|\| >=24.0.0`，`packageManager: pnpm@11.7.0`（未变） | `git show 141eb6fef:package.json` |
| node-pty | 仍精确 `1.2.0-beta.15`；`subprocess-local` 新增 `koffi ^3.1.0` | `packages/subprocess/subprocess-local/package.json` |
| 上游浅克隆 | `.tmp-dsh-rc7\`（工作树 rc7，含 rc8 对象） | 本地 |

## 提交范围

`git rev-list 99f6f02fe..141eb6fef`：

- 全部提交：318
- `--first-parent`：36（35 个功能/修复 PR + 1 个 release merge）
- `git diff --stat`：1604 文件，+54,064 / −10,533

First-parent 时间线（2026-08-18 17:30 → 08-19 23:11，committer +0800）：

| SHA | PR | 主题 |
|---|---|---|
| `50ba7576` | [#2607](https://github.com/deepseek-ai/deepseek-harness/pull/2607) | workflow 手动披露（官方 workflow 工具） |
| `f8912628` | [#2589](https://github.com/deepseek-ai/deepseek-harness/pull/2589) | product subagent 非交互权限（codex） |
| `f4caa4db` | [#2619](https://github.com/deepseek-ai/deepseek-harness/pull/2619) | web pi-ai 重试默认值 |
| `6c16d29b` | [#2613](https://github.com/deepseek-ai/deepseek-harness/pull/2613) | **web settings describe mirror（settings-store 重构）** |
| `836c3227` | [#2638](https://github.com/deepseek-ai/deepseek-harness/pull/2638) | product subagent 命名实例（codex） |
| `0b42971d` | [#2628](https://github.com/deepseek-ai/deepseek-harness/pull/2628) | **locale 默认改英文** |
| `1df24165` | [#2392](https://github.com/deepseek-ai/deepseek-harness/pull/2392) | **可安装 product subagents（Bundle 化）** |
| `c1197105` | [#2579](https://github.com/deepseek-ai/deepseek-harness/pull/2579) | 可安装 codex provider |
| `c1e0acba` | [#2635](https://github.com/deepseek-ai/deepseek-harness/pull/2635) | 分区覆盖率（CI） |
| `36d8a2ae` | [#2603](https://github.com/deepseek-ai/deepseek-harness/pull/2603) | **web_search 多查询** |
| `657f52eb` | [#1787](https://github.com/deepseek-ai/deepseek-harness/pull/1787) | plan 窄视口回归 |
| `ba4aa807` | [#2623](https://github.com/deepseek-ai/deepseek-harness/pull/2623) | **命令图片附件信封** |
| `5b3a8813` | [#2554](https://github.com/deepseek-ai/deepseek-harness/pull/2554) | Python SDK standard agent runtime |
| `bae043e4` / `943daa17` | [#2636](https://github.com/deepseek-ai/deepseek-harness/pull/2636) / [#2640](https://github.com/deepseek-ai/deepseek-harness/pull/2640) | product subagent failure facts（claude/codex） |
| `6079181d` | [#2673](https://github.com/deepseek-ai/deepseek-harness/pull/2673) | web feedback note popover |
| `2aaf760f` | [#2709](https://github.com/deepseek-ai/deepseek-harness/pull/2709) | home path 缩写（~） |
| `7d2982de` | [#2695](https://github.com/deepseek-ai/deepseek-harness/pull/2695) | tool 行文件打开失败处理 |
| `4f1eb8f3` | [#2724](https://github.com/deepseek-ai/deepseek-harness/pull/2724) | **DeepSeek 原生多模态（直接视觉输入）** |
| `fe351b4d` | [#2650](https://github.com/deepseek-ai/deepseek-harness/pull/2650) | **pi-ai 配置面暴露 + catalog 大扩** |
| `0497a10f` | [#2686](https://github.com/deepseek-ai/deepseek-harness/pull/2686) | rail search 外部点击修复 |
| `e84b82d7` | [#733](https://github.com/deepseek-ai/deepseek-harness/pull/733) | **web 文件/会话引用（@file/@session）** |
| `24ef32c7` | [#2134](https://github.com/deepseek-ai/deepseek-harness/pull/2134) | **取消时流前缀 finalize** |
| `2bff588f` | [#2756](https://github.com/deepseek-ai/deepseek-harness/pull/2756) | oxlint CI（CI） |
| `f8e4ca0b` | [#2410](https://github.com/deepseek-ai/deepseek-harness/pull/2410) | **`dsh web` 自动开浏览器 + `--no-open`** |
| `e1220050` | [#2744](https://github.com/deepseek-ai/deepseek-harness/pull/2744) | CI 移除 hosted serial linux（CI） |
| `c474d28d` | [#2722](https://github.com/deepseek-ai/deepseek-harness/pull/2722) | 避免 persistence seed clone |
| `e7d24de3` | [#2300](https://github.com/deepseek-ai/deepseek-harness/pull/2300) | **pwsh 持久 PTY（Windows）** |
| `1943a532` | [#2769](https://github.com/deepseek-ai/deepseek-harness/pull/2769) | web reference UI polish |
| `1a5e038f` | [#2665](https://github.com/deepseek-ai/deepseek-harness/pull/2665) | **client build environment + nologo** |
| `6efd8edd` | [#2306](https://github.com/deepseek-ai/deepseek-harness/pull/2306) | **sqlite 物理 chunk 行压缩** |
| `75282c92` | [#2778](https://github.com/deepseek-ai/deepseek-harness/pull/2778) | nologo 2 |
| `a9dc3b7f` | [#2780](https://github.com/deepseek-ai/deepseek-harness/pull/2780) | brand guidelines i18n |
| `05d64b50` | [#2786](https://github.com/deepseek-ai/deepseek-harness/pull/2786) | llm-deepseek reasoning passback 修复 |
| `b862725e` | [#2787](https://github.com/deepseek-ai/deepseek-harness/pull/2787) | worktree rename team |
| `141eb6fe` | [#2783](https://github.com/deepseek-ai/deepseek-harness/pull/2783) | release `0.1.0-rc.8` |

包目录集合变化（`packages/`）：

- **删除**：`client/web-react`（即 `@deepseek-ai/dsh-client-web-react`，并入 `client/web`）、`client/schema-form`
- **新增**：`client/ui-brand-official`、`client/ui-reference`、`client/ui-renderer`、`code-runtime/code-runtime-python`、`context/file-reference`、`context/file-reference-local`、`experimental/agent-team`、`experimental/tool-agent-team`、`shell/tool-pwsh-persistent`

## 对 Marisa 有意义的 rc8 变化（按影响面）

### 0. 没变的 patch 面（重放风险低）

`git diff --quiet 99f6f02fe 141eb6fef` 退出码 0 的文件：

- `apps/cli/src/` 全部 6 个文件（`args.ts`/`bin.ts`/`dump-config.ts`/`plugin.ts`/`process-shutdown.ts`/`profile-boot.ts`）—— Marisa 的 `--profile` / launcher 参数补丁继续适用；`web.ts` 在公开 rc7/rc8 都不存在（`dsh web` 是 `--profile web` 的硬编码别名，web 命令实现已由 `packages/bundle/web-app` 提供方持有，rc8 仅在其上加 `--no-open`/`--trusted-host` 等参数）；
- `packages/host/webserver/src/index.ts` —— `webServer` 服务名未动；
- `pnpm-workspace.yaml` —— 根 workspace 关系未变；
- `tsconfig.host.json` 有 12 行新增（`#1787` 之类测试接入），属增量。

### 1. 构建管线换血（打包链路必须跟着改）

- 根 `package.json`：`npm run build` 从 `build:lib && build:web` 改为 `tsx scripts/build.ts`（新增 `--profile official` 与 `DSH_BUILD_CLIENT_PROFILE`），并新增 `scripts/client-build-environment.ts`（`DSH_CLIENT_BUILD_PROFILE` / `DSH_CLIENT_TITLE` / `DSH_CLIENT_COMMIT_HASH` 注入 + build record 写盘）、`scripts/verify-client-packages.ts`（进 `hygiene`）、coverage partitions。
- `apps/web/package.json`：`@deepseek-ai/dsh-client-web-react` 依赖项换成 `@deepseek-ai/dsh-client-web`，react/react-dom 从 dependencies 移到 devDependencies；`watch` 加 `--no-emptyOutDir`。
- `apps/web/index.html`：lang 默认 `en`，标题默认 `DSH Local Build`；`DSH_CLIENT_TITLE` 环境变量可在构建期投影标题（Marisa 可用它打 `Marisa` 标题，官方 profile 默认是 `DeepSeek Harness`）。
- **Marisa 含义**：`desktop`/打包脚本如果直接调用上游 `npm run build` 或依赖旧产物布局，要切到 `scripts/build.ts` 语义；`DSH_CLIENT_TITLE` 同时解决品牌标题诉求（可去掉对 index.html 的本地 patch，若有）。

### 2. 客户端 shell 包改名（插件破坏面）

- `@deepseek-ai/dsh-client-web-react` → `@deepseek-ai/dsh-client-web`；npm `next` 上旧名停在 rc.7 不再发布。
- `client/schema-form` 删除（`@deepseek-ai/dsh-schema-form` 不再存在）。
- **Marisa 含义**：任何 plugin / MyGO / bundle 依赖 `dsh-client-web-react` 或 `dsh-schema-form` 的，rc8 装不上或构建失败；逐项核查见插件矩阵。

### 3. settings 契约再动（#2613 settings describe mirror）

- `ui-agent-preset`、`ui-permission-presets`、`ui-settings-general` 的 client `settings-store` 重构（permission-presets 的 store 146 行改动、settings-document-store 76 行），settings describe 镜像到 web（新增 `startup-rpc-budget` e2e）。
- **Marisa 含义**：自绘设置卡/设置存储的插件（MyGO 设置面、vision-toolkit 设置页、genui 等）需要按新 store 契约复核；keyed-by-namespace 仍是 rc7 的基准，rc8 是 store 层重构，不改变 `settings.plugin.item` keyed 注册方式本身。

### 4. locale 默认改英文（#2628）

- `FALLBACK_LOCALE` 从 `zh` 改为 `en`；`<html lang>` 按活动 locale 同步（`zh` → `zh-CN`，`en` → `en`）；浏览器派生初始 locale（rc7 已有 `browser-derived-initial-locale`，rc8 调整默认与回退语义：浏览器没声明已发布语言时开英文）。
- **Marisa 含义**：中文用户浏览器声明 `zh` 时仍是中文；但无语言声明的环境（headless、部分 WebView2 配置）从「默认中文」变「默认英文」。桌面 WebView2 首启语言表现需要实测（用户语言设置通常能派生 zh）。

### 5. `dsh web` 自动开浏览器（#2410）——桌面壳动作项

- `dsh web` 本地启动就绪后自动打开默认浏览器（`--no-open` 关闭；`SSH_CONNECTION`/`SSH_TTY` 非空时自动抑制；仍打印 `dsh web: <url>` 行）。实现位于 `packages/bundle/web-app/src/index.ts`：`openBrowser`（默认 true）、`printUrl`（默认 true，保持 `dsh web: http://...` 行格式，桌面壳的 stdout 解析兼容）、`DSH_WEB_URL` 环境变量。
- **Marisa 两条启动路径都要处理**：
  1. 桌面壳默认路径 `dsh web --port {port}`（`desktop/command.go` 的 `webCommandLine`）→ rc8 下应改为 `dsh web --port {port} --no-open`；
  2. 随包后端路径 `desktop/bundle/launcher.cmd` 直接跑 `bin.js --profile marisa --patch <overlays>`（不打 `web` 子命令）→ 不能靠 `--no-open` 参数，应在 `profiles/marisa/desktop.overlay.yml` 给 web-app bundle 提供方补 `openBrowser: false` 行（`openBrowser` 是 bundle config，profile overlay 可覆盖）。

### 6. 原生多模态闭环（#2724 + rc7 基础 + #2623）——多模态插件评估的直接背景

- **直接 DeepSeek 视觉输入**（#2724，notes `2026-08-19-direct-deepseek-vision-input.zh.md`）：直接 `deepseek-official` 适配器允许配置了 `inputModalities: [text, image]` 的模型收图（`image_url` data URL；规范消息只存 `ImageAttachmentRef`，Data URL 仅存在于单次请求；PNG/JPEG/WebP/GIF；不支持外部 URL / Files API / 图片输出；未列出的模型 id、省略 `inputModalities` 的仍仅文本；`deepseek-v4-flash-vision-exp` 不随目录公布，部署可自行启用）。
- **请求级图片载荷上限**（notes `2026-08-18-request-image-payload-bound.zh.md`）：pi-ai 与直接适配器共享 `maxRequestImageBytes`（默认 20 MiB），超限从最老图片起替换为固定占位文本（`(see attached image)` 语义），413 归类 `INVALID_REQUEST`；准入新增 `maxImageDimension`（单边像素上限，见 `docs/subsystems/attachment.md` diff）。
- **Attachment wire 面**（rc8）：新增 `EncodedImageAttachment`（`mediaType`/`data`/`name`）与 `admitEncodedImages()` 批量准入入口，`saveImages()` 拥有 count/aggregate-byte 限额与 validate-all-before-save 顺序（`docs/subsystems/attachment.md`）。
- **命令图片附件信封**（#2623）：`CommandDefinition.input.images: boolean`（缺省 false）；`commands/execute` 新增必填 `images` wire 参数；`CommandInvocation.attachments` 携带冻结 `ImageBlock[]`；`/goal`、`/plan` 支持参考图（goal 通过 `agent.followup` 提交带图 user 消息，plan 并入 steer 消息）。执行器强制声明，composer 对未声明命令的带图提交可见拒绝。
- **Marisa 含义**：① 官方 Web 图片输入 + 持久附件（rc7 已有）→ rc8 直接适配器原生消费图片，第三方视觉输入插件的能力缺口进一步收窄；② 自注册命令的插件（含 MyGO 命令面、`dsh_workflow` 的命令扩展等）需评估 `input.images` 声明与 execute wire 变化；③ 视觉插件若绕过 attachment 准入自造 base64，需对照新 wire 类型。

### 7. 官方 workflow / ralph 工具（#2607 披露策略；工具本身 rc7 已有）——与 vendored `dsh_workflow` 直接相关

- **事实修正**：`@deepseek-ai/dsh-tool-workflow`、`dsh-tool-ralph`、`dsh-workflow-worker-thread` 在 rc7 的 CLI 依赖与 base bundle 组合（`packages/bundle/base/cordis.patch.yml` 的 `tool-workflow`/`tool-ralph`/`workflow-worker-thread` 行）**已经默认存在**；rc8 只是随 `#2607 workflow-manual-disclosure` 补充使用策略（显式要求时才用、一两次委托用普通 subagent）并继续保留在 base。
- 官方 `tool-workflow` 注册 `toolName: workflow`（`maxResultChars` 默认 50000，跑 JS 编排脚本 fan-out subagent，`ctx.workflowEngine` seam）。
- **Marisa 现状（与 rc7 同源，非 rc8 新增）**：Marisa 组合同时挂载官方 `tool-workflow`（来自 base bundle）与社区 fork `@dsh-external/workflow`（`dsh_workflow`，`plugins/dsh_workflow/src/index.ts:676` 注册 `name: 'workflow'`）——两个 `workflow` 工具并存/撞名。boot 未阻断，但这是组合层面的重复能力。
- **迁移时应决定**：① 移除 fork 行，改用官方工具（若 fork 的审批/持久化差异不再必要）；② 或确认 fork 改 toolName 后保留。无论 rc8 与否，这个重复都值得单独清理。

### 8. product subagent 可安装化（#2392/#2579/#2638/#2589/#2640/#2636）——YAS 与预设策略

- codex / claude-code subagent provider 从「预设内注释行」改为**独立可安装 Bundle**（`dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex` 等）；preset 里对应工具行保留 `disabled: true` 注释，安装 Bundle + 复制 preset 去掉 disabled 才启用。
- 官方 `@deepseek-ai/dsh-tool-subagent` 仍在默认依赖（YAS 撞名问题不变）。
- **Marisa 含义**：① YAS（`yet-another-subagent`）的「禁用官方 tool-subagent 再挂」策略在 rc8 不变，但官方 subagent 面重构（run.ts/wire.ts 大改、failure facts、named instances、noninteractive permissions）可能扩大 YAS 的兼容面差距；② Marisa 若用自定义预设（marisa profile 的 agent preset 行），需对照 rc8 preset 结构（背景工具行注释变化）重放。

### 9. Windows 侧：pwsh 持久 PTY（#2300）+ koffi

- 新包 `@deepseek-ai/dsh-tool-pwsh-persistent`（`shell/tool-pwsh-persistent`）进入 CLI 默认依赖；`subprocess-local` 新增原生 FFI 依赖 `koffi ^3.1.0`；持久 bash 的同套就绪检测/等待语义扩展到 pwsh。
- **Marisa 含义**：Windows 桌面后端重建时要带 `koffi`（原生二进制，打包闭包变化）；持久 pwsh 会话能力可直接从 base bundle 获得（Marisa 组合已启用 tool-pwsh 行，可评估是否加 persistent 行）。

### 10. 会话持久化：sqlite 物理 chunk 行压缩（#2306）

- `session-persistence-sqlite` 引入 chunk 行压缩 + `begin`/`commit` SQL 资源（`BEGIN IMMEDIATE`）；`docs/persistence-catalog.md` 同步。
- **Marisa 含义**：存储格式内部变化（压缩是物理层），既有会话库升级路径需按上游 README 验证；备份/迁移注意 `begin-immediate.sql` 语义。

### 11. 其余值得知道的

- **pi-ai 配置面大扩**（#2650）：`llm-pi-ai/src/catalog.ts` +475 行（模型目录扩充），`config.ts` 57 行；`docs/config-catalog.md` 大改。Marisa 若用 pi-ai 路由（如 vision-toolkit 的 GLM 免费通道）会获得更多开箱模型条目。
- **web_search 多查询**（#2603）：`tool-web` 新增 `searchMaxQueries` 配置与 `WEB_SEARCH_MAX_QUERIES` 导出（一次调用可多条查询）；包装官方搜索 schema 的插件需同步。
- **@file / @session 引用**（#733）：composer 引用语法 + 新 RPC；`dsh-sonar` 之类读 session 的插件可关注。
- **取消 finalize 语义**（#2134）：取消时前缀消息 finalize 行为变化（`cancelled-stream-prefix-finalize` 笔记）；依赖 `conversationEvents` 时序的插件（`dsh-llm-fallbacks`、suggested-replies）在 rc8 重测时必须覆盖取消路径。
- **llm-deepseek serialize 修复**（#2786）：reasoning passback 每轮补齐（`serialize.ts`/`types.ts` 小改）——重放/缓存类代码若按旧形状解析 reasoning 字段需复核。
- **home path 缩写**（#2709）：client workspace path 显示 `~`。
- **experimental/agent-team**（#2787 配套）：官方 Agent Teams（lead/teammate）进入 experimental，与 workflow 定位不同（团队协作 vs 编排脚本），但属同一「多代理」主题，值得在 roadmap 观察。

## 迁移可行性评估

### 规模判断

- rc7→rc8 的 318 提交/1604 文件属于上游「一周大版本」节奏；对 Marisa 而言，harness 仍是非 submodule 的整目录同步，所以迁移 = 换树 + 重放 patch + 重生成 profile/bundle + 重打包 + 全量验收，工作量与 rc7 sync（2026-08-18）同级，主要风险不在 diff 大小而在**构建管线与客户端包改名的连锁反应**。
- `maintenance/upstreams.json` 的 `mode: mirror` 语义不变；rc8 同步是「只更新 pin + 重验」，与 AGENTS.md 的 mirror 边界一致。

### 桌面/发行动作项（来自上游事实）

1. 桌面启动命令加 `--no-open`（`desktop/` 的 `webCommandLine`，见 `desktop/command.go`）；随包后端 `desktop/bundle/launcher.cmd` 走 `bin.js --profile marisa` 不打 `web` 子命令，改为在 `profiles/marisa/desktop.overlay.yml` 给 web-app 提供方补 `openBrowser: false`。
2. 打包脚本切换到 rc8 构建语义（`scripts/build.ts` + `DSH_CLIENT_TITLE`；`apps/web` 的 react 移到 devDependencies 后，安装期依赖图变化）。
3. `koffi` 原生二进制进入 `subprocess-local` 闭包 → 桌面 backend 打包清单/完整性校验更新。
4. 默认 locale 行为验证（WebView2 无语言声明时是否变英文；若不可接受，评估 profile/客户端注入 zh 偏好）。
5. **根 workspace 依赖面清理**：根 `package.json` 里 `@deepseek-ai/dsh-*@^0.1.0-rc.6` 的 npm 依赖在 rc8 下会**静默解析**——存活包自动到 `0.1.0-rc.8`，但 `dsh-client-web-react`/`dsh-client-schema-form` 停在 rc.7 且 rc8 已删除（schema-form）或改名（web-react→web）。必须显式升到 `^0.1.0-rc.8` 并删除两个死包条目，否则 lockfile 混装 rc.7 死包与 rc.8 活包。

### 必须验证清单（升 rc8 时）

1. `--profile marisa` 启动 + boot（launcher 参数面未动，理论直接可用）。
2. web 全流程：首启配置、会话、图片输入（粘贴/拖放/文件）、`/goal` `/plan` 带图、设置页（MyGO 卡、插件卡 keyed 注册）。
3. 持久 pwsh 会话（若启用 persistent 行）与 tool-pwsh 行在 base bundle 下的交互。
4. 官方 `workflow` 工具与 `@dsh-external/workflow` fork 的注册冲突（或移除 fork）。
5. 全部插件按下节矩阵逐项验收；`dsh-client-web-react`/`dsh-client-schema-form` 依赖逐包 grep。
6. sqlite 会话库升级与既有会话可用性。
7. `pnpm install --frozen-lockfile` + `pnpm test` + 桌面 Go 测试 + MSI 安装/启动/卸载（AGENTS.md 门槛）。
8. 取消路径（#2134）与 replay（#2786）回归：旧 rc7 会话在 rc8 上重放。

### 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 构建管线语义变化导致发行构建断裂 | 高 | 先在本仓验证 rc8 树 `pnpm run build`（或 `build.ts`），再动 profile/打包 |
| 客户端包改名导致插件/MyGO 构建失败 | 高 | 逐包 grep `dsh-client-web-react`、`dsh-schema-form`；优先升级/替换 |
| 官方 workflow 与 vendored fork 冲突 | 中 | 迁移时二选一（建议官方 + 移除 fork，或确认 fork toolName 不撞） |
| settings store 重构影响自绘设置卡 | 中 | 按 #2613 的 store 契约重测 MyGO/vision-toolkit/genui 设置面 |
| locale 默认英文影响中文首启体验 | 中 | WebView2 实测；必要时注入 zh 偏好 |
| 自动开浏览器与桌面壳双窗口 | 低 | `--no-open` 一行 |
| 旧会话重放/取消语义变化 | 低-中 | 升级后回归取消与重放路径 |

## 插件兼容矩阵（附录 A）

> 产出：2026-08-20。证据：本地 fork 补丁（`docs/plugins/<id>.md`）、上游 HEAD/npm 版本实测（`git ls-remote` openssl 后端 + registry packument）、rc8 树源码对照（上文第 1–11 节）。「直接兼容」指 API 面无死包/删除面引用，**仍需 rc8 真机 boot 验收**。
>
> 说明：`mineru` / `aigc-canvas` 只出现在 legacy 清单（根 `plugins.json`、`legacy/`）与 rc7 兼容文档的旧表述里，**不在**当前 `profiles/marisa/plugins.json` 的 28 个 vendored 插件中，不参与本轮矩阵。

### A.1 组合启用（19 个）——rc8 定性

| 插件 | vendored | 上游现状 | rc8 定性 | 动作 |
|---|---|---|---|---|
| `dsh-better-sidebar` | 0.10.3（npm） | **0.14.0**（08-19，peers 全 `^0.1.0-rc.8`，无死包引用） | **需升级**：0.10.3 依赖已删除的 `dsh-client-web-react`+`dsh-client-schema-form`，rc8 构建必坏 | 同步 0.14.0 并重验 |
| `interpreters` | 0.1.0（npm） | **0.2.1**（08-19，peers `^0.1.0-rc.8`） | **需升级**：0.1.0 的 `workspace:^` web-react 在 rc8 workspace 解析不到 | 同步 0.2.1 |
| `mnemon` | 0.2.9（npm） | **0.2.13**（08-19，peers rc.6 可解析 rc.8，无死包） | 需升级（低优先）；Go 引擎二进制 v0.2.3 是否随新版变化须核对 | 同步 0.2.13 |
| `ya-workspace-sidebar` | 0.1.0（npm） | **0.3.1**（08-18） | 需升级；0.3.1 peer 仍是 `^0.0.1-rc.1` 旧风格，rc8 组合行为待测 | 同步 0.3.1 后 boot 验收 |
| `dsh-vision-toolkit` | 0.1.32（git） | **0.1.36+**（HEAD `a79d5405`） | 需升级；rc8 无硬断点（见附录 B.1） | 同步 0.1.36+ |
| `dsh-paste-input` | `7cf0698a`（git） | HEAD `2fa32218`（有更新） | 需同步检查；与 rc8 原生图片输入无冲突面 | 同步后重验 |
| `dsh_workflow` | `44b83c18`（git fork） | HEAD 同 pin（未动） | **建议移除**：官方 `tool-workflow`（rc7 起 base bundle 默认挂载）与 fork 同名 `workflow` 并存；fork 是 0808/rc.2 时代产物 | 迁移时移除 fork 行（或 fork 改 toolName 后保留） |
| `dsh-a2a` | `220de3a5`（git） | HEAD 同 pin | **需小改**：`ui-a2a` 子包依赖 `dsh-client-web-react@^0.1.0-rc.6`，rc8 解析到 rc.7 死包 | 本地改 dep 或等上游 |
| `dsh-genui` | `ae8006d8`（git） | HEAD 同 pin | 直接兼容（settings keyed 未变）；rc8 真机验收 | 保持 |
| `dsh-git-identity` | `39c608ca`（git） | HEAD 同 pin | 直接兼容（host 侧策略插件，无 client 面） | 保持 |
| `dsh-input-history` | `eaf9aab7`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-sidechain` | `9dc75fef`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-stickers` | `1703f099`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-ui-progress` | `e8ffef3b`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-code-map` | `c90e37d0`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-artifact` | `cad2c4da`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-drag-and-drop` | `09088d68`（git） | HEAD 同 pin | 直接兼容 | 保持 |
| `dsh-web-ui-approval-notify` | `865d2f6f`（git） | HEAD 同 pin | 直接兼容（rc6 测试路径补丁） | 保持 |
| `dsh-update-check` | 自研（git） | 无上游 | 直接兼容（仅检查+通知，深链 Release） | 保持 |

### A.2 停用/待重测（9 个）——rc8 定性

| 插件 | vendored | 上游现状 | rc8 定性 | 动作 |
|---|---|---|---|---|
| `dsh-llm-fallbacks` | 0.1.0-alpha.1（npm） | **0.3.2**（08-20，peers `^0.1.0-rc.8`，无死包） | **上游已 rc8 就绪**：0.3.2 重测后可考虑恢复组合挂载；同时必须回归取消 finalize（#2134）路径 | 同步 0.3.2 + rc8 事件契约重测 |
| `dsh-web-review` | 0.1.0（npm，client 语法损坏） | **0.3.0**（08-17，无 peers/deps） | 值得重新构建验证：0.3.0 可能已修 client 脚本 | 装 0.3.0 实测 |
| `dsh-diff-viewer` | `75ded1bc`（git） | HEAD `d576c00c`（**已前进**） | 上游有修复动作；rc8 下重新评估 keyed toolview 注册 | 同步上游 + 重测 |
| `dsh-track` | `0efb1796`（git） | HEAD `49991c6e`（**已前进**） | 上游有动作；session-query 契约在 rc8 仍不存在（官方有 `session-query-sqlite`/`tool-session-query` 包——见下文注） | 同步上游 + 重测 |
| `whale-girl` | `90c1a027`（git） | HEAD `e22e1fd9`（**已前进**） | 娱乐插件，非多模态；inject `jobs` 服务在 rc7/rc8 均不存在，boot fail-loud 未变 | 维持停用，按娱乐策略单独决策 |
| `dsh-sonar` | `1de51055`（git） | HEAD 同 pin | 契约（Cordis 服务 + `conversation.view` slot）rc8 未验证；上游无动作 | rc8 重测或维持停用 |
| `dsh-suggested-replies` | `eb7e41b8`（git） | HEAD 同 pin | 沿用停用；rc8 客户端 API 时序未验证（含 #2134 取消路径） | rc8 重测或维持停用 |
| `dsh-multimedia-webui-input` | `fecdc67a`（git） | HEAD 同 pin | **建议移除出包**：结构性不兼容（`dsh-client-ui-slash` 已不存在、注入 `httpServer` 而非 `webServer`）+ 功能已被 paste-input/drag-and-drop/原生图片输入覆盖（附录 B.2） | 移除或标注历史遗留 |
| `yet-another-subagent` | 0.1.2（npm） | 0.1.2（未动） | 撞名策略不变（须禁用官方 `tool-subagent`）；rc8 官方 subagent 面重构（#2392 系列）扩大差距 | 维持未挂载 |

> 注：`dsh-track` 依赖的 session-query 能力，rc8 harness 树已有官方 `@deepseek-ai/dsh-session-query` + `dsh-session-query-sqlite` + `dsh-tool-session-query` 包（本仓 root workspace 已引用），但 `docs/plugins/dsh-track.md` 明示其依赖的契约形状在 rc7 不存在——重测时应**先对照官方包判断是否等价**，若等价则按「删除而非重放」原则（`docs/upstream-diff.md`）处理 fork 补丁。

### A.3 MyGO（dsh-mygo/，vendored `0.2.0-rc.7`）

| 面 | rc8 状态 | 证据 |
|---|---|---|
| `webServer` | 兼容 | MyGO 面板 inject `['pluginManager', 'webServer']`，服务名 rc8 未变；对受管插件另有 `httpServer` 可选通道（`service.ts:331` `ctx.get('httpServer')`） |
| settings | 兼容面待核 | 面板走 `settings.section` + `settings.plugin.item` keyed（`mygo-panel/src/client/index.ts`）；#2613 store 重构不改变 keyed 注册，但 store 内部契约变了，面板 live-apply 需真机验收 |
| `dsh-client-web-react` | **风险点** | `mygo-panel/tsdown.config.mjs` 把 `dsh-client-web-react` 列为 external——rc8 运行时不再提供该模块，面板 client 若在运行时 import 会失败；须确认 external 是否真实触发 import |
| 受管插件面 | 兼容面待核 | `settings.register`（keyed）、commands、tools 等宿主面 rc8 均在；受管插件自身的 rc8 兼容由市场侧解决 |
| MyGO 版本 | 0.2.0-rc.7 → 上游 `next` 线是否已有 rc8 适配版本 | 同步时查 `omdsh-dev/dsh-mygo` 的 next dist-tag |

### A.4 矩阵结论汇总

1. **升级即修复的**（vendored 落后，上游新版 rc8 就绪）：`dsh-better-sidebar`→0.14.0、`interpreters`→0.2.1、`dsh-llm-fallbacks`→0.3.2（可重挂载）、`mnemon`→0.2.13、`dsh-vision-toolkit`→0.1.36+、`dsh-web-review`→0.3.0（重测）、`ya-workspace-sidebar`→0.3.1。
2. **本地小改**：`dsh-a2a`（ui-a2a 去 web-react 依赖）、MyGO panel（去 web-react external 或确认无运行时 import）。
3. **建议移除**：`dsh_workflow` fork（官方 tool-workflow 已覆盖）、`dsh-multimedia-webui-input`（结构不兼容 + 功能重复）。
4. **上游有更新、借机重测**：`dsh-diff-viewer`、`dsh-track`（官方 session-query 已等价，优先删除补丁）、`whale-girl`（娱乐类单独决策）。
5. **维持停用**：`dsh-sonar`、`dsh-suggested-replies`、`yet-another-subagent`。
6. **直接兼容保持**：`dsh-genui`、`dsh-git-identity`、`dsh-input-history`、`dsh-sidechain`、`dsh-stickers`、`dsh-ui-progress`、`dsh-code-map`、`dsh-artifact`、`dsh-drag-and-drop`、`dsh-web-ui-approval-notify`、`dsh-update-check`（以上均需 rc8 真机 boot 验收）。

## 多模态插件去留（附录 B）

> 由多模态研究线程产出（2026-08-20）。对照 rc8 树（`141eb6fef`）源码逐项核实；上游活跃度来自 `git ls-remote` + npm registry 实测。

### B.1 dsh-vision-toolkit —— 保留（组合启用）

**能力清单 vs rc8 原生**（10 个模型工具 + `vision_toolkit_activate` + vision-skills Skill）：

| 维度 | rc8 原生（deepseek-official 直接视觉） | dsh-vision-toolkit | 关系 |
|---|---|---|---|
| 模型范围 | 仅显式配置 `inputModalities:[text,image]` 的 DeepSeek 模型（catalog 默认不含 vision-exp；Flash/Pro 仍仅文本） | 任意 OpenAI-compatible/Anthropic 端点 + 给所有文本模型注册 `(Vision Toolkit)` 变体 | 互补 |
| 图片通路 | `ImageAttachmentRef` → 单次请求 `image_url` data URL；20MiB 上限、最旧 offload | wire 改写「路径 + 描述文本」或 path takeover | 机制不同 |
| 图片来源 | user 与工具结果；system/assistant 历史图 `UNSUPPORTED_CONTENT` | 覆盖面略宽（递归转换） | toolkit 略宽 |
| 非图片能力 | 无 | grounding 像素坐标、元素检测、crop、trace、pixel diff、长图 OCR、主色、前景提取、HTML 截图（6 项纯本地） | **toolkit 独占** |
| 命令信封 | `/goal` `/plan` 带参考图（rc8 #2623） | 无 | 原生独占 |
| 开箱 | 需先配置视觉模型 | 默认匿名 Zen MiMo 零配置 | toolkit 保持开箱即用 |
| 隐私 | 图片只到官方端点 | 图片外发 Zen/GLM 第三方 | 原生更私密 |

**rc8 兼容性（源码级核实）**：宿主 API 全在（`settings.register`、`tools.register/restrict`、`skills.register`、`llm.registerAdapter/listModels`、`attachments.readImage`、`subprocess`、`webServer`）；设置页走 keyed namespace + client `settings.section` slot，#2613 store 重构不改变注册方式；client 注入的 7 个包与 3 个 slot（`tool.call.toolview`、`settings.section`、`conversation.input.dock`）在 rc8 均存在；`dsh-client-web-react` 改名不触及注入面；`shouldWrapModel` 对已声明 image 模态的模型返回 false（与原生共存无冲突）。**无源码级硬断点。**

**成本**：vendored 树 ≈8 MB（assets 5.4 MB）；首次运行无系统 Python 3.11+ 时下载 python-build-standalone 3.13 ≈35 MB 到 `$DSH_HOME/cache`（不进 MSI）+ pip pillow/numpy/vtracer；默认匿名 Zen MiMo（限时免费，数据可能用于改进模型）；上游非常活跃（npm 0.1.28→0.1.36 三天 9 版，vendored 0.1.32 落后 4 版；star 4 天 +87%）；MIT 授权无再分发限制；已审计无新增进程/文件写入权限。

**动作项**：① 同步上游 0.1.36+；② rc8 真机验收设置页 live-apply（#2613）与粘贴接管时序；③ Zen 免费服务下线预案（GLM → 本地 Ollama → OVH）。

### B.2 dsh-multimedia-webui-input —— 建议移除出包（或维持停用并标注历史遗留）

- **结构性不兼容**（不是「待重测」能解决）：client 依赖 `@deepseek-ai/dsh-client-ui-slash`（官方 harness rc5 起不存在，rc8 `packages/client/` 亦无）；host 注入 `httpServer`（rc7/rc8 服务名是 `webServer`）。恢复必须 fork 改造。
- **功能已全覆盖**：核心「粘贴/拖拽/选文件 → 发送时复制进会话工作区」与已组合启用的 `dsh-paste-input`、`dsh-drag-and-drop` 重复，另有 rc7 原生 Web 图片输入（持久附件）；唯一剩余差异是文件夹树上传（低频）。
- mirror 0.1.0-dev、README 自述私有授权分发，无 upstream-sync 维护价值。

### B.3 whale-girl —— 不算多模态插件

桌面宠物/娱乐形象类（sprite 渲染），非视觉/媒体输入插件。当前未挂载（inject `jobs` 服务在 rc7/rc8 官方 harness 不存在），去留按娱乐插件策略单独决策。

### B.4 其他视觉候选（快速扫描，定位不变）

- `dsh-open-eyes`：移至 `hyper-dsh-plugins/dsh-open-eyes`，仍 v0.1.0、Windows 测试缺陷未修，维持「BYO-provider 备选」。
- `dsh-vision-router` 1.6.1：维持 Optional 替换层（与 toolkit 二选一）。
- 新增 14 个 vision 候选均为 0–51★ 小仓，rc8 原生视觉出现后定位不变。

### B.5 无法核实项

- rc8 真机行为（设置页 live-apply、粘贴接管时序）——须在同步 PR 验收阶段落实；
- 上游 0.1.33–0.1.36 具体变更内容（api.github.com 不可达，判断为增量修复）；
- Zen 免费服务可用性（2026-08-19 探测仍在，随时可能下线）。

## 方法与限制

- GitHub HTTPS API（`api.github.com`）在本环境不可达；`github.com` 的 git 操作需 `-c http.sslBackend=openssl`；npm 来自 registry.npmjs.org packument；上游一手笔记来自 rc8 树的 `.agents/notes/implemented/`。
- 上游事实截止 2026-08-19 23:11 +0800（rc8 merge）；之后的上游提交不在本报告范围内。
- 没有跑上游测试、没有对 Marisa `harness/` 做三方 merge、没有实机安装 rc8 验证——所有「待验证」项都必须在同步 PR 的验收阶段落实。
