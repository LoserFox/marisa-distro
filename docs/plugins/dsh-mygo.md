# dsh-mygo — Marisa fork 记录

> 市场基础设施（**vendored 源**，不在 `plugins/`，不纳入 `maintenance/upstreams.json`
> 的 mirror/fork 表——本文件是它的 fork 治理记录，对应 AGENTS.md 的 fork 义务：
> 记录本地修改、带测试证据、尽量反馈上游）。

## 基线

- **上游**：`omdsh-dev/dsh-mygo`，`next` 分支（v0.2 重做线），vendored 版本
  `0.2.0-rc.7`，7 个包（`@r05en1cu/dsh-mygo[-api|-cli|-ext-fabric|-ext-panel|-loader-hub|-loader-profile]`）。
- **引入**：2026-08-18 换源（原 npm `@r05en1cu/dsh-mygo*` → vendored next），
  决策与踩坑实录见 `docs/sessions/SESSION-install-speed-compression-2026-08-18.md`（决策 19）。
- **形态**：`dsh-mygo/` 为普通 vendored 目录（无 `.git`），携**源码级本地修改**
  （keyed 契约修复做在源码里，不再用 pnpm patch；`pnpm-lock.yaml` 注释
  "keyed fix applied in-tree"）。
- **挂载**：profile bundle 成员（`generate-profile.mjs` 的 `MYGO_PACKAGES` 四包：
  mygo / loader-hub / cli / ext-panel，其余三包为解析依赖）；构建期由
  `profiles/marisa/verify-mygo-runtime.mjs` 验证挂载（面板进 boot 图 +
  `/api/mygo/plugins` 200 + 四包 enabled 0.2.0-rc.7）。

## fork 修改（本地相对上游 next 的增量）

| # | 修改 | 文件 | 说明 |
|---|---|---|---|
| 1 | **settings keyed 契约适配**（2026-08-18） | `packages/extensions/mygo-panel/src/**` 及 lib | rc7 破坏面：`settings.plugin.item` 从 list 的 `id`/`order` 改为按 namespace 的 keyed slot。源码级 `key: entryId` + slot 声明 `keyed` + 删 list-era `label`。上游 next 源码仍是 list 契约 |
| 2 | **bridge 安装 symlink → junction**（2026-08-23） | `packages/extensions/mygo-panel/src/index.ts` + lib | Windows 上目录 symlink 需管理员/开发者模式（EPERM），junction 免权限；POSIX 忽略 type 参数行为不变。修复桌面用户装插件第一步必挂的问题。已回馈上游 |
| 3 | **devDeps 远古范围升级 + schemastery 单实例**（2026-08-23） | `packages/{core/mygo-api,cordis/mygo,cordis/mygo-cli,extensions/mygo-panel}/package.json`、根 `pnpm-workspace.yaml` | `@deepseek-ai/*` devDeps 从 `^0.0.1-rc.1` 升 `^0.1.0-rc.6`（0.0.x 族依赖未发布的 dsh-compact/dsh-type-meta → 全新 install 404）；根 override 统一 schemastery `3.18.1-rc.1`（0.1.x 依赖声明 `^3.18.1` 引入双实例 → TS2883）。已回馈上游 |

## 上游反馈

- 修复 2、3 已提交上游 PR（2026-08-23）：
  - [omdsh-dev/dsh-mygo#1](https://github.com/omdsh-dev/dsh-mygo/pull/1)（devDeps 升 `^0.1.0-rc.6` + schemastery 单实例 override，分支 `fix/devdep-ranges` → next）
  - [omdsh-dev/dsh-mygo#2](https://github.com/omdsh-dev/dsh-mygo/pull/2)（bridge symlink → junction，分支 `fix/windows-junction-links` → fix/devdep-ranges，栈式）
- 等待上游合并后按 vendored 同步流程收编；本次**发行版侧零改动**（vendored 树保持 0.2.0-rc.7 + keyed 修复原样，PR 合入前桌面装插件问题仍存在，见下节）。
- 修复 1（keyed 契约）是 Marisa 对 rc7 harness 的适配层，暂未回馈（官方 harness 的 keyed 契约演进另行评估；上游 panel 的 list 形式靠类型增强可编译，但现代 harness 下卡片渲染需 keyed 运行时契约，属独立 PR）。

## 已知限制（发行版侧实测，2026-08-23）

- **桌面装插件硬卡点**：除本表修复 2 的 symlink 权限外，装到
  `$DSH_HOME/mygo-plugins` + profile 用户层 patch 行的安装物，位于
  `backend\.dsh` 内——升级换 exe 时被 RemoveAll 连锅端（数据安全铁律，
  见 MEMORY.md；"home 应移出 backend"待开 issue）。
- **verify 盲区**：`verify-mygo-runtime.mjs` 只验证挂载不验证安装；安装链路
  需真机冒烟（staging 方法：junction 桌面部署树 + `--profile marisa` 起服务 +
  `POST /api/mygo/install`，folder 源 + 自包含插件）。
- **客户端半边**：实测覆盖 host-only 插件；带 client 半边的 bridge 安装
  （client bundle 投影 + 浏览器挂载）尚未真机验证。
