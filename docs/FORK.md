# Fork 变更账本（FORK.md）

魔理沙 v2 对 `deepseek-harness` 的 fork 修改清单 + 上游同步流程。
**规则：所有对 vendored 上游（`harness/`、`plugins/`）的改动必须登记在此，否则上游更新时无法重放。**

## 上游基线

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/deepseek-ai/deepseek-harness |
| 基线快照 | **20260808**（commit `4e7fb95f` "Private DSH snapshot 20260808T121140Z"） |
| vendored 位置 | `harness/`（净源码 54MB，无 node_modules/.git 提交） |

> `harness/.git` 嵌套仓库**保留在磁盘上**（`.gitignore` 已排除，不进本仓库提交）——
> 它是上游 diff 基线，随时可 `git -C harness diff` 查看 fork 差异：
>
> ```
>  apps/cli/src/args.ts                 | 28 +-
>  apps/cli/src/web.ts                  | 10 +-
>  apps/cli/tests/args.spec.ts          | 12 +-
>  packages/host/webserver/src/index.ts |  6 +
>  pnpm-lock.yaml / pnpm-workspace.yaml | 删除（结构决策，非代码修改）
> ```

## 1. harness/ 源码修改（fork 核心 — 上游更新必须重放）

| 文件 | 修改内容 | 原因 | 同步动作 |
|---|---|---|---|
| `apps/cli/src/args.ts` | `web` 子命令新增自有 `--profile <name>` 选项（默认 `'web'`）；`WebInvocation`/`WebOptions` 增 `profile` 字段；`--dump-config`/`--dump-default-config` 用所选 profile；帮助示例更新 | 官方 `dsh web` 硬编码 `--profile web` 且拒绝父级 `--profile`（win-port launcher 注入被拒），无法指向 marisa 等命名 profile | 重放 diff + 跑 `tests/args.spec.ts` |
| `apps/cli/src/web.ts` | `WebFlags.profile`；`runWeb` boot `flags.profile`（原硬编码 `'web'`）；row-not-found 报错带 profile 名 | 同上（profile 贯穿到组合解析） | 重放 |
| `apps/cli/tests/args.spec.ts` | 既有 web 用例补 `profile: 'web'` 断言；新增 `web --profile tui --port 8080`、`--dump-config` 用例 | 测试对齐新选项 | 重放 |
| `packages/host/webserver/src/index.ts` | `HttpServerService` 构造时 `ctx.provide('webServer', this)`（v1 服务名别名，同实例） | 0808 快照插件 inject `webServer` 服务名，v2 webserver 只提供 `httpServer`；原用 `marisa-v2-compat` bundle 适配，改为 harness 源码提供（验证：`[dsh-track] webServer inject fired`） | 重放 + **重建 lib**（见 §2） |
| `packages/client/web/src/platform.ts`、`seed.ts` | 将 `@deepseek-ai/cordis` 作为 `cordis` 同实例的平台 seed 别名 | registry rc.6 client bundle 将 scoped Cordis 名作为 external；workspace Web 壳原来只提供无 scope 名，导致模块表 require miss | 重放 + **重建 web dist**（见 §2） |

## 2. 构建注意（fork 环境）

- **lib 是构建产物**：`harness/**/lib/` 由 tsdown 生成（已 gitignore），源码修改后必须重建。
- `pnpm run build:lib:host`（tsc -b + tsdown）会在 `examples/`、`website/` 的**既有 TS 错误**上失败（vitepress 等 devDeps 缺失）——用：
  ```powershell
  cd harness
  $env:PATH = "<repo>\node_modules\.bin;$env:PATH"
  pnpm exec tsdown --env.DSH_BUILD_FACE host
  ```
  （仅 tsdown，跳过 tsc 类型门；与工作流 agent 的构建方式一致。）
- 根 `pnpm-workspace.yaml` 的 fork 集成项（非 harness 文件、不属上游同步，但依赖 harness 结构）：
  - landlock 包**显式目录**列出（`packages/*` glob 在绝对路径 workspace 下匹配失败 → ERR_PNPM_WORKSPACE_PKG_NOT_FOUND）
  - `bundles/*`、`plugins/*` 成员 + 根 package.json 的 8 个 npm 插件依赖（单树分发）
  - `linkWorkspacePackages: true` + `allowBuilds` + `minimumReleaseAgeExclude`（npm 插件多为近期发布）
  - standalone 根依赖必须将 `dsh-host-webserver`、`dsh-host-apiproxy`、`dsh-workflow` 与 `schemastery` 固定为 `workspace:^`：外部插件需要 workspace API/服务契约；registry rc.6 的 host 包会令 `httpServer` 等服务保持 pending
  - client 子图中所有已发布包都显式固定 registry rc.6；未发布的 slash/command/model/models/permission/question 等少数包保留 workspace。已发布包漂到 workspace 会造成 client module table 缺项，而把全部 client 包切到 workspace 又会缺少 rc.6 Web 壳的 typert/slots 等种子服务
  - registry `dsh-client-modules@rc.6` 在 stage 中保留其 `dsh.client` 解析行为，并由构建脚本以签名校验方式把同一实例额外提供为旧服务名 `clientModuleHost`，兼容 dsh-sonar
  - `desktop/bundle/make-bundle.ps1` 同时记录 live harness 与 stage 的全部 junction；链接目标既可能是相对路径也可能是绝对路径，必须规范化后写入 `LINKS.json`，并在压缩前检查上述四个根运行时链接

## 3. vendored 插件修改（plugins/ 相对各自上游仓库的差异）

> `plugins/*/` 无嵌套 .git（干净拷贝），以下清单是唯一记录；上游插件更新后需对照重放。
> 全部为**路径引用修正**（旧机器/旧布局 → 本仓库 `../../harness`），无功能代码改动。

| 插件 | 文件 | 修改 |
|---|---|---|
| dsh-track | `tsconfig.json`（19 处）、`vitest.config.ts`、`scripts/dsh-env.mjs` | `C:/Users/lf/.dsh/source/current` → `../../harness`；dsh-env 改为相对仓库解析 |
| Qwen-MM-Plugins | `tsconfig.json` | `../deepseek-harness` → `../harness`（extends + 5 project references） |
| dsh-genui | `tsconfig.json`（14 处 + invariants 路径修正）、`vitest.config.ts`、`scripts/e2e.mjs`、`tests/skill-md.spec.ts` | `../../.dsh/source/current` → `../../harness`；`runtime-diagnostics/invariants` → `support/invariants` |
| dsh-diff-viewer | `package.json`（9 处 link:）、`vitest.config.ts` | `../dsh2026/deepseek-harness` → `../../harness`；test-runtime 路径 |
| dsh-ui-progress | `package.json`（12 处 link:） | 同上 + invariants 路径 |
| dsh-stickers | `package.json`（12 处 link:） | 同上 |
| dsh-input-history | `package.json`（4 处 link:） | `../test-lhh010` → `../../harness` + invariants |
| dsh-web-ui-approval-notify | `vitest.config.ts` | `../test-bill9109` → `../../harness` |
| dsh-suggested-replies | `scripts/link-dsh.mjs` | invariants/session-persistence 路径修正 |
| dsh_workflow | `tsconfig.json`（16 处）、`tsconfig.test.json`（18 处）、`package.json`（14 处 link:）、`vitest.config.ts`、2 个 scripts | `../test-icetomoyo` → `../../harness` + 子路径修正（interaction/commands → ui/commands 等） |

**已知悬空引用（0808 不存在这些包，尚未处理）**：
- `@deepseek-ai/dsh-jobs`、`@deepseek-ai/dsh-user-questions`（dsh_workflow 引用）
- `@deepseek-ai/dsh-client-ui-input-trigger`（dsh-genui 引用）
- 组合侧对应处置：`yet-another-subagent`/`whale-girl`/`suggested-replies` 已在 bundle patch 中移除（上游 API 消失），`multimedia-webui-input` 禁用（依赖官方不存在的 `@deepseek-ai/dsh-client-ui-slash`）

## 4. 本仓库自有组件（非 fork 修改，无需同步）

- `bundles/marisa-bundle/` — 聚合 bundle：25 个 file: 依赖 + 组合 patch（插件行 + Windows pwsh 通道 + 禁用行）
- `profiles/marisa/` — 薄 profile（dsh-coding 形态）+ `generate-profile.mjs` + `desktop.overlay.yml`
- `desktop/` — Go/Wails 壳（含 `embedded.go` 单文件自解压打包、webview-ready 修复）
- 根 `package.json` / `pnpm-workspace.yaml` / `build.ps1` / `desktop/bundle/make-bundle.ps1`
- 上游偏离（有意为之，见 README）：0808 无 mygo 内核（`@r05en1cu/*`）；Windows pwsh 通道在 marisa-bundle 层

## 5. 上游同步流程

1. **取新快照**：clone upstream（或拉取），记录新 commit。
2. **对比基线**：`git -C harness diff 4e7fb95f <新commit> --stat` 预览上游变化。
3. **替换 vendored harness**：新快照拷入 `harness/`（排除 node_modules/.git/lib/dist/*.tsbuildinfo/pnpm-lock.yaml/pnpm-workspace.yaml），重建嵌套 .git 基线（保留 4e7fb95f 或改用新基线，更新本表 §基线）。
4. **重放 §1 修改**：4 个文件按表重放（`git apply` 或手工）。
5. **重建**：`pnpm exec tsdown --env.DSH_BUILD_FACE host`（§2）。
6. **重放 §3 插件修改**（如上游插件未内置相同修复）；检查 §3 悬空引用是否有解。
7. **验证**：`apps/cli/tests/args.spec.ts` 全过；`dsh web --profile marisa` boot → URL 行；日志确认 `webServer inject fired`；profile 安装无 workspace 报错。
8. **更新本文件**：基线 commit、修改清单（上游可能已内置部分修复，标注"上游已内置"）。
