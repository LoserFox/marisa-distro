# Better Harness / Harness Inspector 研究：Delivery Provenance 对 dsh-track 的启发

> 状态：研究完成（2026-08-18）· 对象：QoderAI/better-harness（MIT，npm `@qoder-ai/better-harness`）· 性质：外部产品研究 + 差距对照
> 主要一手来源：<https://github.com/QoderAI/better-harness> 仓库（已 clone 至本地精读）、博客 <https://qoderai.github.io/better-harness/blog/harness-inspector>、`docs/specs/*`、`scripts/harness-inspector/*`、`references/loop-engineering/*`、`roadmap.md`

## 0. 结论先行

Better Harness 的核心洞察是一句话：**Session 不产生价值，Output 才产生价值**。一次 Agent 交付是 `Intent → Process → Output` 一条链，度量必须从 Output 出发反向回看（Output → Session → Prompt），而不是盯着 Session 猜测什么值得沉淀。

对照我们的 dsh-track，差距是实打实的（用我们自己 store 的数据）：

- **95 条 issue，83 条 done，其中只有 9 条挂上了 `implements` commit 链接——74 条 done 没有任何代码落地证据。** 我们的 done 是"会话内判断 + 用户点头"，不是"Output 验证"。
- lifecycle 状态机（`src/lifecycle/state-machine.ts`）的证据信号只有 `todo-all-done / turn-completed / activity / turn-error…`，**没有 `commit-observed` / `output-verified` 这一类信号**；`implements`/`landed-in` 链接躺在 graph 层，没有接进 lifecycle 的证据账本。
- `src/graph/commits.ts` 的关联是时间窗口 + 标题相似度（`linkMethod: 'deterministic'`），命名误导——deterministic 只表示幂等哈希，不代表证据强度。Better Harness 明确说"never infer the relationship from timestamp proximity or LLM similarity alone"（时间接近/相似度永远只是 candidate）。

值得吸收的东西按优先级列在 §4；先看他们是什么、工程化好在哪里、我们差在哪里。

## 1. 他们是什么：Better Harness 与 Harness Inspector

**产品定位**："Delegate coding to agents. Improve the loop around them." 它是 Coding Agent 的 **evidence & control plane**，不是又一个 agent runtime（`roadmap.md` 有明确的领域边界表）。默认按五个工作循环维度出报告：任务理解 / 可控执行 / 改动验证 / 可靠交付 / 经验沉淀（`docs/concepts.md`）。

**Harness Inspector**（`docs/blog/2026-08-14-harness-inspector.md`）是其中的"交付溯源"能力：一条命令

```bash
npx @qoder-ai/better-harness inspector
```

在项目目录里起一个**本地只读**的交互页，把 Story（需求）、Session（过程）、Commit（产出）放进同一视图。

### 1.1 交付链：Intent → Process → Output

- **Intent**：语义起点——需求 / Issue / Spec / 架构约束；
- **Process**：过程——主要是 session 记录及其中的搜索、读取、编辑、验证；
- **Output**：交付进工程系统的最终结果——目前最清晰的锚点是 **commit**。

Story / Session / Commit 不是三个平行的抽象，而是 Intent / Process / Output 在当下工具链里的可观测对象。真实项目里它不是一条直线，而是一张证据图：一个 Story 跨多个 session，一个 session 碰多个 commit。

### 1.2 三种观察方式

| 视图 | 回答什么 | 一句话 |
|---|---|---|
| **Workbench** | 需求↔session↔commit 的关系 | 关系 |
| **Trace** | session 内部结构（按 Turn 组织、时间线折叠重复活动） | 结构 |
| **Replay** | 按事件顺序回放（纯证据回放，不重跑工具、不恢复工作区） | 顺序 |

关键纪律：**证据弱时保留为 candidate 或 unmapped，绝不自动拼出一条"看起来完整"的交付链**。

### 1.3 证据分级（最值得抄的一张表）

来自 `docs/specs/2026-08-12-harness-inspector.md` 的真实审计结论，四档：

- `declared`：经过 review 的显式声明（Feature/Story/spec/session/commit refs）
- `observed`：带类型的宿主证据，或精确的 repo-relative 文件重叠
- `candidate`：conventional-commit / spec / 时间提示，等待人工 review
- `unmapped`：真实存在但没有可辩护归属者的 session/commit

### 1.4 关联规则（commit-session-link，`docs/specs/2026-08-11-commit-session-correlation.md`）

确定性排序：`explicit`（commit body 里的类型化 trailer，如 `Harness-Session:` / 解析 Entire `Entire-Checkpoint:` 元数据）> `high`（时间重叠 + 至少一个重叠文件）> `medium`（时间重叠 + session cwd 在仓库内）> `low`（仅时间重叠）。grace window 45 分钟。**时间窗/相似度只用于启发式，显式 trailer 才是 provenance**。还规定：用 committer time 做生产时间关联、author time 仅展示。

### 1.5 SKILL 蒸馏的立场（回应我们最初的动机）

他们明确反对"把一个 session 总结成新 SKILL.md"：

- 频繁 ≠ 有价值：反复读同一文件、重试失败命令，是噪声不是可复用经验；
- 值得沉淀的是**跨相似任务反复出现、且被最终输出和验证结果支撑**的工作路径（如何从需求划定范围、如何建上下文、如何完成编辑并跑验证）；
- 所以蒸馏 = 在**多条真实交付**上识别稳定模式，再给每个模式配上适用场景、边界、执行步骤、验证方法；Inspector 今天解决的是这条链最底层的环节——让交付留下**有界、可检视的证据**。

实现侧的参考：`skills/better-harness/references/session-repeated-workflows.md` 的 Repeated Workflow Discovery——Phase 1 只读首 prompt 聚类（按目标/产物类型/稳定输入形态/验收边界，明确"共享词、路径、产品名、泛动词不足为据"），Phase 2 才展开候选；`goalConfidence` 与 `procedureConfidence` 分开；核心阶段要求至少两个独立 run 支撑。

### 1.6 演进路线（roadmap.md 的证据链）

```text
TaskEpisode + delivery/outcome links
  → PatternCandidate（review 前的假设，不是问题也不是 Skill）
  → 人/AI review
  → HarnessIssue（跨 run 的持久身份，Open/Watch/Resolved/Dismissed/Reopened）
  → 有界的 Harness 干预
  → 留出/后续可比 outcome
  → retain / narrow / revise / revert / reopen
```

顺序是刻意的：**先确立事实，再挖模式；先 review 模式，再固化；先证明有界干预有效，再加自治行为**。

## 2. 他们工程化做得好的地方（值得吸收）

1. **Spec 驱动，每 feature 一 spec**。`docs/specs/` 从 2026-07 到 2026-08 有 100+ 份，统一结构：Traceability / Intent / Acceptance Scenarios（可测的 AC，编号 AC-1..N）/ Non-goals / Plan and Tasks / Test and Review Evidence。测试直接映射到 AC，`npm test` 1330 条通过是收尾证据的一部分。
2. **证据纪律**。确定性关联 + 置信度排序 + 显式通道优先 + 启发式标 candidate；UI 里有 Evidence Drawer（选一个对象，解释它和谁直接相关、证据种类与强度、**不能证明什么**）；缺失证据保持显式（"Missing or partial evidence remains explicit"）。
3. **隐私优先的投影层**。版本化只读模型（`HarnessInspectorReportV1` / `SessionViewerReportV1` / `ToolCallTraceV2`），边界处统一 sanitize/redact（`safeText` / `safeLocator` / `safeRelativeFile` / `redactTranscriptText`），路径一律 repo-relative，**对抗性 fixture 断言最终 HTML 里不存在凭证/绝对路径**，而不是只测工具函数返回值。
4. **只读原则**。Inspector 不写 git notes/trailers/hooks/worktree，不恢复工作区、不重跑工具；能力不存在时（如 HarnessCheckpointV1 还是 Draft）就不提供"Recover"按钮——UI 里没有假能力。
5. **版本化契约 + 适配器隔离**。一个渲染器吃多个宿主来源（原生 Codex 历史 + Entire checkpoint 内容归一进同一投影）；宿主工具身份（`exec_command` / `apply_patch` / browser / test）与 provider-neutral 动作族分离。
6. **先审计真实数据再迭代 UI**。2026-08-12 用 17 个 Codex session + 60 个 commit 做真实证据审计，发现 5 个阻塞性数据契约问题（tool 身份塌缩、session 文件证据缺失、prompt 观测≠用户 turn、Feature/Story 身份稀疏、Recovery 未实现）后才进入下一轮 UI。
7. **规模与对抗测试**。`inspector-timeline-scale` / `inspector-commit-compaction` / `inspector-cross-provider` 等测试；单 trace 保留 1000+ 工具调用不设限；提交文件证据可压实（contextual / file-context 证据先折叠）。
8. **不落库，渲染时派生**。Inspector 没有数据库：一切在 render 时从一手来源（git log、宿主 JSONL 转录）派生，进一个版本化 JSON（`HarnessInspectorReportV1`）嵌入自包含 HTML。每条 Story→Session / Session→Commit 边都挂一个证据对象 `{strength: direct|observed|candidate|contextual, source, facts[], limitations[]}`，limitations 是固定文案，**UI 永远不会把弱证据说成强证据**（`report-model.mjs`）。
9. **确定性层与语义/判断层分离**——这是他们最好的一个设计。确定性图（git 事实、时间窗、trailer 解析、置信度阶梯）和语义层（LLM 聚类、SKILL 候选、review 门禁）是两套独立管线，语义层永远不能伪造确定性证据。SKILL 蒸馏（`learning-loop-candidates.mjs`）是确定性候选挖掘（16 个模式、复现 ≥2 次、`priorityScore = 复现 × 成本 × 杠杆`）+ LLM 只在摘要/allowlist 门禁内做 review，噪声 vs 经验是判断层的事，不进证据图。

## 3. 我们的现状与差距（我们做的不工程化 / 抽象不好的地方）

### 3.1 Output-first 度量缺口（最核心，数据说话）

对 `~/.dsh/storages/track.json` 实测：

```
issues: 95   done: 83   in_progress: 2
links: 456   其中 implements: 162   landed-in: 132
link methods: commit-window: 294（64%） session-link: 101  session-lineage: 47  promotion: 11  decision-record: 3
done issues WITH implements link: 9
done issues WITHOUT implements link: 74   ← 89% 的 done 无代码落地证据
```

- done 是会话内判断（用户确认 / todo 全绿 / turn completed），没有"产出物被观测到"这一环；
- `src/lifecycle/state-machine.ts` 自己都写"the local runtime has no CI/deploy signals strong enough to auto-claim done"——但我们**其实有** commit 信号（`implements`/`landed-in`），只是没接进 lifecycle；
- 我们自己的 evolution brief 就在报 `done-without-commit` gap（75 个 proposed gaps 里一大片），说明这是系统性问题不是偶发。

### 3.2 证据模型抽象弱

- `linkMethod: 'deterministic'` 是**命名误导**：deterministic 说的是幂等哈希（`semanticLinkId`），不是证据强度。实际匹配是时间窗口 + 标题 token 相似度（`IMPLEMENTS_OVERLAP = 0.5`），按 Better Harness 的标准这只能算 candidate。
- `Link` 类型（`src/types.ts`）没有 `evidenceKind`（declared/observed/candidate/unmapped）、没有 `confidence` 字段；UI 图（`right-panel.ts` 的 `.gv-landed-in` / `.gv-implements`）对边不区分证据强度。
- **没有显式链接通道**：不支持 commit body trailer / git note / 声明式 ref，只有两种启发式（时间窗 + 标题重叠）；也没有 committer/author 时间区分（我们只用 author date `%aI`）。
- grace window（`SESSION_GRACE_MS = 10min`）没有文档化、不可配置、没有置信度衰减概念。

### 3.3 无 spec/AC 文化

- 我们的 `docs/` 有 RELEASE.md、genealogy-vision.md（研究文档），但**没有 per-feature spec**：没有 Acceptance Scenarios、Non-goals、Test-evidence 块；开发是"功能 + 测试"，不是"AC 驱动 + 测试映射 AC"。
- genealogy-vision.md（2026-08-16）自己写"links: 0 → 启用写入是本方案第一个动作"——愿景立得住，落地纪律弱（现在 links 456 条了，但全是启发式，没有分级）。

### 3.4 缺"输出验证"的 UI/反馈

- 面板有捕获墙 / 任务墙 / 会话结构图 / 日历纱线，但**没有"这个需求落到哪个 commit"的证据抽屉**，也没有 candidate/unmapped 展示；
- 没有 Better Harness Evidence Drawer 式的"为什么这条边存在、证据强度多少、它不能证明什么"。

### 3.5 对照参考：他们自己的工程化短板（防止我们抄错方向）

对方也不是处处工程化（都写在 `scripts/` 老一代实现里，正好是"抽象不好"的活教材）：

- 旗舰能力 Inspector 是纯 `scripts/` 脚本，没有 npm 表面，且**默认输出路径硬编码成 `.qoder/better-harness-runs/…`**——一个多 provider 工具里出现 Qoder 品牌路径；
- `ui/workbench.js` 是 2242 行模板字符串拼 DOM，无框架；redact 逻辑在三个层各写了一份（`report-model.mjs` / `session-source.mjs` / `privacy-safe-text.mjs`）；
- JSON 形状耦合：builder 消费临时 summary 形状、UI deep-equal 精确 JSON，schema 一 bump 就要 4 个文件协调改，且全是 `.mjs` 没有类型层；
- provider 特化 hack 混进干净适配器里（Claude slug 折叠字符类、`harness-run` 适配器硬编码 `maxDepth: 6`）；
- "规模"测试名不副实：commit-compaction 测试只断言一个常量，timeline-scale 只测数学往返不测 UI 行为。

对我们的含义：**"spec 纪律 + 证据分级 + 确定性/语义分层"值得抄；"硬编码路径 + 字符串拼 UI + 无类型契约"是反面教材。**

## 4. 可以吸收的具体改进（按优先级）

- **P0 — Output 门禁**：lifecycle 增加 `commit-observed` 信号（`implements`/`landed-in` 新鲜链接进证据账本，权重 0.5 量级，可支撑 done 提议）；done 提议要求"有 implements 链接 **或** 用户显式确认无代码产出"；任务墙对 done-without-commit 的 issue 打标记（对应他们的 `unmapped`/`candidate` 概念）。参考他们的高置信通道：session 里**观测到 `create-commit` / `push` 类工具调用**（±2s 内出现 commit）是比时间窗强得多的证据——我们的事件日志里有 tool/call 事件，可以直接做。
- **P1 — 证据分级落进数据模型**：`Link` 增加 `evidenceKind` + `confidence` + `limitations`（对齐他们的证据对象 `{strength, source, facts[], limitations[]}`）；`linkMethod` 拆成两个概念——`idempotent`（幂等哈希，工程属性）与 `evidence`（证据强度，语义属性）；UI 边样式区分 declared/observed/candidate/unmapped，并保证**弱证据的文案永远不被说成强证据**。
- **P2 — 显式链接通道**：支持 commit body 里的类型化 trailer（如 `Track-Issue: INV-12`）→ `explicit` 优先；时间窗/标题重叠一律降级为 `candidate` 且标置信度；用 committer time 关联、author time 展示。
- **P3 — spec/AC 纪律**：从下一个 feature 起，`docs/specs/` 每 feature 一 spec（Intent / ACs / Non-goals / Plan / Test evidence），测试文件头标注覆盖哪些 AC。
- **P4 — 输出证据抽屉**：面板选中 issue 时显示 implements/landed-in 边、证据强度、commit 摘要与 limitations；复用现有 `.gv-*` 边渲染，加图例。
- **P5 — SKILL 蒸馏立场对齐**：将来做"从交付里识别稳定工作路径"时，按 Repeated Workflow Discovery 的做法——首 prompt 聚类、goal/procedure 双置信度分离、核心阶段 ≥2 独立 run、以输出和验证结果为准；频率 ≠ 价值（"反复纠正用户是摩擦，不等于稳定流程"；"显式使用现有 Skill 是覆盖证据，不是该造新 Skill 的证据"）。
- **P6 — 分层纪律**：把确定性图（git 事实/时间窗/链路哈希）与语义层（sync 的 LLM 聚类、SKILL 候选）保持为两条独立管线，语义层永远不能伪造确定性证据——这是他们最好的设计，我们已有雏形（`src/graph/` 确定性 vs `src/sync/` 语义），需要写成显式约束写进 AGENTS.md。

## 5. 与我们的 vision 的关系

- genealogy-vision 的 M3 就是"代码落地关联：git log/remote 扫描，commit ↔ 会话 ↔ 需求对齐（Entire 的本地版）"。Better Harness 的 `commit-session-link` + Inspector 就是这个方向目前**最好的参考实现**（比 Entire 更贴近我们：本地只读、隐私投影、证据分级）。
- 定位互补不冲突：他们做 evidence & control plane 不做 runtime；我们做任务管理 + 会话/项目归纳，也不碰 runtime。他们（和 Entire）**不做需求级归纳**——"从对话里长出需求树、跨项目派生"仍然是我们的差异化。
- 但我们的归纳必须站在输出验证的地基上：需求/issue 的"完成"先由 commit 证据说话，然后才谈得上从多条真实交付里蒸馏 SKILL。

## 6. 一句话

先看 Output 再评 Session；证据分级（declared/observed/candidate/unmapped），启发式永远只配当 candidate；时间接近和文本相似不是 provenance，显式声明和可观测事实才是。
