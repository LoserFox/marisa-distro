# Decision: 采用 deep-standard L2 工程标准

Status: implemented

## Problem

dsh-pet 是长期维护、有 agent 参与开发、计划分发到 plugin-registry 生态的插件项目。没有工程标准时，机制契约（contributes 同步、bundle id、构建产物新鲜度）与文档/决策会随会话丢失而漂移——agent 随时可能被终止、下次只能靠文件系统恢复上下文，任何只存在于对话里的约定视为不存在。

## Decision

本项目采用 deep-standard 体系的 **L2 档**（判定表见该 skill 的 adoption reference；装什么由本记录决定）：

- **常驻文件（法则 1）**：根 `AGENTS.md`，每个 session 必读，每条 1–3 行、自包含、只链接不复述。
- **决策记录（法则 3）**：`decisions/` 生命周期目录 + 封闭分类 + 强制 `## Alternatives considered` + 取代检查 + 归档永久冻结。
- **门禁即代码（法则 2）**：三个门禁 + 编排器 `scripts/gates/run.mjs`（门禁清单的唯一归属）；每个非平凡门禁带自证测试（合成非法输入断言拒绝 + 合法输入断言通过）。
- **生成物防漂移（法则 2）**：`client.js` 由 `scripts/build-client.mjs` 生成，`--check` 模式在内存生成后与已提交文件逐字节比对；手改生成物禁止。
- **测试分层与唯一归属（法则 4）**：Node half 状态机单测在 `tests/`（node:test，零依赖）；门禁自证测试跟随门禁源码（`scripts/gates/*.test.mjs`）。
- **窄 hook + CI 分工（法则 4）**：`.githooks/pre-commit` 跑本地精选门禁组；`.github/workflows/ci.yml` 跑 CI 全量组。
- **散文契约（法则 5）**：`docs/AGENTS.md` 定义 slop 清单。
- **PR 纪律（法则 6）**：一个 PR 一种性质；未被明确要求时不推送、不合并、不发布。

档位判定依据：预期寿命（长期维护）、协作者（vlln + agent，非并行）、外部消费者（计划经 hub/registry 分发）、契约面（client↔Node 状态通道 1 个 + dsh.plugin.json 1 个）、生成物（client.js 1 个）、CI（无现成基建——workflow 随首个 push 生效）。多数信号命中 L2，按人类授权确认。

**升档触发条件**：出现外部消费者、多协作者并行改动、或契约面超过 4 个时，评估 L3（字数预算门禁、覆盖率门禁、快照体系）。

## Alternatives considered

**L1（最小档）。** 只装常驻文件 + 决策记录 + 链接门禁。项目有生成物（client.js）与对外分发计划，生成物 `--check` 与门禁自证在开发期就值得装；人类明确要求升 L2。

**L3（长期维护多包仓库）。** 需要字数预算、覆盖率、快照体系——本项目单包、契约面少，L3 门禁会成为永远不失败的空壳，按采纳原则不装。

**不采用任何标准。** 不可接受——机制契约（contributes 同步、bundle id 一致）一旦漂移，插件启用即失败且难以定位。

## Consequences

- 每个非平凡改动多一条决策记录义务——有意成本，换代为记忆。
- 门禁自证测试跟随门禁源码：加一条接受/拒绝规则必须同时加对应非法样例。
- CI workflow 在仓库 push 到带 CI 的宿主前不生效；期间门禁由本地精选组 + pre-commit 执行。
- 本记录是后续审计的锚点：被拒绝的项（L3 门禁）不会悄悄再装。
