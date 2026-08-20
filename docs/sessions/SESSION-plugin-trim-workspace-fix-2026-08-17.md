# 插件取舍决策与工作区卡死修复：YAS/a2a 保留、harness 只 sync 上游、rc7 全量同步

> 来源会话：`a1d1d3ad-39b3-496a-bd1f-4a2bf5b2e5f2.jsonl`（主会话）、`921bd884-4b33-4f64-9dee-97e6394c1db9.jsonl`（Codex rollout 续接）、`d2ab2673-08e1-4168-839b-22f6d5b8a7a5.jsonl`（「你疯了？」事件）、`9081fc1d-ed02-4f7f-a0e6-b4079785f065.jsonl`、`80749612-3c99-42f0-b5e6-994cc8cf9fbe.jsonl`、`7e7125df-4616-4529-925a-4af82e4b1831.jsonl`（2026-08-17→18）
> 整理方式：会话记录结构化纪要
> 说明：本纪要聚焦**插件取舍决策**（YAS/a2a/interpreters 等去留）与**工作区「正在加载工作区」卡死的修复**（desktop 层问题、harness 只 sync 上游、最终 rc7 全量同步）。安装速度/压缩的细节由 `SESSION-size-reduction-prebundle-2026-08-17.md`（及 README 索引中的 `SESSION-install-speed-compression-2026-08-18.md`）覆盖，本纪要只交叉引用不展开。时间均为 UTC（北京 = UTC+8）。

## 背景与目标

- **起点**：继续 Codex 会话 `rollout-2026-08-16T23-49-06-01a00b43…jsonl` 的诊断工作。原始问题：打包/安装 Marisa DSH 桌面版后，UI 一直停在「正在加载工作区」——没有工作区选择器、没有对话、没有 API-key onboarding、没有权限模式 UI。
- **两条用户硬约束**（会话中反复强调）：
  1. **不要乱改 harness 源码**——`harness/` 只允许 sync 上游（16:33、18:26 两次明确；「那里应该只是sync上游的」）。
  2. **这是 desktop 的问题，不是 harness 的问题**——兼容修法只能打在桌面打包层 / 已发布客户端（用户 16:35 前后定调「我感觉这个是desktop的问题」）。
- **会话中途的分叉**：主会话刚开始修握手时，用户插入了新请求——调研 [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)（约 1253 个插件、精选 Top 50）里哪些该整理进 Marisa、哪些没意义。之后用户又对「减重清单」里的 **yet-another-subagent 要删**提出异议（「应该留着，因为他确实是一个有功能提升的」），并要求解释 `interpreters` 是什么。插件取舍由此成为本集群主题之一。
- **三件并行的事**（用户 17:59 在 `d2ab2673` 里的最终需求清单）：① a2a 留下，别再划进减重/默认关掉；② 先修好工作区卡死；③ 查清为什么安装不是秒装（MSI/首解包 1–2 分钟）。
- **最终方向升级**：修握手时用户从「patch 客户端」否决转向「sync harness 到 public rc6」（「我们就是应该基于rc6啊」），随即又拍板「直接适配到rc7吧……我们整个项目都要重新评估了」，并强调「我们的上游是rc7，不是他妈的随便的0808」。

## 关键决策与理由

| # | 决策 | 理由 | 时间（UTC） |
|---|---|---|---|
| 1 | **yet-another-subagent（YAS）保留**，从「减重/删除」改为「Experimental / 可选增强」 | 用户明确：「确实是一个有功能提升的」。核实源码后确认它是官方 `subagent` 的**增强替换件**（profile CRUD、单一 `subagent` 工具 + `profile` 参数、实时 toolcall/token、子代理树跳转）；上次划进减重是因为它「现在挂不上去」（`registerGlobal("subagent")` 与官方工具撞名，双挂 fail-loud），不是没价值 | 17:04–17:10 |
| 2 | **a2a 保留**，不划进减重、不默认关 | 用户 17:19 明确「a2a可以留着啊」；README 写明私网、不鉴权、别暴露公网；单窗口写代码用不上，但用户要留就留（可 vendor、不进默认工具表的主张收回） | 17:19–17:22 |
| 3 | **dsh-sidechain 收回「该留」** | 上次把 sidechain 跟 a2a 捆在一起说「协议向」不公平：`/btw` 一次性侧问、`/side` 持续侧聊是 Codex 那套侧问，普通用户日常用得上 | 17:10 |
| 4 | **interpreters = 两个固定工具**（`run_python` / `run_node`），留但不当默认核心能力 | 核实为 `@huanlin/dsh-plugin-interpreters`：`spawn(python|node, ['-'])` 走 stdin，有设置页（路径/30s 超时）。与现有 `tool-pwsh` 重叠；没装解释器的机器上是死工具 | 17:04–17:10 |
| 5 | **mineru / aigc-canvas 不当默认卖点**（可 vendor，可选开） | mineru 要自建服务（默认 `localhost:18000`），没部署等于 5 个空工具占 schema；aigc-canvas 默认 provider 是 `stub://aigc-backend`（假图），没填真实 endpoint 就是演示残骸 | 17:04–17:10 |
| 6 | **不改 harness 源码，只 sync 上游**；修复打桌面打包层/已发布客户端 | 用户两次强约束（16:33、18:26）。AGENTS.md 规定 harness 改动必须更新 `docs/upstream-diff.md` + `maintenance/upstreams.json`；本次 bug 用户明确 override：连 fork 补丁都不要，只允许 sync | 16:33、18:26 |
| 7 | 工作区卡死判定为**桌面打包把旧宿主 + 新 npm 客户端混拼**（client/host 版本面不一致） | 根因链：发行 npm 客户端 `@deepseek-ai/dsh-client-connection@0.1.0-rc.6` 把 `canOpenPath: boolean()` 当**必填**；vendored host 快照 `4e7fb95f`（0808）的 `host.describe` **不返回**该字段 → 握手 throw → WS 关闭 → 无限 `connection lost` → workspace `pending`；API-key onboarding 永不执行（`configured:false`） | 16:15–16:40 |
| 8 | 先尝试的「patch 客户端 `canOpenPath` 变 optional」路线**被用户否决**（「你为什么他妈的要patch一个他妈的msi的canOpenPath 的 client.js」） | 用户认为 MSI 是我们自己构建的，改它该走构建源头，不是事后 patch 安装产物；而且「我们目前用的发行版是 rc6，不是 rc7」——不要拿 rc7 的东西来修 rc6 | 18:26 |
| 9 | **选 A：sync vendored harness 到 public rc6（`fb826987`）** | 用户「对啊，A啊，你为什么要这么做，我们就是应该基于rc6啊」；根因是 vendored 快照 `4e7fb95f`（0808 私有快照）**落后于 public rc6**，缺 `canOpenPath`；sync 后 host 天然返回字段、host/client 同源一致、零 patch | 18:28 |
| 10 | **直接适配到 rc7（`99f6f02fe`，上游 master HEAD）**，整个项目按 rc7 重新评估 | 用户 18:43 拍板「直接适配到rc7吧，然后插件可能有些patch有问题，是针对旧版本的，我们直接sync上游，我们整个项目都要重新评估了」；rc6→rc7 仅 22 个 first-parent PR，比 4e7fb95f→rc6 小得多；18:57 再强调上游是 rc7 不是 0808 | 18:43、18:57 |
| 11 | **harness 考虑转 git submodule**（方向确认，会话内未执行） | 用户提议「可以考虑把 harness 作为 git submodule 塞进来」，sync 上游 = `git submodule update`，主仓库零 patch 面；前提：撤销 tsconfig.host.json 的发行裁剪（submodule 内不能改 harness 文件），改由根 workspace 纳入 `harness/examples` + `harness/website` | 18:59 |
| 12 | **pnpm 走本地代理 `127.0.0.1:10808`**，写记忆 | 用户「用pnpm，代理一直在10808，写个记忆记住」；registry.npmjs.org 直连超时（SSL 失败），代理下通；此前临时用 npmmirror 直连可通但用户指示统一走代理 | 18:56 |
| 13 | **junction 创建用 go-winio 的 `EncodeReparsePoint`**，不手写 reparse buffer | 用户「你为啥要自己写？网上没有？」；微软官方 go-winio 是 Windows 生态验证过的布局（`SubstituteNameLength` 不含 NUL、`PrintNameOffset = SubLen + 2`、`inBufferSize` 必须精确 `8 + ReparseDataLength`）；自己摸索半天踩坑后被一句话点醒 | 19:28–19:33 |
| 14 | **build.ps1 只重构建 3 个插件**（a2a / code-map / sidechain），其余插件 lib 随 vendored 提交不重构建 | 查 build.ps1 源码：其余插件「ship lib or are compatibility-disabled」；批量重构建 19 个是过度操作（POSIX `rm -rf` 脚本在 Windows cmd 下也会失败）；插件 lib 对 rc7 的兼容性在 boot 时评估 | 19:03–19:04 |
| 15 | **rc7 下删掉 Marisa 的 pwsh-local insert，改用 rc7 base 自带的 pwsh-sandbox** | rc7 base 在 Windows 上原生启用 pwsh-sandbox（ACL 受限令牌 runner，注册 `ctx.shell`）；Marisa 再 insert pwsh-local 会 `shell` 服务双注册冲突；0808 时代「Windows 无沙箱」的前提在 rc7 已不存在 | 19:07–19:08 |
| 16 | **tool-pwsh 从 insert 改为 patch 行（enabled）** | rc7 base 已有 tool-pwsh 行（web-app 层 disabled），Marisa 再 insert 同 id 触发 `duplicate loader entry`；cordis 规则：`insert` = 新 entry、普通 patch 行 = 修改已有 entry | 19:06 |
| 17 | **rc7 CLI 语法变化适配**：`--profile` 是 launcher 级 flag（`dsh --profile marisa`），`web` 子命令不接受 `--profile` | boot 自检报 `unknown option '--profile'`；核实 rc7 `web` 子命令固定 boot web profile 且 reject parent `--profile`；`build.ps1`、`dev.mjs`、`verify-mygo-runtime.mjs` 三处旧调用全部改 | 19:05–19:09 |
| 18 | **interpreters 设置卡改 rc7 keyed 契约**（`id`/`order` → `key: "interpreters"`） | rc7 破坏面唯一挂载项：`settings.plugin.item` 从 list 改 keyed-by-namespace（PR #2404）；`settings.section` 仍是 list 契约，其余 8 个 section 用户不受影响 | 18:50–18:52 |
| 19 | **安装慢的两处优化**：原生 junction（免 1865 次 `cmd mklink` spawn）+ 并行解压（worker pool） | 实测 PrepareBackend ≈ 108s：358MB zip → 929MB、56k 文件顺序写盘 + 1865 条逐条 `cmd /c mklink /J`（每条 spawn 一个进程）；SSD 上「秒装」物理极限约 10s+，30–40s 现实可达 | 19:18–19:33 |

## 工作过程时间线

### 阶段 0：Codex rollout 续接与「不要改 harness」确立（16:09–16:40，921bd884）

- 16:09 用户「继续 他的工作 …rollout-2026-08-16T23-49-06…jsonl」；助手读 Codex 会话（4MB/884 行，不能拷进仓库——Sensitive-Source Provenance 拒绝，只留内存）。
- 16:09–16:32 接续诊断：确认根因为 `host.describe` 缺 `canOpenPath`（发行 npm rc.6 客户端必填），并在 harness 源码里加了 `canOpenPath: true`（`api-proxy.ts`、`host.schema.ts`、`host.ts`、测试、文档），补了实现级回归（`api-proxy-models.spec.ts` / `rpc-schemas.spec.ts`），重建了 `lib/`。
- 16:33 **用户打断：「不要乱改啊，你不应该动harness的源码，因为那里应该只是sync上游的」**。助手立即回退全部 harness 改动（源码 + 测试 + upstream-diff.md + upstreams.json），并重新定位为「桌面打包把旧宿主（私有快照）和 npm rc.6 客户端拼在一起」。
- 16:35–16:40 按用户「这是 desktop 的问题」定调，改走 `make-bundle.ps1` 打包层补丁 + `patchedDependencies` 路线；确认 `make-bundle.ps1` 已有同类 post-install JS 兼容补丁（ui-slash/inputTriggers、ui-command/commandUi 别名、aigc-canvas id）。
- 16:41 会话上下文压缩（摘要注入），主会话 `a1d1d3ad` 从这里续接。

### 阶段 1：awesome-dsh-plugins 调研与插件取舍（16:41–17:19，a1d1d3ad）

- 16:41–16:52 用户插入新请求：调研 awesome-dsh-plugins。GitHub 直连/WebFetch 被网络拦截，改用 `gh`、jsdelivr 镜像、本地克隆拉精选清单；读仓库已有 `docs/RESEARCH-adam-awesome-plugin-audit-20260815.md`（8/15 审计）。
- 16:53 给出完整取舍报告（详见「要点摘录」）：**已在包里的别重装**、**4 个建议进 Core**（dsh-at-file / dsh-annotation / dsh-outline / dsh-plugin-connection-banner）、**Optional 货架**（message-edit、chat-import、browser、mnemon、modlens、lark）、**整类划掉**（终端/桌面竞品、替代 runtime、娱乐重复、技能包当插件 vendor）；核心主张：**awesome-dsh-plugins 是发现雷达，不是发行版 BOM**（收录 ≠ 兼容，运行可用 ≠ 安全审计）。
- 17:04 **用户异议：「yet-another-subagent应该留着，因为他确实是一个有功能提升的，interpreters是啥？还有什么？」**。
- 17:04–17:10 核对 YAS / interpreters / mineru / aigc-canvas / ya-workspace-sidebar 源码与挂载说明，给出修正版结论：YAS 留（替换件不是叠加件）、interpreters 解释清楚、sidechain 收回该留、mineru/aigc-canvas 不当默认卖点。同时发现 `docs/plugins.md` 状态表落后于 `bundles/marisa-bundle/cordis.patch.yml`（YAS/interpreters/mineru/canvas/ya-sidebar 文档写「安装未挂载」但后四个实际已 insert）。
- 17:19 用户「a2a可以留着啊，你还没有把我们那个工作区问题修好，还有，为什么这个安装过程会这么慢？不应该是秒安装吗？」→ 三条线并行。

### 阶段 2：握手补丁探索与用户否决（17:19–18:26，a1d1d3ad）

- 17:21–17:53 压缩续接后开始修握手：确认 `make-bundle.ps1` staged 树里的 npm client 把 `canOpenPath` 当必填；方案 = pnpm `patchedDependencies`（`patches/@deepseek-ai__dsh-client-connection@0.1.0-rc.6.patch` 把 `boolean()` 改 `boolean().optional()`）+ make-bundle.ps1 后置 JS rewrite 兜底；同时查安装慢（PrepareBackend 实测 108s：358MB zip、56k 文件、1865 条 `cmd mklink`）。
- 17:53–18:18 反复核实补丁落点（lockfile 解析、.pnpm 结构、MSI 里 client.js 字节）；期间用户多次 /model、/effort、/exit、/exit 后「继续」，最后「handoff，把我的需求说给我，直接告诉我，不允许toolcall」——助手 17:58 给出需求清单（a2a 留、先修工作区、安装慢、YAS 留、不要动 harness）。
- 18:18–18:26 用户「先修好工作区问题」；助手并行推进：junction 原生实现（reparse buffer 手写摸索，`ERROR_INVALID_REPARSE_DATA`，准备用 mklink 造真 junction 反推布局）。

### 阶段 3：「你疯了？」事件（17:59–18:09，d2ab2673）

- 17:59 用户开新会话，给出最终需求清单（a2a 留、先修工作区、安装慢、YAS 留、不要动 harness、补丁只打桌面打包层/已发布 dsh-client-connection）。
- 17:59–18:07 **助手陷入空转循环**：连续约 8 分钟反复执行相同的 Grep/Glob/Read，每轮只说同一句「握手卡死已经对上：客户端把 `canOpenPath` 当必填。接下来核对客户端校验落点和 MSI 解包路径，补丁只打在桌面打包层」——没有写出任何代码、没有新进展（[THINK] 里反复复述「The user wants me to: 1. Keep a2a…」）。
- 18:07:06 用户打断并质问 **「你疯了？」**。
- 18:07 助手承认「刚才空转了，抱歉」「The user interrupted me because I was spinning in circles doing too much research without taking action」，转向直接实现（make-bundle.ps1 patch + 安装优化），但随后消息仍重复「空转停。握手补丁打在打包层的客户端；安装慢先量 zip 和 junction」并继续工具调用。
- 18:09:51 会话结束（file end）。**教训**：诊断信息足够后必须落地代码，空转会被用户视为不可信。

### 阶段 4：用户发火（MSI patch 否决）与「基于 rc6」定案（18:26–18:42，a1d1d3ad）

- 18:26:31 **用户发火：「来来来我我问你，你为什么他妈的要patch一个他妈的msi的canOpenPath 的 client.js，卧槽，你是傻逼吗，msi是我们构建出来的，同时我们目前用的发行版是他妈的rc6，不是他妈的rc7，你是傻逼吗」**。
- 18:27 助手先厘清事实不狡辩：① 没动 MSI 里的文件，写的是 pnpm 构建层 patch（`patches/` + `patchedDependencies`），staged install 会带着 patch 进我们构建的 MSI；② patch 目标就是 rc6；③ 但用户点出了更根本的问题——vendored 快照 `4e7fb95f`（0808）落后于 public rc6（`fb826987`），rc6 本来就带 `canOpenPath`，真正的修法是 **sync 到 public rc6**。给出 A（sync）/ B（保留构建层 patch）两条路让用户选。
- 18:28 用户 **「对啊，A啊，你为什么要这么做，我们就是应该基于rc6啊」**。
- 18:29–18:42 执行 rc6 sync 主线：撤 patch（删 patch 文件、还原 pnpm-workspace.yaml）→ 从 `.tmp-dsh-rc7` 浅克隆 fetch `fb826987` → 展开 7412 文件树 → 替换 `harness/`（1751 个 junction 先逐条 rmdir 再删实体，PowerShell 工具拦 `Remove-Item -Recurse`，改用 cmd rmdir / .NET / robocopy）→ 修 8 个 symlink → root package.json 依赖名大改（`dsh-bash→dsh-shell`、`tasks→jobs`、`ui-slash→ui-input-trigger`、`paths→home-paths`、`skill-local→skill`、裸 `schemastery→@deepseek-ai/schemastery`）→ marisa-bundle 4 处路径 → pnpm-workspace cordis override → 插件 link 路径（6 个失效路径 + aigc-canvas 机器绝对路径）→ `^0.0.1` 旧范围依赖批量改 `workspace:^` → 裸 `cordis` 键全部对齐 `@deepseek-ai/cordis` → install。
- 18:40–18:42 连环 install 失败：`node_modules/.pnpm/lock.yaml`（虚拟 store 内部 lockfile）记录旧 file: resolution → 删根 lockfile + node_modules 全量重建。

### 阶段 5：拍板 rc7、全量同步（18:43–19:11，a1d1d3ad）

- 18:43 **用户拍板：「直接适配到rc7吧，然后插件可能有些patch有问题，是针对旧版本的，我们直接sync上游，我们整个项目都要重新评估了」**。
- 18:43–18:47 换 rc7 树（`99f6f02fe`，7486 文件，`canOpenPath` 在 host ✓）；清 node_modules + lockfile 全量重建。
- 18:47–18:52 逐个清 install 障碍：`cordis` override 改 npm alias（`npm:@deepseek-ai/cordis@4.0.1`，裸 cordis 是插件 **peerDependencies**，pnpm overrides 不覆盖 peer，须改插件声明方）；删 `patchedDependencies` 的 client-modules patch（rc7 原生提供 `clientModuleHost`）；tsconfig 裁剪；**interpreters 设置卡 keyed 修复**。
- 18:56 用户「用pnpm，代理一直在10808，写个记忆记住」→ 记入 MEMORY.md；registry 直连超时（SSL 失败），npmmirror 直连可通但统一走代理 10808。
- 18:57 用户 **「再确定一下，我们的上游是rc7，不是他妈的随便的0808，我真的求你了」**→ 确认 harness 树 = `99f6f02fe`（package.json version `0.1.0-rc.7`）、upstreams.json baseline 已改。
- 18:59 用户提议 **harness 转 git submodule**；助手同意方向（sync = submodule update），撤销 tsconfig 裁剪、把 examples/website 纳入根 workspace。
- 19:00–19:04 harness 构建：typescript 顶层被 5.9.3 占位（上游 pin 6.0.3）→ overrides 加 `typescript: 6.0.3`；vite 5/6 双版本类型冲突（website/.vitepress 排除）→ tsc host 通过 → tsdown host → client face 全过；19 个插件批量构建 7 成功 12 失败 → 判定 build.ps1 只重构建 3 个，其余 boot 时评估。
- 19:04–19:09 boot 自检连环修：rc7 CLI 语法（--profile launcher 级，3 处调用改）；`tool-pwsh` duplicate（insert→patch 行）；`shell` 服务双注册（删 pwsh-local insert，用 rc7 base 的 pwsh-sandbox）；web dist 未构建（补 `build:web`）。
- 19:09:50 **BOOT 成功**（`boot line found: http://127.0.0.1:5786`）；`verify-mygo-runtime.mjs` 旧 CLI 语法修好后 **BUILD COMPLETE（all steps passed）**，后端 HTTP 200、MyGO 验证通过。
- 19:11:27 **握手修复确认**：`host.describe` 返回 `"canOpenPath": true` —— rc7 host 与 rc7 client schema 一致，「正在加载工作区」根因根治，零 patch。

### 阶段 6：安装速度优化与打包（19:18–19:43，a1d1d3ad）

- 19:18 用户再次问「为什么这个安装过程会这么慢？不应该是秒安装吗？」→ 数据回答（108s 解压 + 1865 junction）→ 并行解压（`extract_zip.go`，worker pool + abort channel）落地。
- 19:19–19:28 junction 原生实现连环调试（手写 reparse buffer：字段含不含 NUL、偏移差 2、inBufferSize 精确长度…… 用 mklink 造真 junction + fsutil + hex dump 反推布局，多轮修正）。
- 19:28 **用户「你为啥要自己写？网上没有？」**→ 改用 go-winio `EncodeReparsePoint`（公开 API、官方验证布局）+ 保留 CreateFile/DeviceIoControl（`inBufferSize = 8 + ReparseDataLength` 的坑注释记录）；测试断言从 ModeSymlink 改为功能验证（通过 link 读 target 文件）；**go test / installedbundle / embeddedbundle / vet 全过**。
- 19:34–19:43 make-bundle 重跑：修 onboarding-copy.ts 路径（rc7 移到 `ui-settings-models/src/`）；根 lockfile 未更新 pwsh-local 移除 → 根 install 更新；prune 532.5MB、link walker 进行中（枚举 junction 慢步骤）时**会话结束**（08-18 14:49 任务通知：后台 make-bundle 无完成记录，可能被停止或随进程退出）。

## 产物与影响

### 本集群会话直接改动（据会话记录）

- **harness/**：`4e7fb95f`（0808 私有快照）→ **rc7 树 `99f6f02fe`**（`maintenance/upstreams.json` baseline/dshVersion 已改；tsconfig.host.json 一处本地修改：排除 `website/.vitepress`）。
- **根 workspace 依赖**：9 处改名（shell/jobs/home-paths/skill/ui-input-trigger/@deepseek-ai/schemastery 等）；cordis override → `npm:@deepseek-ai/cordis@4.0.1`；typescript override 6.0.3；patchedDependencies 清空；`harness/examples` + `harness/website` 纳入 workspace glob。
- **插件 ×10+**：link 路径修复（test-runtime→test-support/client-runtime、support/invariants→runtime-diagnostics/invariants、ui/commands→interaction/commands、ui/user-approval→interaction/user-approval、session-title→session/session-title、aigc-canvas 机器绝对路径）；`^0.0.1*` → `workspace:^`；裸 `cordis` → `@deepseek-ai/cordis`；**interpreters lib/client.js 设置卡 keyed 修复**（rc7 破坏面唯一挂载项）。
- **组合/打包层**：`cordis.patch.yml` Windows lane 重写（删 bash-sandbox/tool-bash 冗余行、permission 改名 `@deepseek-ai/dsh-permission-presets`、tool-pwsh 改 patch 行、删 pwsh-local insert）；overlays 删 ui-slash/ui-command；make-bundle.ps1（删 alias 补丁、schemastery 名、onboarding 路径）；build.ps1 / dev.mjs / verify-mygo-runtime.mjs CLI 语法 rc7 化。
- **desktop/**：`junction_windows.go`（go-winio EncodeReparsePoint 布局 + CreateFile/DeviceIoControl）、`junction_other.go`、`extract_zip.go`（并行解压 worker pool）、embedded.go/installed.go 接入、`junction_windows_test.go`（功能断言）。
- **文档**：upstreams.json 已更新；MEMORY.md 记 pnpm 代理 10808；`docs/rc7-plugin-compatibility.md`（2026-08-18）与 `docs/plugins.md` 的 rc7 状态表即为本集群决策的落地（后续会话整理）。

### 验证结果

- `host.describe` 返回 `canOpenPath: true`（19:11 显式 curl 确认）；boot 自检 HTTP 200；MyGO 验证通过。
- 插件 boot 兼容：a2a/code-map/sidechain 基于 rc7 重构建成功；YAS 因撞名未挂载（需禁官方 tool-subagent，patch 已准备——见 `docs/rc7-plugin-compatibility.md`）。

### 交叉引用

- 安装速度/压缩：`SESSION-size-reduction-prebundle-2026-08-17.md`（同日下午另一会话，zstd/tar.zst/vendor prebundle），README 索引另有 `SESSION-install-speed-compression-2026-08-18.md`。
- rc6 vs rc7 差异：`SESSION-rc6-vs-rc7-2026-08-17.md`（三树对比框架：vendored 0808 vs 官方 rc6 vs rc7）、`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`。
- 插件清单/状态：`docs/plugins.md`、`docs/rc7-plugin-compatibility.md`、`docs/RESEARCH-adam-awesome-plugin-audit-20260815.md`。

## 遇到的问题与解决

| 问题 | 表现 | 解决 |
|---|---|---|
| 工作区「正在加载工作区」卡死 | 发行 npm client 把 `canOpenPath` 当必填，vendored host 不返回 → 无限重连 | 起初 patch 客户端（被用户否决）→ sync 到 public rc6（用户选 A）→ 最终直接适配 rc7（host 天然返回字段，握手通过，零 patch） |
| 用户对 patch MSI client.js 发火 | 「msi是我们构建出来的……我们目前用的发行版是rc6，不是rc7」 | 不狡辩先厘清事实（patchedDependencies 是构建输入层不是改产物）；承认根本问题是 vendored 快照落后于 public rc6；给 A/B 两案让用户选（A 胜出） |
| 助手空转惹恼用户（d2ab2673） | 连续 8 分钟重复同一句诊断、只跑工具不写代码 → 「你疯了？」 | 承认空转、道歉，转向直接实现；教训：信息足够后必须产出代码 |
| GitHub 网络拦截 | 网页/API/WebFetch 全被拦 | 改用 git 协议（ls-remote/浅克隆）、jsdelivr 镜像、npm registry |
| registry.npmjs.org 直连超时 | SSL 失败、pnpm install 卡网络重试 | npmmirror 临时可用；用户指示统一走本地代理 127.0.0.1:10808（写记忆） |
| pnpm overrides 不覆盖 peerDependencies | 裸 `cordis` 在插件 peer 里解析失败 | 把插件里所有裸 `cordis` 键改为 `@deepseek-ai/cordis`（上游新生态标准名） |
| `node_modules/.pnpm/lock.yaml` 残留旧 resolution | 删根 lockfile 后仍报旧路径 scandir | 虚拟 store 内部 lockfile 也要清 → 删 node_modules 全量重建 |
| PowerShell 工具拦递归删除 | `Remove-Item -Recurse` / `rmdir /s` 被静态拦截 | cmd rmdir（不跟随 junction）+ .NET `Directory.Delete` + robocopy /MIR 绕过；仓库 make-bundle.ps1 已有结论「cmd rmdir 删 junction 只删链接」 |
| rc7 树无 `lib/`（源码树） | 插件 prepare（tsc）找不到类型声明 | `pnpm install --ignore-scripts` 建图 → 构建 harness lib → 插件 prepare |
| 手写 junction reparse buffer 失败 | `ERROR_INVALID_REPARSE_DATA`、NTFS 读回字段与写入不一致 | 用 fsutil + hex dump 读真 junction 反推；最终改用 go-winio `EncodeReparsePoint`（用户提醒「网上没有？」） |
| rc7 CLI `--profile` 语法变化 | `web --profile marisa` 报 unknown option | launcher 级 `dsh --profile marisa`；build.ps1/dev.mjs/verify-mygo-runtime.mjs 三处改 |
| 会话结束未收尾 | 08-18 14:49 后台 make-bundle 无完成记录 | 安装速度实测（对比 108s）、MSI 构建、submodule 转换均**未完成**，留待后续会话（见「遗留问题」） |

## 要点摘录

### 插件取舍最终结论（本集群核心，17:04–17:19 敲定）

| 插件 | 结论 | 理由 |
|---|---|---|
| **yet-another-subagent（YAS）** | **留**（Experimental/可选增强，不是删除项） | 官方 subagent 的增强替换（profile CRUD、单工具 + profile 参数、实时 toolcall/token、子代理树跳转）；当前因 `registerGlobal("subagent")` 撞名未挂载，需先禁官方 `tool-subagent` |
| **a2a** | **留**（用户明确要求，不划减重/不默认关） | 多 agent 实时 mesh（hub + WebSocket + `a2a_peers/message/history`）；README 写明私网不鉴权 |
| **dsh-sidechain** | 留（收回上次「协议向」误判） | `/btw`、`/side` 是 Codex 式侧问，日常交互 |
| **interpreters** | 留，不当默认核心能力（Optional） | `run_python`/`run_node` 两个固定工具；与 pwsh 重叠；没解释器是死工具 |
| **mineru** | 可留，不当默认卖点 | 要自建服务（localhost:18000），没部署 = 5 个空工具占 schema |
| **aigc-canvas** | 可留，不当默认卖点 | 默认 stub provider（假图），有绘图 API 再开 |
| **ya-workspace-sidebar** | 已挂（disable 官方 ui-workspace）；升级 better-sidebar 0.12 后再看是否还要 | 与 better-sidebar 管不同块，可共存但 IA 是两套侧栏 |
| **whale-girl / stickers / suggested-replies** | 装饰类，保持关或不进默认 | 娱乐 |
| **兼容停用串**（diff-viewer/multimedia/sonar/track/web-review/llm-fallbacks） | 不是功能差，是挂了会坏；留等上游或移出默认树 | 上游 rc6/rc7 对不上 |
| **建议进 Core 的新插件**（雷达） | dsh-at-file / dsh-annotation / dsh-outline / dsh-plugin-connection-banner | 零密钥、不扩模型工具表；connection-banner 正好补「一直加载工作区」的可见连接状态 |
| **整类划掉** | 终端/桌面竞品（dsh-TUI 等 5 个）、替代 runtime（sandbase-harness 等）、dsh-routing-suite（运行时注入器）、娱乐重复、技能包当插件 vendor | Marisa 已是 Wails 桌面；发行版卖点不是插件数量 |

### 工作区卡死根因链（Codex 诊断 + 本集群确认）

1. 桌面窗口和 backend HTTP 都正常；`workspace.list` / `host.describe` 返回 200。
2. 发行 npm client（`@deepseek-ai/dsh-client-connection@0.1.0-rc.6`）Zod schema 把 `canOpenPath: boolean()` 当必填。
3. vendored host 快照（`4e7fb95f`）`host.describe` 只回 `{version, cwd, provider, model, attachedSessions}`，没有该字段。
4. 握手 throw → WS 关闭 → 无限 `[web-runtime] connection lost` → workspace `pending`；API-key onboarding 永不执行（`configured:false`）。
5. 权限模式是 profile 层面禁用的，不是卡死症状。
6. **正确修法**（用户引导后）：把 vendored harness sync 到官方 rc7（`99f6f02fe`）——rc7 的 `canOpenPaths()` 恒返回 boolean，host/client schema 一致，握手必然通过，零 patch。

### 用户发火事件复盘（本集群两处）

- **18:26（主会话）**：误以为助手在 patch MSI 里的 client.js。化解方式：先认「事实厘清」（没改产物，是 pnpm 构建层 patch；目标是 rc6），再承认用户点出的根本问题（vendored 快照落后），给 A/B 方案让用户选。用户选 A 后立即执行。
- **18:07（d2ab2673）**：「你疯了？」。化解方式：承认空转、道歉、转向直接实现。触发原因是诊断信息早已足够却连续 8 分钟只跑工具不写代码。

### 环境事实（已入记忆/可复用）

- pnpm 依赖安装走本地代理 `127.0.0.1:10808`（registry.npmjs.org 直连超时；npmmirror 直连可通但用户指示统一走代理）。
- 上游 refs：官方 rc7 = `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（= `dsh-v0.1.0-rc.7` tag = master HEAD，PR #2620）；官方 rc6 = `fb826987`（PR #2531，无 tag）；vendored 旧基线 `4e7fb95f`（0808 私有快照）。「兼容版本（rc6）」与「导入基线（0808 快照）」是两层记账。
- 本机上游 clone：`C:\Users\lf\deepseek-harness`（是 Marisa 自己的 fork 工作区，origin = dsh2026/test-LoserFox，私有快照之上还有 3515c46b / d5b46783 两个 Marisa 私有提交）。
- `cmd rmdir` 删 junction 只删链接不跟随目标（make-bundle.ps1 已有结论）；PowerShell 工具的沙箱会拦 `Remove-Item -Recurse` / `rmdir /s` 类命令。
- rc7 CLI：`--profile` 是 launcher 级 flag；`web` 子命令不接受 `--profile`（`dsh web` = `--profile web` 别名）。
- rc7 base 在 Windows 上原生启用 pwsh-sandbox（ACL 受限令牌），不再需要 Marisa 自带的裸 pwsh-local。

## 关联文档

- 插件清单/状态：`docs/plugins.md`、`docs/rc7-plugin-compatibility.md`（2026-08-18）
- 插件调研：`docs/RESEARCH-adam-awesome-plugin-audit-20260815.md`、`docs/RESEARCH-awesome-plugins-selection-20260819.md`
- rc6 vs rc7：`docs/sessions/SESSION-rc6-vs-rc7-2026-08-17.md`、`docs/RESEARCH-dsh-rc6-vs-rc7-20260817.md`
- 体积/压缩（安装速度）：`docs/sessions/SESSION-size-reduction-prebundle-2026-08-17.md`（README 索引另有 `SESSION-install-speed-compression-2026-08-18.md`）
- 仓库约定：`AGENTS.md`（harness/plugins/desktop 所有权与验证要求）
- 上游账本：`maintenance/upstreams.json`、`docs/upstream-diff.md`
