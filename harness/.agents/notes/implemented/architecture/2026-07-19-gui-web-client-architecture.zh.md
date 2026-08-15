# RFC: Web 客户端架构——client cordis 插件树、slot 体系与 React-free 对象层

Status: implemented

[English](2026-07-19-gui-web-client-architecture.md) | 中文

> 分工线：通道无关的分层模型与 RPC 协议（消息模型/类型体系/契约面/客户端基类）见 [分层与 RPC 协议 RFC](2026-07-19-gui-layering-and-rpc-protocol.md)；本篇 = 浏览器侧：client cordis 树如何装载、UI 插件如何经 slot 与服务组合、React-free 对象层如何以不可变快照供给 React。

## Problem

浏览器客户端受两股力塑形。其一是流式：事件驱动的对话 UI 里，若业务状态（事件窗口、流式累积、待答交互、连接状态机）散落在 React 组件与全局 store 中，每个 token 分片都会震荡渲染树，且换 UI 库等于重写业务逻辑。其二是模块化：UI 功能（布局、侧栏、对话、主题、语言包）必须是可独立装载的插件——按 host 下发的 manifest（元数据清单）在运行时组合，而非编译进单一 bundle——同时不放弃跨插件边界的编译期类型安全。

## Decision

两端都跑 cordis。host 是一棵 cordis 插件树；浏览器里跑第二棵 client 侧 cordis 树，其中每一项 UI 能力都是插件，由壳静态持有的 loader 动态装载。树内 cordis ctx 承载一切运行时事实（服务、store、会话 scope），React 是纯投影：组件对框架零 import，一切经 props 注入，经 `useSyncExternalStore`（下称 uSES）订阅不可变快照。

```
┌─ Host ─────────────────────────┐   ┌─ Browser ─────────────────────────────────────────┐
│ sessions/agents/SessionLog     │   │ client cordis root ctx                             │
│ apiproxy: RPC + mux/host 双流  │◀─▶│  ├ vendored Loader + ctx.modules（内核，壳静态持有）│
│ webserver:                     │   │  ├ immediately entries: connection/runtime/        │
│  ├ GET /plugins/<id>/client.js │   │  │   ui-theme/i18n（fetch bundle，boot 预拉）       │
│  └ GET / 注入 __DSH_BOOT__ 图  │   │  ├ lazy entries: layout/sidebar/                   │
│                                │   │  │   conversation/trajectory（fetch bundle，按需） │
└────────────────────────────────┘   │  ├ app-shell 伪行（壳内静态注册，同一治理）        │
                                     │  └ session scope ×N（观看驱动，惰性建）            │
                                     │ React: loading 页 → settled → 整 UI 一次成型       │
                                     └────────────────────────────────────────────────────┘
```

## client cordis 树与装载链

装载链——两类包（普通包 vs dshClient 插件）、模块系统/插件治理器之分、host 独家撰写的带修订号 entry 图之上的双层 boot、热重载——归 [client 插件装载 RFC](2026-07-23-client-plugin-loading-model.md) 所有。本篇赖以立足的事实：浏览器启动与 host 相同的 vendored `@cordisjs/plugin-loader`，由 client 模块系统（`ctx.modules`，`packages/client/modules`）填上其 `internal` seam；凡带产品行为的单元都是 host 独家撰写的 `__DSH_BOOT__` 图里的 entry——每个生产插件包（含基础设施）都携带 `dshClient` 声明、以 fetch 到达的 `./client` tsdown 闭包 bundle 供给，`immediately` 行的差别仅在 boot 第一层预取，而普通包（react 家族、cordis、尚未升格的库）保持打进壳、已播种、对图不可见；bundle 执行 `window.__ModuleLoader__.load({ id, factory })`，其 `require` 由 lazy CJS 模块表应答（种子词条 + 已登记工厂，首次 require 时物化并记忆化——跨插件值 import 是构建错误，协作走 cordis 服务）；插件 CSS 内联在 bundle 里、物化时注入为 `<style data-plugin="<id>">`（CSS Modules 哈希 + 归属标记 = 隔离，重载时移除）；热重载已在 dev 图落地——webserver 对自己供给的 bundle 做 stat 轮询并广播 `rebuilt` SSE 帧，`client-hmr` 插件每帧换掉一个 fiber。settled 翻转（`loader.await()` + 一次全 ACTIVE 扫描）依旧让壳从 loading 页一次切换到真 UI——settled 意味着每个 entry 已创建、每个 fiber 都到达 ACTIVE，FAILED/PENDING 的 fiber 被大声列出；不存在部分可用模式（渐进渲染为后置工作）。

类型宇宙在聚合层拆分——`tsconfig.host.json` 是 host program、`tsconfig.client.json` 是 client program，二者由 solution 根 `tsconfig.json` 引用，因为两侧都在相同键（`sessions`、`loader`）上对 cordis `Context` 做声明合并且服务不同；client 包经纯类型子路径（`@deepseek-ai/dsh-session/types` 等）消费协议词汇，host 侧的声明合并不会搭车进入 client program。

## slot 体系：页面怎么拼

slot 体系有自己的 RFC——[slot 体系标准](2026-07-22-slot-type-chain-implementation.md)——本文整体移交给它。此处只留一段定位摘要：壳只渲染 `'root'`；插件用单独一次 `register` 调用组合 UI——占坑、声明并授权子坑（`children` spec 对象）、声明 store、注入业务面；组件 props 分四份额自动推导到达（`PropsRuntime<K>` / `PropsRenderSlots<S>` / `PropsStore<H>` / inject），各有唯一真源。`SlotMap` 声明合并仍是类型权威，entry 只携带 owner 份额（「谁注入的，类型归谁」）；每个被渲染的注册项都在 per-entry 错误边界之内。

实现的家：注册表核心与 props 份额类型在 `packages/client/ui-slots`，出口组件/渲染器/uSES 桥在 `packages/client/web-react`。

## 服务与 scope 寻址

服务是插件对其他插件的唯一 API 面（UI 组件与注入面都不是 API；无人调用的插件不挂服务——ui-trajectory 即最小插件样板：无 ctx 服务，只做视图坑注册）。名册：`ctx.connection`（api client + 流句柄）、`ctx.slots`（注册表包装层，发 `slots/changed`，渲染入口，渲染器安装缝）、`ctx.sessions`（列表 store、当前会话状态、scope 树）、`ctx.loader`、`ctx.theme`、`ctx.i18n`、`ctx.layout`（跨插件视图导航）、`ctx.conversation`（send/cancel/startSession）。过去住在服务 store 里的观看态（面板宽、选中、草稿）现按 [slot 体系标准](2026-07-22-slot-type-chain-implementation.md) 住 entry 声明的 store。

slot 之外不存在第二种注册模型——原视图环与工具环都已溶解进来。会话视图即 ui-conversation 声明的 `'conversation.view'` list 坑的 entry，tab 元数据随注册 options（`id`/`order`/`label`）走，per-view chrome 住视图组件自身。Tool 展示跨越一条显式包边界：运行时把 Code Dispatch 拓扑投影进每个 root 递归的 `subCalls`；ui-conversation 把这个已排序 root 放进 single `'conversation.chat.tool'` seat，不解释 Tool 名称或拓扑；ui-tool 渲染传入的树，并声明 keyed/session 的 `'tool.call.toolview'` 子 slot。key 空间仍在运行时开放（SlotMap 声明 slot、从不声明 key），root 与任意深度的后代都按 `entryKey: toolName` 分发，以 `GenericToolCard` 兜底。业务包通过 `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<tool>', inject? }, Row))` 注册原子视图；声明本身就是加载与重载依赖（[决策](2026-08-05-slot-declaration-injection.md)）。ui-conversation 还通过 `'conversation.details.tool'` 委托选中调用的详情正文，使 ui-tool 的 card model 保持为唯一展示所有者，同时避免 conversation 导入 Tool 组件。

**scope 寻址**与 host 侧 agent scope 惯例同构：服务是 root 单例，方法不收 sessionId——它们读调用方 ctx 上的 scope 标（`scopeOf(ctx)`）。在会话 scope 内，`ctx.conversation.send('hi', 'queue')` 自动打到该会话；跨会话调用换 ctx 定向（`ctx.sessions.scope(id)!.conversation.send(...)`）；从 root ctx 直接调 scoped 方法即 throw。client 会话 scope 的铸造方式与 host agent scope 相同（no-op 插件 fiber + scope 键 extend），首次观看时惰性建，只有会话被移除且无人观看才拆——仅 host 会话死亡不拆 scope（冻结为只读视窗）。

## 数据对象层（`packages/client/runtime/src/client/sessions/`）

帧从这里进、快照从这里出、fold 坐在中间——React-free（零 React import，grep 可断言）：

```
mux/host 帧（ConnectionController 泵入，sinks 注入）
        │
        ▼
SessionManager.handleMuxEnvelope / handleHostEnvelope
        │ 带 sessionId 的帧只投已存在实例（审批/问答 requested 例外：进 pendingBuffers 缓冲）
        ▼
Session.handleMuxEnvelope ──► events 窗口（seq 连续升序）
        │                        │ 定稿事件            │ chunk
        │                        ▼                    ▼
        │                TranscriptAdapter     PartialAccumulator
        │                  （→ nodes）          （→ partial）
        ▼
Notifier 微任务合批 ──► ConversationSnapshot 缓存 ──uSES──► 组件
```

- **Session**（session.ts）：懒建、常驻——建成后在后台持续吃帧，切走切回秒显。操作面：`prompt`/`cancel`（RPC 透传；失败落进快照的 `promptError`）、`open`（拉尾页 history，幂等）、`loadOlder`（向上翻页，防重入）、`resync`（重连 = 清窗口重跑 open）。订阅面：`subscribe`/`getSnapshot`（恒返缓存引用）——`implements ObservableSnapshot<ConversationSnapshot>`，构造时挂 `useSelector = bindSnapshotSelector(this)`，Session 本身就是 uSES 源。帧分发是一个 switch：`session/event` 帧按 seq 去重（唯一去重键），open 在途时缓冲，否则追加 + 增量投影；open/缝合按 seq 合并 live 缓冲并去重，`subscribed.lastSeq` 超出窗口尾则回补一次。
- **ConversationSnapshot**（conversation.ts）：不可变快照契约——`nodes`（人类对话记录，日志序）、`partial`、`runningCalls`、`pending`、`running`、`removed`、`openState`、`hasMore`、`promptError` 等。**引用纪律**（memo 与 uSES 的前提）：顶层对象每变必新；未变化的 nodes 投影保持同一数组引用，消息流变化时返回新数组并复用未变化的元素引用；未变的子结构复用上一快照的引用。
- **SessionManager**（manager.ts）：实例簇 + 帧总入口 + 会话列表。带 sessionId 的帧只投已存在实例（mux 广播不得把每个会话都实例化）；例外是审批/问答 `requested` 帧——它们不落 history、open 无法回补，故缓冲进 `pendingBuffers`，实例化时回放。
- **Notifier**（notifier.ts）：两条通知通道，按变更来源取用。`markDirty()`（默认；帧驱动一律用它）按微任务合批——N 次变更、一次通知、一次重渲染；flush 先重建快照缓存再通知。`notifyNow()`（仅用户手势的直接回响）同 tick 重建并通知——受控输入的回响若延到微任务，DOM 会回滚、光标跳尾。帧驱动代码用 notifyNow 会让合批塌回逐帧渲染；禁。
- **TranscriptAdapter / PartialAccumulator**：对话记录是按日志顺序投影的 append 来源 surface（`@deepseek-ai/dsh-session/surface` 的 `isAppendSurfaceEvent`），外加每次落地的压缩检查点一个标记——绝不用模型 surface，后者遮蔽被替换的范围，会抹掉读者已经看过的对话。节点顺序天然按 seq 单调，因此既无核心 `seq === index` 断言需要满足，也没有降级分支。分片不贡献任何节点（O(1) 跳过）：累积器把 StreamChunk 折叠成 `AssistantBlock[]`，一次增量只换该块引用；定稿消息到达即在同一批内弃掉累积器（提升无闪烁）。成本模型：一个分片 = 一次字符串拼接 + 一个脏标记；帧风暴下未订阅的 Session 只花那个标记。
- **ConnectionController**（在 `packages/client/connection`）：开 mux/host 双流、for-await 泵入，代际围栏之内指数退避重连（500ms 翻倍至 10s 封顶、抖动、无限重试）；sinks 单向注入（Controller 不认识 Session）。重连 = 重建：`onConnected` → 列表刷新 + 各已打开会话 resync。对象层只面向 `IApiClient`；Web 承载以 HTTP POST 载两个 client→server 象限、以[每逻辑流一条 WebSocket](2026-08-04-websocket-downlink-carrier.md)载两个 server→client 象限，客户端类族归分层 RFC 属地。

## React 面（`packages/client/web-react`）

胶水包就是整条 ctx↔React 边界；组件保持零框架依赖。

- 快照 store 引擎**住 runtime 包**（zustand vanilla + 草稿式更新，缺省 `flush: 'sync'`，帧驱动 store 可选 `'raf'` 合批，可选整值 localStorage 持久化，dev 深冻结——全部从 `runtime` 的 `./client` 主出口导出，无子路径）：store 产物是裸的可观察源，不带任何 hook 成员。插件只经 [slot 体系标准](2026-07-22-slot-type-chain-implementation.md) 的 `defineStore` 声明触及引擎。web-react 在绑定处（`bindSnapshotSelector`，按源缓存）从 React 消费的唯一数据契约合成每个 hook：`ObservableSnapshot<T>`（`getSnapshot`/`subscribe`）——Session 对象与快照 store 同构满足它。业务插件包只依赖 runtime 与 ui-slots；web-react 是仅壳可用的胶水。
- `bindSnapshotSelector(source)`：把一个源绑定为经 uSES-with-selector 的带类型 selector hook。uSES 契约四条按构造成立：getSnapshot 恒返缓存引用；subscribe 是绑定期闭包（引用永稳）；纯 CSR 不传 server snapshot；相等性缺省 `Object.is`，按调用可选 `shallowEqual`。
- `useInvoke(fn)`：把异步动作包成引用恒定的触发器加 pending 标志；pending 走 per-hook 外部 store 经 uSES 读出（渲染路径零 setState），并发调用计数，invoke 引用永不变。
- 相等性协议，全链一致：生产端结构共享；消费端以 `Object.is` 或 `shallowEqual` 短路；`React.memo` 浅比较。深比较全链禁止。

## 目录形态

Client 包位于 `packages/client/*`，`apps/web` 是壳 boot 导出之上的薄 Vite 应用。插件包的浏览器半边在 `src/client/` 下；**一切构建产物落 `lib/`**——node 半边为 `lib/index.js`/`lib/invariant.js`，浏览器 bundle 为 `lib/client.js`（共享 tsdown client 预设两者皆出；无 `dist/` 目录，`exports["./client"]` 指向 `./lib/client.js`）。`ui-slots`、web-react 与 runtime 构成基础设施方向；功能插件通过 service 与 slot 协作，不导入展示实现。

多域插件包的 client 半边还按未来包边界再拆——ui-conversation 即样板：

```
src/client/
  contract/    shared slot and cross-domain types
  service.ts   cross-domain orchestration
  skeleton/    conversation shell and details host
  chat/        ordered conversation view
  input/       composer state machine
  queue/       queued-message presentation
  settings/    conversation settings rows
  apply.ts     cross-domain assembly point
  index.ts     public contract surface
```

各领域实现文件不 import 兄弟领域；共享面统一经过 `contract/`。`scripts/verify-client-domain-graph.ts` 把守分层（contract=0、domain=1、apply/index=2；import 只准指向不高于自身的层级；兄弟领域依赖会失败）。Tool 展示已经拆为独立 `ui-tool` 包，只通过 ui-conversation 声明的 slot 到达 chat 与 details。

## 怎么开发

- **新 UI 功能** = 新插件包：package.json 声明 `dshClient`（+ `inject` 拓扑），浏览器半边写在 `src/client/`（apply 挂服务/建 store、注册 slot），无 host 逻辑时 node 半边保持空 apply，用共享预设构建。把插件加进 host 配置；manifest 与装载随之自动跟上。
- **新 slot**：见 [slot 体系标准 RFC](2026-07-22-slot-type-chain-implementation.md)——契约合并进 `SlotMap`，在父 entry 的 `children` 里声明，经自动注入的 `renderSlot` prop 渲染。永不全局导出组件。
- **消费新帧类型**：带 sessionId → Session 分发 switch 加一个分支；host 级 → Manager 路由表；UI 需要时给 `ConversationSnapshot` 加字段并守住引用纪律。
- **状态住哪**：业务数据（事件、流式、待答）→ 永远对象层；父知道的 → renderSlot 现场的 owner props；单组件私有（滚动、搜索词、展开集）→ 组件状态；跨 entry 共享或跨重挂载存活（选中、草稿、面板宽）→ entry 声明的 store（[slot 体系标准](2026-07-22-slot-type-chain-implementation.md)）。
- **通知通道**：帧驱动/异步 = `markDirty` 合批；受控输入需要同 tick 的用户手势直接回响 = `notifyNow`。

## Consequences

token 流不再震荡渲染树：帧风暴对未订阅会话只花一个脏位，对被订阅视图每微任务一次合批重渲染（帧驱动 store 走 raf 合批）。UI 功能以独立插件的粒度装载、失败、停用——一个崩溃的 slot 注册项只黑一张卡，一个装载失败的 bundle 在 UI 切入之前大声报错。接受的代价：loader/模块表机件是团队端到端自持的定制基建；一次成型启动（无渐进渲染）用首屏粒度换装配简单；双类型 program 让「这个文件归哪个聚合」成为开发者偶尔要回答的问题。

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| 静态链接的单 SPA bundle | 插件必须由 host 在运行时按配置组合；单体把每个 UI 功能重新耦回一次构建 |
| window 全局变量 / import map 供共享依赖 | DI require 表让共享显式、大声失败、可替换；全局变量静默泄漏身份与版本 |
| 业务数据进 zustand 切片 | 事件窗口/累积器是行为状态机，不是扁平切片；对象层保住快照粒度与合批的可控性 |
| Tool 行使用平行的字符串键组件注册表 | ui-tool 的 keyed 子 slot 通过唯一的 slot 注册模型承载运行时开放的 Tool 名称集合（[toolview 溶解](2026-07-23-toolview-dissolution.md)） |
| P-I 就做渐进/Suspense 启动 | 一次成型严格更简单；loader 的按插件状态面已保留，渐进点亮日后可落地而无需重构 |
