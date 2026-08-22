# dsh-better-sidebar fork

上游：`omdsh-dev/DSH-better-sidebar`，npm 版本 `0.14.0`（2026-08-20 同步，自 0.10.3）。本仓库按发布 npm 包内容 vendored。

## 本地差异

- 0.10.3 时代的本地差异（移除 `prepare`/`prepublishOnly` 生命周期脚本）在 0.14.0 已由上游消除：0.14.0 发布包不带安装期生命周期脚本，且 peer 依赖已升到 `^0.1.0-rc.8`、删除 `dsh-client-web-react`/`dsh-client-schema-form` 依赖（rc8 死包）。
- 0.10.3 → 0.14.0 内容变化：office（docx/pptx/xlsx）视图模块移除，新增 mermaid 视图与插件管理相关模块。
- **与 dsh-sidechain 面板互斥**（2026-08-22，panel mutex）：两个面板同时打开会互相挤压布局（本插件挤 `#root` 宽度，sidechain 是 360px fixed 右栏）。协议 = 一对 window CustomEvent：
  - 本插件展开（`collapsed` → false）→ `dsh:sidechain:close`，sidechain 关闭；
  - sidechain 打开 → `dsh:better-sidebar:collapse`，本插件收起（`store.reduce(s => s.panelOpen ? togglePanel(s) : s)`）。
  - 实现位置：`src/client/Sidebar.tsx`（collapsed effect 之后新增两个 effect）。
  - **产物双处同步**：0.14.0 发布包不带 `tsconfig*.json`/`tsdown.config`/`vitest.config`，`npm run build` 在 vendored 环境不可复现；互斥补丁同时落在 `src/client/Sidebar.tsx` 与 `lib/client.js`（未压缩 bundle 手工补丁，`node --check` 验证通过）。同步上游版本时需重放两处。

## 同步动作

1. 从上游或 npm 更新目标版本，排除 `node_modules`、`.git` 与缓存。
2. 若发布包仍带会失败的 `prepare`/`prepublishOnly`，按相同原因移除（当前版本无需）。
3. 重放互斥补丁（src + lib/client.js 双处）。
4. 验证侧栏 client 模块、组合 patch 与 Windows 打包。

## 2026-08-23 依赖区间迁移

0.1.1-rc.2 迁移收敛的一部分：`@deepseek-ai/*` 依赖区间从 `^0.1.0-rc.6`/`^0.1.0-rc.8` 统一改为 `workspace:^`（workspace 成员）或 `^0.1.1-rc.2`（registry 包）。机械替换，无代码改动；解析目标从 registry rc.8 副本树切换到 workspace rc.2 树。反馈上游：待同步窗口。
