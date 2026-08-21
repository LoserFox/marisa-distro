# Fork 源码普查与上游化分类调查（2026-08-23）

> 调查目标：清点本仓库所有 fork 上游源码的面，并对每一处本地差异给出处置建议——
> **A 应合并上游 / B 应先通用化再提 / C 保留仓库 / D 已有上游反馈（计划或已提交）**。
> 只读调查：未修改任何文件、未提交；涉及其他 agent 在途未提交工作（harness 品牌补丁、auto-resume 修复）仅记录不动。

## 1. 调查范围与方法

- 权威登记：`maintenance/upstreams.json`（18 个 fork + 12 个 mirror + harness）、`docs/upstream-diff.md`、`docs/plugins.md`、`docs/upstream-sync.md`。
- 差异文档：`docs/plugins/<id>.md` 18 份逐份核对，抽查插件源码与差异描述一致性。
- 交叉验证：`docs/RESEARCH-rc8-migration-20260820.md`、`RESEARCH-modlens-vision-switch-20260822.md`、`RESEARCH-shell-switcher-plugins-20260821.md` 等；git 历史（fork 相关提交）；patches/、dsh-mygo/、desktop/、legacy/ 现场核查。
- 执行：4 个并行子代理分组调查插件，本会话核查 harness/patches/mygo/desktop/legacy 与 mirror 品牌痕迹。

## 2. Fork 全景

| 面 | 数量 | 说明 |
|---|---|---|
| `harness/`（镜像） | 1 树 + 2 处本地增量 | 上游 deepseek-harness rc7 pin；增量=anchored-standard 预设、Marisa 品牌 title |
| git fork 插件 | 12 | dsh_workflow、dsh-genui、dsh-git-identity、dsh-stickers、dsh-suggested-replies、dsh-diff-viewer、dsh-track、dsh-sidechain、dsh-vision-toolkit、dsh-web-ui-approval-notify、dsh-input-history、dsh-ui-progress |
| npm 快照 fork 插件 | 6 | dsh-better-sidebar、dsh-llm-fallbacks、ya-workspace-sidebar、dsh-bash-terminal、dsh-update-check、dsh-auto-resume（后两个为本地第一方） |
| mirror 插件 | 12 | 抽查 4 个干净；无本地差异 |
| vendored 市场源码 | 1 | `dsh-mygo/`（@r05en1cu/dsh-mygo 0.2.0-rc.7，file: 依赖，含 in-tree keyed fix 未登记出处） |
| pnpm 补丁 | 2 | `patches/` 两个文件均已失联（见 §4.2） |
| desktop 捆绑资产 | 1 | `desktop/bundle/mnemon.exe`（dsh-mnemon Go 引擎二进制，非 fork，随包资产） |
| legacy/ | 1 | 历史快照归档（2026-08-13/14），无上游动作 |

## 3. 插件 fork 分类结论

### 3.1 A —— 应合并上游（通用价值，可直接提 PR）

| 插件 | 差异 | 上游 | 备注 |
|---|---|---|---|
| dsh-bash-terminal | ① msys2 后端（candidateMsys2Paths 探测 + argv 构造）② MSYSTEM 注入 ③ 按调用 `shell` 参数切换 ④ `wslDistro` 配置 ⑤ 设置面扩展 | MAXeaglet/dsh-bash-terminal | **优先项**。五项增量全部通用（多后端 shell 选择是任何 DSH 用户的诉求）。文档已计划 PR（见 D 类），网络恢复后即提；提之前先修 §5.3 版本号不一致 |
| dsh-sidechain | 深色模式适配：`:root` 级 `--ds-color-*` → `--dsw-alias-*` token 映射 | dsh-external/dsh-sidechain | 平台语义 token 映射属通用 bug 修复（Arco 风格变量名与 DSH 主题命名脱节是所有消费 `--ds-*` 的插件的共同问题）；若上游改用 DSH 语义 token 则删补丁 |
| dsh-web-ui-approval-notify | tsdown.config.mjs 用 `pathToFileURL` 加载 `DSH_CHECKOUT/packages/client/tsdown.client.ts`（修复 Windows `import('C:\…')` ESM URL 失败） | bill9109/dsh-web-ui-notify | 最小 PR，文档已注明「建议反馈上游」；上游 v0.1.3 即最新，无同步压力 |
| dsh-genui | `/panel` 从已删除的 `ctx.slash`（ui-slash）迁到 `ctx.inputTriggers`（ui-input-trigger） | dsh-external/dsh-genui | 前提：上游尚未完成同款迁移（无法联网核实，若上游已同步则降为 C） |
| dsh-vision-toolkit | ① `authMode: none` 匿名模式（不读不存密钥，非秘密占位值）② vendored 清单 CRLF 归一化校验 | Anionex/dsh-vision-toolkit | **不建议投入**：RESEARCH-modlens-vision-switch 已计划以 ModLens 整体替换本插件；上游化价值被替换计划覆盖 |
| dsh-auto-resume | 整插件（第一方，无上游） | — | 判定 A 指「可直接单独开源」：全目录零 Marisa 字符串、MIT、双语 README、单测齐全、包名已是 `@dsh-external/dsh-auto-resume`。落地前需收编在途未提交修复（client.jsx inject ['slots'] + order:999 原位替换）并补浏览器冒烟 |
| （等效 A）patches/ 的 client-modules 补丁 | 曾补 `ctx.provide("clientModuleHost")` | deepseek-ai | **已随上游解决**：安装解析到 0.1.0-rc.8 原生提供该服务；补丁已断线，无需再提（§4.2） |

### 3.2 B —— 应先通用化再提上游

| 插件 | 差异 | 通用化方向 |
|---|---|---|
| dsh-git-identity | env 注入机制：解析身份写入 `GIT_AUTHOR_*`/`GIT_COMMITTER_*` 压过 git config，防会话 `-c user.name` 污染 | 当前绑定 gh CLI/GitHub noreply 规则；抽象成通用 provider（plugin config → CLI → env → git config 链）后可提；策略本体与全局写回保留本地 |
| dsh-better-sidebar | 与 dsh-sidechain 面板互斥协议（一对 window CustomEvent，事件名硬编码对方插件） | 通用化为「面板互斥声明 + 标准事件总线」类机制；当前是 Marisa 同时启用两个面板的组合决策 |
| dsh-web-ui-approval-notify | `awayNow()` 失焦判定（壳内 `visibilityState` 保持 visible 时 hidden-only 闸门失效） | 失焦检测目前以 `'_wails' in window` 耦合桌面壳；解耦成「平台能力探测 + 通用 focus/blur 闸门」后值得提 |
| dsh-update-check（第一方） | 整体 | 核心能力（GitHub Releases 检查+缓存+通知+深链）通用、生态内无同类；但硬编码 Marisa 资产名（Marisa-DSH-windows-x64.msi/standalone.exe）、`MARISA_INSTALL_FORM`/`MARISA_VERSION` 环境变量、marisa UA、installForm 语义需参数化后才可开源。`repo`/`apiBase` 已可配 |
| dsh-diff-viewer / dsh-track | checkout 路径补丁（link: 与 DSH_SOURCE/tsconfig 指向 `../../harness`） | 已可移植化（相对路径），但终态是**删除而非提 PR**：上游改用 peerDependencies/正式 dsh-session-query 包后按「删除而非重放」原则移除（docs/upstream-diff.md 明示） |
| dsh_workflow / dsh-genui / dsh-stickers | `../../harness` 路径化（devDeps link、vitest、tsconfig） | 上游仓库已用 `DSH_SOURCE`/`DSH_ROOT` 环境变量约定；统一参数化后再谈提上游，但属纯 dev 管线，留本地也无碍（B/C 边缘，见 §3.3） |
| ya-workspace-sidebar | devDeps 8 条 `@deepseek-ai/dsh-*` 改写为 `workspace:^`（原范围拉取 rc.1 远古链 → dsh-compact 404） | **无公开仓库（repository: null），无处可提**；等上游发布可解析 devDep 范围或公开仓库，实际以 C 方式保留 |

### 3.3 C —— 保留仓库（发行版特有 / 流程约束 / 第一方）

- **第一方插件**：dsh-update-check（当前形态）、dsh-auto-resume（当前形态）——repository 指向发行版仓库自身，随发行版演进。
- **dsh-git-identity 策略本体**：gh CLI 身份解析优先级、幂等写回 `git config --global`（隐私敏感，若要上游化必须 opt-in）、包名/品牌。
- **dsh-sidechain ↔ dsh-better-sidebar 互斥协议**（两侧合计 3 文件 + 测试）：发行版组合决策。
- **dsh-vision-toolkit 预设与包名**：Zen（opencode.ai/zen/v1 + mimo-v2.5-free 匿名默认）、GLM 预设、`@dsh-external/` 包名保留——直至 ModLens 替换落地。
- **dsh-web-ui-approval-notify 原生 toast 桥**：`MARISA_TOAST_PORT` 回环桥 + wintoast + 桌面 Go 壳（`desktop/toast_bridge.go`）+ 通知样式设置——与桌面壳强耦合，Marisa 专有；vitest 路径与 tsconfig `node` 类型亦为本地适配。
- **dsh-llm-fallbacks**：移除 `prepare` 脚本、使用发布 dist——AGENTS.md vendoring 铁律（npm 快照不得含安装期生命周期脚本），上游 0.3.2 打包缺陷的发行版应对；随上游新版本自然归零。
- **dsh-better-sidebar lib 双处同步**：0.14.0 发布包不带构建配置，src 与 lib/client.js 双处手工补丁——快照流程必然产物。
- **路径适配类（dsh-input-history / dsh-ui-progress / dsh-stickers / dsh_workflow / dsh-genui / dsh-suggested-replies）**：devDeps `link:../../harness` + invariants 路径——纯开发管线差异，差异文档均写明「上游提供正式 rc 依赖后删除」；无提 PR 价值，保留至删除条件成立。
- **dsh-suggested-replies 停用**：rc6 起默认停用（客户端 API 与组合时序兼容未证明）——组合决策。
- **dsh_workflow 撞名现状**：与官方 `tool-workflow` 并存撞名——组合层问题，RESEARCH-rc8 建议**移除 fork 改用官方工具**（§5.5）。
- **harness 两处本地增量**（§4.1）。
- **dsh-mygo vendored 源 + keyed fix**（§4.3）；**desktop** 全部自研（§4.4）；**legacy/**（§4.5）。

### 3.4 D —— 已有上游反馈（计划/已提交）

| 插件 | 反馈状态 | 证据 |
|---|---|---|
| dsh-bash-terminal | **计划提交未实际提交** | upstreams.json + 差异文档：「上游反馈待 GitHub 可达后提交」；本次调查仍未检出 PR 记录 |
| dsh-web-ui-approval-notify（tsdown 修复） | 文档注明「建议反馈上游」，未提交 | 差异文档 |

其余 16 个 fork 均无任何已提交/计划的上游反馈记录（upstreams.json 无 note、差异文档无 PR/Issue 链接）。

### 3.5 Mirror 策略健康度

- 抽查 dsh-a2a、dsh-sonar、dsh-paste-input、whale-girl：**全部干净**——无品牌字符串、无未提交改动、无 diffDocument；git 历史仅 vendor/upstream-sync 提交。dsh-artifact README 中的 "marisa" 指上游 `dsh-external/marisa` 仓库 issue，非本发行版品牌，非本地改动。
- 镜像流程（`.github/workflows/upstream-sync.yml` + `scripts/sync-upstream.mjs`）按组件生成候选 PR，fork 只写 `maintenance/candidates/<id>.json` 不自动改写——机制健全。
- 注意：`dsh-sonar` 消费 `clientModuleHost`（inject），该服务当前由安装到 0.1.0-rc.8 的 dsh-client-modules 原生提供（旧补丁已不需要）；sonar 仍在 rc7 待重测清单。

## 4. 非插件 fork 面

### 4.1 harness/（镜像 + 2 处本地增量）

- 基线：deepseek-harness `99f6f02f`（0.1.0-rc.7）；当前工作区处于 rc8/0.1.1-rc.2 同步在途（sync/0.1.1-rc1 分支 worktree，其他 agent 推进中）。
- 增量 1 `apps/cli/config/agent-presets/anchored-standard/`（4 文件，已提交）：tool-bootstrap.mjs vendored 自 xiaobright/dsh-anchored-standard@95b98af（MIT）+ agent.cordis.yml（rc7 standard + 锚定增量）+ preset.yml/LICENSE。实验预设不属上游产品面；rc8 换树时原样重放。→ **C（保留），可考虑单独开源为 preset 仓库**
- 增量 2 品牌 title（`apps/web/index.html` `<title>Marisa DSH` + smoke-real.e2e.ts 断言）：**在途未提交**（工作树有、HEAD 无；其他 agent 工作）。rc8 已删除 `DSH_CLIENT_TITLE` 构建期覆盖机制，品牌只能落静态 title；若上游恢复构建期品牌注入则删本行。→ **C（保留）**
- 治理上 harness 应转 pinned submodule（AGENTS.md 已约定），避免把 rc 同步误读为源码修改。

### 4.2 patches/ —— 两个失联补丁（建议删除）

| 文件 | 曾用途 | 现状 |
|---|---|---|
| `@deepseek-ai__dsh-client-modules@0.1.0-rc.6.patch`（补 `ctx.provide("clientModuleHost")`） | 历史接线过（git 历史可见 pnpm-workspace patchedDependencies 条目） | 根 pnpm-workspace.yaml 的 patchedDependencies 已清空（2026-08-18）；安装解析到 0.1.0-rc.8 原生提供该服务。全仓无引用 |
| `@huanlin__dsh-plugin-aigc-canvas@0.1.1.patch`（ModuleLoader id 改写） | aigc-canvas 插件时代 | 插件 2026-08-19 已移除（make-bundle.ps1 注释明确）；包不在依赖图、lockfile 无记录。全仓无引用 |

→ 两个文件均为死文件，建议删除（或归档 legacy/），避免误导后续维护者以为补丁仍在生效。

### 4.3 dsh-mygo/（vendored 市场源码）

- `@r05en1cu/dsh-mygo*` 0.2.0-rc.7 整体 vendored（file: 依赖）；上游自身带 `patches/` 协议目录（fabric-host.patch 等为**上游内容**，非 Marisa 改动）。
- pnpm-workspace.yaml 注释声明「keyed fix applied in-tree」，但**该本地修改无出处文档**（无 diff 文档、无 commit 拆分）；`dsh-mygo/AGENTS.md` 是上游原样带入。
- 已知未修硬点：面板 bridge 安装用 `fs.symlink(...,'dir')`，Windows 非提权 EPERM（桌面 launcher 刻意用 junction 免权限，见 `desktop/junction_windows.go`）——桌面用户装插件第一步必挂；本次调查确认面板源码仍是 symlink（index.ts:696 等），junction 改造仅停留在临时测试。
- → **处置**：① 为 in-tree 修改补登记（mygo-pack.md 或 diff 文档，写明改了什么、为什么）；② Windows junction/symlink 回退是**应提上游（A）**的通用修复（dsh-mygo 仓库或上游 DSH 面板 lib）；③ 0.2.0-rc.7 → 上游 next 线跟进时按 vendored 流程重放。

### 4.4 desktop/（自研，无 fork 面）

- go.mod 无 replace directives、无 vendored Go 源码；toast 桥（wintoast 经 Wails notifications 服务）是自研（`toast_bridge.go` + 插件桥接），非 fork。
- `desktop/bundle/mnemon.exe` 为 dsh-mnemon 的 Go 引擎二进制，随包资产（上游 0.2.13 对应版本，需与运行时解析核对），非 fork 源码。
- 桌面壳是 Marisa 专有（Wails 壳 + junction + 升级迁移 + 更新守卫），天然 C 类。

### 4.5 legacy/（历史归档）

2026-08-13/14 快照（旧 plugins.json、install.sh、skills 副本等），保留作历史参考，无上游动作。

## 5. 行动清单（按优先级）

| # | 动作 | 类型 | 依据 |
|---|---|---|---|
| 5.1 | 删除 `patches/` 两个失联补丁（或归档 legacy/） | 清理 | §4.2，全仓零引用 |
| 5.2 | 提交 dsh-bash-terminal 上游 PR（msys2 后端 + 按调用 shell + wslDistro） | A | §3.1；先修 5.3 |
| 5.3 | 修正 dsh-bash-terminal 版本不一致：package.json 实为 0.3.14，文档称 fork v0.4.0 | 一致性 | 子代理实测 |
| 5.4 | 修复悬空路径：dsh_workflow tsconfig（ui/commands、user-approval、workflow-workerthread 不存在）、dsh-genui invariants（实际在 runtime-diagnostics/，配置指向 support/）、dsh-suggested-replies link-dsh.mjs 目标不存在 | 修复 | §3.3，同步前必做 |
| 5.5 | dsh_workflow 移除决策：官方 tool-workflow 已覆盖且撞名，随 rc8/0.1.1 迁移一并移除（或确认 fork 改 toolName 后保留） | 决策 | RESEARCH-rc8 §8；本节 §3.3 |
| 5.6 | dsh-update-check 通用化清单开 issue（资产名/环境变量/UA 参数化） | B | §3.2 |
| 5.7 | dsh-auto-resume 收编在途修复 + 浏览器冒烟后按 `@dsh-external/dsh-auto-resume` 开源 | A | §3.1；等待在途 agent 完成后进行 |
| 5.8 | dsh-mygo：补 in-tree 修改出处文档；Windows symlink→junction 回退提上游 | 登记 + A | §4.3 |
| 5.9 | vision-toolkit：ModLens 替换落地时点决策（替换前不为 authMode 上游化投入） | 决策 | §3.1 |
| 5.10 | 5 个 dsh-external fork（dsh_workflow/genui/git-identity/stickers/suggested-replies）upstreams.json 补 note 字段 | 治理 | 子代理发现：区别于有同步记录的 fork |
| 5.11 | harness 转 pinned submodule（rc8/0.1.1 换树后） | 治理 | AGENTS.md + upstream-diff.md |
| 5.12 | mirror 保持零修改策略；rc7 待重测清单（sonar/track/diff-viewer/multimedia-webui-input/suggested-replies/llm-fallbacks）随 rc8 重测时优先核对「删除而非重放」 | 流程 | §3.5 |

## 6. 一句话总结

**能直接提上游的只有少数几处（bash-terminal 五项、sidechain 深色映射、approval-notify 的 tsdown 修复、genui 的 ui-input-trigger 迁移），且大多还停在「计划未提交」；真正该做的是清理（死补丁、悬空路径、版本不一致、dsh_workflow 移除）和把两三个第一方能力（update-check、auto-resume）通用化后开源；其余全部是发行版本质（品牌、预设、桌面桥、vendoring 流程），应留在仓库并靠差异文档+「删除而非重放」原则控制同步成本。**
