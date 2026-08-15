# AGENTS.md

<!-- 常驻层：每个 session 都必须进入上下文的规则。每条 1–3 行、自包含、链接它的家。不放故事、示例、情境流程、任何从被链接的家里复述来的内容。 -->

whale-girl 以官方 **bundle 格式**分发（仓库根 `package.json` 的 `dsh.bundle` + `dsh.client`，包根 cordis.patch.yml，见 [decisions/implemented/simplification/2026-08-12-migrate-to-bundle-format.md](decisions/implemented/simplification/2026-08-12-migrate-to-bundle-format.md)）：在 DSH Web GUI 内悬浮的桌面宠物（QQ 宠物形态，A 模式——GUI 内）。架构决策见 [decisions/implemented/architecture/2026-08-08-in-gui-pet-architecture.md](decisions/implemented/architecture/2026-08-08-in-gui-pet-architecture.md)；文档规范见 [docs/AGENTS.md](docs/AGENTS.md)。

## 当前阶段取舍

**首个版本已分发（官方 bundle 形态，2026-08-12 起）。** 不再有「可自由重命名与重组」的过渡条款——公开 ref 被消费后改名/重组破坏安装；deep-standard 档位重评结论见 [decisions/implemented/process/2026-08-10-l3-tier-review.md](decisions/implemented/process/2026-08-10-l3-tier-review.md)。

## 目录布局

```
.dsh-plugin/index.mjs     Node half 入口：state/interact/config/assets/events 路由 + 事件记账 + ctx.pet 服务（client 经 client-modules 挂载，不再注入页面）
.dsh-plugin/package.json   不消费的 repository 形态残留（无 dsh 声明，仅保留文件清单）
.dsh-plugin/src/          Node half 纯逻辑（账本/活动/assets 守卫/配置/signals，零宿主依赖，可单测）
.dsh-plugin/client/       client bundle 源码（纯 DOM 自渲染 + sprite 帧播放器）
.dsh-plugin/client.js     构建产物（由 scripts/build-client.mjs 生成，勿手改）
.dsh-plugin/assets/       sprite sheet + manifest.json（静态服务；manifest↔文件由 verify-assets 门禁守护）
originals/                生图参考原图（不参与服务）
docs/preview/             状态动画预览 gif（由 scripts/make-previews.py 生成）
scripts/                  门禁编排器与生成器（清单权威在 scripts/gates/run.mjs）+ 预览生成
tests/                    Node half 单测（node:test）
docs/                     文档；标准见 docs/AGENTS.md
decisions/                决策记录；契约见 decisions/README.md
```

## 命令

```sh
node scripts/gates/run.mjs              # 本地精选门禁组
node scripts/gates/run.mjs --group ci   # CI 全量组（含单测）
node --test 'tests/*.test.mjs'          # Node half 单测
node scripts/build-client.mjs           # 生成 .dsh-plugin/client.js
node scripts/build-client.mjs --check   # 校验 .dsh-plugin/client.js 新鲜度（只读）
```

### 按改动面选检查

改动落在哪些表面，就跑覆盖那些表面的**最窄**证据，跑一次；只汇报真正跑过的命令。**不要默认跑全套**，不要为了提交或推送重复跑已经通过的检查——CI 独占穷尽覆盖。证据分层：**pre-commit hook 跑本地精选组 = 提交底线**（快、必过）；**开发中按本表跑最窄证据**；**CI 全量组**（含单测/门禁自证）独占穷尽覆盖，本地不重复预演。

| 改动触达 | 跑什么 |
|---------|--------|
| .dsh-plugin/src/ 状态机行为 | `node --test 'tests/pet-state.test.mjs'` |
| .dsh-plugin/client/ 源码或构建配置 | `node scripts/build-client.mjs --check`，改完跑 `node scripts/build-client.mjs`；验证站 web 运行中跑 `node scripts/verify-client-smoke.mjs <web-url>`（浏览器冒烟：apply 成功 + 宠物渲染，curl 覆盖不到的 client 面）；**client 行为改动**（拖拽/交互/状态序列）加跑 `node scripts/verify-client-behavior.mjs <web-url> [scenario]`（行为回归探针，见 [decisions/implemented/testing/2026-08-10-client-behavior-probe.md](decisions/implemented/testing/2026-08-10-client-behavior-probe.md)） |
| 文档、决策记录 | `node scripts/gates/run.mjs` |
| .dsh-plugin/assets/ sheet 或 manifest | `node scripts/gates/verify-assets.mjs` + 重装 + **刷新页面即可，无需重启 web**（assets 路由按请求读磁盘） |
| .dsh-plugin/index.mjs / .dsh-plugin/src/（Node half） | `node scripts/gates/run.mjs` + 重装 + **web 重启**（ESM 缓存：同 URL 二次 import 返回旧模块，已挂载过的插件改源码 disable/enable 不生效；仅进程内从未 import 过的插件可首次面板 enable 免重启，见 [decisions/implemented/bug-fix/2026-08-08-tool-schema-dsl-compat.md](decisions/implemented/bug-fix/2026-08-08-tool-schema-dsl-compat.md)）；重启后日志须无 `plugin tree failed to load` |
| 门禁本身 | 对应门禁的自证测试（`node --test 'scripts/gates/*.test.mjs'`） |

## 约定

- **每个非平凡改动必须在同一 PR 内新增或更新至少一条决策记录**；豁免与格式见 [decisions/README.md](decisions/README.md)。
- **约定必须有门禁。** 机械可查的约定写成只拒绝一条不变量的程序；每个门禁有用非法样例证明它会拒绝的测试。门禁清单的权威是 [scripts/gates/run.mjs](scripts/gates/run.mjs)，本文件不手抄。
- **生成物一律不手改**：`.dsh-plugin/client.js` 由 [scripts/build-client.mjs](scripts/build-client.mjs) 生成，改 [.dsh-plugin/client/index.mjs](.dsh-plugin/client/index.mjs)；新鲜度由 `--check` 守护。
- **官方插件契约**：仓库根 `package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml`（insert 挂载自身）+ `dsh.client`（platform web）；Node half 入口 `.dsh-plugin/index.mjs`（`name`/`inject`/`apply`）；client 经 `__ModuleLoader__.load` 注册（`.dsh-plugin/client/index.mjs` 命名导出 `name`/`apply`）。
- **注释与文档写契约，不写推理转录**：行为、时序、异常、后果、所有权、安全使用条件保留；实现叙述、测试走查、评审史、代码复述删除。只写当前态。
- **一个 PR 一种性质** + 对应标签（feature / bug-fix / doc / testing / cleanup）；独立改动拆开；缺陷在引入它的那个 PR 上修，不往下游打补丁。**PR 性质标签与决策分类是两套词汇**：决策分类是封闭集合（feature/bug-fix/simplification/architecture/process/testing，见 [decisions/README.md](decisions/README.md)）——cleanup 改动进 `simplification/` 目录，doc 改动通常无决策记录（纯文档豁免）。
- **宿主/平台环境性行为首次复现即沉淀**：如「宿主会清理/覆盖 CSS 注入样式」这类环境事实，第 1 次踩坑就写 bug-fix 决策记录并标注「环境事实」，不等到第 N 次再固化（教训见 hitarea/menu/effects 系列记录）。
- **并行/在途改动保护**：`git status` 存在未暂存改动时**禁用 `git add -A`**——显式路径 add，只暂存本次改动的文件（pre-commit 会列出未暂存文件提醒）；提交前确认未吞入他人在途修改。
- **未被明确要求时不推送、不合并、不发布**；不可逆动作需要针对该具体动作的显式批准。

## 编辑本文件

每条规则保持自包含，同时链接高层文档。能压缩就压缩；本档（L2）不设字数上限。
