# dsh-diff-viewer fork

上游：`dsh-external/dsh-diff-viewer`。本地只维护 monorepo workspace 链接与 Vitest test-runtime 路径。当前 rc6 缺少其客户端所需的 UI primitives，并且 slot 选项不兼容，因此本发行版不默认挂载它，保留官方编辑/写入界面。上游若改用 peerDependencies 或正式 DSH SDK，应删除这些路径补丁并重新验证浏览器 bundle。

## 2026-08-20 同步（基线 75ded1bc → d576c00c = v0.1.1）

- 整树导入上游 0.1.1：shiki 自包含高亮（`highlight.ts`/`clipboard.ts`，不再依赖 ui-primitives 的 highlight 导出）、PTC/Code 嵌套支持、edit 结果默认展开、dshfind 徽章等。
- 重放路径补丁：`package.json` devDependencies 的 `link:../dsh2026/deepseek-harness/...` → `link:../../harness/...`；`vitest.config.ts` 的 fork 根路径同样改 `../../harness/packages/client`（test-runtime 别名保持上游的 `../test-support/client-runtime`，该路径在 rc7/rc8 harness 均存在）。
- 上游 0.1.1 的 `tsdown.config.ts` 已自带 `dsh-client-web-react` / `dsh-client-schema-form` 平台模块表条目（旧本地补丁并入上游；rc8 同步 harness 时需按新包名再清理）。
- 插件仍未挂载（keyed toolview 注册待 rc8 复核）。
