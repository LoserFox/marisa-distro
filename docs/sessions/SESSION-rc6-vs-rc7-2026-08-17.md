# 上游 harness rc6 vs rc7 对比调研：npm 通道澄清与 Marisa「兼容版本 vs 导入基线」界定

> 来源会话：`47581740-dff1-4eef-a4ff-aba5519f3fc8`（主会话）、`690cea2f-180b-48b5-b527-5177b2d829f5`（重试/重复）、`4cfddaa5-3b82-470d-927f-2249bfe4c786`（重试/重复），2026-08-17
> 整理方式：会话记录结构化纪要
> 说明：`690cea2f` 与 `4cfddaa5` 是同一问题的两次失败重试（模型/账号级 API 报错，未开展实质工作），仅在此标注，不展开。

## 背景与目标

用户提出调研问题：**「看一下 deepseek harness 的 next 分支里面的 rc7 和目前主分支的 rc6 有什么不一样的」**。本会话为纯调研（research-only）：要求对照一手来源（官方文档、源码、npm registry），把结论写成 Markdown 笔记落盘，**不修改产品代码、不执行 rc7 升级**。

会话全程约 53 分钟（13:11–14:05 UTC）。核心产出是 `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`（本会话创建，压缩续接后又经加强重写）。会话末尾用户对「marisa-distro 是 0808」的表述提出强烈异议（「marisa-distro是rc6啊，怎么可能是0808？？你在逗我吗」），成为后半段的核心交锋，最终以「兼容版本 vs 导入基线」两层记账方式澄清。

两个小文件为前置失败重试：

- `690cea2f`（13:07–13:07）：先执行 `/model` 把默认模型设为 Opus 4.8，随后提出同一问题，立即报 `API Error: 403 This group does not allow /v1/messages dispatch`，未进入实质工作。
- `4cfddaa5`（13:08–13:10）：同一问题连发两次，均报 `API Error: 400 unknown provider for model gpt-5.6-sol`，第一次尝试调 Agent 工具后失败，未进入实质工作。

主会话（`47581740`）即为第三次尝试，成功后完整走完调研。

## 关键决策与理由

| # | 决策 | 理由 | 时间（UTC） |
|---|---|---|---|
| 1 | 把「next/main」解读为 **npm dist-tag 而非 git 分支** | `git ls-remote` 显示公开仓库默认分支只有 `master`，不存在 `main` / `next` 分支；npm 上 `next` 通道 = `0.1.0-rc.7`，与用户口语「next 分支 rc7」对应 | 13:17–13:20 |
| 2 | 数据源锁定一手来源：`git ls-remote` / 浅克隆 / `git show` / `git diff` + npm registry 元数据 | GitHub 网页与 `api.github.com` 在本环境被网络拦截（域名校验/TCP 超时），改用 git 协议与 npm 通道；后台 research agent 同步深挖主仓库历史 | 13:14–13:29 |
| 3 | 建立**三棵树对比框架**：(A) Marisa vendored `4e7fb95f`（0808 私有快照，账本标 rc6）；(B) 官方公开/ npm `0.1.0-rc.6`（`fb826987`）；(C) 官方 `0.1.0-rc.7`（`99f6f02f`） | 避免把「本地 vendored 树」与「官方 npm 包」混为一谈；最初把 0808→官方 rc6 的包名大重构误归因到 rc6→rc7，拆包后纠正 | 13:23–13:34 |
| 4 | 判定**官方 rc6→rc7 是小版本推进**（106 commits / 22 个 first-parent PR），而非大重构；「bash→shell 改名」等大重构属于 **0808→官方 rc6** 区间 | 已发布 rc6/rc7 tarball 体积几乎一致，多数 JS 只差版本号；真正有行为差的仅数处 | 13:30–13:38 |
| 5 | 本会话**只调研不改代码**；结论与升级清单写入研究笔记，不启动升级 | 用户原始请求即「看一下……有什么不一样的」，会话摘要亦明确「do not change product code or upgrade the fork」 | 13:41 前后 |
| 6 | 回应「0808」质疑：**「兼容版本/依赖面」与「导入基线 git 对象」分开记账**——说 Marisa 是 rc6 对（`dshVersion: 0.1.0-rc.6`、根依赖 `^0.1.0-rc.6`、插件停用理由均按 rc6 记账）；说 `4e7fb95f` 是 08-08 私有快照也是事实（git subject 明写 `Private DSH snapshot 20260808T121140Z`，比公开 rc6 早 5 天、布局旧） | 用户不接受「发行版自称 0808」；核实账本与树后确认两者不矛盾，只是上次表述把两层混为一谈 | 14:00–14:05 |

## 工作过程时间线

### 阶段 0：失败重试（13:07–13:10，会话 690cea2f / 4cfddaa5）

- 13:07 `/model` 设为 Opus 4.8 → 提问 → `403 group does not allow /v1/messages dispatch`。
- 13:08–13:10 同一问题重发两次 → `400 unknown provider for model gpt-5.6-sol`。两次均未产生实质调研。

### 阶段 1：定位 refs、澄清问题（13:11–13:20，主会话）

- 13:11 用户提问；加载 research 技能，按技能要求启动后台 agent 做一手来源调研。
- 13:13–13:16 GitHub WebFetch / `gh api` 失败 → 改用 `git ls-remote`。
- 13:17 `ls-remote` 只见 `master` 与 tag `dsh-v0.1.0-rc.7`（同一提交 `99f6f02`），一度误判公开仓「只有 rc7 一条历史」；`main`/`next` 分支不存在。
- 13:18 发现本机已有上游 clone `C:\Users\lf\deepseek-harness`；对照其分支/标签。
- 13:20 核对 npm dist-tag：`@deepseek-ai/dsh` 的 `next` = rc7，`latest` 已推到 rc7；多数库包 `latest` 仍停在 rc6 或 `0.0.1-rc.*`。

### 阶段 2：拉取 rc7 源码、建立三树对照（13:21–13:29）

- 13:21 克隆公开 tag `dsh-v0.1.0-rc.7` → `99f6f02`（本地 `.tmp-dsh-rc7/`）。
- 13:23 确认 rc7 为当天发布（PR #2620）；unshallow 拉全历史超时，改用文件级/目录级对比。
- 13:26–13:28 对比本地 rc6 快照（`harness/`、`C:\Users\lf\.dsh\source\current-0808`、`4e7fb95f` 检出）与 rc7 树；`npm view/pack` 下载 rc6/rc7 tarball（`.tmp-dsh-npm/rc{6,7}/`）。
- 13:28–13:29 发现 npm 上「已发布的 rc6」已含改名后的包（shell/jobs 等），与本地 0808 私有快照不同 → 首次明确「0808 ≠ 官方 rc6」。

### 阶段 3：拆包对比、确定 rc6→rc7 差异面（13:30–13:38）

- 13:30 rc6/rc7 tarball 体积几乎一致 → 判定小版本推进；拆包核对依赖与预设。
- 13:31 确认已发布 `0.1.0-rc.6` 是「0808 之后」的版本（已含改名），本地 0808 快照是更早的 rc6 变体。
- 13:34–13:36 体积有变化的包（`tools`/`llm`/`attachment`）逐一拆内容 diff；确认 subagent 配置字段 `enableRunInBackground` → `backgroundMode` 的含义变化。
- 13:37–13:38 读真正改过的 JS/类型差异；核对 vendored rc6 与官方 npm rc6 是否同源（否）。

### 阶段 4：成文与总结（13:39–13:41）

- 13:39–13:40 后台 agent 带回完整 master 历史（rc6 merge `fb826987`、PR #2531；rc6→rc7 共 106 commits / 22 first-parent PRs），修正「公开仓只有 rc7 一条历史」的早期判断。
- 13:41 写入 `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`，向用户总结：官方 rc6→rc7 仅 5 处行为差异，并首次给出「别把 Marisa 的 rc6 当官方 rc6」警告。

### 阶段 5：用户质疑与澄清（14:00–14:05）

- 14:00 用户反驳「marisa-distro是rc6啊，怎么可能是0808？？你在逗我吗」。
- 14:01 会话上下文压缩续接；agent 重新核实 `maintenance/upstreams.json`（`dshVersion: 0.1.0-rc.6`、`baseline: 4e7fb95f`）、根 `package.json` 依赖、`docs/upstream-diff.md` 原文（「DSH 兼容版本 `0.1.0-rc.6` / 当前导入基线 `4e7fb95f`（2026-08-08 快照）」）与 `harness/` 实际布局（版本仍 `0.0.1`、包目录旧布局）。
- 14:04 给出最终澄清（见「要点摘录」），同时把研究笔记加强重写（补官方 rc6 SHA、106-commit 范围、settings/ACP/MCP/`reasoningEffort`/node-pty 等细节），不撤销、不重写为旧版本。会话结束。

## 产物与影响

### 直接产物

- **`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`**（本会话创建，压缩续接后加强重写）——完整调研笔记，含：精确 refs 表（rc6 merge `fb826987`、rc6 bump `15148dbd`、rc7 commit/tag `99f6f02f`、rc7 bump `bb4ca698`、无 rc6 git tag）、npm dist-tag 明细表、106-commit 的 first-parent PR 时间线、9 项产品变化逐条分析（含 Marisa 含义）、「明确没变的 fork 接触面」表、0808 私有快照与官方 rc6/rc7 的包名对照表、升级清单（8 项）。该文档为后续 rc7 同步（2026-08-18）的直接依据之一。

### 对本会话之后仓库状态的影响（据仓库当前文件，非本会话动作）

- `maintenance/upstreams.json` 的 harness 条目在本会话后已更新：`baseline` = `99f6f02fecdb…`、`dshVersion` = `0.1.0-rc.7`、`channel` = `next`，note 写明「rc7 sync 2026-08-18: replaced the private 4e7fb95f snapshot … client+host now share one rc7 tree」。
- `docs/upstream-diff.md` 已改写为 rc7 基线（兼容版本 `0.1.0-rc.7`），并记录了 rc7 下待重测插件清单；`docs/rc7-plugin-compatibility.md`（2026-08-18）按本会话的「不能在 rc6 结论上推断 rc7」原则逐项列了 rc7 插件状态。
- 本会话本身未触碰产品代码、未执行升级（研究-only 边界被遵守）。

### 临时工作区（非发行树）

- `.tmp-dsh-rc7/`（rc7 tag 浅克隆）、`.tmp-dsh-npm/rc{6,7}/`（npm pack 解包）、`.tmp-dsh-upstream/`（上游浅克隆）——均不在发行树内，未提交。

## 遇到的问题与解决

| 问题 | 表现 | 解决 |
|---|---|---|
| GitHub 网络拦截 | `github.com` 网页抓取、`api.github.com`、`gh api` 全部失败（域名校验 / TCP 超时） | 改用 `git ls-remote` / `git clone`（git 协议）+ npm registry；后台 agent 用同样途径补齐历史 |
| 公开仓历史误判 | 首次 `ls-remote` 只见 `master`+rc7 tag，误以为公开仓只有 rc7 一条历史；unshallow 拉全历史又超时 | 后台 agent 从主仓库取回完整历史：rc6 merge `fb826987`（PR #2531）在 `master` 上，是 rc7 的祖先；研究笔记据此修正 |
| 差异归因错误 | 最初拿 0808 私有树 vs rc7 对比，把 bash→shell 等包名大重构记到 rc6→rc7 头上 | 拆 npm rc6/rc7 tarball 后确认改名属于 0808→官方 rc6 区间；rc6→rc7 只有版本号与少量行为差 |
| 误发协议响应 | 向后台 research agent 发了一条 `plan_approval_response`（request_id 为占位符），对方并无审批请求 | 立即放弃该路径，改走正常 clone/对比流程；不影响最终结论 |
| 用户对「0808」表述不满 | 「marisa-distro是rc6啊，怎么可能是0808？？你在逗我吗」 | 核实账本（`dshVersion: 0.1.0-rc.6`）与树（`4e7fb95f` = 0808 私有快照）后，以「兼容版本 vs 导入基线」两层记账澄清（见关键决策 #6） |
| 前置重试全部失败 | `403 group does not allow /v1/messages dispatch`、`400 unknown provider for model gpt-5.6-sol` | 属模型/账号级环境问题，非调研问题；主会话（第三次尝试）成功完成 |

## 要点摘录

### 术语澄清（会话核心结论）

- 公开 `deepseek-ai/deepseek-harness` **没有 `main` / `next` git 分支**，默认分支是 `master`；「next 分支 rc7 / 主线 rc6」实际是 **npm dist-tag**：`next` = `0.1.0-rc.7`（= 公开 `master` HEAD + 唯一公开 tag `dsh-v0.1.0-rc.7`），`latest` 混乱（CLI `@deepseek-ai/dsh` 已推到 rc7，多数库包仍停 `0.0.1-rc.*`）。
- 官方 rc7：`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（PR #2620，2026-08-17）；官方 rc6：merge `fb82698709c39f1860b0ab0ed147e1fa30c1d5d0`（PR #2531，2026-08-13，**无 git tag**）；`fb826987` 是 `99f6f02fe` 的祖先。
- rc6→rc7 共 **106 commits / 22 first-parent PR**（21 功能/修复 + 1 release）；无产品 CHANGELOG。

### 官方 rc6 → rc7 的实际差异（9 项，能对照 `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`）

1. **插件设置页契约（破坏性）**：`settings.plugin.item` 从 `list` + `id`/`order` 改为按 settings namespace 的 `keyed` slot（PR #2404）；Host 删除 `WEB_SETTINGS_NAMESPACES` / `PRODUCT_SETTINGS_NAMESPACES` 白名单与 RPC 错误 `settings-not-exposed`。→ 仍按 `id`/`order` 注册的插件在 rc7 client 上对不上 keyed dispatch；rc7 起插件终于可不改 Harness 就上设置页。
2. **ACP/MCP/code-mode 传图**（PR #2252）：新增 `packages/acp/acp/src/content.ts`（只收 png/jpeg/webp/gif + canonical base64，模型须声明 `inputModalities` 含 image）；MCP 结果含图先 decode/预检/写 attachment 再投影 `ContentBlock`；attachment 新增批量 `saveImages` 与封闭类型 `AttachmentErrorCode` / `isImageAdmissionError`；code-mode 子工具带图结果经父结果延后带回，不再被 JSON-only binding 丢弃。
3. **DeepSeek `reasoningEffort` 增加 `low`**（PR #2549）：联合从 `'off'|'high'|'max'` 扩为 `'off'|'low'|'high'|'max'`；默认仍 `high`；穷举该联合的配置 UI/校验会漏。
4. **ReplayEnvelope**（PR #2596）：`finish.replayState` 从扁平 `unknown` 收成 `ReplayEnvelope { response; blocks? }`，max-token 裁块时同步丢不能安全执行的 tool-call；旧扁平 replay 降级、不再永久 `INVALID_REPLAY_STATE`，但形状不保证兼容（类型收紧，非静默兼容）。
5. **产品 subagent 预设**（PR #2374）：`enableRunInBackground: false` → `backgroundMode: one-shot`（字段两者并存，schema 未删）；默认仍前台，但模型可显式 `run_in_background: true` 拿 Job id；后台回执文案 `task` → `job`；`AggregateError`（启动+回滚失败）不再误报 `killed`。
6. **持久 bash 不再劫持 PS1**（PR #2586）：删除 `__DSH_PERSISTENT_BASH_PROMPT__` / `stripPrompt`，改看 `result.waitReason === 'stdin_read'`；主要影响 Linux/macOS 实验壳，Windows 默认 pwsh 不受影响。
7. **大历史分页**（PR #1371）：`Math.min(event.seq, ...sources)` 改手写循环，`sourceEventSeqs` 很大时不再炸调用栈；RPC 形状不变。
8. **`node-pty` 精确钉到 `1.2.0-beta.15`**（PR #2517）：`^1.1.0` → 精确版本，patch 同步更换；桌面原生 pty 重建要带新 patch 与 beta 预编译（发行闭包变化，非 JS API）。
9. **UI 文案/交互（非协议）**：英文 Code preset 文案 `Code mode` → `PTC mode`（preset id 仍是 `code`，PR #2559）；问用户卡片可折叠（#2308）；Safari textarea 软换行（#2504）；Cordis 面板点击外部关闭（#2527）。

### 明确没变的 fork 接触面（`git diff fb826987..99f6f02f`）

- `apps/cli/src/args.ts`（Marisa 的 `dsh web --profile` 补丁要重放）、`web.ts`、`bin.ts` 均未动。
- `packages/host/webserver`：公开 rc6 **已经**用 `webServer` 服务名 → `docs/upstream-diff.md` 里「额外提供旧名 `webServer`」对照的是 Marisa 自己的 `4e7fb95f` 快照，不是公开 rc6；同步到公开 rc6/rc7 时该补丁应重新判断能否删除。
- CLI 包依赖名集合 rc6/rc7 相同，无新增必装运行时包。

### 三棵树与「0808」之争的最终表述（会话末结论）

| 账本字段 | 值 | 含义 |
|---|---|---|
| `dshVersion` | `0.1.0-rc.6` | 兼容 / 依赖面：根 `package.json` 为 `^0.1.0-rc.6`，MyGO 锁 `0.2.0-rc.6` |
| `baseline` | `4e7fb95f` | 实际 vendored 进 `harness/` 的 git 对象 = `Private DSH snapshot 20260808T121140Z`（2026-08-08 12:11 UTC），**不在公开 GitHub 历史** |

- 「Marisa 是 rc6」——对：兼容版本、npm 依赖、插件停用理由都按 rc6 记账。
- 「`4e7fb95f` 是 8 月 8 日私有快照」——也是事实：比公开 rc6（`fb826987`，08-13）早 5 天，包布局还是 `bash/compact/pty/tasks`（官方 rc6/rc7 已是 `shell/compaction/terminal/jobs`）。
- 从这棵 `harness/` 跳到 rc7，中间还隔着**从未进过本仓的整段公开 rc6 发布面**——「升到 rc7」不是升一个 RC。
- 包名对照（0808 私有快照 vs 官方 rc6/rc7，**不是** rc6→rc7 的差）：`dsh-bash→dsh-shell`、`dsh-compact*→dsh-compaction*`、`dsh-pty*→dsh-terminal*`、`dsh-tasks*→dsh-jobs*`、`dsh-frontend→dsh-web-frontend`、`dsh-client-ui-slash→dsh-client-ui-input-trigger`、`dsh-repeat-tool-guard→dsh-repeat-tool-reminder`。

### 升级清单（会话记录的事实，未执行）

同步到公开 rc7 时逐项看：① 插件/MyGO 是否仍按 `id`+`order` 注册 settings 卡；② 写死 `settings-not-exposed` 或 Host 白名单的补丁；③ profile 里的 `enableRunInBackground`；④ 自研 LLM adapter 对 `replayState` 的假设；⑤ DeepSeek 设置 UI 是否露 `low`；⑥ Windows 原生 `node-pty` 重建与 pnpm patch；⑦ `docs/upstream-diff.md` 现有补丁逐项判断（`--profile` 必重放、`webServer` 别名可能可删、client 模块名映射/toolview/tsconfig 裁剪对照新树）；⑧ 因「rc6 API/时序」停用的插件（`multimedia-webui-input`、`dsh-llm-fallbacks`、`yet-another-subagent`、`dsh-diff-viewer`、`dsh-sonar`、`dsh-track`）须在公开 rc7 上重测，不能沿用对 `4e7fb95f` 的结论。

## 关联文档

- `docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md` —— 本会话直接产出（一手 refs、PR 时间线、9 项差异、升级清单）
- `docs/upstream-diff.md` —— 基线记录（会话时为 rc6/`4e7fb95f`；会话后 2026-08-18 已更新为 rc7/`99f6f02f`）
- `docs/rc7-plugin-compatibility.md` —— rc7 插件兼容评估清单（2026-08-18，承接本会话第⑧项）
- `docs/upstream-sync.md` —— harness 新 rc 同步流程（7 步，含 LTS 分支策略）
- `docs/sessions/README.md` —— 会话纪要索引（本文件条目）
- `maintenance/upstreams.json` —— harness pin 账本（会话后已推进到 rc7）
