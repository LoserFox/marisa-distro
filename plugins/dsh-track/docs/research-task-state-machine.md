# 任务状态机调研：证据驱动完成判定、todo→issue 完成传播与 AI agent 任务管理

> 调研目的：为 Track 插件（capture → issue → done 管线）的状态机设计讨论提供学术与业界依据。
> 当前设计：issue 状态机为『证据驱动 + 用户确认门控』——todo→in_progress 可自动提交，done/canceled 必须用户确认。
> 待讨论问题：能否让『todo 全部标记完成』自动把对应 issue 标记完成（capture 与 todo 创建时机挂钩、todo 完成自动联动任务完成）。
> 调研日期：2026-08-14。所有链接均经核实（标注 ⚠️ 的为反爬/付费墙站点，浏览器可正常访问）。

---

## 一、任务/工作项状态机的学术基础

### 1.1 Workflow Patterns —— 工作流控制流模式的经典

- **van der Aalst, ter Hofstede, Kiepuszewski, Barros（2003）**《Workflow Patterns》，*Distributed and Parallel Databases* 14(1): 5–51。
  - 链接：[Springer（DOI: 10.1023/A:1022883727209）](https://link.springer.com/article/10.1023/A:1022883727209)｜[Workflow Patterns 网站·控制流模式](http://www.workflowpatterns.com/patterns/control/)
- 核心观点：系统化归纳了 20 种控制流模式，其中显式定义了**状态迁移的触发条件**：隐式条件（任务完成即触发后续任务）与显式条件（*explicit/implicit conditions*）、以及『等待多个前驱任务』的同步（AND-join）、『任一前驱完成即触发』的选择（XOR-join）等。它把『什么条件下允许某个活动发生』作为工作流引擎的核心语义。
- 与本插件设计的关联：issue 状态机的每个迁移都应当有一个**显式定义的触发条件**（如『所有 todo 处于 done』就是 AND-join 型条件），把『用户确认』作为一个可选的前置条件（guard）而不是黑盒逻辑。Track 可把状态机定义为『条件→动作』的规则表，方便配置与审计。

### 1.2 Petri 网工作流建模 —— 使能规则就是守卫条件

- **van der Aalst（1998）**《Petri net-based modelling of workflow systems: an overview》，*European Journal of Operational Research* 104(1): 3–26。
  - 链接：[ScienceDirect（DOI: 10.1016/S0377-2217(98)00292-7）⚠️](https://www.sciencedirect.com/science/article/abs/pii/S0377221700002927)
- 核心观点：用库所（place，状态）与变迁（transition，动作）建模工作流；变迁的**使能规则**（前置库所 token 满足条件）即状态迁移的守卫条件；并提出了工作流网（WF-net）的 *soundness* 概念——要求流程总能到达终态且无死锁/无残留 token。
- 与本插件设计的关联：把『issue done』建模为工作流网终态，会自然问出两个 soundness 问题——(1) 自动完成联动是否会让 issue 在 todo 未全部真正完成时过早到达终态（假完成）；(2) 若某些 todo 永远不完成，issue 是否会卡死（死锁）。『todo 全 done → issue done』是一个典型 AND-join，Petri 网理论要求明确『分支永远不产生 token 时怎么办』（超时/人工接管）。

### 1.3 Statecharts —— 层次化状态与守卫条件

- **Harel（1987）**《Statecharts: A visual formalism for complex systems》，*Science of Computer Programming* 8(3): 231–274。
  - 链接：[ACM DL（DOI: 10.1016/0167-6423(87)90035-9）⚠️](https://dlnext.acm.org/doi/10.1016/0167-6423%2887%2990035-9)
- 核心观点：在有限状态机上引入**层次化复合状态**（super-state 细化）、事件广播与**守卫条件（guard）**。父状态可包含子状态机，子状态全部处于终态时父状态可迁移。
- 与本插件设计的关联：issue 与 todo 天然构成『复合状态 + 子状态』的层次。Statecharts 给出的语义是：**子状态机的内部进度向上聚合，父状态迁移由显式事件 + 守卫触发**——即『todo 全完成』是一个可观测条件，但把它变成『issue 自动 done』还需要一个显式迁移事件（例如提交完成），而不是条件成立就隐式迁移。这直接支持『todo 全完成 → 进入 done 候选（待确认）』而非直接 done 的设计。

### 1.4 软件过程建模 —— 过程即状态机的经典视角

- **Curtis, Kellner, Over（1992）**《Process modeling》，*Communications of the ACM* 35(9): 75–90。
  - 链接：[ACM DL（DOI: 10.1145/130994.130998）⚠️](https://dlnext.acm.org/doi/10.1145/130994.130998)
- **Kellner et al.（1994）**《Software processes representation languages: survey and assessment》，*IEEE Transactions on Software Engineering*。
  - 链接：[IEEE Xplore ⚠️](https://ieeexplore.ieee.org/document/227957)
- 核心观点：软件过程可以（也必须）用显式的模型来描述——状态机、活动网络、规则/约束三类表示各有侧重；过程模型的价值在于**可执行、可分析、可模拟**，其中『活动何时可以开始/结束』由状态与约束显式刻画。
- 与本插件设计的关联：Track 的 issue 状态机正是『过程模型』的一个实例。Curtis 等的框架提醒：完成条件（何时允许 done）应与开始条件分开建模；把『todo 全完成』作为 done 的**必要条件而非充分条件**，与过程建模中的『约束』思想一致。

### 1.5 形式化规范：UML 状态机的事件/守卫/动作语义

- **OMG（2017 及后续）**《Unified Modeling Language (UML) 2.5.1 规范》——状态机部分定义了完整的事件（event）、守卫（guard）、动作（action）语义。
  - 链接：[OMG UML 规范](https://www.omg.org/spec/UML/)
- 核心观点：状态迁移 = 事件触发 + 守卫条件（布尔表达式）+ 动作。守卫不满足时迁移不使能，事件可被丢弃或缓存；这一语义是『自动完成联动』形式化的标准语言。
- 与本插件设计的关联：可直接用 UML 语义表述提议中的迁移：『（事件）最后一个 todo 变为 done；（守卫）无未完成 todo 且无外部验证失败；（动作）issue → done_candidate，等待用户确认』。守卫语义保证了**条件成立 ≠ 必然迁移**，为确认门控提供了形式化依据。

### 1.6 『完成』如何被判定：Definition of Done 的实证研究

- **（2022）**《On the benefits and problems related to using Definition of Done — A survey study》，*Journal of Systems and Software*。
  - 链接：[arXiv:2208.04003](https://arxiv.org/abs/2208.04003)（正式版 DOI: 10.1016/j.jss.2022.111479）
- 核心观点：对敏捷团队使用『完成定义（DoD）』的调查发现，DoD 的主要收益是**完成标准的一致性与透明**，但主要问题是『检查流于形式、DoD 与实际情况脱节、团队跳过部分条目仍宣告完成』——即**完成判定过度依赖人工/团队自报、缺乏外部验证时会失真**。
- 与本插件设计的关联：这是『todo 全部勾选』不可直接当作『任务真正完成』的最直接学术证据。调查区分了**验收标准（acceptance criteria）**与**过程性检查（DoD 条目）**——建议 Track 把『todo 完成』视为 DoD 式自报信号，把『验收标准/外部验证（测试、构建、用户确认）』视为独立信号，两者都需要才允许 done。

---

## 二、todo/子任务完成 → 父任务自动完成

### 2.1 业界机制概览

| 平台 | 子任务→父任务联动行为 | 一手来源 |
|---|---|---|
| GitHub Task lists | 支持勾选与**进度百分比**显示，但勾选只更新进度，**不自动关闭 issue** | [GitHub Docs: About task lists](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-tasklists) |
| GitHub Sub-issues | 子问题可独立跟踪进度，父 issue **不自动关闭**，需手动或自动化 | [GitHub Docs: Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues) |
| Linear | **默认提供 auto-close 联动**：父 issue 的全部子 issue 完成后，可配置自动关闭父/子 issue | [Linear Changelog: Auto-close parent and sub-issues（2024-09-06）](https://linear.app/changelog/2024-09-06-auto-close-parent-and-sub-issues)｜[Linear Docs: Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues) |
| Asana | 子任务可独立完成；**父任务默认不自动完成**，需用 Rules 构建『全部子任务完成→改父任务状态』 | [Asana Help: Subtasks](https://help.asana.com/s/article/subtasks)；[Asana 社区讨论](https://asana.staged-by-discourse.com/t/automatically-marking-a-parent-task-complete-when-all-subtasks-have-been-completed/76436/6) |
| ClickUp | 默认不自动完成父任务；社区长期请求该能力，官方提供 Automation 触发选项（如 ALL subtasks resolved）实现 | [ClickUp Feature Request](https://clickup.canny.io/feature-requests/p/all-subtasks-resolved-as-trigger-option)｜[ClickUp Help: Automation Triggers ⚠️](https://help.clickup.com/hc/en-us/articles/6312128853015-Use-Automation-Triggers) |

- **关键观察**：除 Linear 外，主流工具（GitHub、Asana、ClickUp）**默认都不自动把父任务置为完成**，而是提供『进度聚合显示 + 手动/自动化联动』。Linear 的 auto-close 是最接近『todo 全完成自动关 issue』的官方设计，但其实现是**显式可配置的自动化规则**（父/子联动可开关），且关闭动作可审计、可撤销。业界共识：**自动联动可以，但必须是显式规则 + 可配置 + 可回滚**，而不是隐式状态传播。

### 2.2 学术根基 I：层次任务分解与完成回卷（HTN 规划）

- **Erol, Hendler, Nau（1994）**《HTN planning: Complexity and expressivity》，*AAAI-94*。
  - 链接：[UMCP/马里兰大学项目出版物页（论文索引）](https://www.cs.umd.edu/projects/plus/umcp/manual/publications.html)｜[ACM 收录（DOI: 10.5555/2891730.2891904）⚠️](https://dl.acm.org/doi/10.5555/2891730.2891904)
- 核心观点：层次任务网络（HTN）规划中，**抽象任务（abstract task）通过方法（method）分解为子任务网络，抽象任务完成的定义就是其分解出的所有子任务全部完成**——这是『父任务完成 = 子任务全部完成』最经典的形式化来源。论文还证明了 HTN 规划的高复杂度，暗示『无条件自动回卷』在理论上需要约束（如无环分解、单一分解方法）才安全。
- 与本插件设计的关联：issue=抽象任务、todo=子任务、todo 列表=任务网络，天然符合 HTN 语义；『todo 全 done → issue done』正是 HTN 的任务完成回卷（rollup）。但 HTN 也提示两个坑：**(1) 子任务可能被重新分解/增删（todo 中途增删），回卷必须基于当前快照；**(2) 若允许多种分解路径，『全部完成』的定义需要唯一锚定**（例如以最后一次 todo_write 的列表为准）。

### 2.3 学术根基 II：Checklist 理论与完成验证

- **Gawande（2009）**《The Checklist Manifesto: How to Get Things Right》。
  - 链接：[Wikipedia 词条](https://en.wikipedia.org/wiki/The_Checklist_Manifesto)
- **Hales & Pronovost（2006）**《The checklist—a tool for error management and performance improvement》，*Journal of Critical Care* 21(3): 231–241。
  - 链接：[PubMed: 16990087](https://pubmed.ncbi.nlm.nih.gov/16990087/)
- 核心观点：checklist 的价值不在于『打勾』本身，而在于**把隐性知识外化为显式验证步骤，并在每个步骤执行时进行确认（verification）**；医学实证表明 checklist 降低错误的前提是**逐项、真实地执行与确认**，流于形式的勾选（tick-box）反而带来虚假安全感。
- 与本插件设计的关联：todo 列表就是 agent 的 checklist。Gawande/医疗研究直接支撑一个设计判断：**『todo 全部勾选』只有在每个勾选都有真实证据（执行的命令、改动的文件、通过的测试）时才可信**——这正是 Track 应记录『todo 完成证据』而非只记录状态的原因。

### 2.4 补充：进度/计划完成检测的邻近工作

- 从『完成』信号中提取/预测完成的直接学术工作较少单独成文，但**流程挖掘（process mining）与 AWM（见 3.7）**提供了从执行轨迹中识别任务/步骤完成的方法论；业界（GitHub 进度百分比、Linear 子 issue 进度）则是『已完成子项数 / 总子项数』的简单聚合。对本插件的启示：**完成传播的默认公式可保持简单（AND 聚合），把复杂度留给『证据校验层』**。

---

## 三、AI agent 的任务管理

### 3.1 Claude Code / Anthropic 的 todo 工具与状态机设计

- **Anthropic，官方文档**：《Todo Lists (Agent SDK)》《Tools reference》《Best practices for Claude Code》。
  - 链接：[Todo tracking（Agent SDK）](https://code.claude.com/docs/en/agent-sdk/todo-tracking)｜[Tools reference（含 todo_write 等工具）](https://code.claude.com/docs/en/tools)｜[Best practices](https://code.claude.com/docs/en/best-practices)
- 核心观点：Claude Code 把 todo 列表当作 agent 长任务的『进度护栏』：官方最佳实践明确要求 agent『把工作分解成小任务并用 todo 跟踪、定期更新』，并在工具契约中要求 **todo 状态更新必须如实反映真实进度**。todo 的完成由 agent 自己声明（自报），系统只做状态存储与展示。
- 与本插件设计的关联：Claude Code 的 todo 状态机（pending → in_progress → completed）正是 Track 捕获 todo 的直接来源；但它的**完成是 agent 自报、无外部验证**——既说明『todo 完成』信号在生态中是标准且易得的，也提醒 Track 不能把自报信号当作铁证（见 3.8）。

### 3.2 早期自主 agent 的任务列表范式

- **AutoGPT**（2023 起）与 **BabyAGI**（2023）的『任务列表 + 循环执行』范式。
  - 链接：[AutoGPT (GitHub)](https://github.com/Significant-Gravitas/AutoGPT)｜[BabyAGI (GitHub)](https://github.com/yoheinakajima/babyagi)
- 核心观点：早期自主 agent 用『任务队列（task list）』驱动循环：LLM 生成任务 → 执行 → 根据结果增删任务。任务状态基本是『排队/执行/完成』，完成由 agent 自报；实践中暴露出任务漂移、无限循环、自报完成不可靠等典型失败模式。
- 与本插件设计的关联：这些失败模式是『todo 完成 → 自动推进父任务』的**反面教材**——没有外部护栏时，自报完成会级联放大（todo 误报 → issue 误报 done）。Track 的确认门控正是这类护栏的一种。

### 3.3 编码 agent 的 issue→补丁管线：SWE-agent

- **Yang, Jimenez, et al.（2024）**《SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering》，*NeurIPS 2024*。
  - 链接：[arXiv:2405.15793](https://arxiv.org/abs/2405.15793)
- 核心观点：SWE-agent 把『GitHub issue → 代码修改』建模为受限接口下的 agent 循环：agent 通过自定义命令（搜索、编辑、测试）操作仓库，**『完成』由下游评测判定，而不是 agent 自报**；其系统设计刻意限制 agent 的自由度，减少无效操作。
- 与本插件设计的关联：支持『issue 完成判定应外置』的设计哲学——Track 若让『todo 全完成』自动关闭 issue，应同时挂接外部验证（如测试/构建信号），否则就是在复刻 SWE-agent 明确避免的『自报完成』。

### 3.4 完成判定的评测标准：SWE-bench 与 SWE-bench Verified

- **Jimenez, Yang, et al.（2023）**《SWE-bench: Can Language Models Resolve Real-World GitHub Issues?》，*ICLR 2024*。
  - 链接：[arXiv:2310.06770](https://arxiv.org/abs/2310.06770)
- **OpenAI（2024）**《Introducing SWE-bench Verified》。
  - 链接：[OpenAI 官方博客 ⚠️](https://openai.com/index/introducing-swe-bench-verified/)
- 核心观点：SWE-bench 的『issue 解决』判定是**执行隐藏测试（FAIL_TO_PASS / PASS_TO_PASS）**，即『完成』必须有可复现的执行证据；SWE-bench Verified 进一步用人工重标注剔除了测试噪音。隐含结论：**agent 说自己完成了 ≠ 完成，测试/执行验证才是黄金标准**。
- 与本插件设计的关联：给 Track 提供一条可操作路径——**todo 的完成证据最好绑定可执行信号**（测试通过、命令退出码、产物存在），作为『todo 全 done』自动联动前的校验守卫。

### 3.5 TaskWeaver：代码优先 agent 框架中的任务/状态追踪

- **Microsoft Research（2023/2024）**《TaskWeaver: A Code-First Agent Framework》。
  - 链接：[arXiv:2311.17541](https://arxiv.org/abs/2311.17541)
- 核心观点：TaskWeaver 把任务拆解为可执行代码片段，并用『会话 + 状态』管理多步任务；其设计强调**中间状态显式化（代码执行的输入/输出留痕）**，使 agent 的多步行为可复现、可审计。
- 与本插件设计的关联：支持『每个 todo 完成记录执行产物』的设计——Track 的完成证据不只是状态翻转，还应包含该 todo 对应的执行痕迹，便于回滚与事后校准。

### 3.6 MetaGPT：SOP 驱动的多 agent 状态机

- **Hong, Zheng, et al.（2023）**《MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework》，*ICLR 2024*。
  - 链接：[arXiv:2308.00352](https://arxiv.org/abs/2308.00352)
- 核心观点：MetaGPT 把软件开发流水线编码为**标准操作流程（SOP）**：每个角色（产品/架构/工程）是一个状态机节点，产出物（文档/代码）在节点间流转，节点输出要满足可校验的格式才放行。
- 与本插件设计的关联：『产出物校验后放行』的 SOP 思想可迁移到 Track：**todo 的 done 状态在绑定可校验产出（改动、测试结果）后才允许作为自动联动的输入**。

### 3.7 从 agent 轨迹提取任务与完成信号

- **Zhou, et al.（2024）**《Agent Workflow Memory (AWM)》，*ICML 2025*。
  - 链接：[arXiv:2409.07429](https://arxiv.org/abs/2409.07429)
- 核心观点：从 LLM agent 的轨迹中自动提取可复用的工作流（子例程/状态），把『散落的事件日志』抽象为『结构化任务步骤』；这是『从会话日志提取任务与完成信号』的代表性方法。
- 与本插件设计的关联：Track 的 capture 机制（首次 todo_write 自动捕获）本质上是**在 agent 轨迹中做任务边界检测**；AWM 的思路支持『任务提取 + 完成信号识别』可以自动化，也提示完成信号应从轨迹事件（工具调用、产出物）中提取而非仅依赖 agent 声明。

### 3.8 agent 自我判定『任务完成』的可靠性 / overclaiming

这是本插件『todo 自动联动完成』讨论中最关键的一类证据，结论一致：**agent 自报完成显著不可靠，需要外部校准**。

- **Liu, et al.（2025）**《Exploring Autonomous Agents: A Closer Look at Why They Fail When Completing Tasks》。
  - 链接：[arXiv:2508.13143](https://arxiv.org/abs/2508.13143)
  - 核心观点：对自主 agent 完成长任务的失败模式做系统归因，其中一大类失败是**agent 自认为完成、实际未完成或完成质量不达标**——尤其在缺少外部验证信号的开放式任务中。
- **（2025）**《Runaway is Ashamed, But Helpful: On the Early-Exit Behavior of Large Language Model-based Agents in Embodied Environments》，*Findings of EMNLP 2025*。
  - 链接：[ACL Anthology](https://aclanthology.org/2025.findings-emnlp.1304/)
  - 核心观点：发现 agent 存在系统性**提前退出（early-exit）倾向**——在任务尚未真正完成时就终止，且这种倾向在奖励/反馈信号稀疏时更严重。
- **Pradel（2025）**《Are "Solved Issues" in SWE-bench Really Solved Correctly? An Empirical Study》，*ICSE 2026*。
  - 链接：[arXiv:2503.15223](https://arxiv.org/abs/2503.15223)
  - 核心观点：即使测试通过（SWE-bench 判为 solved），仍有可观比例的解**实际并未正确解决 issue**（行为仍错、规范不符）——证明『执行验证』也非万无一失，人工/语义复核仍有价值。
- **METR（2024）**《Measuring AI Ability to Complete Long Tasks》。
  - 链接：[GreaterWrong 全文帖](https://www.greaterwrong.com/posts/deesrjitvXM4xYGZd/metr-measuring-ai-ability-to-complete-long-tasks)（METR 官网博客同文，反爬不可直连）
  - 核心观点：用『可验证任务（verifiable tasks）』评测 agent 的完成能力，强调**评测必须基于任务产物的客观可验证性**，而非 agent 或评测者的主观判断。
- 综合结论：**『todo 全部 done』是弱完成信号**（自报 + 早期退出 + 执行通过也可能有误）；自动联动必须叠加：外部可验证信号、最少工作/时间证据、以及可撤销的确认门。

---

## 四、对本插件状态机设计的启示（可直接用于设计讨论）

1. **『todo 全 done → issue done』应建模为『守卫条件 + 显式迁移事件』，而非隐式传播。** Workflow Patterns / Petri 网 / UML 状态机的一致结论是：条件（所有 todo done）成立只**使能**迁移，是否真的迁移还取决于事件（提交/确认）。建议设计为：全部 todo done → issue 进入 **done_candidate（待确认）** 状态，用户一次确认（或配置『自动 + 可回滚』）后才进入 done。

2. **保留用户确认门控，但把『todo 全完成』变成高置信的确认触发器，降低摩擦。** DoD 调查（1.6）与 overclaiming 研究（3.8）都表明自报完成不可靠；业界（GitHub/Asana/ClickUp 默认不自动关父任务，Linear 用可配置 auto-close）支持『自动联动可以、但必须显式且可撤销』。可提供 **per-issue 开关**：默认『全完成→提请确认』，可选『全完成→自动 done（记录证据、可一键回滚）』。

3. **给每个 todo 完成绑定证据指针，把『状态』升维成『状态 + 证据』。** 医学 checklist 研究（2.3）、SWE-bench 执行验证（3.4）、TaskWeaver 执行留痕（3.5）共同指向：勾选必须对应真实产物（命令、文件 diff、测试结果）。Track 的 todo 完成事件应携带证据字段；**只有携带证据的 todo 才计入自动联动的 AND 条件**。

4. **区分『自报信号』与『验证信号』，完成判定 = 两者叠加。** todo 勾选 = 自报（agent）；测试/构建/用户确认 = 验证。建议自动联动守卫为：全部 todo 完成且均带证据、且无待验证项 → done_candidate；若配置了 CI/测试信号，可进一步要求验证通过才允许自动 done。

5. **防止『空 issue 瞬时完成』误报：设置最小证据门槛。** 若 capture 在首次 todo_write 即创建 issue，而 agent 一次性声明一批 todo 后立即全勾（空跑/幻觉），自动联动会产生虚假 done。建议门槛：至少一个 todo 曾进入 in_progress、或有真实执行事件、或 issue 存在时间超过阈值——否则一律走确认门。

6. **回卷（rollup）基于『当前 todo 快照』，处理中途增删。** HTN 理论（2.2）提示『全部完成』必须锚定唯一任务网络：以最后一次 todo_write 的列表为权威快照，中途新增的 todo 计入当前快照，删除的 todo 需有记录（不能靠静默消失绕过 AND 条件）。

7. **对 canceled 保持强确认，对 done 允许『低摩擦自动 + 审计回滚』。** overclaiming 研究（3.8）主要威胁是『假完成』，不是『假取消』；建议自动联动只作用于 done 方向（或 done 候选），canceled 仍强制用户确认；每个自动迁移写入审计日志（触发事件、证据、守卫求值结果），支持事后校准与回滚——与流程挖掘/AWM（3.7）的可审计思想一致。

8. **把『自动联动』做成可配置规则而非硬编码状态机。** 业界（Linear auto-close、ClickUp automations）的成熟形态都是『规则/自动化』，而非把传播写死在状态机里。建议 Track 提供配置面：联动开关、AND/进度阈值（如 100% 或 80%）、是否要求验证信号、是否自动提交或提请确认——状态机只负责执行规则，规则可审计可修改。

---

## 附录：引用来源速查（均经 URL 校验）

**学术论文**：Workflow Patterns（Springer DOI 10.1023/A:1022883727209）；Petri 网工作流建模（EJOR 1998）；Harel Statecharts（1987）；Curtis/Kellner/Over Process modeling（CACM 1992）；软件过程表示语言综述（IEEE TSE 1994）；Definition of Done 调查（arXiv:2208.04003）；Erol/Hendler/Nau HTN（AAAI-94）；Hales & Pronovost checklist（PubMed 16990087）；SWE-agent（arXiv:2405.15793）；SWE-bench（arXiv:2310.06770）；TaskWeaver（arXiv:2311.17541）；MetaGPT（arXiv:2308.00352）；AWM（arXiv:2409.07429）；agent 失败模式（arXiv:2508.13143）；early-exit（ACL 2025 Findings: EMNLP）；SWE-bench solved 正确性（arXiv:2503.15223）。

**业界文档**：GitHub task lists / sub-issues；Linear auto-close changelog 与 parent/sub-issues 文档；Asana subtasks 帮助；ClickUp automation triggers 帮助与 feature request；Claude Code todo-tracking / tools / best-practices；OpenAI SWE-bench Verified 博客；METR 长任务评测（GreaterWrong 全文）。