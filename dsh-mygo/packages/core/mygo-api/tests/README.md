# Test Layout

`tests/*.spec.ts` 覆盖契约层公开面（错误码全量、fake-env、adapter、invariant）。
运行：包根 `pnpm test`（vitest.config.ts）或 checkout 全量
`vitest run packages/core/mygo-api`。稳定可见输出按
`tests/snapshots/` 约定存放（见 snapshots/README.md）。
