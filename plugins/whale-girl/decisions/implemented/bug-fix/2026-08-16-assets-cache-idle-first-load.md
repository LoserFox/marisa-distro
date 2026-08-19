# Decision: 素材 immutable 缓存 + idle 优先加载——多插件环境首屏提速

Status: implemented

## Problem

多插件环境（web-ui 全家桶，50+ 插件 bundle）下刷新页面宠物 10-20s 才出现（issue #6）：whale-girl 的 16 个请求（manifest + 15 张 PNG）在连接池与主线程上被其他插件 bundle 的解析执行拖住；`no-cache` 缓存头让每次刷新都全量重下素材，15 次 `analyzeSheet` 逐像素扫描排主线程末尾。实测（50 bundle 环境）：暖刷新 PNG 总耗时 249ms、冷加载 287ms。

## Decision

- **素材路由 immutable 缓存**（`lib/index.mjs` assets 路由）：`cache-control` 由 `no-cache` 改为 `public, max-age=31536000, immutable`。素材路径含角色 id（`/assets/characters/<id>/…`）且随包分发，内容不可变——刷新零请求（实测暖刷新 PNG 总耗时 249ms → 11ms，transferSize 归零）。
  - **发布契约**：改图必须改文件名或角色 id（immutable 会滞留「同名被替换」的旧图——替代原 no-cache 的重新校验防线）。契约写入 `docs/adding-a-character.md` 与路由注释。
- **client idle 优先加载**（`lib/client/index.mjs` `loadAssets`）：由 `Promise.all` 全等改为「先 await idle 一张，其余状态后台 preload 不 await」——连接池饱和时 idle 最先发出/扫描，首帧尽快显示；无 idle 状态的角色退化为全并发。实测冷加载 PNG 总耗时 287ms → 136ms；宠物挂载时机取决于初始状态（会话活跃时初始为 think/wait，首帧等待的是那张 sheet——该场景收益来自缓存头而非 idle 优先）。
- 两个改动均与素材格式/清单契约无关（`verify-assets` 门禁不变）。

## Alternatives considered

**A：素材合并单张 spritesheet.webp（dsh-pet 模式，16 请求 → 1 请求）。** 请求数与扫描次数最优，但需重做切图管线与播放器尺寸逻辑，超出本 bug-fix 范围——长期方向，暂不实施。

**B：只做 idle 优先，不动缓存头。** 冷加载有收益但暖刷新（issue 主场景「刷新页面」）无改善——缓存头是主收益，两者互补。

**C：idle 等待加超时兜底。** idle sheet 加载失败时其余 14 张会等重试背退（最坏约 1.5s）——verify-assets 门禁保证发布时 manifest↔文件一致，正常发布不触发；超时兜底留待真实故障场景再补。

## 取代检查

无重叠：`feature/2026-08-09-asset-full-contract.md` 与 `feature/2026-08-09-character-manifest.md` 覆盖素材格式/清单契约与解析层，本记录不改格式与解析；`feature/2026-08-09-config-system.md` 覆盖体验层配置——本记录只新增「素材 HTTP 缓存策略」与「加载顺序」，活跃决策树中无记录覆盖。

## Consequences

- 暖刷新（缓存命中）：16 个素材请求零传输，PNG 总耗时 −95%；冷加载 PNG 总耗时 −52%。
- 发布侧新增硬约束「改图必改文件名或角色 id」——违反则用户端滞留旧图直至缓存过期（365 天）。
- 引用点：`lib/index.mjs`（assets 路由缓存头）、`lib/client/index.mjs`（loadAssets idle 优先）、`docs/adding-a-character.md`（改图约束）。
