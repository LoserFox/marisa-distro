# AGENTS.md — Marisa 仓库工作约定

给在此仓库工作的 coding agent。冲突时以 `docs/` 和 `maintenance/` 为准。

## 仓库边界

- `plugins/`、`desktop/` 由本仓库直接拥有；`harness/` 是 git submodule（`.gitmodules` pin 上游 rc 基线），不得在其中维护发行版源码修改——发行版增量（anchored-standard 预设、品牌兜底字符串）唯一合法存放处是 `overlays/harness/`，由 `scripts/apply-harness-overlays.mjs` 在构建/打包期应用，harness 工作树必须保持上游 pristine（`verify-repository` 强制；fresh clone 先 `git submodule update --init harness`）。不得创建其他嵌套 `.git`。
- 根 `pnpm-lock.yaml` 是唯一依赖图；`harness/` 内的 lockfile/workspace 文件不参与构建。
- `release/`、`node_modules/`、`*.log`、`*.tsbuildinfo` 不得提交。

## 修改权限

- `mirror` 插件：只允许维护者标记 `upstream-sync` 的同步 PR 修改；禁止手工功能修改。
- `fork` 插件：修改必须同步更新 `docs/plugins/<id>.md`，带测试证据，并尽量反馈上游。
- `harness/`：修改必须更新 `docs/upstream-diff.md` 和 `maintenance/upstreams.json`。
- npm 快照插件：不得重新引入 `prepare/prepublishOnly/preinstall/install/postinstall`；它们依赖发布时自带的构建产物。
- 任何插件新增网络、进程、文件写入、密钥或模型访问能力，必须在 PR 中写明权限影响。

## 必须执行的验证

```powershell
$env:CI = 'true'   # harness 的 postinstall（install-lefthook）在 submodule 下拒绝配置 git，CI 环境跳过
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
```

harness 构建必须从根 workspace 发起（`pnpm --filter @deepseek-ai/dsh-root run build`，build.ps1 step 3 即此形态）：harness 目录内嵌套上游自带的 pnpm-workspace.yaml/pnpm-lock.yaml，直接在其目录跑 pnpm 会触发 deps-status 自动 install。fresh checkout 顺序：`pnpm install --frozen-lockfile --ignore-scripts`（链接）→ harness build（产出 lib/）→ `pnpm install --frozen-lockfile`（补 lifecycle；build.ps1 的 step 3.5 按 mygo-api lib 存在性自动判断）。

改动 `plugins/` 或 `harness/` 时，额外跑 PR 边界检查：

```powershell
git diff --name-only origin/main...HEAD | node scripts/verify-pr-boundaries.mjs
```

后端 HTTP 200 不是桌面验收。发布前必须完成真实窗口渲染和 MSI 安装/启动/卸载验证。

## 提交习惯

- 一个 PR 只解决一个可验证问题。
- 先写清基线、动机、测试证据和人工验收范围。
- 不把 vendored 源码与发行版自研修改混在一个提交里，方便上游同步和审查。
