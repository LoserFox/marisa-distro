# Decision: 单角色时「换角色」按钮置灰——消除静默无反馈

Status: implemented

## Problem

宠物点击面板的「🎭 换角色」按钮在 manifest 仅内置 1 个角色时点击无任何反馈（click 处理 `roles.length < 2` 直接 return）：按钮看似可点实则无操作，用户误以为功能故障（issue #6 附带发现）。曾调研「把换角色迁入宿主插件配置区」：宿主 Settings → Plugins 面板的插件清单为**只读** inventory（模块名/状态），settings 服务只渲染 schemastery schema 表单且 schemastery（含 DSH fork）无 button/select 字段——第三方插件在宿主配置区没有动作按钮机制，该方向不可行，放弃（保留在宠物面板，改为置灰）。

## Decision

- **单角色置灰**：client 新增 `syncRoleBtnState()`——`listCharacters(manifest).length < 2` 时 `roleBtn.disabled = true` + 置灰（内联 `opacity 0.35` / `cursor default`）+ `title="暂无其他角色"` 悬停提示；多角色时还原（内联样式清空）。
- **两个刷新点**：模块初始化时调用（manifest 未加载 = 单角色默认 → 置灰）；`loadAssets` 解析 manifest 后调用（角色清单就绪 → 刷新可用性）。
- **点击兜底保留**：click 处理里的 `if (roles.length < 2) return` 不删——disabled 按钮不发 click，兜底无害且防程序化触发。
- 关键样式一律内联（宿主可能覆盖/清理 CSS 注入，同 hitarea/menu 系列环境事实）。

## Alternatives considered

**A：点击时弹提示气泡（「暂无其他角色」）。** 保留按钮可点 + 显式反馈。弃：置灰是更标准的「不可用」语义；气泡通道是行为反馈（喂食/玩耍/思考陪伴），不承担表单提示职责；title 悬停提示已够。

**B：单角色时隐藏按钮。** 菜单三项变两项，布局跳动。弃：置灰保留布局稳定与可发现性（用户知道存在换角色功能，只是当前不可用）。

**C：换角色迁入宿主「插件配置」区。** 实证宿主无第三方动作按钮机制（插件 inventory 只读、settings 表单无 button/select 字段），需要宿主新增机制，超出插件能力——放弃。

## 取代检查

无重叠：`feature/2026-08-09-panel-abstraction.md` 覆盖菜单/状态卡/气泡面板的样式与生命周期抽象，本记录不改面板结构；`feature/2026-08-09-character-manifest.md` 覆盖 manifest 角色索引格式与解析层，本记录不改清单契约——本记录只新增「单角色时换角色按钮的可用性语义」，活跃决策树中无记录覆盖该行为。

## Consequences

- 单角色（当前唯一发布形态）下按钮恒置灰 + 悬停提示「暂无其他角色」，不再静默无反馈。
- 多角色（manifest 后续扩展）自动恢复可点；`syncRoleBtnState` 在 manifest 解析后刷新，无时序窗口。
- 引用点：`lib/client/index.mjs`（`syncRoleBtnState` 定义 + 初始化调用 + `loadAssets` 内调用、click 兜底保留）。
