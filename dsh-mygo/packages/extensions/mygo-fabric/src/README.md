# src/ — mygo-fabric 源码

- `fabric.ts`：fabric extension 治理壳——extension 登记表首条
  （`fabricExtensionRegistration`）、受管块写入/移除（幂等标记块，P3
  启停块同机制）、`enableFabric`/`disableFabric`（经 profile loader
  执行面安装；默认 git 子目录 spec 白名单过渡，验证用本地路径 spec）。
- `index.ts`：包面 + mygo 受管插件形态（挂载即登记进治理面）。
- `invariant.ts`：包级 invariant 伴生（官方模板形态，空 installer）。
