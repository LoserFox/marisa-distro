# Mirror 干净度核验报告

> 生成：`node scripts/verify-mirror-purity.mjs`。对比对象：本地 vendored 树 vs 上游 baseline commit（忽略 node_modules/lib/dist/.dsh-build 等构建产物与行尾差异）。

| 组件 | baseline | 结果 | 差异文件 |
|---|---|---|---|
| dsh-a2a | `220de3a5cf8b` | ❌ DIRTY | package.json (content differs)<br>ui-a2a/package.json (content differs) |
| dsh-artifact | `cad2c4dacccf` | ❌ DIRTY | package.json (content differs) |
| dsh-code-map | `c90e37d02da5` | ✅ CLEAN |  |
| dsh-drag-and-drop | `09088d689086` | ❌ DIRTY | CHANGELOG.md (content differs)<br>package.json (content differs)<br>README.i18n.yaml (content differs)<br>README.md (content differs)<br>README.zh.md (content differs)<br>src/locator.ts (content differs)<br>tests/locator.spec.ts (content differs) |
| dsh-multimedia-webui-input | `fecdc67a4789` | ✅ CLEAN |  |
| dsh-paste-input | `2fa32218af50` | ❌ DIRTY | package.json (content differs)<br>README.en.md (content differs)<br>README.i18n.yaml (content differs)<br>README.md (content differs) |
| dsh-sonar | `1de51055a30e` | ❌ DIRTY | package.json (content differs) |
| dsh-change-ledger | `ae742c65689c` | ❌ DIRTY | VENDOR.md (local-only) |
| harness | `b150a551b8d4` | ✅ CLEAN |  |

共 9 个组件，6 个存在本地差异（DIRTY 组件转 submodule 前必须先消除差异：反馈上游或降级 fork）。
