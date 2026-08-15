# Decision: 项目更名 dsh-pet → whale-girl（插件 id/路由/命名空间/存储键/事件名统一）

Status: implemented

## Problem

项目名 `dsh-pet` 是泛称（任何宠物都能叫 dsh-pet），与角色 `whale-girl`（鲸鱼娘）不匹配；且插件尚未对外分发（本地提交未推送、无外部消费者）——改名成本窗口期，错过则成为永久历史包袱。

## Decision

- **插件 id**：`vlln/dsh-pet` → `vlln/whale-girl`（`dsh.plugin.json` + client bundle `load({ id })`，verify-contributes 门禁强制 bundle id = 插件 id）。
- **路由前缀**：`/plugins/vlln/dsh-pet/*` → `/plugins/vlln/whale-girl/*`（state/interact/config/assets 四个端点，Node half 与 client half 同步）。
- **命名空间与存储**：settings NAMESPACE `dsh-pet` → `whale-girl`（settings.yaml section）；账本状态文件 `<dshHome>/data/dsh-pet/state.json` → `<dshHome>/data/whale-girl/state.json`；localStorage 键 `dsh-pet:character`/`dsh-pet:pos` → `whale-girl:*`。
- **DOM/事件契约**：宿主标记 `data-dsh-pet`（含 `-inert`/`-hidden`）、keyframes 名 `dsh-pet-m-*`/`dsh-pet-float`/`dsh-pet-pop`、开放事件 `dsh-pet:say`/`dsh-pet:fx`/`dsh-pet:status` → 统一 `whale-girl` 前缀（第三方驱动事件契约随更名同步，见 docs/architecture-evolution.md）。
- **不变项**：工具名 `pet_feed`/`pet_play`/`pet_status`（宿主面 API 稳定）；角色 id `whale-girl`（已是）；DOM 结构类 `pet-*`（stage/sprite/hitarea/menu/bubble/heart/status）——非插件标识。
- **历史档案不追溯**：`decisions/` 既有记录是已实施决策的事实记录，保留当时命名，不机械替换（verify-decisions 门禁只校验格式与链接可达性）。

## Alternatives considered

**A：只改目录名，保留插件 id `vlln/dsh-pet`。** 半改名——路由/存储/事件名仍带旧名，混乱且下次改名成本未消除——弃。

**B：加兼容垫片（旧 id 别名/旧路由重定向/双事件名监听）。** 无外部消费者，垫片是永久维护负担；「可自由重命名与重组」阶段不设兼容层——弃。

## Consequences

- **已安装实例失效需重装**：`~/.dsh` 与验证站的 `vlln/dsh-pet` 安装目录须移除，重装 `vlln/whale-girl`；web 进程需重启加载新插件树（旧 id 未 import 过则新 id 首次 enable 可免重启，见 ESM 缓存决策）。
- **配置迁移**：settings.yaml 的 `dsh-pet:` section 不自动迁移（回退默认），用户配置需手改 section 名。
- **账本迁移**：`data/dsh-pet/state.json` 不自动迁移（新 id 从空账本开始）；可手动拷文件到 `data/whale-girl/`。
- 开放事件新契约 `whale-girl:say`/`whale-girl:fx`/`whale-girl:status`；引用旧事件名的第三方需同步。
