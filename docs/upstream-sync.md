# 上游同步流程

## 自动检查

`.github/workflows/upstream-sync.yml` 每天比较 `maintenance/upstreams.json` 中 Git 组件的 commit 基线和各仓库 HEAD，并查询 npm 快照包的最新发布版本。发现变化后，它创建或更新一个带 `upstream-sync` 标签的候选 PR；它不会直接合并未经验证的源码。

Git mirror 的候选 PR 会替换对应上游源码并更新基线；Git fork 与 npm 快照只写入 `maintenance/candidates/<id>.json`，不自动改写插件。后续检查会先恢复该组件已有且仍处于打开状态的候选分支；候选文件的 `checkedAt` 不会单独触发写入，因此同一上游状态不会产生每日提交。已关闭的候选会从当前 `main` 重新生成，避免旧分支阻塞新 PR。

普通 npm 和 GitHub Actions 依赖由 Dependabot 分别提出 PR。一个 PR 只处理一种依赖来源。

## Mirror 插件

mirror 不允许本地功能修改。同步 PR 应：

1. 从 manifest 中记录的上游仓库检出目标 commit。
2. 用上游内容替换 `plugins/<id>/`，排除 `.git`、`node_modules` 和缓存。
3. 更新 manifest 的 `baseline` 和根 lockfile。
4. 添加 `upstream-sync` 标签并运行仓库、profile、插件构建和桌面测试。
5. 人工确认许可证和权限没有变化后合并。

## Fork 插件

fork 不能盲目替换。同步 PR 应先导入新上游，再根据 `docs/plugins/<id>.md` 逐项重放或删除差异。PR 必须更新差异文档；如果改动适合所有用户，应同时链接对应上游 Issue/PR。

## npm 快照插件

`source: npm` 的插件从 npm 发布 tarball 快照，不自动走 Git 源码同步。工作流会查询包的最新发布版本，并在新版本出现时创建只含候选元数据的 PR；它不会下载、解包或替换插件。原因是这些包可能没有可发现的仓库，或者仓库源码与发布产物不一致；直接用仓库源码替换会丢失发布时自带的 `dist/`/`lib/`。

人工同步步骤：

1. `npm view <package> version` 检查新版本；若仓库可发现，同时核对上游 README/许可证是否变化。
2. 解包目标版本 tarball 到临时目录，替换 `plugins/<id>/`，排除 `node_modules`、`.git` 与缓存。
3. 删除 `prepare`、`prepublishOnly`、`preinstall`、`install`、`postinstall` 生命周期脚本，只保留发布产物；如需本地构建，必须把完整源码和构建配置一起 vendor。
4. 更新 `maintenance/upstreams.json` 与 `profiles/marisa/plugins.json` 的 `version`，运行 `pnpm install --no-frozen-lockfile` 重新解析并提交 lockfile；随后用 `pnpm install --frozen-lockfile`、`pnpm test` 和桌面构建验证。
5. fork 快照还要更新 `docs/plugins/<id>.md`；AGPL 插件必须核对修改是否仍符合其许可证。

## Harness / 新 DSH rc

1. 创建独立同步分支，并导入新的上游源码快照。
2. 更新 `maintenance/upstreams.json` 的 DSH 版本和 baseline。
3. 逐项处理 `docs/upstream-diff.md`，不得直接复制旧构建产物。
4. 重新安装根 lockfile，构建 harness、插件、profile 和 desktop。
5. 验证严格 pnpm 依赖解析、MyGO 清单、后端、真实桌面窗口、Windows standalone 和 MSI 安装/卸载。
6. Linux/macOS 实验构建失败可以作为已知问题，但必须记录。
7. 只在完整验证后合并到 `main`；需要稳定维护时再从该点创建 `lts/rcN`。
