# dsh-plugin-ya-workspace-sidebar fork

上游：`@huanlin/dsh-plugin-ya-workspace-sidebar`，npm 版本 `0.3.1`（2026-08-20 同步，自 0.1.0）。本仓库按发布 npm 包内容 vendored。

## 本地差异

- **devDependencies 改写**：8 个 `@deepseek-ai/dsh-*` devDeps 从发布包的 `^0.0.1-rc.1` 改写为 `workspace:^`。原因：`^0.0.1-rc.1` 会拉取 rc.1 远古版本，其传递依赖引用已 404 的 `@deepseek-ai/dsh-compact` 等旧包名，workspace 内无法安装；`workspace:^` 让构建/测试直接链接 vendored harness 的对应包（与 0.1.0 时代的本地状态一致）。
- peerDependencies 保持发布包原样（`^0.0.1-rc.1`，全部 optional——rc8 组合行为待 boot 验证）。

## 同步动作

1. 从 npm 更新目标版本，排除 `node_modules`、`.git` 与缓存。
2. 重放 devDependencies 的 `workspace:^` 改写（每次同步必须检查发布包是否改回了 registry 风格范围）。
3. 验证侧栏 client 注入、组合 patch 与 rc8 boot。

## 2026-08-25 npm 快照同步（0.3.3）

从 npm 重新 vendored `@huanlin/dsh-plugin-ya-workspace-sidebar@0.3.3`（7 个 `@deepseek-ai/*` workspace 依赖按 `workspace:^` 重接线），peer 依赖可选化保持；验证侧栏 client 注入、组合 patch 与 rc8 boot。
