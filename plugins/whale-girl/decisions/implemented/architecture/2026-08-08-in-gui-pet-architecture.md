# Decision: GUI 内桌面宠物架构（A 模式）

Status: implemented

部分消费边界已由 [外部只读快照契约](2026-08-14-external-snapshot-contract.md) 取代：GUI 仍是本仓库唯一分发的界面，但本地外部伴侣可以非消费式读取状态。

## Problem

目标是一个"类似 QQ 宠物"的插件。QQ 宠物的原型是挂载在 OS 桌面上的原生悬浮窗。plugin-registry 插件的 client half 只能跑在 DSH Web GUI 的浏览器页面里，无法脱离浏览器挂到原生桌面；需要决定宠物以什么形态落地。

## Decision

宠物以 **A 模式（GUI 内宠物）** 落地：

- **client half**：在 DSH Web GUI 内自渲染一个 `position: fixed` 的宠物层（纯 DOM + CSS 动画起步，Canvas 为后续备选），支持拖拽、点击互动、状态显示。bundle 走 `window.__ModuleLoader__.load({ id: "vlln/dsh-pet", factory })` 契约，零平台模块依赖（纯 DOM），`id` 必须等于插件 id。
- **Node half**：`inject: ['httpServer', 'tools']`；`ctx.httpServer.register` 注册 `GET /plugins/vlln/dsh-pet/state`（状态快照）与 `POST /plugins/vlln/dsh-pet/interact`（feed/play 动作）；`ctx.tools.register` 注册 `pet_feed`/`pet_play` 工具（模型也可喂宠物）；`contributes.tools` 与注册逐名一致。
- **状态同步**：客户端轮询（默认 3s）Node half 状态路由——task-status 的"自造缝"模式，官方树零改动。
- **状态机**：`src/pet-state.mjs` 为纯函数模块（tick/feed/play，不可变更新），零宿主依赖，可脱离 dsh 单测。

边界：宠物只存在于 DSH Web GUI 页面内；关掉页面宠物即消失（状态持久化属后续 feature）。真·OS 桌面宠物（脱离浏览器、置顶、托盘、开机自启）不属于插件能力，见备选方案 B'。

## Alternatives considered

**B'（原生桌面伴侣）。** 拆两块：registry 插件只做 Node half 暴露状态 API，另配 Tauri/Electron 原生程序常驻桌面渲染宠物，经 DSH 服务端 HTTP/WS 通信。落败原因：伴侣程序不是 registry 插件产物，属于另一个项目；当前阶段（无外部消费者）先交付 GUI 内形态验证交互与状态机，B' 作为后续 feature 单独决策。

**C（官方槽嵌入）。** 挂进 `conversation.input.dock` 等官方槽。落败原因：宠物是全局悬浮物，不需要会话上下文；官方槽语义不匹配，且当前纪律是插件侧自造缝。

## Consequences

- client half 自渲染意味着动画、拖拽、菜单全部自建，官方树零改动。
- 轮询粒度（3s）而非推送，状态实时性有限——当前够用；后续可换 `@deepseek-ai/dsh-client-connection` 通道（引入平台模块依赖，bundle 构建契约随之变化）。
- 引入"构建产物"这个新生成物：`client.js` 必须由构建脚本生成并受 `--check` 守护。
- 未注册 `/pet` 命令与状态持久化——属后续 feature，分别单独决策。
