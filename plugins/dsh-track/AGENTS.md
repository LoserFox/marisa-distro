# AGENTS.md — dsh-involute（@fakechris/dsh-track）仓库速记

本仓库是 Track Bridge 任务管理插件。**GitHub 仓库仍叫 `dsh-external/dsh-track`，本地目录名是 `dsh-involute`（曾用名 dsh-track），两者是同一个仓库**。

- **身份**：bundle 插件（package.json name = `@fakechris/dsh-track`），`cordis.patch.yml` 挂 track 引擎；安装：`dsh plugin --profile web add github:dsh-external/dsh-track`
- **技能**：`skills/dsh-track`（fat skill，安装时复制到 `~/.dsh/skills/dsh-track`，skill-local 默认根扫描）
- **源码布局**：src/（capture 捕获 / lifecycle 生命周期 / sync 同步 / eval 评估 / store / types）、tests/（vitest，含 golden/fixtures）
- **构建**：`scripts/dsh-env.mjs` 走 DSH 工具链（不能裸 tsc）；`scripts/prepack-cordis-rewrite.mjs` 打包前改写
- **部署到 3080（正式版布局，2026-08-14 实测）**：主目录 `pnpm run build`（当前用 `DSH_SOURCE=slot-a DSH_TSCONFIG=tsconfig.worktree.json`，主目录 tsconfig.json 已随轮换失效）后，把 `lib/` 同步进 **slot profile 的 vendored 副本**（`~/.dsh/source/slot-<x>/profiles/node_modules/.pnpm/@fakechris+dsh-track@<ver>_.../node_modules/@fakechris/dsh-track/lib/`）——3080 从该副本加载，不再直接读主目录 lib；client 改动硬刷新即可，host 改动需重启 3080（kill 前写 HANDOFF，见全局 L8/L9）
- **AB 快照扩展**：本仓库是 ab-config.json 的 extension（`dsh-track`，repo 指向本目录）。**新增 `@deepseek-ai/*` 依赖必须三处同改**：tsconfig paths、vitest alias、ab-config relink（全局 L7；漏一处生产即 `ERR_MODULE_NOT_FOUND`）
- **发布（npm 生态，2026-08-14 起）**：版本发布 = npm 包 `@fakechris/dsh-track`（GitHub 是分发源与 CI 校验位）。流程概览：bump version → 主目录 build → **lib 产物必须提交**（git 源/CI 不跑构建，官方推荐）→ PR（含 lib）→ squash merge → `git tag vX.Y.Z && git push origin vX.Y.Z`（触发 `.github/workflows/npm-release.yml` 校验+打包）→ **本地** `npm publish --ignore-scripts --registry=https://registry.npmjs.org`（npm 要求 IP 信任 + 硬件 2FA 指纹，**CI 无法发布**，publish 永远留本地）。完整清单见 `docs/RELEASE.md`；README 中英双语（L6）
- **提交**：全局 L4（branch → push → PR → squash merge）；开发 worktree 在 `.worktrees/<name>`（L5）

## 证据纪律（2026-08-18 确立，对齐 Better Harness — P6 分层 + P5 蒸馏立场）

**分层纪律（硬约束，`store.upsertLink` 有 guard 强制执行）**：
- 确定性图（`src/graph/commits.ts` 的 git 事实/时间窗/哈希链接、`src/graph/links.ts` 的结构派生）与语义层（`src/sync/*` 的 LLM 聚类、capture promotion、候选折叠）是**两条独立管线**；
- 只有显式声明能携带强证据：`linkMethod: 'trailer'`（commit body 类型化 trailer）或 `'user'` → `evidenceKind: declared/observed`；
- 语义/启发方法（promotion、identity、session-link、session-lineage、parent、supersedes、decision-record、commit-window、title-overlap）**最多只能写 `candidate`**——语义层永远不能伪造确定性证据；guard 会把越权的 declared/observed 降级为 candidate（向下安全，永不升级）；
- 时间接近和文本相似不是 provenance；缺证据保持显式（candidate/unmapped），不拼一条"看起来完整"的链。

**SKILL 蒸馏纪律（P5 立场；当前不做蒸馏管线，先立规矩）**：
- 频率 ≠ 价值：反复读文件/重试失败命令是噪声，不是可复用经验；
- goal 置信度与 procedure 置信度分开；核心阶段要求 ≥2 个独立 run 支撑；
- 只从"输出已验证"的交付里识别稳定工作路径（commit-observed 之后），不挖单条 session；
- 反模式："反复纠正用户是摩擦，不等于稳定流程"；"显式使用现有 Skill 是覆盖证据，不是该造新 Skill 的证据"。
- 蒸馏管线前置（未就绪，勿提前动手）：工作路径归一化（intake→prepare→…→verify）、中间证据档（create-commit 工具观测/文件重叠）、eval 闭环。
