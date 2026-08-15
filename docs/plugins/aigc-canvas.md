# aigc-canvas fork

上游：npm `@huanlin/dsh-plugin-aigc-canvas`，当前 vendored 版本 `0.1.0`。npm 包未声明可发现的上游仓库，因此没有 Git 基线；同步需要通过重新发布 npm 包并人工核对。

## 本地差异

- 移除 `prepare` 生命周期脚本。发布包只带 `lib/`/`assets/` 等产物，`prepare: tsdown --config tsdown.prepare.config.ts` 缺少源文件与构建配置；运行时不需要安装期构建。
- 发布版 `0.1.1` 曾把浏览器模块注册为旧的 `@dsh-external/dsh-aigc-canvas` id；vendored `0.1.0` 已使用 `@huanlin/dsh-plugin-aigc-canvas`。
- `desktop/bundle/make-bundle.ps1` 在打包阶段校验并保留正确的 client module id，防止旧发布包令浏览器 loader 拒绝该模块。

## 同步动作

1. 从 npm 重新拉取目标版本并放入 `plugins/aigc-canvas/`，排除 node_modules 与缓存。
2. 删除安装期生命周期脚本（`prepare` 等），并核对 `lib/client.js` 的 `window.__ModuleLoader__.load({ id })` 是否为 `@huanlin/dsh-plugin-aigc-canvas`。
3. 检查 AGPL-3.0 许可证、可选 provider 能力和 canvas 持久化目录没有引入新的密钥/网络权限。
4. 更新本文件与 `maintenance/upstreams.json` 的 `version`。