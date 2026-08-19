# tests/ — mygo-loader-hub 测试

- `registry.spec.ts`：快照解析/摘要校验/Ed25519 验签（本地生成密钥对
  注入）/篡改检测/双 origin 故障转移/NDA 404 降级 vendored/
  insecure-no-verify 规则。
- `intent.spec.ts`：三种 install intent 翻译（profile-bundle 两种 spec、
  guided 展示、repository-plugin 默认拒绝 + 探针放行）、可安装判定与
  治理提示、collections 原子安装（stub 执行面验证整组丢弃）。
- `adapter.spec.ts`：hub adapter resolve/list/install 委托。
- `fixtures/registry-v1.json`：dsh-hub 真实快照（第三方语料，豁免区）。
