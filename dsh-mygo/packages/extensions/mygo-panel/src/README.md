# Source Layout

`src/index.ts` 是面板服务端注册面（settings.section / api 路由）；
P0 起 `/api/mygo` 读门沿用 host 信任语义，写门 loopback-only；
`src/trust-fence.ts` / `src/hub-catalog.ts` / `src/hub-version.ts` /
`src/catalog-sources.ts` 为目录与安全面（trust fence / hub 条目投影 /
semver 更新态 / local-hub-github 三源合并）。
`src/client/` 是 Web 客户端（r7 起组件化拆分，经 tsdown 产出 lib/client.js）：

- `index.ts` — 槽位注册：settings.section 主面板 + settings.plugin.item
  受管插件逐张配置卡片（r7.1 合并：轮询 config-cards 差异注册/注销）
- `api.ts` — /api/mygo/* 类型化客户端与全部面板数据类型（单点契约镜像）
- `Panel.tsx` — 主壳：头部概览（版本/统计/BOM/导入导出）+ 标签页导航 + 通知条 + 配置抽屉
- `PluginList.tsx` / `InstallPanel.tsx` / `UpdatesPanel.tsx` /
  `ConfigHelper.tsx` — 四个标签页
- `InstallPanel.tsx` — 插件安装（r7.3 收敛：npm bundle 默认 / 单个 tar 包）
- `HubCatalog.tsx` — 目录页（搜索/类型/风险筛选 + 安装/更新 +
  operation SSE 状态与重启横幅）
- `CatalogSourcesPanel.tsx` — 目录来源卡片（逐源报告 + 三源配置）
- `PackInstallCard.tsx` — 整合包安装卡片（预留位，走 CLI）
- `PluginConfigCard.tsx` — 受管插件配置卡片（settings.plugin.item；
  外壳对齐官方 PluginCard 折叠形态 + mygo 小标，保存走核心 API）
- `ConfigTransfer.tsx` — 整 profile 配置导入/导出（面板头部）
- `ConfigEditor.tsx` — 抽屉形态配置编辑器（表单/JSON、重置模板、复制 JSON）
- `ConfirmDialog.tsx` — 危险操作/计划警告统一确认弹窗
- `ConfigFields.tsx` — 共享字段编辑器（schemastery-style；P1 对齐
  plughub：string list/dict 行编辑、secret 只写、unsupported 只读 JSON）

`src/css-modules.d.ts` 是 CSS Modules 类型声明。新增客户端能力时同步更新
`package.json` 的 `exports` 白名单（./client）。
