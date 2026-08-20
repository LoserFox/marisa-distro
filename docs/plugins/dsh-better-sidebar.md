# dsh-better-sidebar fork

上游：`omdsh-dev/DSH-better-sidebar`，npm 版本 `0.14.0`（2026-08-20 同步，自 0.10.3）。本仓库按发布 npm 包内容 vendored。

## 本地差异

- 0.10.3 时代的本地差异（移除 `prepare`/`prepublishOnly` 生命周期脚本）在 0.14.0 已由上游消除：0.14.0 发布包不带安装期生命周期脚本，且 peer 依赖已升到 `^0.1.0-rc.8`、删除 `dsh-client-web-react`/`dsh-client-schema-form` 依赖（rc8 死包）。当前本地与 npm 包内容一致。
- 0.10.3 → 0.14.0 内容变化：office（docx/pptx/xlsx）视图模块移除，新增 mermaid 视图与插件管理相关模块。

## 同步动作

1. 从上游或 npm 更新目标版本，排除 `node_modules`、`.git` 与缓存。
2. 若发布包仍带会失败的 `prepare`/`prepublishOnly`，按相同原因移除（当前版本无需）。
3. 验证侧栏 client 模块、组合 patch 与 Windows 打包。
