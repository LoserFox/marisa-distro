# src/ — mygo-loader-hub 源码

- `registry.ts`：`omdsh-registry/v1` 客户端——双 origin 拉取故障转移、
  本地快照（file:// 或 vendored `assets/registry-v1.json`）降级、
  snapshotId 摘要校验（canonical JSON sha256）、Ed25519 验签（签名非
  null 时强制；`HUB_BUILTIN_KEYS` 内置常量当前为空 + 轮换窗口结构）。
- `assess.ts`：可安装判定（listing/release 硬门）与治理元数据提示
  （risk/listing/maintenance/relations/capabilities，建议式）。
- `intent.ts`：install intent 翻译——profile-bundle → pnpm intent；
  guided → display；repository-plugin 默认拒绝 + dsh.bundle 启发式探针
  实验放行。
- `adapter.ts`：`createHubLoaderAdapter()`——LoaderAdapter 契约实现
  （`id: 'hub'`；`hub:<id>[@release]` spec；list 检索面）。
- `index.ts`：包面 + mygo 受管插件形态（挂载即注册进治理面）。
- `invariant.ts`：包级 invariant 伴生（官方模板形态，空 installer）。
