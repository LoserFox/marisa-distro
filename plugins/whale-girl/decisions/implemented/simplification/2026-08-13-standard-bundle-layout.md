# Decision: 统一标准 bundle 布局（`.dsh-plugin/` → `lib/`）

Status: implemented

## Problem

0812 迁移到 bundle 形态（[2026-08-12-migrate-to-bundle-format](2026-08-12-migrate-to-bundle-format.md)）保留了 repository 时代的 `.dsh-plugin/` 目录名——`main → .dsh-plugin/index.mjs`、client 产物 `.dsh-plugin/client.js`。这正是 0812 记录里被否的 B 方案的问题：「包根仍是 `.dsh-plugin/` 子目录（repository 布局），与官方 bundle 生态割裂」。dsh-loop/navbar/task-status 均已用 `lib/` 作为 bundle 入口目录，whale-girl 是唯一还挂 `.dsh-plugin/` 的。

发布 npm 也要求标准形态：`files` 字段、非 `private`、入口指向稳定目录。

## Decision

把 whale-girl 收敛到与 dsh-loop/navbar/task-status 一致的标准 bundle 布局：

- **目录**：`git mv .dsh-plugin lib`（Node half `lib/index.mjs` + `lib/src/`、client 产物 `lib/client.js` + 源码 `lib/client/`、素材 `lib/assets/` 全部随之移动；内部相对 import 不变）。
- **删残留**：`lib/package.json`（0812 记录明载「不消费的 repository 形态残留」）删除。
- **根 `package.json`**：`main → lib/index.mjs`、`exports` 改 `lib/`、新增 `files: ["lib", "cordis.patch.yml"]`、删除 `private: true`。`dsh.client` 不加 `inject`——client 是纯 DOM 自渲染（`lib/client/` 只 import 内部 `./character.mjs`/`./logic.mjs`/`../src/routes.mjs`，零 `@deepseek-ai/dsh-client-*` 依赖）。
- **引用更新**：`scripts/`、`tests/`、`docs/`、`README.md` 的 `.dsh-plugin` 路径全改 `lib`；decisions 里仅两处活链接（behavior-rhythm-v3、playback-data-driven 的 `client/logic.mjs`）改 `lib`，其余 `.dsh-plugin` 均为历史 prose（repository 时代事实），保持不动。
- **`.gitignore`**：`.dsh-plugin/assets/raw/` → `lib/assets/raw/`。

## Alternatives considered

**保留 `.dsh-plugin/` 目录名。** 改动最小，但维持「repository 布局」的割裂形态，与其余三插件不一致，npm 发布时入口指向一个语义混乱的目录名。弃。

**重构为 `src/` + `lib/` 双层（Node half 引入 tsdown 构建）。** whale-girl 的 Node half 是手写 `.mjs`（无构建步骤），引入构建链会改变「零宿主依赖、可单测」的现状并增加门禁面。纯改名已是标准 bundle 的充分条件，不引入构建。弃。

## 取代检查

- **部分取代** [2026-08-12-migrate-to-bundle-format](2026-08-12-migrate-to-bundle-format.md)：该记录把 `.dsh-plugin/` 作为已知残留保留，本文完成其「与官方 bundle 生态一致」的剩余一步。两记录保持活跃并互链。

## Consequences

- whale-girl 与 dsh-loop/navbar/task-status 同构：`lib/` 入口 + 根 `cordis.patch.yml` + `files` 白名单。
- npm 可直接发布（非 private + `files`）；client id 仍为裸 `whale-girl`（bundle 包名一致）。
- `schemastery` 仍为裸 `dependencies`（历史「移到根 dependencies 供 git 源解析」的既定事实，见 git log `f8a310f`）；对齐 `@deepseek-ai/schemastery` 留作后续，不在本次布局迁移内。
- decisions 历史 prose 仍写 `.dsh-plugin`（不可变记录，指代 repository 时代事实），仅活链接已修。
