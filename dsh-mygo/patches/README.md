# Patches

`patches/` 是本仓库根级的补丁契约目录（对齐官方 plugin-template @87acac8；
2026-08-12 用户裁决采纳官方 DSH host 补丁语义）。

## 依赖补丁（dependency patches）

当某个精确版本的 registry 依赖需要修正时，将 pnpm 补丁放在本目录并在
`pnpm-workspace.yaml` 的 `patchedDependencies` 中声明，注明原因与移除条件。
当前无补丁，不添加空的 `patchedDependencies` 块。

## DSH host 补丁（提案工件，不 apply）

官方语义：当行为需要 host 侧能力（launcher/bootstrap 接线、构建缝，或
`cordis.patch.yml` 无法表达的变更）时，把 host 侧 diff 作为仓库级提案
工件携带，供 host 维护者合入，而不是分发被改过的 host。

dsh-dev 执行约束（AGENTS.md，2026-08-12 裁决）：

- 只存提案，不在工作区 apply；对已安装 checkout 保持零写入；
- 每个补丁 = 自包含 diff + 固定 host 快照 + apply/regenerate 命令 + 说明
  （触及哪些 host 文件、为什么、对应快照）；
- 不进发布包 `files`、不写 `pnpm-workspace.yaml`；host 合入后删除。

## fabric-host.patch（P6，2026-08-14）

Fabric/Mixin 扩展层的 host 硬缝提案。从 fabric 仓
（dsh-external/fabric@944a87c）的 `patches/fabric-host-integration.patch`
（17 文件，baseline 0812 快照 7b9644f2）收编：**剔除两条组合缝**
（`packages/bundle/web-app/cordis.patch.yml` 插 fabric 行、
`packages/boot/app-boot/src/profile.ts` profile init 模板
blockExoticSubdeps 预声明）——组合缝已由 mygo 治理层接管
（@r05en1cu/dsh-mygo-ext-fabric 受管块写 profile cordis.patch.yml；
git spec 子依赖放行由治理层在安装时按需写 profile pnpm-workspace.yaml）。
本提案只保留三条硬缝及其必需接线（15 文件）：

- `apps/cli/src/profile-boot.ts`：boot prepare 调 installFabricBootstrap +
  完成后 checkFabricRequiredPatches（挂钩安装必须早于目标模块 import）；
- `packages/client/tsdown.client.ts`：clientBundle 的 opt-in source
  transform 缝（addWatchFile 接入 watch 图）；
- `packages/extensions/tool-cordis/src/api-catalog.ts`：编译期 fabric
  服务 catalog 条目；
- 接线：apps/cli/package.json（fabric 两包 git spec 依赖）、
  fabric-bootstrap 宿主测试与 fixture、knip/tsconfig 登记、
  pnpm-workspace.yaml allowBuilds 说明、transform 缝的两个宿主测试。

**固定 host 快照**：公开版 deepseek-harness-public @ `47f9438`
（baseline 重钉自 fabric 仓的 0812 快照 7b9644f2）。逐文件漂移核对
（相对 0812）：profile-boot.ts / plugin.ts 逐字节相同；api-catalog.ts
漂移——公开版已含 PostToolDecision/PreToolDecision 两个 TYPE_API 条目
（上游新增），重钉后仅补 PatchId 条目，其余 hunk 原位适用；
tsconfig.client.json 上下文行号漂移（include 列表新增 ui-cordis 行），
同语义重钉；其余 12 文件原位干净适用。`git apply --check` 在 47f9438
干净通过（2026-08-14 实测，只 check 不 apply）。

apply（host 维护者）：

```sh
cd <dsh checkout 47f9438> && git apply /path/to/patches/fabric-host.patch
```

regenerate（手动步骤，复用价值低故不写脚本）：

1. 从 fabric 仓 patch 剔除两个组合缝文件段（diff --git 分节过滤）；
2. `git archive` 目标 host 快照到临时目录，副本上 `git apply --reject`
   减缝 patch，手工修复 reject（本次：api-catalog.ts 补 PatchId 条目、
   tsconfig.client.json 补 include 行）；
3. 逐文件 `git diff --no-index` 重生成头并拼接；
4. 在目标 host checkout 内 `git apply --check` 验证（只 check）。

与 fabric 仓的关系：fabric 仓的 fabric-host-integration.patch 保持原样
（它有自己的仓库规则与演进节奏，面向 0812 快照）；本提案是独立工件，
面向公开版基线，组合缝差异即上述两文件。

对 vendored 内容的**已落地**本地修改仍先登记 vendor/PATCHES.md（当前
vendor 零补丁）再动工；两轨分开：patches/ = 提案，vendor/PATCHES.md = 落地。

## client-hmr-graph-host.patch（r7 P7，2026-08-15）

client-hmr 浏览器半 graph 帧处理提案。动机：r7 live rail 运行期装卸后
（host watchUserPatches 重放 profile patch 层），node 半的 client 模块
图已随 onGraphChanged 更新，但 `/plugins/events` SSE 通道只在连接时推
一次 graph 帧、浏览器半对 graph 帧显式 no-op——已打开的页面要刷新才能
看到 live 安装的新插件行。本提案让 graph 帧端到端携带成员变化：

- node 半（packages/client/hmr/src/index.ts，+8 行）：onGraphChanged 时
  向全部 SSE 连接广播新 graph（连接时的基线推送不变）。
- 浏览器半（packages/client/hmr/src/client/index.ts，+52/-4 行）：graph
  帧按成员 diff 应用——新增行复用 boot 路径动词（prefetch 注册工厂 +
  `loader.create({ name })`），消失行复用 reload() 的拆卸动词
  （registry-first 避免被标 disabled、drain inertia、清 fiber、撤
  `<style data-plugin>`）后从树中移除。shell 自有条目（modules wrapper、
  app-shell）从不出现在 graph 中；首帧建立基线集合，diff 只触碰 graph
  出现过的行。与 rebuilt 帧共存语义：rebuilt 管内容变化（同 id 新
  rev）、graph 管成员变化（id 增减），共用同一串行队列。

**固定 host 快照**：deepseek-harness-public @ `47f9438`（dsh 0.1.0-rc.6
公开 npm 线）。`git apply --check` 在 47f9438 干净通过（2026-08-15 实测，
只 check 不 apply）。

apply（host 维护者）：

```sh
cd <dsh checkout 47f9438> && git apply /path/to/patches/client-hmr-graph-host.patch
```

regenerate（手动步骤）：

1. 固定快照取出 `packages/client/hmr/src/index.ts` 与
   `packages/client/hmr/src/client/index.ts` 两份原文件；
2. 按 patches/README 本节描述应用两类改动（node 半广播 + 浏览器半
   applyGraph diff）；
3. `git diff --no-index` 生成 diff，路径前缀规整为 `a/packages/...` /
   `b/packages/...`，前置 Subject 说明段；
4. 在目标 host checkout 内 `git apply --check` 验证（只 check）。

挂账：EXT-4（docs/EXT-CD-index.md）。
