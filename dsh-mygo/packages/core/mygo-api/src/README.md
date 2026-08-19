# Source Layout

`src/index.ts` 是 @r05en1cu/dsh-mygo-api 的公开导出面（契约类型、
PluginError 词汇、fake-env 测试面）；`src/invariant.ts` 是包级 invariant
companion。契约按能力拆分到 `src/<feature>/` 目录；新增公共面时同步更新
`package.json` 的 `exports` 白名单。
