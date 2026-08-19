# Test Layout

`tests/*.spec.ts` 覆盖 CLI 命令面（init / render / cli-e2e / webui spike），
包根 `pnpm test` 运行（vitest.config.ts 把 @deepseek-ai/* 映射到 checkout
源码）。`assets/plugin-template/` 是 vendored 官方模板资产，其自带测试约定
见 assets/plugin-template/tests/README.md。
