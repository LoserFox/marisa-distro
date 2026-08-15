# Decision: 官方包未发布期的过渡安装桥（prepare-cache.mjs）

Status: implemented

## Problem

whale-girl 以官方 repository-plugin 格式分发，但官方 `@deepseek-ai/dsh-repository-plugin`（提供 `dsh-plugin-prepare` 的包）是 `private: true` **未发布到 npm**。RepositoryCache 安装时在 `.dsh-plugin/` 跑 `pnpm install` 会因该 devDependency 404 失败；而官方 loader 又硬校验安装目录 `package.json` 必须声明 `scripts.prepack`（调 `dsh-plugin-prepare`）+ devDependencies 官方包（`installedPackageSchema`）——**声明必须、安装必败**，无法通过移除 devDep 绕过。

这使"参考实现 + skill 引导"的整个第三方插件分发链在官方发布前是断的：任何按官方格式开发的插件在真实环境都装不上。

## Decision

过渡期采用 **RepositoryCache 预填充桥**（不违反 loader 硬校验，绕过 pnpm install 的 404）：

1. **`scripts/prepare-cache.mjs`**：按 loader 的 cache 契约（`cacheKey = sha256(specifier)`，目录 `$DSH_HOME/cache/repository-plugins/<sha256>`，marker `.repository-cache.json` 记录精确 specifier）预填充缓存——拷贝**已 prepared 的** `.dsh-plugin`（含提交入库的 `dsh-plugin.mjs` wrapper 与 `dsh-plugin-assets/`）到 `node_modules/repository/`，临时摘除不可解析的官方 devDep 后 `npm install`（只装 runtime 依赖 `schemastery`），恢复原始 `package.json`（保留 prepack/devDep 声明供 loader metadata 校验），写 marker。loader 命中缓存后跳过 `pnpm install`、校验 metadata、加载 wrapper。
2. **`dsh-plugin.mjs` / `dsh-plugin-assets/` 提交入库**（过渡期）：官方契约本由 prepack 生成、不入库；预填充桥需要 wrapper 现成可用。入库后 loader 校验与未来 prepack 重生成均不受影响（prepack 生成的 wrapper 与入库版本一致时无冲突；官方发布后此决策废弃时，可移除入库 wrapper 恢复纯 prepack 流程）。
3. **README 安装章节**写明过渡步骤（先 `prepare-cache.mjs` 再配置 `cordis.patch.yml`），并链接本文。

**废弃条件**：`@deepseek-ai/dsh-repository-plugin` 在官方私有 npm 库可见（`npm view @deepseek-ai/dsh-repository-plugin versions` 非 404）后，正常安装流程的 `pnpm install` 可解析 devDep、prepack 自动生成 wrapper——移除本桥（脚本可留作普通安装前的缓存预热或删除），README 恢复纯 config 安装。

**现状更新（2026-08-11 实测）**：官方私有 rc 库已发布（`@deepseek-ai/dsh`、`@deepseek-ai/dsh-tools` 等 `0.0.1-rc.1`，NPM_TOKEN 访问），但 **`@deepseek-ai/dsh-repository-plugin` 仍未发布（私有库 404）**——本桥对参与内测的 token 用户同样必需，不因私有库发布而解除。另：私有库版本为 rc 预发布，`0.0.1`/`^0.0.1` 声明匹配不到（npm 预发布规则），依赖声明须用 `0.0.1-rc.*` 形态。

## Consequences

- 安装路径：配置 `cordis.patch.yml` 前先 `node scripts/prepare-cache.mjs`（默认 `~/.dsh`、ref = 当前 HEAD；`--home`/`--ref` 可指定，ref 须与 config 行一致——cache 按 specifier 精确匹配）。
- 维护面：`dsh-plugin.mjs` wrapper 入库是过渡态生成物，与 `scripts/build-client.mjs` 的 client.js 同理不手改（重新生成用 `dsh-plugin-prepare`，需官方包可用环境）；仓库门禁不校验 wrapper 新鲜度（官方发布前的环境限制）。
- 缓存卫生：`prepare-cache.mjs` 幂等（specifier 匹配即跳过）；换 ref 或清缓存后重跑即可；`rm -rf $DSH_HOME/cache/repository-plugins/<sha256>` 手动重置。
- 边界：本桥只解决官方包未发布期的安装；loader 硬校验（prepack + devDependencies 声明）保持不变，`package.json` 始终保留官方契约声明。

## Alternatives considered

**A：移除官方 devDep 依赖。** loader `installedPackageSchema` 硬校验 prepack + devDependencies 声明，移除直接加载失败——不可行。

**B：wrapper 生成物不入库，每次预填充时现跑 prepack。** prepack 需要 `@deepseek-ai/dsh-repository-plugin`（未发布）——预填充环境同样装不上，死锁；入库 wrapper 是唯一能让预填充不依赖官方包的方式。

**C：等官方发布后再分发。** 参考实现与 skill 引导链在此期间完全失效；过渡桥以极低成本（一个脚本 + 一次生成物入库）维持生态可用——过渡期价值明确。

## Environment facts

- RepositoryCache 安装失败症状：`ERR_PNPM_FETCH_404 ... @deepseek-ai/dsh-repository-plugin ... bundled pnpm install exited with code 1`。
- loader cache 契约：`vendor/loader/src/repository.ts` 的 `cacheKey(specifier) = sha256(specifier)`；`readCached` 校验 `.repository-cache.json` 的 specifier 精确匹配。
- loader metadata 校验：`packages/self-modification/repository-plugin/src/source.ts` 的 `installedPackageSchema`（prepack 必须含 `dsh-plugin-prepare`、devDependencies 必须含官方包）。
