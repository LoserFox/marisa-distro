# Decision: 删除 Agent 工具（pet_feed/pet_play/pet_status）

Status: implemented

## Problem

whale-girl entry 注册了 3 个 Agent 工具（`pet_feed`/`pet_play`/`pet_status`）——宠物互动占用 Agent 工具面，任何会话的工具清单都带宠物动作；宠物互动本是 GUI 内悬浮角色的即时体验，不需要经 Agent 工具间接触发（Agent 工具调用与菜单点击是同一行为的重复通道）。

## Decision

- **删除全部 Agent 工具**：entry 移除 3 个 `ctx.tools.register` 块；`inject` 移除 `'tools'`（entry 不再消费 tools 服务）。
- **交互保留在 client 侧**：菜单投喂/玩耍（`/whale-girl/interact` 路由 + `applyAction`）不变——用户点击仍触发 eat/play/joy；工具删除只移除「Agent 会话里调宠物动作」的通道。
- **`verify-tool-schemas` 门禁退役**（无工具对象可查）：run.mjs 条目 + 门禁 + 自证移除。
- `ctx['whale-girl.pet']` 服务（开放性窄缝，其他插件 `inject ['whale-girl.pet']` 消费）**保留**——不是工具。

## Alternatives considered

**A：保留工具（Agent 也能喂宠物）。** Agent 工具与菜单是重复通道；工具面被宠物动作占用影响会话工具清单整洁；无 Agent 侧宠物互动的真实需求——删。

**B：只删 pet_feed/pet_play，留 pet_status。** 状态查询对 Agent 有信息价值（会话中了解宠物资历）——但 pet_status 也占用工具面且价值低（宠物资历与 Agent 任务无关）；统一删除，保持「宠物 = GUI 内互动角色，不参与 Agent 工具面」。

## 取代检查

部分取代 [2026-08-10-migrate-to-official-repository-plugin.md](2026-08-10-migrate-to-official-repository-plugin.md)：
其「目标态/工具可用性/验收核对」中的工具注册与调用陈述由本记录取代（Agent 工具已删除）；
该记录的架构与分发决策（.dsh-plugin 结构、config.yaml 安装、tapIndex 注入）不受影响。

## Consequences

- Agent 工具面不再包含宠物动作（会话工具清单干净）；宠物互动完全走 GUI 交互（菜单/拖拽）。
- entry 依赖面再减（tools 服务依赖移除）；门禁少一个（verify-tool-schemas 退役）。
- client 交互行为不变（菜单/路由/动画照常）。
