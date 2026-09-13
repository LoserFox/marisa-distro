# harness 版本升级 — 归档计划

> 状态：**TODO（本轮不实施）**／生成日期：**2026-09-13**（文件名日期 `20260831` 为立项标识，非文档生成日）
> 调查方式：只读。未修改任何源文件、未提交、未安装依赖、未跑构建、未执行任何 submodule 更新命令。
> 上游数据查询时间：2026-09-13，经代理 `http://127.0.0.1:7890`（`gh` CLI / GitHub REST API / raw.githubusercontent.com）。
> 读数口径：本文所有版本号、commit、路径、行号均来自实际查询或实际读文件；无法确证的一律写入第 7 节「未查清/待确认」，不做推测性填写。

---

## 结论摘要（TL;DR）

| 项 | 结论 |
|---|---|
| **当前 pin** | `harness/` submodule @ `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` = tag **`dsh-v0.1.1-rc.2`**（commit 日期 2026-08-21 20:03:37 +0800） |
| **上游最新发布** | tag **`dsh-v0.1.5-rc.2`** @ `fb2c4b9e698e30edb738bca4cf0618587db7d203`（2026-09-10T15:09:34Z） |
| **落后量** | **3225 个 commit（ahead 3225 / behind 0）**，跨 **4 个 minor 版本号**（0.1.2→0.1.5；0.1.4 从未发布），中间隔 **12 个 tag**（9 个 alpha + 3 个 rc），时间跨度 **20 天**。包目录 225 → 265，客户端包 40 → 51 |
| **推荐目标线** | **升到 rc 线 = `0.1.5-rc.2`**（不升 alpha 线）。理由见第 4 节 |
| **本轮是否可实施** | **否**。存在 3 个**必须先解决**的前置项：① overlay 品牌替换表 2 个锚点已失效，`apply-harness-overlays` 会硬失败；② anchored-standard 预设目标路径 `apps/cli/config/agent-presets/` 在上游已不存在（**静默失效**，比硬失败更危险）；③ `scripts/verify-repository.mjs:132` 的上游形态断言在 0.1.5-rc.2 上必然失败 |
| **最大单点风险** | **会话数据格式升级到 V3 且不支持降级读取**（0.1.5-rc.1 起）。对桌面发行版而言这是不可逆的用户数据边界，需独立的迁移与回滚策略，不能当作普通 rc 升级处理 |
| **建议工期** | 未评估（本轮未做工作量估算；第 6 节给出执行顺序与每步验证手段） |

---

## 1. 当前基线（pin 在哪）

### 1.1 事实清单

| 项 | 值 | 证据 |
|---|---|---|
| 仓库分支 | `feature/linux-support` | `git rev-parse --abbrev-ref HEAD` |
| 仓库 HEAD | `8b20a481ccc4f8aff2f0c48bcf2b476ed44d6027`（2026-08-25 13:30:03 +0800） | `git log -1` |
| submodule 登记 | `harness` → `https://github.com/deepseek-ai/deepseek-harness.git` | `.gitmodules:1-3` |
| submodule pin | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，`git submodule status` 标注 `(dsh-v0.1.1-rc.2)` | `git submodule status` |
| tag 解析 | `git -C harness describe --tags` → `dsh-v0.1.1-rc.2`（`--abbrev=0` 同为该 tag） | `git -C harness describe --tags` |
| harness HEAD commit | `b150a551b8` = `Merge pull request #2908 from deepseek-harness/release/dsh-0.1.1-rc.2`，2026-08-21 20:03:37 +0800 | `git -C harness log -1 --format="%H %ci %s"` |
| 本地 tag 集 | `dsh-v0.1.0-rc.7`、`dsh-v0.1.0-rc.8`、`dsh-v0.1.1-rc.1`、`dsh-v0.1.1-rc.2` | `git -C harness tag --list` |
| 机器可读基线 | `mode: mirror`、`mechanism: submodule`、`baseline: b150a551…`、`baselineReviewed: 2026-08-22`、`dshVersion: 0.1.1-rc.2`、`channel: next`、`diffDocument: docs/upstream-diff.md` | `maintenance/upstreams.json:12-22` |
| 差异文档基线表 | DSH 兼容版本 `0.1.1-rc.2`；当前导入基线 `b150a551…`（2026-08-22 换树，分支 `sync/0.1.1-rc1`） | `docs/upstream-diff.md:5-10` |
| 上游仓库默认分支 | `master` | `gh api repos/deepseek-ai/deepseek-harness --jq .default_branch` |

### 1.2 根依赖图现状

- 根 `package.json` 共 **274** 条 `dependencies`。
- 其中 **56** 条对外部 registry 包使用 `^0.1.1-rc.2` 区间（家族钉版），其余为 `workspace:^` / `file:` / `workspace:*`。
  - 证据：根 `package.json:38-96` 的 `^0.1.1-rc.2` 块（如 `:38 @deepseek-ai/dsh-agent-loop`、`:47 dsh-client-runtime`、`:74 dsh-llm-deepseek`）。
- `engines.node` = `^22.19.0 || >=24.0.0`（根 `package.json:6-8`）。
- `pnpm` 以依赖形式钉在 `11.9.0`（根 `package.json:299`）。
- 依赖白名单与 override 分别在根 `pnpm-workspace.yaml`：
  - `minimumReleaseAgeExclude:` 起于 `:79`，全文件 315 行；**`0.1.1-rc.2` 家族条目 56 条**，位于 `:257-312`（首条 `:257 @deepseek-ai/dsh-agent-loop@0.1.1-rc.2`，末条 `:312 @deepseek-ai/dsh-typert-registry@0.1.1-rc.2`）。
  - `allowBuilds:` 起于 `:39`；`overrides:` 起于 `:55`。
- profile 侧另有一份同类白名单：`profiles/marisa/generate-profile.mjs:229-261`，其中 `:249-260` 是 **12 条 `@0.1.1-rc.2`**，输出到 `:307-308`。

### 1.3 harness 工作树状态（pristine 契约）

- harness 自 2026-08-27 起是 **git submodule**，工作树必须与上游零差异；发行版增量唯一合法存放处是 `overlays/harness/`，由 `scripts/apply-harness-overlays.mjs` 在构建/打包期应用。证据：`docs/upstream-diff.md:32`、`AGENTS.md:7`。
- 强制机制：`scripts/verify-repository.mjs:29-41` 会调用 `apply-harness-overlays.mjs verify`，发现 overlay 残留即失败；`:18-27` 断言 harness 必须是 gitlink 而非嵌套 `.git`。
- 核对口径：`git -C harness diff b150a551` 应为空；`scripts/verify-mirror-purity.mjs --ids harness` 可复验（最近结果为 ✅ CLEAN，见 `docs/RESEARCH-mirror-purity-20260827.md:7-15`）。

---

## 2. 上游最新状态与差距量化

### 2.1 上游 tag / release 全谱（`gh release list`，2026-09-13 查询）

| tag | 类型 | 发布日 (UTC) | 相对我们的位置 |
|---|---|---|---|
| `v0.1.5-rc.2` | Pre-release | 2026-09-10T15:09:34Z | **最新（推荐目标）** |
| `v0.1.5-rc.1` | Pre-release | 2026-09-10T03:09:00Z | 新 1 |
| `v0.1.5-alpha.2` | Pre-release | 2026-09-09T14:23:10Z | 新 2 |
| `v0.1.5-alpha.1` | Pre-release | 2026-09-08T16:16:04Z | 新 3 |
| `v0.1.3-alpha.2` | Pre-release | 2026-09-07T13:59:29Z | 新 4 |
| `v0.1.3-alpha.1` | Pre-release | 2026-09-04T11:34:32Z | 新 5 |
| `v0.1.2-rc.1` | Pre-release | 2026-09-03T06:06:07Z | 新 6 |
| `v0.1.2-alpha.5` | Pre-release | 2026-09-02T10:02:56Z | 新 7 |
| `v0.1.2-alpha.4` | Pre-release | 2026-09-01T15:45:07Z | 新 8 |
| `v0.1.2-alpha.3` | Pre-release | 2026-08-31T16:03:39Z | 新 9 |
| `v0.1.2-alpha.2` | Pre-release | 2026-08-30T13:52:14Z | 新 10 |
| `v0.1.2-alpha.1` | Pre-release | 2026-08-27T17:06:37Z | 新 11 |
| `v0.1.1-rc.2` | Pre-release | 2026-08-21T12:35:08Z | **← 当前 pin** |
| `v0.1.1-rc.1` | Pre-release | 2026-08-21T07:12:39Z | 旧 1 |
| `v0.1.0-rc.8` | Pre-release | 2026-08-19T15:37:57Z | 旧 2 |
| `v0.1.0-rc.7` | Pre-release | 2026-08-17T12:01:58Z | 旧 3 |

**关键观察**：
- **rc 线只有 3 个 tag 比我们新**：`0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2`。
- **alpha 线有 9 个 tag 比我们新**（0.1.2-alpha.1..5、0.1.3-alpha.1/2、0.1.5-alpha.1/2）。
- **`0.1.3` 与 `0.1.4` 从未发布 rc**：0.1.3 只有 alpha，0.1.4 **一个 tag 都没有**（版本号被跳过）。
- 因此「落后 4 个 minor 版本号」中的 0.1.3 / 0.1.4 在 rc 线上**不存在可升目标**，rc 线的实际落点只有 `0.1.2-rc.1` 和 `0.1.5-rc.1/rc.2` 三个选择。

### 2.2 commit 距离（GitHub compare API）

| 比较 | ahead | behind | files |
|---|---|---|---|
| `b150a551`(pin) → `fb2c4b9e`(0.1.5-rc.2) | **3225** | 0 | 300（**API 分页上限，真实改动文件数 ≥300**） |
| `b150a551`(pin) → `a66e4702`(0.1.2-rc.1) | 1735 | 0 | 300（同上，触顶） |
| `b150a551`(pin) → `183f08e9`(0.1.5-rc.1) | 3221 | 0 | 300（同上，触顶） |
| `fb2c4b9e`(0.1.5-rc.2) → `master` HEAD `c291e796` | 139 | 0 | — |

- 上游 `master` HEAD = `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10T14:17:09Z，`Merge pull request #3977 from deepseek-harness/worktree/release-0.1.5-sync-master`），**已比 0.1.5-rc.2 再前 139 个 commit**，说明下一个 rc 正在路上。
- 节奏：从 pin（08-21）到 0.1.5-rc.2（09-10）共 **20 天 / 3225 commit**，约 **161 commit/天**。

### 2.3 包面变化（工作区包目录集合 diff）

- 以 `git/trees?recursive=1` 取 `packages/<group>/<name>` 目录集合：
  - pin（0.1.1-rc.2）：**225** 个包目录
  - 0.1.5-rc.2：**265** 个包目录
  - **新增 48 个**：`acp-app, agent-team-profile, agent-team-web-profile, chunked-list, client-ui-agent-team, crypto, deepseek-llm-api-extensions, deque, file-upload, http-proxy, inspector, open-in-app, package-manifest, plugin-package-inventory-deepseek, resources, sdk-app, sdk-minimal, session-controller, session-format, session-format-catalog, session-format-v0-to-v1, session-format-v1-to-v2, session-format-v2-to-v3, session-log-deepseek, session-snapshot, session-turn-outline, settings-controller, store, time, tool-present, ui-approval, ui-chat, ui-dockkit, ui-open-in-app, ui-schedule, ui-session, ui-sidebar-documentpreview, ui-sidebar-files, ui-sidebar-right, values, webhook, webhook-github, webworker-packer, webworker-runtime, win32-process, workspace-controller, workspace-files, workspace-path`
  - **删除 8 个**：`acp-demo, acp-snapshot, agent-spine-demo, apiproxy, jsonrpc-demo, runtime, session-persistence-sqlite, tool-subagent-report`
- 客户端包专面 diff：**40 → 51**。
  - 新增 12：`file-upload, resources, store, ui-approval, ui-chat, ui-dockkit, ui-open-in-app, ui-schedule, ui-session, ui-sidebar-documentpreview, ui-sidebar-files, ui-sidebar-right`
  - **删除 1：`runtime`（`packages/client/runtime`，包名 `@deepseek-ai/dsh-client-runtime`）**

### 2.4 本仓库历史同步过的版本（用于判断「升级是常态动作」）

| 迁移 | 归档文档 |
|---|---|
| rc6 → rc7 | `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md` |
| rc7 → rc8 | `docs/RESEARCH-rc8-migration-20260820.md` |
| rc8 → 0.1.1-rc.1（被 rc.2 取代）→ **0.1.1-rc.2（当前 pin）** | `docs/RESEARCH-0.1.1-rc1-migration-20260822.md` |
| 插件/组件级巡检 | `docs/RESEARCH-upstream-sync-assess-20260827.md` |

- 提交记录（`git log --oneline --all --grep="sync" -i`）相关项：`e96fe8e3`（harness 转 git submodule）、`eb702af8`（`Merge branch 'sync/0.1.1-rc1'`）、`27687a89`、`a193e2d7`、`eb823fe2`、`008a110e`。
- **结论：本仓库已完成 3 次 harness rc 换树，流程成熟；这次的特殊性不在"换树"本身，而在 ① 跨了 4 个 minor（历史最大跨度）② 引入了不可降级的会话格式 V3。**
- 全仓文档中**没有任何关于 `0.1.5-rc.2` 的记录**（最高只到 `0.1.1-rc.2`，见 `maintenance/upstreams.json:19`、`docs/upstream-diff.md:7`）。本计划的 0.1.5 面差异均为本轮新查。

---

## 3. 每次升级的固定成本清单

> 说明：本仓库没有单篇「升级固定成本」文档；该清单由 `docs/upstream-sync.md`、`AGENTS.md`、`docs/upstream-diff.md`、`docs/RESEARCH-0.1.1-rc1-migration-20260822.md` 合并而来。以下逐项给出依据文件，并标注**本轮 0.1.5-rc.2 上的实际状态**（已核验／会失败／需重做）。

### A. 独立分支 / worktree 纪律

- 固定动作：换树必须从 `origin/main` 开新 worktree 执行，**禁止在当前工作区就地换树**。
- 依据：`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:70`、`:74`；`docs/upstream-sync.md:39`。
- 本轮状态：照做即可（无版本耦合）。

### B. submodule pin bump

- 固定动作：把 `.gitmodules` 指向的 gitlink 从 `b150a551` 改到新 tag commit；harness 必须是**人工 pin bump**（`scripts/sync-upstream.mjs harness` 只产出 review 候选，不自动换树）。
- 依据：`docs/upstream-diff.md:32`；`docs/upstream-sync.md:39-40`；`scripts/sync-upstream.mjs:129-142`（`:130`、`:138`）。
- 附带义务：换树后 `git add -f harness/scripts/release`（根 `.gitignore` 的 `release/` 规则会静默吞掉该目录）。
  - 依据：`docs/upstream-diff.md:25`；`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:119-120`。
  - 本轮需核对：0.1.5-rc.2 是否仍存在 `scripts/release/`（未逐项核验，见第 7 节）。
- Windows 形态：symlink 以内容等价普通文件入库、exec 位缺失，**比对以 blob SHA 为准**，mode 差异不算增量。
  - 依据：`docs/upstream-diff.md:26`。

### C. `overlays/harness/` 发行版增量（**本轮的主要工作量和主要障碍**）

overlay 共 **2 类**，全部由 `scripts/apply-harness-overlays.mjs` 在构建期应用、构建后还原。

#### C-1 品牌兜底字符串替换表 `overlays/harness/brand-replacements.json`

- 表结构：**4 个文件 / 6 条规则**（`overlays/harness/brand-replacements.json:4-37`）：
  1. `apps/web/index.html`：`<html lang="en">` → `zh-CN`；`<title>DSH Local Build</title>` → `Marisa DSH`
  2. `apps/web/vite.config.ts`：`DEFAULT_CLIENT_TITLE` 常量；`html.replace('<title>DSH Local Build</title>'` 调用点
  3. `packages/client/ui-renderer/src/client/DocumentTitle.tsx`：`DEFAULT_CLIENT_TITLE` 常量
  4. `packages/client/ui-sidebar/src/client/SidebarRoot.tsx`：`>DSH Local Build</span>` 字面量
- 应用方式：`applyReplacement()` 要求 `from` 严格匹配上游原文；**`from` 与 `to` 都找不到时 `fail()` 并以 exit 1 退出**（`scripts/apply-harness-overlays.mjs:56-64`，失败文案 `upstream shape changed, overlay must be re-baselined`，`:61`）。
- **本轮实测状态（对 0.1.5-rc.2 逐文件核验）**：

| 文件 | 0.1.5-rc.2 状态 | 结果 |
|---|---|---|
| `apps/web/index.html` | 仍含 `<html lang="en">` 与 `<title>DSH Local Build</title>` | ✅ 锚点有效 |
| `apps/web/vite.config.ts` | 仍含 `const DEFAULT_CLIENT_TITLE = 'DSH Local Build'` 与 `html.replace('<title>DSH Local Build</title>'` | ✅ 锚点有效 |
| `packages/client/ui-renderer/src/client/DocumentTitle.tsx` | **文件已不在该路径**。上游把它移到了 `packages/client/ui-layout/src/client/DocumentTitle.tsx`，且不再持有品牌字面量——改为接收 `productTitle: string` 属性（注释 `Build-configured or localized product title.`） | ❌ **硬失败**（`applyBrand` 在 `readUtf8` 返回 `null` 时 `fail('<rel>: file missing in target tree')`，`scripts/apply-harness-overlays.mjs:75-77`） |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 文件仍在，但字面量 `>DSH Local Build</span>` 已 **改为 i18n key** `t('brand.localBuild')` | ❌ **硬失败**（`from` 与 `to` 均不匹配 → `fail()`） |

- **失败时序注意**：`applyBrand` 按 `Object.entries(table.files)` 的插入顺序遍历（index.html → vite.config.ts → DocumentTitle → SidebarRoot），遇错即 `process.exit(1)`。`revert` 是同一结构，因此**前两个文件在两条路径上都会先被写入/还原，之后才退出**；构建脚本的 `finally` revert（`build.ps1:327-336`）会在同一处再次失败。**不能假定自动还原可靠，换树前要明确人工兜底（`git checkout -- harness/apps/web/index.html harness/apps/web/vite.config.ts`）。**
- 重基线口径：0.1.5-rc.2 的品牌机制已转向 **i18n + build-configured `productTitle`**，硬编码字面量替换不再是正确手段。新方案需在换树后依据 `packages/client/ui-layout`、`packages/client/ui-sidebar` 的实际注入点重新设计（见第 7 节待确认项）。

#### C-2 anchored-standard 实验预设 `overlays/harness/agent-presets/anchored-standard/`

- 内容：`agent.cordis.yml`（19737 B）、`tool-bootstrap.mjs`（12634 B）、`preset.yml`（393 B）、`LICENSE`（1104 B）。
- 应用方式：`applyAnchored()` 递归复制到 `apps/cli/config/agent-presets/anchored-standard/`（`scripts/apply-harness-overlays.mjs:28`、`:127-131`）。
- **本轮实测状态**：**❌ 目标路径在上游已不存在**。
  - pin（0.1.1-rc.2）确实有 `apps/cli/config/agent-presets/{code,cordis,minimal,standard}/`。
  - 0.1.5-rc.2 的 `apps/cli/config/` 下**只剩 `examples/`**，预设已整体迁移到 `packages/preset/agent-presets/presets/{cordis,minimal,ptc,standard}/`（同时 `code` 预设被 `ptc` 取代）。
  - 新的消费点在 `apps/cli/package.json` 的 `dsh.configTrees`：`{ "mount": "config/agent-presets", "path": "../../packages/preset/agent-presets/presets", "scanRoster": true }`。
  - 后果：`applyAnchored()` **不会报错**（`copyDirRecursive` 会自动建目录），但预设被写到 CLI 不再扫描的路径 → **静默失效**——构建全绿、产品里 anchored-standard 预设凭空消失。
  - 危险点在于 `verifyPristine()` 只检查该目录**是否残留**（`scripts/apply-harness-overlays.mjs:157`），不做"路径是否仍被上游消费"的检查，所以现有门禁**拦不住这个静默失效**。
- **C-2 内容本身也需重基线**（独立于路径问题）：该 preset 的 `agent.cordis.yml` 是「rc.2 `standard` 预设 + 锚定增量」，逐行挂载了 27 个 `@deepseek-ai/*` 包。与 0.1.5-rc.2 上游 `standard`（255 行）对比：
  - overlay 挂载但**新版 standard 已不再挂载**：`dsh-fs-local`、`dsh-terminal`、`dsh-terminal-bash`、`dsh-tool-bash-persistent`、`dsh-tool-str-replace-editor`
  - 新版 standard 挂载但 **overlay 未挂载**：`dsh-tool-present`、`dsh-command-goal`
  - 其 Windows 平台前提已变：0.1.5-rc.2 的 `minimal` 预设**新增 `dsh-tool-pwsh-persistent`、移除 `str_replace_editor`**，而 overlay 里「win32 无持久 PTY bash，所以 bootstrap 对回退为 pwsh + str_replace_editor」的整段理由（`agent.cordis.yml` 中 persistent-shell 组的 `disabled: !!js process.platform === 'win32'`）需要重新论证。
  - `tool-bootstrap.mjs` 依赖 `system-prompt/assemble` 事件与 `skill-catalog` / `agent-instructions` 两个抑制源（`tool-bootstrap.mjs:97`、`:198`），这些上游契约需逐项回归。

#### C-3 overlay 的验证闭环（必须一起更新）

- `scripts/dev.test.mjs:154`、`:181` 使用 `apps/cli/config/agent-presets/anchored-standard` 作为测试路径，**路径变更后这两处单测需同步改**。
- `pnpm test` 会跑 `node --test scripts/dev.test.mjs`（根 `package.json:14`、`:17`）。

### D. 记账义务：`docs/upstream-diff.md` + `maintenance/upstreams.json`

- 固定动作：更新 `maintenance/upstreams.json` 的 `baseline` / `baselineReviewed` / `dshVersion` / `note`；更新 `docs/upstream-diff.md` 的基线表，并对每个差异项做「重放、迁移或删除」三选判定。
- 依据：`AGENTS.md:15`；`docs/upstream-diff.md:50-52`；`docs/upstream-sync.md:41`；`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:107-110`、`:129`。
- **机器强制**：`scripts/verify-pr-boundaries.mjs:51-53` 规定 harness 变更必须同时改这两个文件，否则 PR 边界检查失败（CI 亦跑，`.github/workflows/ci.yml:61-69`）。
- 本轮状态：必做，无版本耦合。

### E. 插件兼容性矩阵

- 固定动作：换 rc 必须重做插件兼容矩阵（**不能沿用旧 rc 的结论**）。
- 既有产物与模板：
  - `docs/rc7-plugin-compatibility.md`（表头 `:7`、11 行数据 `:9-19`、判定规则 `:21-26`）
  - `docs/RESEARCH-rc8-migration-20260820.md` 附录 A（A.1 组合启用 19 个 `:214-236`；A.2 停用/待重测 9 个 `:238-250`；A.3 MyGO 分面 `:254-262`；A.4 结论汇总 `:264-271`；「必须验证清单」`:185-194`）
  - `docs/plugins.md`（状态词表 `:7-12`）
- 受管清单来源：`profiles/marisa/plugins.json`（**35 个 plugin 条目**，git 14 / npm 9 / internal 4 + 其他）与 `maintenance/upstreams.json:24-278`。
- 本轮触发刷新的具体理由（0.1.5-rc.1 release notes 明示的破坏面）：
  - **`tool-subagent-report` 包被删除**，`report` 工具被 `send_message` 双向语义取代 → 影响 `dsh-sidechain`、`yet-another-subagent`、`dsh-track` 等依赖子代理/会话查询契约的插件。
  - **Web 右侧 Detail 面板被移除**，改为多标签 Sidebar → 影响所有注入 Detail/conversation view slot 的插件（`dsh-diff-viewer`、`dsh-sonar`、`dsh-track`、`dsh-suggested-replies` 等 rc7 时期就「待重测」的项）。
  - 客户端包新增 12 个（含 `ui-sidebar-right`、`ui-sidebar-files`、`ui-sidebar-documentpreview`、`ui-dockkit`、`ui-chat`、`ui-session`）→ client inject 链重组。

### F. 根依赖图 / `plugins.json` / `profiles/` 随动

1. **根 `pnpm-lock.yaml` 是唯一依赖图**；`harness/pnpm-lock.yaml` 与 `harness/pnpm-workspace.yaml` **不参与**根构建，打包时排除以免 pnpm 11 触发二次安装。
   - 依据：`AGENTS.md:8`；`docs/upstream-diff.md:36`。
2. **`minimumReleaseAgeExclude` 两处同步补齐**（否则整族 rc 包被 age 闸门拦截）：
   - 根 `pnpm-workspace.yaml:79`（存量 56 条在 `:257-312`）
   - `profiles/marisa/generate-profile.mjs:229-261`（存量 12 条在 `:249-260`，输出于 `:307-308`）
   - 依据：`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:61`、`:121`。
3. **根 `package.json` 的 `@deepseek-ai/*` 区间改写**：workspace 成员 → `workspace:^`；registry 包 → `^<新家族>`。
   - 依据：`docs/plugins/dsh-better-sidebar.md:24`；`docs/plugins/ya-workspace-sidebar.md:13`（「每次同步必须检查发布包是否改回了 registry 风格范围」）。
4. **本轮新增的硬阻断：8 个根依赖所指向的上游包已被删除**（下节 H-1 详列），必须从根 `package.json` 删除或替换。
5. **profile 重新物化**：`node profiles/marisa/generate-profile.mjs`（`build.ps1:203-215` step 5/8）；fresh worktree 首装前必须先生成，否则 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND marisa-marisa`（`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:124`）。
6. **lockfile 重算纪律**：manifest 变更只用 `pnpm install --lockfile-only --no-frozen-lockfile`；**永远不要裸跑 `pnpm install`**（hoisted 全量图链接规划内存 >12G 会 OOM）。
   - 依据：`docs/dev-workflow.md:12`、`:34`；`docs/RESEARCH-pnpm-oom-full-context-20260823.md:45-57`、`:68-72`。

### G. 桌面壳是否受影响

#### G-1 Go/Wails 壳 `desktop/`（本仓库自有）

- 与 harness 的耦合点（均为**路径/协议**耦合，非源码耦合）：

| 耦合点 | 证据 | 0.1.5-rc.2 核验结果 |
|---|---|---|
| 后端可执行入口 `apps/cli/lib/bin.js` | `build.ps1:237`、`:243`；`desktop/bundle/stage-boot/main.go:49-50`；`desktop/bundle/extractprofile/main.go:131`；`desktop/embedded_goos_test.go:55`；`desktop/rescue_test.go:47,64,180` | ✅ 仍有效：0.1.5-rc.2 的 `apps/cli/package.json` 仍为 `"bin": { "dsh": "lib/bin.js" }`（`lib/` 为构建产物，仓库内不含） |
| `DSH_WEB_CMD` 覆盖机制 | `desktop/command.go:2`、`:13`、`:18`；`desktop/main.go:445-454`；`desktop/embedded.go:2`、`:5`、`:223` | ✅ 我方自有环境变量，不受上游影响 |
| `dsh web --no-open --port <n>` 启动行 | `desktop/command.go`；`build.ps1:241-243` 注释「rc7 CLI syntax: `--profile` is a launcher flag；`web` 子命令不接受它」 | ✅ 仍有效：`--no-open` / `--port` 在 `packages/bundle/web-app/src/startup.ts:52-53` 仍存在；`web` 子命令仍在 `apps/cli/src/args.ts:175`，且 `:186` 仍 `rejectParentOptions('web')`（即 `--profile` 仍不能放在 `web` 后，build.ps1 的写法依旧正确） |
| 就绪行 `dsh web: <url>` | `build.ps1:258`（正则 `dsh web: (http://127\.0\.0\.1:\d+)`） | ✅ 仍有效：`packages/bundle/web-app/src/index.ts` 仍产出该行 |
| `appSession`/bundle 目录形态 `marisa-distro/harness/apps/cli/lib/bin.js` | `desktop/bundle/extractprofile/main.go:131`；`desktop/rescue_test.go:47` | ⚠ 依赖 `make-bundle.ps1` 的暂存布局，需在换树后重跑打包验证 |
| Go 侧 `go test -C desktop -tags {installedbundle,embeddedbundle}` | `AGENTS.md:25-26` | 必跑 |

- **结论：desktop/ 无源码级改动需求，但必须重跑 `make-bundle.ps1` + 两个 tag 的 Go 测试**（布局与就绪行虽已核验有效，仍属运行时契约）。

#### G-2 Electron 壳 `C:\Users\lf\Documents\Workspace\marisa-electron-wt\desktop-electron`（**独立 worktree，不在本仓库内**）

- 事实：该目录存在且独立（`package.json` name `@marisa/desktop-electron`，version `0.1.0`，`main: lib/main.js`，electron `^43.2.0`）。
- 与 harness 的耦合点（同样只有路径/协议，无源码耦合）：
  - `src/command.ts:10` `export const WEB_CMD_ENV = 'DSH_WEB_CMD'`；`:24` 默认 `dsh web --no-open --port <n>`
  - `src/backend-stdout.ts:12` `export const READY_LINE_PREFIX = 'dsh web: '`
  - `src/core.test.ts:26-28` 断言命令行含 `bin.js`；`:37` 断言就绪行解析
- 核验结果：与 G-1 相同——`--no-open`/`--port`/`dsh web:` 就绪行/`bin.js` 入口在 0.1.5-rc.2 **均未变**。
- **风险**：该壳**不受本仓库 CI 覆盖**（不在 `pnpm test` 与 `go test` 范围内），换树后必须手动跑它的 `npm run build` + `npm test`，否则协议漂移不会被自动发现。其在本发行版的发布流程中的归属也未在仓库文档中查清（第 7 节）。

### H. 上游删除/改名对根依赖的直接影响（**本轮新增，历史清单没有**）

逐一比对「pin 有、0.1.5-rc.2 没有」的包目录，并映射到本仓库根 `package.json` 的声明：

| 上游包目录（pin） | 包名 | 根 `package.json` 声明位置 | 0.1.5-rc.2 状态 |
|---|---|---|---|
| `packages/client/runtime` | `@deepseek-ai/dsh-client-runtime` | `package.json:47`（`^0.1.1-rc.2`） | ❌ 已删除（**客户端 inject 链成员**） |
| `packages/host/apiproxy` | `@deepseek-ai/dsh-host-apiproxy` | `package.json:72`（`workspace:^`） | ❌ 已删除（新增 `packages/util/http-proxy` = `@deepseek-ai/dsh-http-proxy`，**疑似替代但未确认一对一**） |
| `packages/session/session-persistence-sqlite` | `@deepseek-ai/dsh-session-persistence-sqlite` | `package.json:82`（`^0.1.1-rc.2`） | ❌ 已删除 |
| `packages/subagent/tool-subagent-report` | `@deepseek-ai/dsh-tool-subagent-report` | `package.json:240`（`workspace:^`） | ❌ 已删除（功能被 `send_message` 取代） |
| `packages/examples/acp-demo` | `@deepseek-ai/dsh-acp-demo` | `package.json:144`（`workspace:^`） | ❌ 已删除（新增 `acp-app`） |
| `packages/examples/agent-spine-demo` | `@deepseek-ai/dsh-agent-spine-demo` | `package.json:145`（`workspace:^`） | ❌ 已删除 |
| `packages/examples/jsonrpc-demo` | `@deepseek-ai/dsh-sdk-jsonrpc-demo` | `package.json:146`（`workspace:^`） | ❌ 已删除（新增 `sdk-app`） |
| `packages/test-support/acp-snapshot` | `@deepseek-ai/dsh-acp-snapshot` | `package.json:244`（`workspace:^`） | ❌ 已删除 |

- 交叉验证：对本仓库 75 个 `package.json`（排除 node_modules/harness/.tmp/release/dist/lib）扫描这 8 个包名，**命中全部集中在根 `package.json`**，`.claude/worktrees/*` 下的旧 worktree 副本另有命中（非当前有效声明）。→ **改动面集中在根 `package.json` 一处，不扩散到插件**（结论仅限包名声明层面，插件运行时行为另计）。

### I. 上游门禁断言（本仓库脚本里的版本敏感断言）

- `scripts/verify-repository.mjs` 对上游文件形态有硬断言，上游改版则断言必须同步改：

| 断言 | 位置 | 0.1.5-rc.2 核验 |
|---|---|---|
| `tsconfig.host.json` 必须含 `"examples/*/src/**/*.ts"` | `scripts/verify-repository.mjs:132` | ❌ **必然失败**：pin 的 `harness/tsconfig.host.json:92` 有该行；0.1.5-rc.2 的 `tsconfig.host.json` 中 **无任何 `examples` 匹配**（examples 包已整体删除） |
| `tsconfig.host.json` 必须含 `"website/.vitepress/**/*.ts"` | `scripts/verify-repository.mjs:133` | ✅ 仍在（`tsconfig.host.json:114-115`） |
| `apps/web/package.json` 的 `scripts.build` 必须为 `vite build` | `scripts/verify-repository.mjs:136` | ✅ 仍为 `"build": "vite build"` |
| harness 必须是 submodule / `.gitmodules` 存在 / baseline 形态 / `mode=mirror` / `mechanism=submodule` | `scripts/verify-repository.mjs:18-27` | ✅ 与上游内容无关 |
| cordis `4.0.0-rc.7`、schemastery 重定向、release workflow 断言 | `scripts/verify-repository.mjs:124-131`、`:141` | 需换树后按实际值复核（本轮未逐条核验） |

- `scripts/verify-repository.mjs:144-145` 另断言 `verify-mygo-runtime.mjs` 含 `'--no-open'`。

### J. 验证矩阵（每步必跑）

```powershell
$env:CI = 'true'   # harness 的 postinstall（install-lefthook）在 submodule 下拒绝配置 git，CI 环境跳过
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
```

- 依据：`AGENTS.md:21-27`；CI 同形 `.github/workflows/ci.yml:37-59`。
- 额外：改动 `plugins/` 或 `harness/` 时跑 PR 边界检查
  `git diff --name-only origin/main...HEAD | node scripts/verify-pr-boundaries.mjs`（`AGENTS.md:31-35`）。
- **harness 构建必须从根 workspace 发起**：`pnpm --filter @deepseek-ai/dsh-root run build`（`AGENTS.md:29`；`build.ps1:160-172` 即 step 3）。**harness 目录内不得直接跑 pnpm**（会触发 deps-status 自动 install）。
- fresh checkout 顺序：`pnpm install --frozen-lockfile --ignore-scripts`（链接）→ harness build（产出 `lib/`）→ `pnpm install --frozen-lockfile`（补 lifecycle）。
- **后端 HTTP 200 不是桌面验收**：发布前必须完成真实窗口渲染和 MSI 安装/启动/卸载验证（`AGENTS.md:37`）。

---

## 4. 目标版本建议（rc 线 vs alpha 线）

### 4.1 候选与影响面

| 目标 | commit | 距 pin | 影响面评估 |
|---|---|---|---|
| **`0.1.5-rc.2`（推荐）** | `fb2c4b9e` | 3225 | 上游自行声明的「0.1.5 系列首个候选」，release note 汇总了**自 `v0.1.2-rc.1` 以来**的全部变更；是当前**唯一处于 rc（候选发布）状态的最高版本**，语义上表示上游认为该批次可发布 |
| `0.1.5-rc.1` | `183f08e9` | 3221 | 与 rc.2 仅差 4 个 commit（`rc.2` 只含反馈提交体验与文件卡片排版两项改进），无理由选它 |
| `0.1.2-rc.1` | `a66e4702` | 1735 | 中间落点，影响面最小；但**要付两次升级成本**（0.1.2 → 0.1.5 的破坏面依然要吃），且 0.1.2-rc.1 本身也已是 10 天前的版本 |
| alpha 线（`0.1.5-alpha.2` 等 9 个 tag） | 多个 | 最多 3221 | 见下 |

### 4.2 为什么不选 alpha 线

1. **不符合本仓库的发布纪律**。`docs/versioning.md:9` 规定 Testing 分支跟进的是「跟进最新**已经通过 Marisa 兼容测试**的 DSH rc」；`docs/upstream-sync.md:37` 的同步流程标题即「Harness / 新 DSH rc」。alpha 从来不在发行版的候选池里。
2. **alpha 不收敛**。0.1.5 系列在 4 天内连发 `alpha.1 → alpha.2 → rc.1 → rc.2`（09-08 → 09-10），alpha 与 rc 之间的距离极小、返工概率极高；追 alpha 等于把「4 天 3 次返工」引进发行版验证周期。
3. **alpha 的破坏面不比 rc 小**。0.1.5 的破坏性变更（会话格式 V3、Session 生命周期、默认工具调整）来自这一整批变更集，alpha 与 rc 共享；选 alpha 并不能规避第 5 节的风险，只是多承担"上游还没自认为可发布"的不确定性。
4. **`0.1.3` / `0.1.4` 在 rc 线上不存在**，所以「一步步升」在 rc 线上也不成立——rc 线的落点只有 `0.1.2-rc.1` 和 `0.1.5-rc.*`。既然跳跃不可避免，就跳到当前最新的 rc。

### 4.3 推荐

> **推荐目标：`dsh-v0.1.5-rc.2` @ `fb2c4b9e698e30edb738bca4cf0618587db7d203`。**

补充判断依据：
- 该版本发布于 2026-09-10，距今 3 天；上游 `master` 已在其上再走 139 commit，**下一个 rc 很可能在数天内出现**。因此存在两种合理策略：
  - **(a) 立刻开工升 `0.1.5-rc.2`**：吃到当前最大的一批破坏面（V3 会话格式等），一次付清；若拖到下一个 rc，这批破坏面**不会消失**（V3 已落地），只会叠加新变更。
  - **(b) 再等一到两个 rc**：若下一个 rc 在两周内出现且仍属 0.1.5/0.1.6 家族，可与本轮合并，避免重复付固定成本（overlay 重基线、插件矩阵、MSI 验收）。
- **本计划倾向 (a)**，理由是固定成本（第 3 节 C/E/F/H 项）的最大头是**一次性重基线**，越早做越早暴露；而等待的收益（少一次返工）不确定。
- 无论选 (a) 还是 (b)，**都不要选中间版本**（如 0.1.2-rc.1）：它既不能规避 V3 破坏面，又会让 anchored-standard / 品牌 overlay 经历两次重基线。

---

## 5. 风险与阻塞点

> 分级：🔴 硬阻断（不解决无法构建/无法启动）／🟠 高风险（可构建但功能静默丢失或数据不可逆）／🟡 中风险（需返工或需人工验收）

### 🔴 R1. overlay 品牌替换表在 0.1.5-rc.2 上必然硬失败

- **证据**：`scripts/apply-harness-overlays.mjs:56-64`（`fail()` 语义）、`:75-77`（`file missing in target tree`）。目标文件 `packages/client/ui-renderer/src/client/DocumentTitle.tsx` 在 0.1.5-rc.2 已不存在（迁移到 `packages/client/ui-layout/src/client/DocumentTitle.tsx`）；`SidebarRoot.tsx` 的品牌字面量已改为 `t('brand.localBuild')`。
- **影响**：`build.ps1:160-162` 的 overlay apply 步骤失败 → 构建中断；且如上文所述，前两个文件已被写入，自动 revert 会在同一处再次失败。
- **处置**：换树前先重写 `brand-replacements.json`（或改造 `apply-harness-overlays.mjs` 支持"文件级可选"与"路径重定向"）。

### 🟠 R2. anchored-standard 预设**静默失效**（比 R1 更危险）

- **证据**：`scripts/apply-harness-overlays.mjs:28`（旧目标路径 `apps/cli/config/agent-presets/anchored-standard`）、`:127-131`（`copyDirRecursive` 自动建目录，不校验目标是否仍被上游消费）、`:157`（`verifyPristine` 只查"是否残留"）。0.1.5-rc.2 的 `apps/cli/config/` 下**无 `agent-presets`**，预设已迁至 `packages/preset/agent-presets/presets/`，`apps/cli/package.json` 的 `dsh.configTrees` mount 指向该新路径。
- **影响**：构建/校验**全绿**，但产品内 anchored-standard 预设消失。现有门禁（`verify-repository.mjs:29-41` → `apply-harness-overlays.mjs verify`）**无法发现**。
- **处置**：① 更新 overlay 目标路径并在 `apply-harness-overlays.mjs` 增加"目标路径必须被上游消费"的断言；② 增加 e2e 断言（0.1.5-rc.2 已有 `apps/cli/tests/web-agent-presets.e2e.ts` 可借鉴）。

### 🟠 R3. 8 个根依赖指向已删除的上游包

- **证据**：第 3 节 H 表（`package.json:47/72/82/144/145/146/240/244` 对应 8 个 0.1.5-rc.2 已删除的包）。
- **影响**：`pnpm install --frozen-lockfile` 失败或解析到陈旧 registry 副本；`dsh-client-runtime` 属**客户端 inject 链成员**，其删除意味着客户端包合成图重组。
- **处置**：删除或替换这些声明；`apiproxy → http-proxy` 是否为替代关系需确认（第 7 节）。

### 🔴 R4. 会话数据格式升级到 V3，且**不支持降级读取**

- **证据**：0.1.5-rc.1 release notes「其他变更」首条——「**会话数据格式升级至 V3：** 受支持的旧日志通过版本迁移生成新版日志并保留原文件，**升级后的会话不支持降级读取**」，并给出迁移文档 `packages/session/session-format-v2-to-v3/README.zh.md`。
- **代码面佐证**：0.1.5-rc.2 新增 `packages/session/session-format`、`session-format-catalog`、`session-format-v0-to-v1`、`session-format-v1-to-v2`、`session-format-v2-to-v3` 五个包；`packages/session/session-persistence-sqlite` 被删除。
- **影响（对本发行版最严重）**：Marisa 是**桌面发行版**，用户本地有真实会话数据。一旦升级并写入 V3，**回滚到 0.1.1-rc.2 将无法读取新会话**（原文明确「不支持降级读取」，但「保留原文件」暗示旧文件仍在）。这使"升级失败就回退"的常规策略失效。
- **处置**：升级方案必须包含**数据备份 + 回滚策略**（在写入 V3 之前对 `~/.dsh/sessions` 做整目录快照），并把"不可降级"写进发布说明。这也意味着第 6 节必须增加一个**独立的、可单独否决的数据迁移闸门**。

### 🟠 R5. Session 生命周期契约变更

- **证据**：0.1.5-rc.1 release notes「其他变更」——「Session persistence API 改为由生命周期持有的 `SessionHandle`；`agentLoop.create()` 改为异步，新增 session 锁，**同一 session 至多被一个进程持有**」。
- **影响**：任何自行驱动 hub/session 的组件都可能踩锁；Marisa 侧 `dsh-mygo`（fork，`maintenance/upstreams.json:3-11`）、`dsh-session-query`/`dsh-track`/`dsh-sidechain` 等会话查询类插件属高风险面。桌面壳的双实例保护（`desktop/single_instance_windows.go`）与上游 session 锁的语义需对齐。

### 🟠 R6. 子代理 `report` → `send_message` 语义迁移

- **证据**：`packages/subagent/tool-subagent-report` 在 0.1.5-rc.2 被删除（第 2.3 节）；0.1.5-rc.1 notes「Agent Team 的 `send_message` 统一采用 steer 语义，并在跨 Agent 和冷恢复投递中保留发送者归属与顺序」；0.1.2-rc.1 notes「父 Agent 与可持续子 Agent 可通过 `send_message` 双向传递后续消息，**取代单向 `report` 工具**」。
- **影响**：`dsh-sidechain`、`yet-another-subagent`（`docs/rc7-plugin-compatibility.md:13` 已记「与官方 `tool-subagent` 撞名」）、`dsh-track` 等。
- **补充风险**：本仓库的 `overlays/harness/agent-presets/anchored-standard/agent.cordis.yml:292-296` 有大段注释依赖 `tool-subagent-report` 的 host-plane 语义；该注释在 0.1.5 上已过时（预设内容重基线时必须一并处理）。

### 🟠 R7. 默认工具调整 + minimal 预设变更，动摇 anchored-standard 的设计前提

- **证据**：0.1.5-rc.1 notes「**默认工具调整：** SDK、Headless 和 ACP 默认使用 read、write、edit 编辑文件；Web `minimal` 与 Python `sdk-minimal` 默认**仅提供持久 shell，`str_replace_editor` 需显式启用**」。
- **代码面佐证**：0.1.5-rc.2 的 `minimal/agent.cordis.yml`（69 行）挂载 `dsh-persona`、`dsh-terminal`、`dsh-terminal-bash`、`dsh-tool-bash-persistent`、**`dsh-tool-pwsh-persistent`（新增）**，**不含 `dsh-tool-str-replace-editor`**。
- **影响**：anchored-standard 的 bootstrap 工具对是 `bash + str_replace_editor`（POSIX）/ `pwsh + str_replace_editor`（win32），其"复刻 Minimal 首个请求工具对"的核心论证（见 `overlays/harness/.../agent.cordis.yml` 的 persistent-shell 与 bootstrap-filesystem 段注释）**在 0.1.5 上不再成立**；Windows 侧还多出了 `pwsh` 持久化选项，原「win32 无持久 shell」的整段平台分支需要重新论证。
- **处置**：该 preset 需**重新设计而非重新基线**；`docs/agent-preset-anchored-standard.md` 的证据记录需同步更新（该文档已明确要求不得把实验包装成性能保证）。

### 🟡 R8. 客户端包链重组 / `ClientPackageCompositionError`

- **机制证据**（来自 pin 树内的上游源码）：`harness/packages/client/modules/src/index.ts:99-117`（`ClientPackageCompositionError extends AggregateError`，首行 `client-modules: N client packages failed to compose:`）、`:331-337`（抛点）、`:79`、`:81-97`（`MissingClientBundleError`，恢复指令 `` run `pnpm run build` before launch ``）、`:194-201`（模块图环）、`:204-211`（自请求）、`:302-311`（`ctx.baseUrl` 未设置）。
- **插件侧复述**：「宿主在激活时校验 `dshClient` 包的构建产物，缺失会抛 `ClientPackageCompositionError` 并**拒绝启动 `dsh web`**」——`plugins/dsh-input-history/README.md:17`、`plugins/dsh-ui-progress/README.md:37`、`plugins/dsh-paste-input/README.md:19`。
- **本轮触发点**：客户端包 40 → 51，新增 `ui-sidebar-right`、`ui-sidebar-files`、`ui-sidebar-documentpreview`、`ui-dockkit`、`ui-chat`、`ui-session`、`file-upload` 等；**移除 `runtime`（`@deepseek-ai/dsh-client-runtime`）**；0.1.5-rc.1 移除 Web 原 Detail 面板并重组右侧 Sidebar。
- **历史前科（说明这不是理论风险）**：rc8 时 `dsh-client-web-react` → `dsh-client-web` 改名、`client/schema-form` 删除，直接导致 `dsh-better-sidebar 0.10.3`「构建必坏」（`docs/RESEARCH-rc8-migration-20260820.md:218`）、`interpreters`（`:219`）、`dsh-a2a`（`:225`）。
- **处置**：换树后必须对每个 client 侧插件单独跑构建 + boot 验证，不能只看 `pnpm test`。

### 🟡 R9. `scripts/verify-repository.mjs:132` 断言必然失败

- **证据**：见第 3 节 I 表。pin 的 `harness/tsconfig.host.json:92` 含 `"examples/*/src/**/*.ts"`；0.1.5-rc.2 该文件**无任何 `examples` 匹配**。
- **影响**：`pnpm test`（`pnpm test:repository` 三连之一）失败。
- **处置**：随换树更新断言（属预期内的断言维护，非缺陷）。

### 🟡 R10. overlay 的构建闭环 + 单测路径耦合

- `scripts/dev.test.mjs:154`、`:181` 硬编码 `apps/cli/config/agent-presets/anchored-standard`；路径变更后 `pnpm test`（`test:dev`）会失败。
- `build.ps1:327-336` 的 `finally` revert 是 overlay 闭环的一部分；R1 场景下该 revert 同样失败。

### 🟡 R11. pnpm 单一依赖图的固有脆弱性

- `nodeLinker: hoisted` 全量图链接规划内存 >12G；**任何 importer 变更都会触发放大路径**。证据：`docs/RESEARCH-pnpm-oom-full-context-20260823.md:27-29`（286 importer / 1673 包 / lockfile 33209 行 / 4000+ peer 变体）、`:33-41`（exit 134）、`:45-57`（>12G vs isolated 8G 内完成）、`:68-72`（放大器）。纪律见 `docs/dev-workflow.md:12`、`:31-37`。
- 本轮升级必然改动根 `package.json`（删 8 个包）+ lockfile + profile 生成器 → **正好踩在放大器上**。
- `build.ps1:36-39` 设 `NODE_OPTIONS=--max-old-space-size=8192`；经验值为"每次 install 都要带（frozen 同样会炸）"（`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:125`）。

### 🟡 R12. peer 依赖的 semver 预发布元组陷阱

- `^0.1.0-rc.8` 的比较符元组是 `0.1.0`，而 `0.1.5-rc.2` 是 `0.1.5` 元组 → **不满足范围**，出 peer 警告（非致命）；若 `autoInstallPeers` 装副本则产生双版本风险。
- 证据：`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:60`；`docs/PLAN-dsh-ego-browser-integration-20260823.md:42`。
- 叠加风险：vendored 插件/快照里 `@deepseek-ai/*` 区间若被上游改回 registry 风格，会解析到旧包名链（历史 404 案例 `dsh-compact`，`docs/plugins/ya-workspace-sidebar.md:7`；`profiles/marisa/generate-profile.mjs:270-275`）。**每次同步必须检查**（`docs/plugins/ya-workspace-sidebar.md:13`）。

### 🟡 R13. `minimumReleaseAgeExclude` 闸门

- 近期发布的 registry 包会被 pnpm 11 的 24 小时 age 闸门拦截（`pnpm-workspace.yaml:79`；行为实测 `plugins/modlens/CHANGELOG.md:206`；pnpm#11224 无 CLI/env 覆盖）。
- 升级后需在**两处**补齐新家族条目（根 `pnpm-workspace.yaml` + `profiles/marisa/generate-profile.mjs:229-261`），否则 install 整族被拦。

### 🟡 R14. 上游构建管线与命名约定的漂移

- rc8 起上游根构建脚本已改为 `tsx scripts/build.ts`（新增 `--profile official`、`DSH_CLIENT_BUILD_PROFILE`/`DSH_CLIENT_TITLE`/`DSH_CLIENT_COMMIT_HASH`）——`docs/RESEARCH-rc8-migration-20260820.md:99-104`。0.1.5-rc.2 的 `package.json` 仍为 `"build": "tsx scripts/build.ts"`（本轮已核验）。
- `packages/experimental/*` 的包命名已变成 `@deepseek-ai/dsh-experimental-<name>`（如 `dsh-experimental-webworker-runtime`、`dsh-experimental-agent-team`，见 `apps/web/package.json` devDeps 与 `apps/cli/package.json` devDeps），新包命名不能按旧规律推断。
- `pkgManager` 上游为 `pnpm@11.7.0`，本仓库钉 `pnpm 11.9.0`（`package.json:299`）——上游未跟随，无冲突但需注意。
- Node engines 一致：`^22.19.0 || >=24.0.0`（上游 0.1.5-rc.2 与根 `package.json:6-8` 相同）——**无 engines 变更成本**。

### 🟡 R15. 上游与 MyGO 生态的适配滞后

- 历史记录：「上游 mygo 未适配 rc.1/rc.2」（`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:133`）。本轮跨 4 个 minor，`dsh-mygo`（fork，`maintenance/upstreams.json:3-11`，7 包 `0.2.0-rc.7`）与 panel 的 slot keyed 契约适配需重新验证。
- 另：`dsh-mygo` 的两个 PR（`#1 fix/devdep-ranges`、`#2 fix/windows-junction-links`）**截至 2026-08-23 提交上游未合并**（`maintenance/upstreams.json:10`）——若上游在 0.1.5 期间合并，需重放同步。

### 🟡 R16. 桌面壳的"未覆盖"风险

- Electron 壳不在本仓库 CI 覆盖范围内（第 3 节 G-2），其源码与发布流程归属未在仓库文档中查清。
- Go 壳的 bundle 布局（`marisa-distro/harness/apps/cli/lib/bin.js`）依赖 `make-bundle.ps1` 的暂存逻辑（`desktop/bundle/make-bundle.ps1:326-339` 复制 harness body 并在暂存副本上应用 overlay），换树后必须实跑。

---

## 6. 建议执行顺序与验证

> **本轮不实施。** 以下为后续执行者的步骤清单，每步给出验证手段；标 ⛔ 的为**必须先解决才能继续**的前置项。

### 阶段 0 — 前置决策（不碰代码）

1. **决定目标版本**：按第 4 节取 `0.1.5-rc.2`（或明确选择"再等一个 rc"）。若选等待，重新评估时以 `gh release list` 为准。
2. **决定会话数据策略**（⛔ 对应 R4）：确定回滚方案（是否在升级前对用户 `~/.dsh/sessions` 做整目录快照、是否提供降级安装包、发布说明如何告知"不可降级"）。
   - 验证：产出书面回滚方案，且**在动 harness 之前**完成。
3. **冻结并发工作**：`feature/linux-support` 上与 harness 相关的在途改动先落地或搁置（避免换树冲突）。

### 阶段 1 — 开新 worktree + 建立对照基线

4. 从 `origin/main` 开独立 worktree（**禁止就地换树**，`docs/RESEARCH-0.1.1-rc1-migration-20260822.md:70`）。
5. 在 worktree 中先跑一遍**升级前**的完整验证，建立绿基线：
   ```powershell
   $env:CI = 'true'
   pnpm install --frozen-lockfile
   pnpm test
   go test -C desktop -tags installedbundle ./...
   go test -C desktop -tags embeddedbundle ./...
   ```
   - 验证：全通过（若有既存失败，先记录并区分）。
6. 生成 profile（fresh worktree 必须先做，否则首装报 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND marisa-marisa`）：
   `$env:MARISA_PROFILE_DIR = <profileDir>; node profiles/marisa/generate-profile.mjs`
   - 验证：profile `package.json` 已物化（`build.ps1:213-215` 同款断言）。

### 阶段 2 — 解决 overlay 阻断（⛔ 先于换树）

7. **重写 `overlays/harness/brand-replacements.json`**（对应 R1）：
   - 删除已失效的 `ui-renderer/.../DocumentTitle.tsx` 条目，改挂新位置 `packages/client/ui-layout/src/client/DocumentTitle.tsx` 的实际注入点（0.1.5 改为 `productTitle` 属性，需先查清该属性由谁提供）。
   - 重做 `ui-sidebar/.../SidebarRoot.tsx` 条目（品牌已 i18n 化，字面量替换不再可行）。
   - `apps/web/index.html` 与 `apps/web/vite.config.ts` 两条**本轮核验仍然有效，可暂留**。
   - 验证：`node scripts/apply-harness-overlays.mjs apply --tree <新树> && node scripts/apply-harness-overlays.mjs revert --tree <新树> && node scripts/apply-harness-overlays.mjs verify --tree <新树>` 三步均 exit 0。
8. **重建 anchored-standard overlay 的目标路径**（对应 R2）：
   - 把目标从 `apps/cli/config/agent-presets/anchored-standard` 改到新消费路径，并**在 `apply-harness-overlays.mjs` 增加"目标必须被上游消费"的断言**（当前只有"残留即失败"）。
   - 同步更新 `scripts/dev.test.mjs:154`、`:181`。
   - 验证：`pnpm test`（含 `test:dev`）通过；并用 0.1.5-rc.2 的 `apps/cli/tests/web-agent-presets.e2e.ts` 形态做一次预设可见性的 e2e 断言。
9. **重基线 anchored-standard 预设内容**（对应 R7）：按 0.1.5-rc.2 的 `standard`（255 行）与 `minimal`（69 行）重做 `agent.cordis.yml`，重新论证 Windows 平台分支与 bootstrap 工具对。
   - 验证：boot 冒烟 + 首个请求工具对快照比对；更新 `docs/agent-preset-anchored-standard.md` 的证据记录。

### 阶段 3 — 换树与依赖

10. 在 worktree 中 checkout 目标 tag 并 bump gitlink（**不要用 `git submodule update` 做换树**；按 `docs/upstream-diff.md:32` 的人工 pin bump 口径）。
    - 验证：`git -C harness describe --tags` == `dsh-v0.1.5-rc.2`；`git submodule status` 显示新 commit。
    - 注意：换树后补 `git add -f harness/scripts/release`（若该目录仍存在）。
11. **清理根 `package.json` 的 8 个已删包**（对应 R3 / 第 3 节 H），并确认 `apiproxy → http-proxy` 的替代关系。
    - 验证：无 `workspace:` 指向不存在成员；`pnpm install --lockfile-only --no-frozen-lockfile` 成功。
12. **补齐 `minimumReleaseAgeExclude` 两处**（根 `pnpm-workspace.yaml:79` 起的块 + `profiles/marisa/generate-profile.mjs:229-261`）。
13. **改写 `@deepseek-ai/*` 区间**：workspace 成员 → `workspace:^`；registry 包 → `^0.1.5-rc.2`（根 `package.json:38-96` 共 56 条）。
    - 验证：`grep` 无残留 `^0.1.1-rc.2` / `^0.1.0-rc.*`。
14. 重算并提交根 lockfile（只用 `--lockfile-only`；**不要裸跑 `pnpm install`**，会 OOM）。
    - 验证：`pnpm install --frozen-lockfile` 在带 `$env:CI='true'` 与 `NODE_OPTIONS=--max-old-space-size=8192` 下成功。

### 阶段 4 — 构建与仓库门禁

15. 从根 workspace 构建 harness：`pnpm --filter @deepseek-ai/dsh-root run build`（**harness 目录内不得直接跑 pnpm**）。
    - 验证：`harness/apps/cli/lib/bin.js` 等 `lib/` 产物生成（`build.ps1:237-240` 同款检查）。
16. 更新 `scripts/verify-repository.mjs:132` 的 examples 断言（对应 R9），并按需复核 `:124-131`、`:141`、`:144-145`。
    - 验证：`pnpm test`（`test:repository`）通过。
17. 更新记账：`maintenance/upstreams.json`（baseline/baselineReviewed/dshVersion/note）+ `docs/upstream-diff.md`（基线表 + 逐项"重放、迁移或删除"）。
    - 验证：`git diff --name-only origin/main...HEAD | node scripts/verify-pr-boundaries.mjs` 通过（`:51-53` 强制两文件同时更新）。
18. 更新插件兼容矩阵（新写一份 0.1.5 矩阵，模板见 `docs/RESEARCH-rc8-migration-20260820.md:208-271`；状态词表见 `docs/plugins.md:7-12`），重点覆盖 R6/R8/R15 点名的插件。

### 阶段 5 — 全量验证

19. 跑完整验证矩阵（第 3 节 J）+ `pnpm test`；对每个 client 侧插件单独构建 + boot（不能只看单元测试，R8）。
20. 跑 `make-bundle.ps1` 打桌面包（`desktop/bundle/make-bundle.ps1`，注意 `:333-339` 会在暂存副本上再次应用 overlay）。
21. **真实窗口验收 + MSI 安装/启动/卸载**（`AGENTS.md:37`：后端 HTTP 200 **不是**桌面验收）。
22. 跑 Electron 壳（独立 worktree）的 `npm run build` + `npm test`（R16）。
23. **会话数据迁移验收**（R4）：在**测试用户目录**上执行 V2→V3 迁移，确认旧文件保留、新格式可读；再验证"回滚到 0.1.1-rc.2 无法读取"这一已知边界被正确写入发布说明。
24. LTS 晋升（可选）：完整验证通过后再从该点创建 `lts/rcN`（`docs/versioning.md:10`、`docs/upstream-sync.md:45`）。

### 回滚点

- 阶段 2 结束（overlay 已重基线、**尚未**换树）是干净回滚点。
- 阶段 3-4 未做真机验收前，可 `git checkout` 回 worktree 起点 + 恢复 lockfile。
- **一旦阶段 5 步骤 23 在任何真实用户数据上执行过 V3 迁移，回滚即不可逆**（R4）。

---

## 7. 未查清/待确认

> 以下均为本轮**未能确证**的项，实施前必须补齐；不要按推测执行。

1. **overlay 品牌新注入点未查清**：0.1.5-rc.2 的 `DocumentTitle.tsx` 改为接收 `productTitle: string` 属性，但**该属性的提供方未查清**（是本仓库未逐文件检索 `packages/client/ui-layout` 其余源码）。同时 `t('brand.localBuild')` 的 i18n 资源位置与覆盖方式未查清。→ 直接决定 C-1 的重基线方案。
2. **新预设路径的消费方式未逐行确认**：已确认 `apps/cli/package.json` 声明 `dsh.configTrees: [{mount: "config/agent-presets", path: "../../packages/preset/agent-presets/presets", scanRoster: true}]`，但**未在 0.1.5-rc.2 源码中逐行确认** CLI 的 preset 发现逻辑（`SHIPPED_PRESET_ROOT` 位于 `packages/preset/agent-presets/src/discovery.ts` / `src/index.ts`，未读取内容）。→ 直接决定 C-2 的新目标路径。
3. **`apiproxy` 与 `http-proxy` 是否一对一替代未确认**：只确认 `packages/host/apiproxy` 被删、`packages/util/http-proxy`（`@deepseek-ai/dsh-http-proxy`）新增，未比对二者 API 与调用方。
4. **GitHub compare 文件清单被截断**：三次 compare 的 `files` 均为 300（API 上限），**真实改动文件数未知**（≥300）。→ 无法给出"具体要改哪些上游文件"的完整清单。
5. **0.1.5-rc.2 的逐 PR 破坏面清单未做**：本轮只取了 release notes + 包目录 diff + 定向文件核验，**未做** `docs/RESEARCH-0.1.1-rc1-migration-20260822.md:92-105` 那种逐 commit/逐 PR 的差异盘点。历史教训（rc6 基线口径坑，`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md:20`、`:280-306`）说明这一步不可省。
6. **哪些插件会坏未验证**：第 5 节点名的插件均基于"上游释放说明 + 包目录 diff"的**推断**，**未对任何插件做实际构建或 boot**。35 个 plugin 条目的逐项矩阵尚未产出。
7. **`scripts/release/` 是否仍在上游未核**：`docs/upstream-diff.md:25` 记录 0.1.1-rc.x 有 9 个发布脚本；本轮**未核验** 0.1.5-rc.2 是否仍有该目录。
8. **`dsh` 的 `--profile` / `--patch` launcher 旗标未在新版核验**：已确认 `apps/cli/src/args.ts` 仍存在 `--patch` 相关代码路径（code search 命中 `args.ts`、`profile-boot.ts`），但**未读取实现**确认 `build.ps1:243` 的 `node apps/cli/lib/bin.js --profile marisa --patch <path>` 调用形态在 0.1.5-rc.2 上仍然有效。
9. **Electron 壳的仓库归属与发布流程未查清**：`C:\Users\lf\Documents\Workspace\marisa-electron-wt\desktop-electron` 存在且独立，但本仓库文档中**未见**对该壳的登记、CI 覆盖或发布流程描述。→ 换树后由谁验证、如何验证未定。
10. **上游 `master` 的 139 个额外 commit 未做内容评估**：可能存在下一个 rc 会带入的破坏面；建议在实施前重跑 `gh release list`。
11. **工作量/工期未评估**：本轮未做估时（按用户要求"不算工期"以外的量化也未做）。
12. **`dsh-model-proxy` 是否因上游原生支持而可退役未确认**：0.1.5-rc.1 notes 明确「所有出站网络请求都会遵循启动环境中的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY` 配置」，而本仓库第一方插件 `dsh-model-proxy`（`maintenance/upstreams.json:266-270`）的定位正是"令模型/搜索/上传请求在不改 API endpoint 的前提下透明走标准 HTTP_PROXY"。→ 二者可能重叠，**未验证**上游实现是否覆盖本插件的全部场景（尤其 Agent shell 子进程的环境变量发布）。
13. **会话 V3 迁移的可用工具与失败模式未评估**：只知道存在 `packages/session/session-format-v2-to-v3`（含 `README.zh.md` 链接于 release notes），**未读其内容**。→ R4 的处置方案需要这份文档。
14. **`0.1.2-rc.1` → `0.1.5` 之间是否存在只有 alpha 记录的中间破坏面未评估**：0.1.3/0.1.4 只有 alpha 或完全缺失，这些 alpha 引入的变更会被 0.1.5-rc.2 一并购入，本轮**未读 alpha release notes**。

---

## 附：本轮查询命令留痕（可复现）

```powershell
# 本仓库基线
git submodule status
git -C harness describe --tags
git -C harness log -1 --format="%H %ci %s"

# 上游 release / tag
$env:HTTP_PROXY='http://127.0.0.1:7890'; $env:HTTPS_PROXY='http://127.0.0.1:7890'
gh release list --repo deepseek-ai/deepseek-harness --limit 30
gh api "repos/deepseek-ai/deepseek-harness/tags?per_page=40" --jq '.[] | "\(.name)\t\(.commit.sha)"'
gh api "repos/deepseek-ai/deepseek-harness/compare/<A>...<B>" --jq '"ahead=\(.ahead_by) behind=\(.behind_by)"'
gh api "repos/deepseek-ai/deepseek-harness/git/trees/<TREE_SHA>?recursive=1" --jq '.tree[].path'

# 定向文件核验（raw.githubusercontent.com 经代理）
curl.exe -s --proxy http://127.0.0.1:7890 "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/<REV>/<PATH>"
```

- 本文所有上游断言均可在 2026-09-13 的数据快照上复现；上游若已前进，第 2 节的数字需重取。
