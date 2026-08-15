# Decision: 迁移到官方 repository-plugin 分发（去 plugin-registry 依赖）

Status: implemented

## Problem

whale-girl 当前完全运行在 plugin-registry（社区第三方插件管理器）机制上：`dsh.plugin.json` manifest 协议、`~/.dsh/plugins` 注册表、`dsh registry` 子命令（patch 注入）、`__ModuleLoader__` client 挂载——全部是 plugin-registry 的 patch + package 注入官方树（`patches/dsh-plugin-registry-0808.patch` 的 `+program.command('registry')` 实证）。plugin-registry 自己的评估（`official-0809-coverage.md`）确认：官方 0809 的 repository-plugin 格式已覆盖其 ~95% 能力（打包/安装/分发/启停/HMR），并实证「UI 插件经 entry 自渲染，不需要 client-half 机制」——社区层剩余价值只剩管理控制台 UI。whale-girl 应迁到官方格式，去掉对社区第三方的依赖。

## Decision

### 目标态

whale-girl 以官方 **repository-plugin**（0809）分发：仓库含 `.dsh-plugin/` 子目录，`package.json#dsh.entry` 声明完整 Cordis 插件入口，`scripts.prepack` 经 `dsh-plugin-prepare` 生成固定 wrapper + `dsh-plugin-assets/`；安装 = `$DSH_HOME/config.yaml` 的 `repository-plugins.repositories` 一行（`github:owner/repo#<ref>`）。不再有 `dsh.plugin.json`、`index.json`、`__ModuleLoader__`、`dsh registry`。

### 分面迁移设计

**1. 仓库布局（`.dsh-plugin/` 子目录）**

```
whale-girl/                    # 仓库根（docs/decisions/originals 保留——不参与插件）
├── .dsh-plugin/
│   ├── package.json           # name/version + dsh.entry + scripts.prepack
│   ├── entry.mjs              # re-export 插件入口（Cordis 插件，见 2）
│   ├── client/                # client 源码（自渲染脚本，见 3）
│   ├── assets/                # characters/ + manifest（见 4）
│   └── prepack.mjs            # 调用 dsh-plugin-prepare（官方生成 wrapper）
├── docs/  decisions/  originals/   # 仓库元资产（不进插件包）
```

（官方路径包含规则：贡献路径须留在 `.dsh-plugin/` 目录内——entry/assets 全部收进子目录，与官方 07-30 static-format 的 containment 契约一致；dsh.entry 的外目录指向能力需在 0809 实测确认，保守按「全收进」设计。）

**2. Node half（成本：低——几乎零改动）**

`index.mjs` 已是纯 Cordis 插件（`apply(ctx)` + `inject: ['httpServer','tools','tasks','agents','sessions']` + `defineTool` 注册 pet_feed/pet_play/pet_status + `ctx.provide('pet')`）——**零 plugin-registry import**，只依赖官方服务与 Cordis。迁移动作：
- 移入 `.dsh-plugin/`，`entry.mjs` 直接 re-export（或整体搬移）
- `dsh.plugin.json` 删除；`contributes.tools` 声明删除（官方 entry 无此面——工具由 defineTool 在 entry 内注册，verify-contributes 门禁随之退役）
- 状态卡/交互等无改动

**3. client（成本：中——最大迁移点）**

现状：`client/index.mjs` 是浏览器 bundle，经 `__ModuleLoader__.load({ id, factory })` 由 registry 的 client-modules 挂载进页面。官方无第三方动态 client 机制（coverage 实证：UI 插件经 entry 自渲染，`httpServer` 注册路由 + 浏览器 fetch/iframe/DOM）。迁移：
- client 脚本改为**自执行 DOM 渲染**（去掉 `__ModuleLoader__.load` 契约与 load 守卫，保留全部渲染/交互逻辑）
- entry（index.mjs）注册 UI 路由：`GET /whale-girl/ui.js`（返回 client 脚本，`application/javascript`）+ 复用现有 assets 路由（`/whale-girl/assets/*` 已是 Node half 自实现——见 `src/assets.mjs`）
- **页面注入缝（插件自造）**：官方 GUI 无「第三方插件自动悬浮」机制——entry 需自造注入点（如 httpServer 向宿主页注入 `<script src="/whale-girl/ui.js">`，或经配置/宿主 hole）。这是迁移唯一不确定面，随 0809 实测定方案（web-app 是否提供注入 API / 需自带 patch 提供 hole）

**4. assets（成本：低）**

`assets/characters/` 进 `.dsh-plugin/assets/`；prepack 复制到 `dsh-plugin-assets/`（官方约定）或 entry 直接静态服务 `.dsh-plugin/assets/`（现在 assets 路由已存在，复用）。manifest.json + 15 状态全量契约不变。

**5. 安装/分发（成本：中）**

`config.yaml` 样例：
```yaml
repository-plugins:
  repositories:
    - github:owner/whale-girl#<commit>&path:/.dsh-plugin
```
- 分发 = GitHub 仓库即插件（克隆 + pnpm 准备 + prepack），无发布流程、无注册表
- 工具可用性：entry 内 defineTool（官方完整 Cordis 语义）——宿主 `pet_feed/pet_play/pet_status` 照常

### 执行步骤（Phase 顺序，每 Phase 可独立验证）

1. **Phase 0（前置）**：搭建官方 0809 纯净 worktree（无 plugin-registry patch）——验证 `dsh.entry` 精确契约（声明格式、prepack 产物、wrapper 内容、路径包含规则）与页面注入缝方案
2. **Phase 1（Node half）**：`.dsh-plugin/` 骨架 + entry.mjs + package.json；删 `dsh.plugin.json`/contributes；工具经 entry 注册验证（`dsh` headless 挂载 + 工具调用）
3. **Phase 2（client）**：client 自执行化（去 `__ModuleLoader__`）+ UI 路由 + 注入缝；验证页面加载 → 宠物渲染 + 交互（拖拽/菜单/喂食）
4. **Phase 3（assets/安装）**：assets 收进子目录 + config.yaml 安装验证（新 DSH_HOME + 纯净 profile）
5. **Phase 4（收尾）**：删除 registry 专属物（`dsh.plugin.json`、`index.json` 相关流程、`verify-contributes` 门禁）→ 决策记录 → 门禁/单测/冒烟回归

### Phase 0 结论（2026-08-10 官方源码 + e2e fixture 实证）

官方 0809 快照（`421e96f4`）自带 repository-plugin 机制（`packages/self-modification/repository-plugin` + `packages/boot` RepositoryCache；官方 0809 基线验证）。契约确认：

- **`dsh.entry` 是完整 Cordis 插件**：官方 e2e fixture（`apps/cli/tests/fixtures/github-repository-plugin/.dsh-plugin/`）的 entry 是 `export const name/inject/apply(ctx)` 标准 Cordis 形态——与 whale-girl `index.mjs` 同构；`dsh` 字段 schema（`format.ts`）：`skills[]`/`mcpServers?`/`entry?` 至少一个，`prepack` 必须包含 `dsh-plugin-prepare`，devDependencies 必须含 `@deepseek-ai/dsh-repository-plugin`
- **prepack 产物**：`dsh-plugin.mjs`（固定 wrapper，无 import）+ `dsh-plugin-assets/`（静态资产）
- **containment**（`isOutside`）：贡献路径相对、越出包根拒绝；skills 可指向 `.dsh-plugin/` 外仓库内路径（fixture 的 `../skills` 实证）
- **安装驱动**：cordis patch/config 的 `repository-plugins.repositories` 列表（官方 e2e：`- id: repository-plugins` + `repositories: [github:owner/repo#<ref>]`）
- **UI 注入缝（官方 README 实证）**：「third-party plugin's browser bundle has no dshClient/`__DSH_BOOT__` distribution path yet」——官方无第三方 client bundle 分发路径，whale-girl client 的页面注入必须自造（entry 自渲染 + 插件自带 patch 提供宿主 hole）

## Alternatives considered

**A：继续用 plugin-registry 分发（维持现状）。** 社区层自评 95% 能力被官方覆盖、剩余价值仅管理 UI；且社区是「验证与分发层」项目（AGENTS.md 定位），机制寿命系于 patch 基线维护——长期依赖风险高于迁移成本。

**B：profile bundle 分发（官方 `dsh plugin --profile web add`）。** bundle 是「组合里的产品服务/补丁层」语义（无插件 id、无动态安装），whale-girl 是业务插件——形态不符；且 bundle 是官方通道 2（组合层），不解决「独立用户安装」场景（官方通道 1 = config.yaml repository-plugin 才是独立安装的官方答案）。

**C：保留 registry 的 client 挂载（只把 Node half 官方化）。** 混合依赖——client 仍需 registry patch（`__ModuleLoader__` 是 patch 注入的），等于没去掉依赖；coverage 已实证 entry 自渲染可行——全量迁移。

## Consequences

- whale-girl 以官方 repository-plugin 格式分发（`.dsh-plugin/` + `dsh.entry` + prepack），**不再依赖 plugin-registry 社区机制**（dsh.plugin.json/registry/__ModuleLoader__ 全移除）；官方 config.yaml 声明式安装，无注册表。
- entry 的 httpServer 改为**可选服务**：headless 无 web 也能激活（降级为无 UI 工具插件），web 模式注册 UI 路由 + tapIndex 页面注入（官方注入面）。
- 工具注册（tools/tasks/agents 强 inject）与宠物行为（素材/状态机/交互）零改动；路由前缀 `/whale-girl`（单一来源）。
- 分发需 GitHub 仓库（`github:owner/whale-girl#<ref>`）；`@deepseek-ai/dsh-tools` 运行时依赖在官方发布环境解析（本地验证经 mock registry）。

## 验收核对（实施后状态）

- ✅ config.yaml 安装 → 挂载成功 → 工具可用：**headless 集成冒烟实测通过**（mock registry 21 包闭包 + github: 源 → pnpm 准备 → prepack → entry 挂载 → pet_feed 经 agent 真实调用）
- ⚠️ GUI 页面自动出现：实现完成（UI 路由 + tapIndex 注入），web 完整渲染被 0809 worktree profile 依赖不完整阻塞（环境构建问题）
- ✅ 仓库无 `dsh.plugin.json`/`__ModuleLoader__` 残留；verify-contributes 退役
- ✅ 单测 107 + CI 门禁 15 全绿

## Risks

- ~~**dsh.entry 精确契约未实测**~~（Phase 0 已确认，见上节）：声明格式/prepack/containment 均从官方源码与 e2e fixture 实证；entry 全部收进 `.dsh-plugin/`（fixture 证明 skills 可外指，entry 保守收内）
- **页面注入缝是插件自造职责**（官方 README 实证无第三方 bundle 分发路径）：entry 自渲染 + 插件自带 patch 提供宿主 hole（plugin-registry 同模式先例：插件仓库自带 patches/ 提供宿主 hole，不入官方树）——评估为可解但需投入
- **基线迁移**：官方 repository-plugin 需 0809 基线（`421e96f4`）；当前验证站是 0808+patch，验证期间两套并存
- **GUI 兼容**：官方 GUI 注入 `__DSH_BOOT__` 与 registry `__ModuleLoader__` 并存时宠物不得双挂（迁移后旧机制不再加载 whale-girl）

## 取代检查

本记录中的工具注册/验收陈述（「工具可用」「pet_feed 经 agent 调用」）为该提交时点快照，其工具部分**部分取代**于 [2026-08-10-remove-agent-tools.md](2026-08-10-remove-agent-tools.md)（Agent 工具已删除，entry 不再注册工具）；架构、分发与注入决策不受影响。门禁/单测计数同样为该时点快照，现状以 `scripts/gates/run.mjs` 清单为准。

## 相关信息

- 官方机制：`official-0809-coverage.md`（覆盖度 + UI 自渲染实证）、`2026-07-30-config-only-repository-plugins.md`（config.yaml 安装）、`2026-07-30-static-repository-plugin-format.md`（子目录格式与 containment）、`2026-08-08-trusted-repository-package-code.md`（dsh.entry 可信代码）
- 现状实现：`client/index.mjs`（`__ModuleLoader__` 契约）、`index.mjs`（assets 路由已自实现）

## 执行状态（Phase 1-3，2026-08-10）

| Phase | 状态 | 证据 |
|---|---|---|
| 1a 结构迁移 | ✅ | `72bfd2a`：Node half 全收 `.dsh-plugin/`（entry containment）；verify-contributes 退役；build-client 去 loader 契约 |
| 1b 路由官方化 + prepack | ✅ | `169fe9a`：ROUTE_PREFIX `/whale-girl`；官方 dsh-plugin-prepare schema 通过 + wrapper 生成（entry=./index.mjs） |
| 2 client 自执行 + UI 注入 | ✅ | `a04bca0`：去 `__ModuleLoader__`（bundle 0 处）→ `apply({})`；UI 路由 `/whale-girl/ui.js` + 官方 `httpServer.tapIndex` 注入（官方注入面，非自造 patch——tapIndex 是官方 webserver 服务 API，api-catalog 文档化） |
| 3 挂载验证 + 断链修复 | ✅ | `9127e3b`：0809 官方依赖解析 + stub 服务挂载 entry：3 工具注册、UI 路由、tapIndex 注入+幂等、pet 服务、事件、disposer 清理全过；抓出并修复 2 个迁移潜伏断链（ASSETS_PATH re-export、STATE_PATH 局部绑定）；`ff613aa` 残留清零（dsh.plugin.json 删除、门禁跟随前缀） |

**残留项（Phase 3 集成冒烟，2026-08-10 headless 已完成）**：
- [x] config.yaml `repository-plugins.repositories` 真实安装 → RepositoryCache → pnpm 准备 → 挂载（日志无 plugin tree failed to load）——**headless dsh run 实测通过**（exit 0）：mock npm registry 发布 @deepseek-ai 依赖闭包（21 包）→ github: 源经 git insteadOf 重写本地 bare → pnpm 准备（devDep dsh-repository-plugin + dep dsh-tools）→ prepack 生成 wrapper → entry 挂载 → **agent 经 mock LLM 真实调用 pet_feed** → successText 输出
- [x] 真实工具调用（pet_feed/pet_play/pet_status）——**pet_feed 实测经 agent 调用成功**
- [x] GUI 页面真实渲染宠物——**0809 基线 web 模式实测通过**：官方 repository-plugins 机制（home 级 cordis.patch.yml + 预置 RepositoryCache，绕过 github 源与 mock registry）挂载 entry → `/whale-girl/state`、`/whale-girl/ui.js`、`/whale-girl/assets/*`、`/whale-girl/interact` 全 200 → tapIndex 页面注入生效（index.html 含 ui.js script）→ Chrome 无头冒烟「apply 成功、宠物以 sprite 渲染」通过。验证环境依赖：入口依赖 `@deepseek-ai/dsh-tools`（symlink 至 0809 monorepo 构建产物）与 `schemastery`（symlink 至仓库 devDep）在缓存条目内解析——预置缓存是本地验证手段，正式分发仍走 github: 源

**集成冒烟过程中对 entry 的修复**（headless 激活约束）：
- httpServer 强 inject → **可选服务**（ctx.get 弱获取；web 有则注册 UI，headless 降级无 UI）——官方 entry 语义：headless 无 web 服务器
- 工具注册（tools/tasks/agents）保持强 inject（headless 有这些服务）
