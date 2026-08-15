# 架构与仓库边界

Marisa 采用单仓库发行模型。一个 Git tag 必须足以复现同版本的源码、配置和桌面壳。

```text
marisa-distro/
├─ harness/                 DSH rc 源码 fork，由本仓库直接维护
├─ plugins/                 所有 vendored 插件源码
├─ desktop/                 固定版本的 Go/Wails 桌面壳与安装器
├─ bundles/marisa-bundle/   插件组合和 Cordis patch
├─ profiles/marisa/         可生成的 Marisa profile
├─ maintenance/             上游 URL、commit 基线和 mirror/fork 分类
├─ scripts/                 仓库策略和上游检查
└─ docs/                    差异、同步、打包与治理文档
```

## 所有权规则

- `harness/` 不是 submodule。Marisa 必须能在一次 clone 后构建，不能引用尚未推送的外部 commit。
- `desktop/` 是发行版自有组件，随 Marisa 版本固定。
- `plugins/<id>/` 只包含源码与插件自身需要分发的构建产物，不提交 `node_modules`、缓存或嵌套 `.git`。
- 无 Git 仓库可跟踪的 npm 插件按发布 tarball 快照 vendored 进 `plugins/`，并通过 `file:` 依赖和 `version` 字段锁定；安装期不执行它们的生命周期脚本。
- MyGO 市场组件保留 registry 精确锁定，是用户点击后下载扩展插件的入口，因此 Marisa 不是离线包。

## 插件所有权类型

- `mirror`：本仓库不做功能修改，只允许上游同步 PR 改动。
- `fork`：存在 Marisa 兼容或产品修改，必须在 `docs/plugins/` 保留差异账本和同步动作。

机器可读基线位于 `maintenance/upstreams.json`；profile 生成器的目录/包名映射位于 `profiles/marisa/plugins.json`。`pnpm test:repository` 会验证目录、基线、source、差异文档和两份 manifest 的完整性。
