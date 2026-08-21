# DSH 0.1.1-rc.1 迁移研究（2026-08-22）

> 状态：**研究完成，迁移未执行**。本文档只记录差异分析与迁移方案；`harness/`、`maintenance/upstreams.json`、`docs/upstream-diff.md` 均未因本研究所动。
> 基座口径：同步应基于 **origin/main（578bf32e，harness = 0.1.0-rc.8）**，不是任何 rc.7 时代的旧分支工作树。

## 一、背景与核心事实

| 项 | 值 |
|---|---|
| 上游新 tag | `dsh-v0.1.1-rc.1` = `528c682e0`（PR #2890 release merge；release commit `3ec5e8f8c`） |
| 版本跳跃 | **没有 rc.9，也没有 0.1.0 正式版**——`0.1.0-rc.8` 直接跳到 `0.1.1-rc.1` |
| 发布时间 | npm `2026-08-21 06:49 UTC` |
| npm dist-tags | 根包 `@deepseek-ai/dsh`：`latest` 与 `next` 双双指向 `0.1.1-rc.1`（rc.8 当时只占 `next`）；家族包走 `next`（如 `dsh-client-web` 的 `next=0.1.1-rc.1`，其 `latest` 仍停在远古的 `0.0.1-rc.1`） |
| 线性关系 | `dsh-v0.1.0-rc.8`（`141eb6fef`）是 `dsh-v0.1.1-rc.1` 的祖先，可快进 |
| 规模 | **172 提交 / 2368 文件变更 / 全树零删除** |

对照 rc7→rc8（318 提交、客户端 shell 改名、schema-form 整包删除）：本次是**常规量级迭代，无结构性破坏**。

## 二、变更构成（去水分后规模更小）

- `.agents/notes/**`（上游开发笔记）约占变更文件的 **35–40%**；
- `docs/subsystems/` 5.8%、其他 docs ~5%、`apps/web/tests/snapshots/` 快照滚动更新一批；
- 实际产品代码集中在 `packages/client/*`、`packages/credentials/*`、`packages/llm/*`、`packages/host/{webserver,apiproxy}`。

### 包级变更热度（前 18）

```
21 packages/client/ui-conversation      11 packages/client/runtime
19 packages/test-support/acp-snapshot   10 packages/credentials/credentials
18 packages/llm/llm-pi-ai               10 packages/client/ui-subagent
16 packages/client/ui-primitives         9 packages/llm/llm-deepseek
13 packages/host/apiproxy                8 packages/llm/token-meter
12 packages/credentials/credentials-local 8 packages/sandbox/sandbox-local
12 packages/client/ui-permission-presets  7 packages/client/ui-theme
11 packages/credentials/authorization(新) 7 packages/session/session-projection
                                          7 packages/host/webserver
```

## 三、Marisa 补丁接触面核对（全部零冲突）

| 接触面 | 上游动作 | 结论 |
|---|---|---|
| `apps/cli/src` + `apps/cli/config`（--profile 面、`anchored-standard/` 预设区） | **零变更**（apps/cli 仅 README/package.json/reference 文档/tests 变动） | 本地增量原样保留，无需重放对齐 |
| `apps/web/index.html` | rc.8 与 0.1.1-rc.1 **逐字节一致**（blob hash 相同），title 均为上游原值 `DSH Local Build` | 换树不产生冲突；「Marisa DSH」品牌补丁可干净重放（注意：该补丁当前只是工作区未提交改动，main 上尚未提交，见第六节） |
| `pnpm-workspace.yaml`（上游根） | 未变更 | 供应策略结构不变，仅需为 0.1.1 家族补白名单 |
| 上游根 `package.json` | 版本号 bump + hygiene 脚本收敛为 `tsx scripts/run-gates.ts hygiene` | 上游内部工程化改动，不影响 Marisa 根 workspace |
| `packages/host/webserver` | 新增 `src/injections.ts`（结构化注入行），`index.ts` 适配 | 增量演进：`IndexInjection` 行类型（global/script/script-src/style/html，head/body 落位），服务 HTML 渲染与静态 worker boot payload 双渲染共用一张表；**`tapIndex` 仍保留且在行渲染之后运行**。Marisa 当前不打 webserver 补丁，无冲突；但插件注入协议面在演进，使用 tapIndex 注入 HTML 的插件需在真机回归时留意 |

## 四、上游重点变更（与 Marisa 决策相关的部分）

1. **`feat(llm-deepseek): publish the vision model`** —— 上游正式发布 DeepSeek vision 模型。这直接冲击「保留 dsh-vision-toolkit」的核心理由之一（rc8 时原生视觉仅覆盖显式配置 `inputModalities:[text,image]` 的模型）。迁移时必须重新评估 toolkit 取舍或组合定位。
2. **全新 `credentials/authorization` 子系统**（新增 11 文件）+ `credentials-local` 持久凭据记录（含 migration/records 测试）+ `feat(credentials): upgrade the pre-release flat document at boot`（boot 时旧格式文档升级）+ `feat(authorization): obtain a credential by asking the human`。鉴权/凭据存储面重构 → 设置页 UI、vision-toolkit 的 authMode/Zen-GLM 预设 fork 补丁需回归。
3. **webserver 结构化 index 注入表 + client boot seams**（见第三节）。
4. **`feat(llm-pi-ai)` provider 登录流**：新增 `src/auth.ts`/`src/login.ts` 及测试——「登录到 provider」而非隐藏之；配合 credentials 子系统构成账号面改版。
5. **客户端 UI churn**：ui-conversation(21)、ui-permission-presets(12)、ui-subagent(10)、client/runtime(11)——自绘设置卡（MyGO、vision-toolkit）与权限预设相关插件需真机回归；`feat(web): answer ask_user_question over multiple lines`（多行提问）；宽表按列数自适应 + hover 滚动条（ui-primitives）。
6. **session-projection checkpoint 统一**、subagent timing 输出规范化、i18n 目录索引推断移除等 refactor 若干。

## 五、插件生态影响

- **peer 不匹配警告**：vendored npm 插件的 peer 多为 `^0.1.0-rc.8`。按 semver prerelease 规则，比较符所在元组是 `0.1.0`，而 `0.1.1-rc.1` 是 `0.1.1` 元组 → **不满足范围**，会出 peer 警告（非致命）。同步时统一评估：升 peer 或容忍警告并在文档记账。
- **`minimumReleaseAgeExclude` 白名单**：0.1.1-rc.1 家族 08-21 刚发布，会被根 workspace 供应策略整族拦截（rc.8 同款问题）；需按惯例把 0.1.1-rc.1 相关加入白名单。
- **vision-toolkit**：0.1.36+ 的同步窗口自 rc8 换树后就开着；本次原生 vision 模型发布后再加一层取舍维度（toolkit 的开箱识图/非 DeepSeek 端点/6 项本地视觉工具仍是独占增量，但默认匿名 Zen MiMo 需下线预案的结论不变）。authMode 补丁需对新 credentials 面回归。
- **tapIndex 使用方核查**：grep vendored 插件是否有向 boot HTML 注入内容的用法，真机回归时确认结构化注入行机制下行为不变。

## 六、工作区现状约束（执行前必读）

- 主工作区当前停在 `feature/upgrade-migration` 分支（HEAD `9c87527a`，**已确认合入 main**），树上 harness 仍是 rc.7——这是旧分支残留，不代表发行基线；发行基线以 origin/main（578bf32e，harness = rc.8）为准。
- 主工作区存在其他 agent 的未提交工作：`desktop/*`（update_guard/logging 等）、`docs/upstream-diff.md`、`maintenance/upstreams.json`、以及 **「Marisa DSH」品牌标题补丁（`harness/apps/web/index.html`，未提交）**。同步操作不得触碰这些文件；品牌补丁的重放责任归其所有者（或在获得授权后随同步提交一并处理）。
- `.claude/worktrees/rc8-test`（feature/rc8-test @ a52ca7d7，harness = rc.8）干净可用作参考树。
- **结论：换树必须从 origin/main 开新 worktree 执行，禁止在当前工作区就地换树。**

## 七、迁移步骤建议（未执行）

1. **开同步分支**：从 origin/main（578bf32e）新建 `sync/0.1.1-rc1` worktree。
2. **换树**：`harness/` 整树替换为 `528c682e0` 内容（临时裸克隆可直接导出，见第九节）；anchored-standard 目录原样保留（上游未触及该区域）；品牌标题补丁按第六节权属处理；`smoke-real.e2e.ts` 断言如需同步一并处理（上游本轮未动该文件，预期无需）。
3. **依赖升级**：根 workspace 的 `@deepseek-ai/dsh-*` 升至 `0.1.1-rc.1` 家族；补 `minimumReleaseAgeExclude` 白名单；处理 vendored 插件 peer 警告。
4. **插件复评**：vision-toolkit 0.1.36+ 同步 vs 原生 vision 取舍（产出决策记录）；MyGO/vision-toolkit 设置卡、权限预设类插件、tapIndex 使用方列入真机回归清单。
5. **验证**：见第八节；发布门槛另需真实窗口渲染 + MSI 安装/启动/卸载验证。

## 八、验证清单（AGENTS.md 必跑项）

```powershell
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
git diff --name-only origin/main...HEAD | node scripts/verify-pr-boundaries.mjs
```

发布前另需：真实窗口渲染验收 + MSI 安装/启动/卸载验证（HTTP 200 不算桌面验收）。

## 九、证据与复现

```powershell
# 上游 tag 列表（代理）
git -c http.proxy=socks5://127.0.0.1:10808 -c http.sslBackend=openssl ls-remote --tags https://github.com/deepseek-ai/deepseek-harness.git
# 99f6f02f=dsh-v0.1.0-rc.7 / 141eb6fef=dsh-v0.1.0-rc.8 / 528c682e=dsh-v0.1.1-rc.1

# 差异分析用裸克隆（blob:none，约 1 分钟；本研究即基于它完成）
git clone --bare --filter=blob:none https://github.com/deepseek-ai/deepseek-harness.git $env:TEMP\dsh-upstream-bare
git -C $env:TEMP\dsh-upstream-bare diff --name-status dsh-v0.1.0-rc.8 dsh-v0.1.1-rc.1
```

- 差异全清单快照：`%TEMP%\dsh-rc8-to-rc1-files.txt`（2368 行，临时文件可能被清理，可用上述命令重新生成）。
- npm dist-tags：`https://registry.npmjs.org/-/package/@deepseek-ai%2Fdsh/dist-tags`（root latest=next=0.1.1-rc.1）；`@deepseek-ai/dsh-client-web`（next=0.1.1-rc.1，时间线 0.1.1-rc.1 → 0.1.0-rc.8 → 0.1.0-rc.7）。

## 十、换树时的记账义务（AGENTS.md 约定）

- `maintenance/upstreams.json`：harness 节点更新 `baseline`（528c682e…）、`dshVersion`（0.1.1-rc.1）、`note`（同步日期与要点）。
- `docs/upstream-diff.md`：基线表更新；逐项复核「重放、迁移或删除」三选并记录。
