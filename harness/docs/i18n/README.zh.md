# 双语文档

[English](README.md) | 中文

本仓库的文档会被公司内外的人和 agent（智能体）阅读，因此范围内的每篇文档都以英文和简体中文维护。本页定义配对契约、强制门禁、范围与排除规则；[translation-rules.md](translation-rules.md) 定义如何翻译；[terminology.md](terminology.md) 是术语真源。仓库内置的 agent 工作流见 [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md)。

## 配对契约

- **两种语言同权。** 一篇文档可以先用任一语言撰写和评审（先写中文的 Agent Note 与先写英文的一样正当），另一侧由它翻译而来。两个文件谁也不高于谁；约束它们的是二者必须说同样的话。
- **一对文档是三个同目录文件。** 英文 `foo.md`、中文 `foo.zh.md`，加一份一致性记录 `foo.i18n.yaml`，都在同一目录。不用语言目录，不用独立翻译仓库，不用中英混排的单文件。配对必须整体合并：PR（Pull Request）永远不会只带一种语言而缺其余两个文件。
- **一致性记录。**`foo.i18n.yaml` 保存两侧文件在上一次被确认「说同样的话」时各自的完整 git blob hash：

  ```yaml
  foo.md: 3f786850e387550fdab836ed7e6dc881de23001b
  foo.zh.md: 89e6c98d92887913cadf06b2adb97f26cde4849b
  ```

  用 blob hash 而不是 commit hash，这样同一个 PR 里改动的文件也能算出记录（`git hash-object foo.md`），一致性是纯内容比较。`--write` 会先把这些快照存入本地 Git 对象库再写下记录，未提交的工作树内容也不例外；它还会在内容寻址的 `refs/dsh/translation-pairing/snapshots/` ref 下固定每个不同的已存 blob，使垃圾回收无法让已记录的恢复指针失效。因此记录的 hash 能还原任一侧上次确认时的确切文本，所以失去同步的配对是「按被改一侧的 diff 最小化地修补另一侧」，从不整篇重译。`pnpm run gen-translation-brief <pair>` 会以能安全对齐的最窄粒度——先是有改动的 Markdown 单元，再是标题小节，最后是整篇文档——机械地汇集这次更新的工作集：被改一侧自上次确认以来的 diff、每个改动块的三方文本、改动触及的术语表行，以及有约束力的更新规则；仅落在配对中逐字节一致的围栏代码块内的改动可以直接算出，`--apply` 则经结构签名校验后把它拼接进对侧文件（[briefed-updates Agent Note](../../.agents/notes/implemented/process/2026-07-26-briefed-minimal-translation-updates.md)）。两侧对齐后，`pnpm run verify-translation-pairing --write <pair>` 重新记录两个 hash；那份 yaml diff 就是「确认一致」这个动作本身，可以被评审，也正因如此，`--write` 要求点名你确认过的配对（`--write --all` 是显式的全语料形式）。
- **语言切换行。** 两个文件在各自 H1 标题之后立即互链：英文文件带 `English | [中文](foo.zh.md)`，中文文件带 `[English](foo.md) | 中文`。
- **结构与另一侧一一对应。** 标题深度与顺序、列表类型、有序列表起始编号、列表项数量、表格行列数、链接目标与逐字节一致的代码块在配对两侧一一对应；完整保持规则见 [translation-rules.md](translation-rules.md)。既有 Markdown 门禁对 `.zh.md` 文件原样生效（`verify-md-wrap`、`verify-md-links`）。

## 门禁：verify-translation-pairing

`pnpm run verify-translation-pairing`（`doc-sync`（文档同步门禁）的一环，贡献者会针对文档变更在本地运行，CI 则会完整运行）机械地强制执行这份契约：

1. 范围内的每篇文档都有完整配对。发现 README 时，basename 不区分大小写，因此 `missions/readme.md` 与其他文档根一样属于范围。
2. 任何已存在的配对产物都完整且一致：三个文件齐全、每一侧的当前 blob hash 等于记录值（改了任一侧而没重新确认配对就变红）、双方都带语言切换行、结构签名按序一致：标题深度、逐字节一致的代码块（信息字符串与内容）、表格行列数、列表类型、有序列表起始编号、列表项数量，以及除切换行之外的每个链接目标。
3. 列为 `excluded` 的文件完全没有 `.zh.md`，也没有 `.i18n.yaml`。`.agents/notes/archived/` 下冻结的 Agent Note 不受这个持续演进的门禁约束；专用校验器会要求其现有的三个配对文件完整，并将其封存。

面向源码的代码门禁会把精确的 `.zh.md` 围栏序列视为其无后缀兄弟文件的派生内容，而不会再次编译相同代码或在 manifest 中重复登记。该序列必须在长度、顺序、围栏类型和按字节精确的正文上一致；否则两份副本仍会独立受检，配对门禁也会报告结构不匹配。

`pnpm run verify-translation-pairing --list` 打印范围内每篇文档的当前配对状态（missing、out-of-sync 或 ok）。它从不失败；其中 missing 与 out-of-sync 行指出普通检查会拒绝的违规。

`pnpm run verify-translation-pairing <pair...>` 只检查被点名的配对——配对的三个文件中的任意一个（或其裸词干）都能点名它——因此更新循环几秒内就能验证自己的配对，而不必重新扫描全语料。`doc-sync` 与 CI 运行的是无参数的全语料形式；限定范围的绿灯在 PR 层面永远不能替代它。

这个门禁带来的实际规则是：**当一个 PR 修改了已配对文档的任一侧时，同一个 PR 更新另一侧并重新记录配对**（运行 [dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) skill（技能），再 `--write <pair>`），与本仓库既有的代码与 README 的 doc-sync 规则完全一致。留下失去同步的配对的 PR 会在 CI 变红。

把门禁的边界说白：**门禁通过意味着这组文档在当前内容上的一致性得到了确认，不代表确认本身正确可靠。** 它检查记录的 hash 与结构签名；它无法判断两侧是否真的在说同样的话，也无法判断措辞是否准确、术语是否得当、行文是否自然；这部分契约由评审者把关，见 [translation-rules.md](translation-rules.md)。重新记录了 hash 但另一侧翻得潦草的配对能通过门禁；它不得通过评审。

## 范围与排除

**范围**：除 vendor 源码外的全部 README，以及 `.agents/notes/**`、`docs/**` 与 `python/**` 下的全部活跃文档。匹配 README 时只看文件名且不区分大小写，因此今后新增的目录无需再修改 manifest。依赖目录、被忽略的构建产物目录以及冻结的 `.agents/notes/archived/` 目录树只在发现阶段排除，不属于持续演进的翻译源文档。

**排除**（永不配对，门禁拒绝为它们建 `.zh.md` 或 `.i18n.yaml`）：

- `docs/cordis-catalog/`、`docs/tool-catalog/`、`docs/config-catalog.md`、`docs/persistence-catalog.md`、`docs/module-graph.md`、`docs/agent-lifecycle.md`、`docs/capability-seams.md`、`docs/event-producer-consumer.md`、`docs/graph-atlas.md` 与 `docs/tool-execution-pipeline.md`：生成文件，其生成器只输出英文；手写译文会在重新生成时变得陈旧。
- `docs/AGENTS.md`、`.agents/notes/**/AGENTS.md` 以及指向它们的 `CLAUDE.md` 指令符号链接：agent 指令，与根 `AGENTS.md` 一样只以英文维护。
- `docs/i18n/terminology.md` 与 [style-samples.md](style-samples.md)：二者本身即为中英对照文档。
- [translation-prompt.md](translation-prompt.md)：自动翻译流水线的提示词模板；正文逐字进入模型请求，配对翻译会改变流水线行为。
- `.agents/notes/archived/`：冻结的历史三文件配对。[`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) 校验其完整性和内容封存记录；翻译维护绝不能重写这些文件。

**统一要求**：当前及今后纳入范围的每篇文档，合并时都必须构成完整的双语配对。[scripts/translation-pairing.manifest.json](../../scripts/translation-pairing.manifest.json) 只包含显式排除项；不存在逐文件推进清单、日期分界或 README 专用政策类别。

## 分工

这里的对侧文件由运行 [dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) 的 agent 生成，再由人评审：在这里推理（inference）很便宜，评审注意力才是稀缺资源。门禁负责检查配对是否完整、记录的 hash、语言切换行以及本文列出的结构签名；翻译质量、术语和签名未涵盖的结构要求仍由评审把关。提示词契约也有可执行实现：[scripts/translation-prompt.ts](../../scripts/translation-prompt.ts) 会把仓库内置的模板（注入术语表；模板自带经人工校准的规则）渲染为英译中或中译英两个方向的提示词，并解析三段式响应；`doc-sync` 中的 `verify-translation-prompt` 会检查两个渲染方向与仓库内示例。
