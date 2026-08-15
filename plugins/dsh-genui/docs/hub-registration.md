# hub 收录登记建议（供 hub 维护者 triage 时复制）

按 dsh-external 规则，hub 不接受 PR：插件仓库由 hub 的 Agent Loop（每 2 小时同步）+ 管理员 triage 收录。
本文件是给维护者的**登记建议**，同步循环把 dsh-genui 标记为「未分类」时，直接复制下面两段即可。

## catalog.source.json（repos 数组追加一行）

```json
    { "name": "dsh-genui", "category": "plugin", "tags": ["web-ui", "generative-ui", "visualization", "interactive"], "note": "对话内生成式 UI：dsh-ui 围栏渲染为可交互组件（布局/图表/函数图/测验/3D/事件循环），渲染器经主仓 fence-registry 扩展点注册，插件 + 配套 skill 独立分发" }
```

## README.md（插件表格，按名字排序插在 dsh-gomoku 前）

```
| [dsh-genui](https://github.com/dsh-external/dsh-genui) | bundle · cordis | 对话内生成式 UI：模型用 `dsh-ui` 围栏把可交互组件直接画进回答流（布局/图表/函数图/测验/3D/事件循环） — DSH 对话内生成式 UI 插件：dsh-ui 围栏渲染为可交互组件，渲染器经主仓 fence-registry 扩展点注册，插件 + 配套 skill 独立分发 | TS | 2026-08-09 |
```

管理器标注：package.json 声明 `dsh.bundle.patch`（`cordis.patch.yml`）→ 自动推导 `bundle · cordis`，无需人工覆盖。
已打 topics：`dsh`、`dsh-plugin`（内测群收编要求）、`marisa-plugin`（自动进 plugins.json 通道）、`web-ui`、`generative-ui`。

> 仓库保持在 `dsh-external` 组织内（私有，内测期间不公开），hub 同步循环可直接读取组织仓库。

> 本地已就绪的完整 commit 在 `/tmp/dsh-hub`（`b79eb2a catalog: add dsh-genui`），管理员可 cherry-pick 或照抄。
