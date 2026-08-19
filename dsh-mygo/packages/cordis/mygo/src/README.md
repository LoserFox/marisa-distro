# Source Layout

`src/index.ts` 是 @r05en1cu/dsh-mygo 的公开导出面；`src/invariant.ts` 是
包级 invariant companion。治理能力按 `src/package/<feature>.ts` 拆分
（fine-epoch / requires-gate / pack 等），生命周期编排在
`src/lifecycle.ts`；新增能力目录时同步更新 `package.json` 的 `exports`
白名单与 DEV-GUIDE 的模块地图。
