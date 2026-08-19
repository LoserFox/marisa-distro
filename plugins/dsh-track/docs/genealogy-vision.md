# 对话生长图：从会话历史长出「需求 x 决策 x 项目」图谱 —— 研究与方案

> 状态：研究完成（2026-08-16）· 对象：@fakechris/dsh-track（dsh-involute）· 性质：终局愿景拆解 + 落地提案
> 一句话：把「用户说过的话 -> 执行过程 -> 代码落地」整条链建成一张可追溯、可生长、可多维切片的图，以 DSH 自己的会话日志为唯一事实源（source of truth），在 dsh-track 上长出「需求基因树」。

## 0. 终局模型（先把愿景翻译成数据模型）

愿景可以拆成四个层次，全部落在同一张图上：

| 层 | 实体 | 现有数据（已验证存在） |
|---|---|---|
| L0 源头 | 用户说的话（user request / message） | ~/.dsh/sessions/<workspace>/<session-id>/session.jsonl.zstd，事件流含 user/message（带 data.id，可精确定位） |
| L1 过程 | turn / step / tool call / todo(plan) / goal / 决策点 / 子代理 / 压缩(compaction) | 同一日志的 turn/start·end、step/start·end、tool/call·result、subagent/descriptor（含 parentSession，可还原子代理树）、agent/inbox/spliced（压缩） |
| L2 归纳 | Capture / Decision / Requirement(Issue) / Epic / Project(Team+Repo) | ~/.dsh/storages/track.json：captures 18 · issues 93 · epics 0 · links 0 · decisions 3（epics 与 links 表是空的——图边还没人写） |
| L3 产出 | 文件 / commit / PR / GitHub repo | git remote 可发现；workspace.json 已维护 workspace->sessionIds 索引 |

图的边（血缘/因果关系）是核心：derives（派生：做 A 时出 B）、realizes（实现）、provoked（触发）、answered-by（决策回答）、blocks、belongs（归属项目）、landed-in（落到哪个 commit/repo）。多维切面 = 在图上换视角：时间轴 / 项目树 / 生长树（一个需求如何从对话里长出来、如何派生出新项目，比如 DSH -> DSH track -> Harness OPS）。

## 1. 现状盘点：你手上已经有什么

1. 完整的事件日志：DSH 每个会话都是 session.jsonl.zstd（zstd 压缩 JSONL，无损），事件类型齐全（上面 L0/L1 已验证）。这是「最源头」的全部素材——用户说过的话一条都不少。
2. dsh-track 已建的半张图（src/types.ts）：
   - Issue：Linear 兼容，已有 parentId（父子）、promptMessageId（溯源到原始 prompt）、linkedSessionIds（一个需求跨多个会话）、teamId
   - Link：边类型 relates | blocks | derives | belongs —— 图模型已经设计好了，但 links 表 0 条，没人写入
   - Decision：决策账本，带 context、supersedesDecisionId（决策被推翻/演进）
   - Epic：Linear Project 形状，teamId + issueIds
3. sync v2 引擎（src/sync/*：normalize -> segment -> intent -> synthesize -> project -> align）：已经能从历史会话折叠出 issue 候选，支持 dry-run->确认->落库，增量游标，fork 检测（identity.ts）。它做的是「候选折叠」，不是「图生长」——没有跨会话/跨项目的 derives 边，没有父子生长树，没有产出物关联。
4. 面板：已有捕获墙 + 任务墙 + 「↩ 对话」跳回来源会话的原始 prompt（高亮定位）。

结论：数据、schema、纪律（dry-run 确认、证据驱动）都已就位；缺的是「把历史全部过一遍 + 写图边 + 画图」这三件事。

## 2. 外部扫描：谁在做类似的事

### 2.1 学术（vibe coding 过程研究，2025-2026 爆发）

- Agentic Consensus / Governable Consensus Layer（arXiv 2604.17883，https://arxiv.org/abs/2604.17883）：与你理念最接近的一篇。它指出「code + chat history」作为主导产物会维度坍缩（dimension collapse）：把复杂系统拓扑压平成低维文本，导致系统在变更下不透明。主张用一个 typed property graph（可操作世界模型 C）作为工程的一等产物，代码从 C 派生，用 Phi (realize) / Psi (rehydrate) 双向同步，证据直接挂到图上的结构主张。你要的「整个系统 source of truth」，学术界给出的答案正是 typed property graph。
- RECAP（ACL 2026 System Demo，https://aclanthology.org/2026.acl-demo.68/）：CMU（Tongshuang Wu 组）。VS Code 里被动录制 AI 对话 + 细粒度代码编辑，合并为统一时间线，交互式回放 + 可扩展分析层（行为分类、AI 依赖度）。课堂实测：41 名学生、2034 条 prompt、8239 次编辑。「单一数据源都不够，必须 merge 多源」的实证。
- VibeContract（arXiv 2603.15691，https://arxiv.org/abs/2603.15691）：把高层 NL 意图分解为显式任务序列，生成任务级契约（输入/输出/约束/行为性质），开发者验证契约并保持 traceability。契约是可被验证的中间产物。
- Beyond the 'Diff': Agentic Entropy（arXiv 2604.16323，https://arxiv.org/abs/2604.16323）：过程化可解释框架：conformity seeding + reasoning monitoring + causal graph interface，做 intent-level telemetry。直接回应「diff 看不到为什么」。
- The Case for Vibe Modeling（arXiv 2607.27923，https://arxiv.org/abs/2607.27923）：主张 NL 与代码之间应有一层保留人类意图的中间表示（学生调研支持）。
- Failure as a Process（2026-07，https://ubos.tech/failure-as-a-process-an-anatomy-of-cli-coding-agent-trajectories/）：CLI 编码 agent 轨迹的失败解剖框架，把失败当作时间过程而非二元结果。
- SE 传统线：requirements traceability（LLM 用于 traceability link discovery 的系统综述 https://national.finna.fi/Record/trepo.10024_229538、REFSQ 2025 Connecting Requirements with Developer Artifacts https://2025.refsq.org/details/refsq-2025-research-papers/18/Towards-Connecting-Requirements-with-Developer-Artifacts-in-a-Local-Context）——需求可追踪性是老问题，LLM 时代被重新激活。

### 2.2 产品（你要问的「entire」）

- Entire（entire.io，https://docs.entire.io/overview）：就是你说的 entire——前 GitHub CEO Nat Friedman 创办，$60M seed。CLI 挂 git 钩子捕获 Claude Code/Codex/Gemini/Pi 等会话，把 session 元数据（prompt/transcript/tool calls/files touched/checkpoint）存到独立分支 entire/checkpoints/v1，与 commit 绑定，web/CLI 可查。「Git shows what changed. Entire shows why.」还能 entire session resume 从任意 checkpoint 续跑。它对标你的「L1->L3 落地链」（session<->commit），但不做需求级归纳：没有「从对话里长出需求/决策」、没有跨项目分组、没有需求生长树。它把「为什么改」绑在 commit 上，你要的「为什么做这个需求、它从哪条对话长出来」它不覆盖。
- SpecStory（https://specstory.com/llms-full.txt）：「Intent is the new source code」。扩展/CLI 自动把会话存成 .specstory 下的 Markdown；Cloud 做跨工具搜索、分析、团队 Loop（所有 open thread 的实时视图）。文档化 + 搜索，非图。
- vibe-replay（https://github.com/tuo-lei/vibe-replay）：把 Claude/Cursor/Codex/OpenCode/Hermes/Pi 会话转成单文件交互式回放（每一步 prompt/思考/工具调用/diff 动画），另有本地 dashboard：活动热力图、成本、上下文窗口、缓存命中、工具分布。单会话复盘可视化，无需求归纳。
- VibeTrace（https://github.com/idvxlab/VibeTrace）：OpenCode 运行时仪表盘：action-flow 图（正交布局、分支分叉）+ todo<->transcript<->action 交叉链接 + 实时干预。执行过程图（实时），不做历史归纳。
- viz-vibe（https://marketplace.visualstudio.com/items?itemName=viz-vibe.viz-vibe）：Context Map Plugin for Vibe Coding：AI 维护项目根的 vizvibe.mmd（轨迹/决策/阻塞/TODO 的图），你只 review。轻量生长文件，靠 AI 持续维护，无自动回扫。
- VOPL（https://github.com/cgast/vopl）：受 Stephen Ramsay 启发的意图式可视化规格编辑器（组件图 + Spec-o-Meter 质量评分）。面向「写规格」，不是「回看历史」。

### 2.3 记忆层（你问的 mem0 这类）

- mem0（架构 https://raw.githubusercontent.com/mem0ai/mem0/main/skills/mem0/references/architecture.md）：对话 -> 单次 LLM 抽取事实 -> hash 去重 -> vector store + entity store（实体图谱做检索 boost）。做的是「事实级记忆」：记住偏好/事实/实体关系，没有需求/决策结构，不区分执行过程。
- Graphiti / Zep（https://help.getzep.com/graphiti/getting-started/overview）：为 agent 记忆建的双时态知识图谱（valid time + transaction time），Thoughtworks 雷达收录。存储模式值得借鉴：需求/决策会演进、被推翻，双时态能表达「当时是这么定的，后来改成了那样」。
- lhl/agentic-memory（https://github.com/lhl/agentic-memory）：agent 记忆研究的精选收藏集：memv（Nemori 风格 predict-calibrate 抽取 + episode 切分 + Graphiti 式双时态）、supermemory（记忆版本化链表 + 类型化关系 updates/extends/derives）、EverMemBench、StructMemEval（「agent 能否把记忆组织成树/账本/状态」的基准——和你「结构 vs 碎片」的痛点同源）。
- 结论：记忆层回答「记得住」，没人回答「长出来 + 看得见 + 跨项目」。它们把对话压成事实，你要把对话长成需求树——两层不同的抽象，可互相借鉴存储技巧（双时态、episode 切分、RRF 检索），但都不是你要做的事。

### 2.4 DSH 生态（awesome-dsh-plugin，https://github.com/awesome-dsh-plugin/awesome-dsh-plugin）——没人做过，但素材都在

图/可视化有人做，需求基因树没人做。最接近的：

- dfycaly98931680/dsh-trajectory-governance（https://github.com/dfycaly98931680/dsh-trajectory-governance）：把扁平 session log 重建为多分支轨迹树，检测循环死锁/无效重试/目标漂移 + 成本归因 + 独立 GUI 页签。执行层图的样板。
- YeqingTang/dsh-session-flow（https://github.com/YeqingTang/dsh-session-flow）：跨会话归档工作台：折叠时间线、子代理血缘、内容搜索、规则+LLM 摘要。
- chouyong/dsh-fork-graph（https://github.com/chouyong/dsh-fork-graph）：git 风格会话分叉图（谁从谁 fork）。
- bwndlct/dsh-session-audit（https://github.com/bwndlct/dsh-session-audit）：会话执行统计（步骤/工具调用/失败/重复/成本）。
- 记忆插件群（dsh-memoria 向量+图、Co-Engram、StrataGate、FuRongJun 时空记忆图、TMCRA 溯源图等）：都在做「下一轮更好」，不在做「把过去讲清楚」。
- fakechris/dsh-track（本插件）：唯一做任务级归纳的，但如上：没写图边。

## 3. 差距分析（一句话版）

| 你的维度 | 谁最接近 | 缺什么 |
|---|---|---|
| 全历史回扫（所有对话） | SpecStory Cloud / vibe-replay dashboard | 无人做需求级归纳，都是搜索/回放 |
| 需求/决策从对话长出 | 学术：VibeContract、Consensus Layer（理念） | 无产品实现「需求生长树」 |
| 图/树可视化 | VibeTrace（实时执行图）、dsh-trajectory-governance（轨迹树） | 无「需求<->决策<->执行<->代码」的跨层图 |
| 项目归纳与派生（A->B->C） | Entire（session<->commit） | Entire 只绑 commit，不归纳需求；无跨项目派生边 |
| source of truth 链（话->过程->代码） | Agentic Consensus（论文理念）、Entire（代码实践） | 无人把「用户话语」作为根节点的整链图 |

核心洞察：你想要的不是一个「更好的记忆插件」，而是把开发过程当作一份可查询的「系统族谱」（system genealogy）——学术界刚把概念题（Consensus Layer / typed property graph）出出来，产品界只做到「会话<->commit」（Entire）或「会话回放」（vibe-replay）。你在 DSH + dsh-track 上做，数据（完整事件流）、半张图（links/derives schema）、纪律（dry-run 确认）都是现成的，这是全球范围内几乎没有的落地位。（注：Consensus Layer 论文本身也只是 arXiv 预印本，无实现。）

## 4. 方案：在 dsh-track 上长出一张「需求基因树」

### 4.1 设计原则

1. 唯一事实源 = 用户话语：一切图节点必须能沿 promptMessageId -> (sessionId, seqRange) 跳回原文（track 已有此模式，扩展为通用 citation 字段挂在每个节点/边上）。LLM 只能「提议」，不能「发明」没有出处的东西。
2. LLM 提，规则落：LLM 做抽取/聚类/派生建议 -> dry-run 预览 -> 用户确认 -> 落库（沿用 track 的 triage 纪律）。图的权威性来自「可回溯 + 人确认」，不来自模型。
3. 增量 + 幂等：沿用 sync 游标；全历史回扫是「补一次」，日常是增量。
4. schema 兼容 Linear：节点/边继续用 Issue/Epic/Link 形状，将来可导出 Linear/其他。
5. 多维 = 同一张图换视角：不做三套数据，只做三种视图（时间轴 / 项目树 / 生长树）。

### 4.2 图数据模型（在现有 types 上增量）

节点（新增少量，其余复用）：
- 已存在：Capture、Decision、Issue(Requirement)、Epic、Session（link fromType 已有）
- 新增：Project（teamId 实体化：path + git remote，对应 DSH / Harness OPS / dsh-track 等）、CommitRef（可选，repo+sha）

边（Link.kind 扩展）：
- 已有：derives | relates | blocks | belongs
- 新增：realizes（需求->commit/文件）、provoked（需求<-用户话语）、answered（决策<-用户回答）、forked-from（项目/需求派生，做 A 时出 B）

现有表状态：links: 0 -> 启用写入是本方案第一个动作。

### 4.3 管线（三段，全部本地）

1. 回扫：sessionQuery.filterSessions(全 workspace) -> zstd 解码 -> normalizeLog（复用 raw-event.ts）
2. 建图（确定性）：user/message -> turn -> tool/call -> subagent 树（parentSession）-> decision/issue 锚点（与已有 capture/issue 记录对齐）-> 写入 links（provoked/executed-in/derives），每条带 citation
3. 归纳（LLM）：抽需求/决策候选（复用 segment/intent/synthesize）-> 跨会话/跨项目聚类（复用 identity.ts，扩展跨 workspace）-> 派生关系检测（「做 A 时出 B」：B 的触发点出现在 A 的执行期）-> dry-run -> 确认 -> 落库

### 4.4 分期落地

| 期 | 内容 | 验收 |
|---|---|---|
| M1（快赢） | 启用 links 表：写「确定性事件图」（会话->turn->tool->子代理），面板加「会话结构图」 | 任意历史会话可展开成执行树，节点可跳回原文 |
| M2 | 全历史回扫 + 需求/决策节点回填 + derives/provoked/answered 边 + 项目归纳（workspace.json + git remote -> Project 节点，issue 归属） | 出现「需求基因树」：每个需求能沿边走到最初的用户话语；跨项目派生可见 |
| M3 | 代码落地关联：git log/remote 扫描，commit <-> 会话 <-> 需求对齐（Entire 的本地版） | 需求树叶子长到 commit；「这需求落到了哪个 repo 哪个 commit」可答 |
| M4 | 图可视化：React Flow 生长树视图 + 时间轴 + 项目树三视角（借鉴 VibeTrace 的 action-flow / viz-vibe 的 mmd / dsh-trajectory-governance 的 GUI） | 浏览器里可逛图，点节点跳回对话 |
| M5 | 复盘叙事：从图生成周/月报告（决策回看、需求生长史、项目派生史） | 一键出一份「过去两周我们为什么做了这些」 |

### 4.5 技术选型

- 存储：短期继续 track.json（加 projects 表 + 启用 links；量级：93 issues + 边数千，KV 完全够）。中期若图查询变重，跟 harness 一致用 SQLite + FTS5（session-query 已用），或 Graphiti 式双时态表达「决策被推翻」。
- 可视化：Web 面板内嵌（track 已有 right-panel），用现成图库（React Flow / cytoscape.js / mermaid），不引重型服务。
- 不做成独立插件：直接扩展 @fakechris/dsh-track（schema/纪律/面板全是现成的），可拆 sync 为子模块；与 dsh-trajectory-governance / dsh-session-flow 互补不重复（它们管执行层/会话层，我们管需求层）。

### 4.6 风险与对策

- LLM 抽取幻觉：每节点/边强制 citation + dry-run 确认（原则 1/2）
- 历史量大（单 workspace 已 18MB 压缩日志）：按需 zstd 解码 + 游标分页 + 后台任务
- 跨项目身份（同一需求在两 repo）：模糊匹配 + 用户确认后合并（复用 capture 去重的 token 相似度思路）
- 图会脏（需求改名/决策推翻）：双时态或 supersedes 链（Decision 已有 supersedesDecisionId）

## 5. 参考链接清单

学术：
- Agentic Consensus（typed property graph 即 source of truth）：https://arxiv.org/abs/2604.17883
- RECAP（捕获+回放+分析，ACL 2026）：https://aclanthology.org/2026.acl-demo.68/
- VibeContract（任务契约与可追踪性）：https://arxiv.org/abs/2603.15691
- Agentic Entropy（causal graph interface）：https://arxiv.org/abs/2604.16323
- Vibe Modeling（NL 与代码之间的中间表示）：https://arxiv.org/abs/2607.27923
- Failure as a Process（轨迹失败解剖）：https://ubos.tech/failure-as-a-process-an-anatomy-of-cli-coding-agent-trajectories/
- SE 可追踪性综述（LLM trace link discovery）：https://national.finna.fi/Record/trepo.10024_229538

产品：
- Entire（前 GitHub CEO，$60M seed）：https://docs.entire.io/overview · https://github.com/entireio/cli
- SpecStory（Intent is the new source code）：https://specstory.com/llms-full.txt
- vibe-replay（会话回放）：https://github.com/tuo-lei/vibe-replay
- VibeTrace（执行流图）：https://github.com/idvxlab/VibeTrace
- viz-vibe（context map）：https://marketplace.visualstudio.com/items?itemName=viz-vibe.viz-vibe
- VOPL（意图规格编辑器）：https://github.com/cgast/vopl

记忆层：
- mem0 架构：https://raw.githubusercontent.com/mem0ai/mem0/main/skills/mem0/references/architecture.md
- Graphiti/Zep（双时态知识图谱）：https://help.getzep.com/graphiti/getting-started/overview
- agentic-memory 收藏集：https://github.com/lhl/agentic-memory

DSH 生态（awesome-dsh-plugin）：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- dsh-trajectory-governance：https://github.com/dfycaly98931680/dsh-trajectory-governance
- dsh-session-flow：https://github.com/YeqingTang/dsh-session-flow
- dsh-fork-graph：https://github.com/chouyong/dsh-fork-graph
---

## 6. M2 细化（2026-08-16 补充，吸收用户 quick-cap 核验）

外部核验修正两处：
- entireio/entire-graph 是**代码库结构图**（函数/类型/调用关系，给 agent 探索用），不是需求/决策图——Entire 家族仍未覆盖动机演化层，差异化成立；
- claude-retrospective 在 bitwarden/ai-plugins 仓库下（plugins/claude-retrospective）：多源复盘插件（git 历史 + ~/.claude/projects JSONL + 质量指标 + 用户反馈 → 证据型复盘 + 改进循环），对应愿景 M5 复盘层，不是需求谱系；crune（chigichan24/crune）确认在做「session JSONL → 跨会话语义图 → 技能合成」。

架构采纳三层模型（与 §4 兼容，节点/边词汇升级）：
- **Layer 0 事实层（不可变）**：用户话语（session.jsonl 事件流）+ 代码产出（git commit/PR/repo）。只追加。
- **Layer 1 语义图层（核心资产）**：节点 = Utterance / Motivation / Decision / Requirement(含 epic/issue 层级) / Problem（做 A 时发现的问题）/ Artifact(commit/repo)；
  边 = derives_from / spawned_by / implements / supersedes。两条硬规则：
  ① 每条边必须带 evidence 指针（(sessionId, seqRange) 回到 Layer 0）——M1 的 citation 机制直接复用；
  ② 全图 bi-temporal（valid time + transaction time）——M3+ 引入 Graphiti 风格存储，M2 先用 supersedes 链 + 时间戳。
- **Layer 2 视图层**：项目维度 = 图上社区检测/聚类；时间维度 = valid-time 切片回放；发展维度 = 沿 derives_from/spawned_by 展开的 derivation tree。反哺 = 图挂成 MCP server（M5+）。

M2 落地顺序（按用户建议：先证据指针，后图存储，可视化最后）：
1. 抽取单位 = event-span（v2 sync 已有 EvidenceSpan）→ 强制落 Issue.citations（(sessionId, seqRange)）；
2. links 表写入语义边（fork 血缘 / issue↔session / capture→issue derives / decision→session / issue parentId derives）；
3. Project 归纳（graph header.cwd 分组 + .git/config remote → Project 节点，issue.projectId 归属）。

---

## 7. 技术选型报告评审（2026-08-16）

对独立深度研究报告（AER + Graphiti + IBIS 融合方案）的评审结论：

### 事实核验与修正
- Entire 创始人 = Thomas Dohmke（非 Nat Friedman，已修正）；$60M seed / $300M 估值、Felicis 领投、2026-02-10 stealth —— 多源确认（GeekWire / Yahoo Finance）。
- 报告称 entire-graph 的 README/源码「不可公开抓取」——不实：本仓已成功抓取其 README。它确为「Entity-level semantic checkpoint context plugin」，但内容是代码库结构图（函数/类型/路由/调用关系，100% 本地无模型），实现是 Go（安装需 C 编译器，疑 sqlite/cgo），非报告推断的纯 C。报告的推断方向（entity=代码符号级，非需求级）被 README 证实。
- EasyLink（arXiv 2507.09199，「Rethinking Issue-Commit Linking」，ICSE'26，Precision@1=75.91%）确认存在；How Coding Agents Fail Their Users（20,574 sessions，含复现包 ND-SaNDwichLAB/coding-agent-misalignment）确认存在。

### 与现状的对照（M1-M3 已落地）
- 报告的「阶段 1 event-span 抽取」= v2 sync 的 EvidenceSpan + M2 落库的 citations/sourceSpan —— 已完成。
- 报告的「阶段 2 跨会话聚合 + evidence 指针」——evidence 指针 ✅（每条 issue 带 (sessionId, seqRange)）；跨会话聚合目前是 align 的 session/title 规则合并，语义 embedding 合并未做（待 M4）。
- 报告的「阶段 2 演化边 derives_from/spawned_by/supersedes」——derives ✅（capture→issue、issue 父子）；spawned_by / supersedes 未做（M3.5 补 supersedes：Decision.supersedesDecisionId 字段早已存在、一直未落边）。
- 报告的「阶段 2 issue-commit 链接」= M3 的 implements（当前为确定性 token 重叠；EasyLink 式 LLM 重排作为增强项，非必需）。

### 采纳与调整
1. bi-temporal 落地为轻量版（M3.5）：Link 增加 eventTime（关系在世界上何时为真）与 ingestedAt（track 何时抽取）；supersedes 写 t_invalid 语义 = 保留被取代节点 + 写边，不删除。全量 t_valid/t_invalid 回放等 M4 可视化需要时再做。
2. IBIS 论证结构：现有 Decision 节点的 options/aiPreference/rationale 已天然是 Position/Argument 形状——补一条 supersedes 边即可表达「决策被推翻」。
3. 存储：维持 track KV（json/sqlite 后端由 harness 提供，量级 KB-MB）；不引 Graphiti/Neo4j（过早基础设施化，报告亦如此建议）。
4. 社区检测 / 介数中心性（项目聚类 + 桥接需求）：M4 可视化阶段按 Leiden/Brandes 做，当前 cwd 确定性分组已够用。
5. MCP 反哺（dsh_why/dsh_related/dsh_project_map）：M5，遵循「工具纯数据、推理留给 agent」。
6. PM4Py conformance checking：探索性（TS 生态需外部服务），生命周期状态推断保持规则/证据驱动，暂不引入。
7. entire 互操作（读 checkpoint trailer 拿 session↔commit）：可选增强，不阻塞。

### 更新后的路线图
- M3.5（本轮）：演化边 supersedes（decision/issue）+ Link bi-temporal 时间戳（eventTime/ingestedAt）
- M4：语义图可视化（需求↔决策↔commit 图、项目分组、derivation tree）+ 社区检测项目归纳
- M5：MCP server 反哺 + 复盘叙事

---

## 8. 第二份 research 评审（2026-08-16）—— Ledger & Assertion 原则

第二份深度报告（Evolution Ledger/Graph、Claim/Relation assertion、12 条不变量）评审：

### 采纳（M4 落地）
1. 账本 vs 投影：TaskCandidate/EvidenceSpan 目前是一次性中间产物，需持久化 extraction run——
   语义理解不能只当导入过程，要成为长期知识资产。
2. 边 = evidence-backed assertion：Link 加 linkMethod（deterministic / commit-window / title-overlap / user）。
3. 来源权威分离：Issue 加 origin（user_explicit / user_confirmed / agent_proposed / system_inferred），对应不变量 #3。
4. Decision 补 QOC 的 Criteria（选项评估标准），与现有 options/rationale 合成 QOC+ADR。
5. 多父 DAG：Link 表天然是 DAG（需求可 belong 多项目），parentId 只是主显示边，不做树强约束。

### 已覆盖/过时（M2-M3 已完成）
- Link 端点已含 decision/commit/project + 7 种边（报告写于 M2 之前，已过时）
- Epic 4（Git/Entire 链接）= M3；任意 Issue 回答 why = citations + promptMessageId
- 不变量 #1/#2/#6/#9/#11 已满足

### 不采纳
- SQLite 自研图引擎 / Graphiti 主库：当前 KV 量级够用；量级到后用 harness 的 sqlite backend。
- Episode/Claim 全套泛化：Issue + citations 已覆盖窄链（用户原话→动机→需求→Issue→Session→Commit→验证）。

### 路线图更新
- M4（本轮）：Ledger & Assertion 加固——extraction run 持久化 + linkMethod + origin + Decision criteria
- M5：Lens UI——Why/lineage 视图优先（不做全局力导向图），时间轴/项目谱系/决策地图随后
- M6：Evolution Brief——plan 前生成项目意图简报 + 缺口检测（proposed 输出）
