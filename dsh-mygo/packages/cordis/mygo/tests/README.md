# Test Layout

`tests/*.spec.ts` 是主套件（生命周期、符号前置门、requires 闸、
BOM、pack/e2e 等），包根 `pnpm test` 运行；`test/eb/` 是假设验证
实验套件（刻意隔离，走 node_modules lib 产物，见 test/eb/vitest.config.ts），
由 `test/eb` 独立配置运行；`tests/fixtures/` 是真实第三方语料（整体豁免，
按不改仓库内容原则处理）。稳定可见输出按 `tests/snapshots/` 约定存放。
