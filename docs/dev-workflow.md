# 开发操作模式（2026-08-23 规范化）

> 本文档是本仓库的**标准操作入口**。新会话/新协作者从这里开始。
> 背景：hoisted linker 全量安装在本机（16G）需要 >16G 内存（见
> `docs/RESEARCH-pnpm-oom-full-context-20260823.md`），一切操作模式围绕
> "isolated 安装 + 增量 + 分区写者"设计。

## 标准命令

| 场景 | 命令 | 说明 |
|---|---|---|
| **首次/重置依赖** | `pnpm setup` | isolated 安装 + 跳过 plugins 链接（`--filter '!./plugins/*'`），~30s。**永远不要裸跑 `pnpm install`**（走 hoisted，必 OOM） |
| **webui 开发** | `pnpm dev` | 后端 + 客户端插件 HMR watcher（改 harness/插件 client 源码热重载） |
| **desktop 开发** | `pnpm dev:desktop` | 上者 + 桌面壳（Go 源码变更自动重建；`MARISA_DEVTOOLS=1` 开 DevTools） |
| **构建** | `pnpm build` | build.ps1：harness + 3 个需构建插件 + profile 物化 |
| **上游巡检** | `pnpm upstream:check` | 本地雷达：稳定版信号 + 建议 pin + NO-STABLE 标记；`--md` 出报告（`maintenance/upstream-report.md`，gitignored） |
| **出板子** | 见下"出板子配方" | 目前在 sync worktree（hoisted 热树）执行 |

## 出板子配方（本机验证可行，2026-08-23）

在 `.claude/worktrees/sync-011-rc1`（唯一 hoisted 热树）：

1. 与 main 对齐 manifest 集（当前已在 `4aca6322` 族）；lockfile frozen 一致时
   `pnpm install --frozen-lockfile` 走增量（~1 分钟）。
2. `pwsh build.ps1 -ProfilePath <worktree>/profiles/marisa/runtime -SkipRootInstall -SkipProfileInstall -SkipSelfCheck -SkipDesktopShell`
3. `pwsh desktop/bundle/make-bundle.ps1 -ProfilePath ... -Version X.Y.Z`
   （stage 内 `--prod --frozen` 安装是设计约束：no-frozen 会在 prod 修剪下
   解析到远古版本并 404）
4. `go test -C desktop -tags embeddedbundle ./...` → `go build -C desktop -tags embeddedbundle -trimpath -ldflags '-s -w -H=windowsgui' -o ../release/<名字>.exe .`

## 纪律（违反 = 复现 OOM 或布局损坏）

1. **不删 node_modules**（本机不能 fresh 全量安装；恢复只能靠 setup 或 worktree 配方）。
2. manifest 变更后重算只用 `pnpm install --lockfile-only --no-frozen-lockfile`（~8s，零链接）。
3. stage（make-bundle）内的安装永远 frozen。
4. plugin 目录的 node_modules 写者是 dev-profile；harness 成员目录的写者归属
   **尚未裁决**（见下"未决"），在裁决前不要手动在这些目录跑第二种安装。

## 已知未决（下一步的设计决策）

**双写者问题**：根 workspace（isolated）与 dev-profile workspace 的成员集几乎
完全重叠（283 vs 285），两个安装器都会往 `harness/packages/*/node_modules`、
`plugins/*/node_modules` 写文件，布局交错导致模块解析损坏（tsdown 缺 ansis、
sharp 缺 detect-libc 均为此类）。当前 `pnpm setup` 用 filter 让出了 plugins，
但 harness 成员仍有冲突。候选方案：

- A. 根安装只装根 importer（`--filter '.'`），harness 构建工具链全部走根
  devDeps + `.bin`；成员目录全部让给 profile。
- B. dev-profile 改快照拷贝模式（release 验证流的既有形态），丢 host 插件
  活链接，HMR 覆盖 client 侧。
- C. 上游修复 hoisted planner 内存后回到单安装器世界（见研究文档 §9）。

**插件测试 gate**：`pnpm test` 尚未纳入插件 vitest（被上述同一问题阻塞：
vitest bin 被 profile hoist 走）。裁决双写方案后一并接线。

## 提交习惯

沿用 AGENTS.md：一个 PR 一个可验证问题；mirror 插件改动必须登记
`maintenance/upstreams.json` 的 note（本轮 dsh-a2a/interpreters/mnemon 已登记）。
