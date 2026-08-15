# Decision: 角色清单化——manifest 角色索引 + client 角色上下文 + 门禁多角色遍历

Status: implemented

## Problem

角色（鲸鱼娘）硬编码在 `assets/manifest.json` 的平铺 `states` + `assets/*.png` 平铺文件里；client 的 sheet URL/缓存 key 用裸文件名，无角色命名空间。换角色必须改 manifest 结构 + 源码常量（SPRITE_MAX/CSS 尺寸），无法「纯加资源换角色」。架构演进设计（docs/architecture-evolution.md）要求「角色扩展性：行为层共通、角色可替换、动画集最小单元」。

## Decision

- **manifest 升级为角色索引**：`characters.<id>.states`（sheet 在 `assets/characters/<id>/`）+ `default` 指定默认角色 + `meta`（stageSize/credit）。顶层 `states` 保留为旧格式兼容简写（单角色、sheet 平铺 `assets/`）——旧安装目录与旧 client 零迁移。
- **client/character.mjs（纯函数解析层）**：`parseCharacters`（旧/新格式归一）、`listCharacters`/`defaultCharacter`/`getCharacter`/`stateOf`（角色级动画集，缺 → ~~emoji 兜底~~ → undefined 占位，见 [asset-full-contract](2026-08-09-asset-full-contract.md)）、`isKnownState`（~~EMOJI 表成员~~ STATE_NAMES 集合成员）、`ROLE_ID_RE`（`[a-z0-9-]`，URL 注入面）。8 条单测。
- **client/index.mjs 角色上下文**：manifest 加载后解析角色（默认角色 + localStorage `dsh-pet:character` 偏好）；`sheetKey(sheet)` = `${characterId}:${sheet}`（缓存命名空间防切角色串图）；`sheetUrl(sheet)` = `assets/characters/<id>/<sheet>`；所有 `manifest.states` 访问改 `stateOf(character, name)`。缺 sheet 状态 → EMOJI 兜底（现有降级机制，think/wait 先例）。
- **verify-assets 多角色遍历**：解析角色索引（新格式按角色目录校验、旧格式平铺兼容），校验每个角色：状态 ∈ ~~EMOJI~~ STATE_NAMES、sheet 存在/扩展名白名单/frames/fps/~~loop~~ playback/motion/PNG 尺寸契约（playback 数据驱动见 [playback-data-driven](2026-08-09-playback-data-driven.md)）；新增角色 id 合法性（`ROLE_ID_RE`）与 default 指向校验。自证测试 6 条新增（接受多角色、拒绝角色 sheet 缺失、拒绝非法 id、拒绝 default 悬空、旧格式兼容）。
- **docs/sprites-spec.md**：投放路径改为角色目录；manifest 模板升级为角色索引格式；规则补角色 id 字符集。

## Alternatives considered

**A：每角色独立 character.json（索引文件 + 每角色文件）。** 15 状态封顶现状下两次 fetch 换不来收益；等「外部角色包」（P4）真实出现再拆——当前单文件角色索引足够——弃。

**B：theme/skin 独立第三层。** 一个角色一套素材时 skin ≡ character，无独立存在意义；同角色多配色是未来需求（P3），解析函数签名已预留（stateOf 可加 overlay 位）——当前不建层——弃。

**C：只加 characters 不迁文件（sheet 继续平铺）。** sheetUrl 需探测目录存在（额外请求）；统一按角色目录组织更干净且门禁可强制——弃。

## Consequences

- 换角色 = 纯加资源（`assets/characters/<新id>/` + manifest 条目 + 改 default 或 localStorage 偏好），零改代码；~~缺 sheet 状态 emoji 兜底~~（已废止：素材全量契约要求 15 状态全有 sheet，见 [asset-full-contract](2026-08-09-asset-full-contract.md)）。
- 缓存 key 含角色 id（防串图）；sheet URL 角色目录化（Node half assets 路由零改动，天然支持子目录）。
- 已知边界：localStorage 偏好由用户手动设置（无 UI，P2 加菜单「换角色」）；角色 meta.stageSize 尚未接入 CSS 变量（P2 尺寸参数化，配置系统已铺 --pet-size）；~~think/wait 仍 emoji 兜底~~（470b940 起已有真 sheet：think.png/wait.png，1 帧 + float/wiggle）。
- 关联：docs/architecture-evolution.md 角色扩展节；架构演进第 2 项。
