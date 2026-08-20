# dsh-track fork

上游：`dsh-external/dsh-track`。本地修正 TypeScript/Vitest/环境脚本的 checkout 路径。当前 rc6 已移除其依赖的 session-query、Context 和客户端契约，因此本发行版不默认挂载或构建 Track Bridge。同步时必须先验证这些契约、Track Bridge 注入和 Windows 打包，再恢复组合启用。

## 2026-08-20 同步（基线 0efb179 → 49991c6e）

- 整树导入上游 49991c6e，重放同一组可移植路径补丁（dsh-env.mjs / vitest.config.mjs / tsconfig.json 的 `../../harness` 相对路径）。
- 插件仍未挂载：session-query/Context 契约在 rc7 不存在；rc8 官方已有 `dsh-session-query` / `dsh-session-query-sqlite` / `dsh-tool-session-query` 包，恢复组合启用前先对照官方包判断契约是否等价（等价则按删除而非重放处理 fork 补丁），再验证 Track Bridge 注入与 Windows 打包。

## 2026-08-19 同步（基线 4e6112b → 0efb179）

- 整树导入上游 0efb179（新增 graph/calendar 功能树、`export/`、`docs/better-harness-research.md` 等；上游删除了 `.dsh-plugin` 下的角色资产目录，镜像如实保留）。
- 重放本地差异（均改为**可移植**形式，不再硬编码机器路径）：
  - `scripts/dsh-env.mjs`：默认 `DSH_SOURCE` 指向 vendored `<repo>/harness`（`fileURLToPath(new URL('../../harness', import.meta.url))`），而非上游的 `~/.dsh/source/current`。
  - `vitest.config.mjs`（上游由 `.ts` 改 `.mjs`）：同一 DSH_SOURCE 默认值。
  - `tsconfig.json`：`/Users/chris/.dsh/source/current/` 前缀整体替换为相对 `../../harness/`（tsconfig 的 paths/typeRoots 以配置文件所在目录解析，跨机器可移植）。
- 版本不再钉 0.3.0，跟随上游（0.5.0）。
- 插件仍未挂载：依赖的 session-query/Context 契约在 rc7 不存在，恢复组合启用前必须先验证契约、Track Bridge 注入与 Windows 打包。
