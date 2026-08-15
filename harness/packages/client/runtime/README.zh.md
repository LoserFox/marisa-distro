# @deepseek-ai/dsh-client-runtime

[English](README.md) | 中文

客户端 cordis 启动与不依赖 React 的对象服务：SlotsService 包装 SlotCore 并提供 renderer 数据源；SessionsService 拥有 Session 对象以及 Chat 所需的列表、scope 和事件窗口状态；SessionHistoryService 为检查类消费方惰性拥有彼此独立的原始历史账本，先加载当前尾部，并仅在消费方请求时向前补入一页更早历史。每份历史快照都会公开原始窗口的绝对基准序号，因此即使该页没有新增任何 surface 可见节点，消费方仍能检测到向前补页。WorkspacesService 依赖 SessionsService，拥有 Workspace 对象、列表／操作、默认目标派生，以及 New Session 空会话复用入口（`connectWorkspace`）。运行时把共享 Host 流分发给 Session、Workspace 和已激活的历史数据所有者，不让检查状态经过 Session 或 SessionManager，并把注册表失效帧桥接为类型化 ctx 事件（`commands/changed`、`settings/changed`、`credentials/changed`、`models/changed`），使各表面缓存无需触碰流即可重拉。客户端会话一律由 Host 创建（一次 `session.create` 同时产生 Session、agent（智能体）和 cwd）；客户端不持有任何实体化之前的会话状态——agent scope（host dsh-scope 的客户端镜像，以 agent/session 共用 id 为键）在会话行进入列表镜像时创建，并随 prune 销毁。契约：api-contracts v3 §4。每个 `Session` 持有一个通用的 `ProjectionValueStore`，由历史记录尾部的 `projections` 块播种，并经 `session/projection` 帧按 seq 高者胜更新；领域键（含 `todos`）经 `projections.faceOf`／`useProjection` 读取，不经 `ConversationSnapshot`。该 store 还会通过 `SessionSummary.projectionValues` 发布一份引用稳定的完整值映射，使全局列表消费方无需为每个会话创建订阅，即可复用同一组投影。

## Slot 声明注入

`ctx.slots.inject(name, callback)` 将完整的 `SlotMap` key 作为贡献项的依赖，适用于贡献方插件可独立于声明条目激活的情形。声明存在时，它会同步运行 `callback`，否则等待；声明折叠会 dispose（资源释放）回调 effect，重新声明则会再次运行回调。控制器归调用方的插件 fiber 所有，因此卸载贡献方会取消等待或移除其活跃注册项。直接调用 `slots.register()` 向未声明 slot 注册仍会抛出异常。

回调返回一个同步 disposer 或由多个 disposer 构成的 iterable。因此，generator 可以 yield 多个 `slots.register()` 调用，并将它们组成一项事务：setup 失败会回滚先前 yield 的 effect，teardown 则按逆序运行它们。声明生命周期使用专用的单调 declaration epoch（声明代次），因此，即使折叠与重新声明合并在同一次 renderer 通知中，回调仍会重启，而普通条目变更不会重启它。声明绑定的 teardown 与账本变更同步运行，在同一 tick 内的后续注册之前释放运行时资源。详见 [slot 声明注入决策](../../../.agents/notes/implemented/architecture/2026-08-05-slot-declaration-injection.md)。

## Workspace 与 Session 列表

Workspace 和 Session 列表各自具有单调的 `pending` → `ready` 基线阶段，也有各自的刷新活动／错误状态。列表请求期间到达的增量插入或更新／移除帧与一元变更回显会在其响应之上回放。第一次成功的基线建立 Host 顺序；后续刷新更新行和成员关系，但不改变已经显示的标识之间的相对顺序。已移除的 Workspace id 会保留进程本地删除标记，避免延迟到达的 changed 帧将其复活；重连仍以 `workspace.list` 作为基线。Workspace 新近程度只在两条基线都 ready 后派生，且绝不改变 Workspace 列表顺序。

`SessionSummary.pendingInteraction` 将阻塞 Session 的实时用户操作分类为 `approval`、`plan-review` 或 `question`。`SessionManager` 依据稳定的请求标识跟踪可应答请求的 requested/resolved mux 帧，即使 `Session` 对象尚未实例化也不例外；实例化前的缓冲会保留每个仍有效的请求，替换回放产生的重复项，并移除已解决的请求，因此打开 Session 时，列表状态始终有一个对应的可应答 `PendingWait`。审批与问题并发时，第一个 pending 问题具有更高的呈现优先级，以匹配 composer 路由；只有满足 plan-review composer 二元呈现约束的请求才会保留独立的 `plan-review` 状态。该状态的作用域限定在连接代次内：断连时清除，mux 打开时的回放只恢复仍处于 pending 的请求。

`WorkspacesService.delete(workspaceId)` 在一元响应成功后从客户端投影中移除注册记录；对应的 `host/workspace-removed` 帧具有幂等性，并负责同步其他标签页。Session 状态与当前 Session selection 相互独立，因此 Workspace 消失后，其已纳入客户端投影的 Session 会立即投影到 Ungrouped 下。

`WorkspaceListState.archivedSessionIds` 镜像 Host 的注册表级全局归档集合（一个按 Host 顺序的 `readonly SessionId[]`，仅在成员变化时才替换；需要 O(1) 查询的消费方自建临时 Set）。它是全快照状态：`workspace.list` 基线、`archiveSession` 一元回声和 `host/archived-sessions-changed` 帧各自安装完整集合。`WorkspacesService.archiveSession(sessionId)` 通过 wire 归档；投影层在当前 selection 落入归档集合时统一清空为 New Session 视图状态——一条规则同时覆盖本地回声、其他标签页的帧、以及重连基线恢复出一个离线期间被归档的 selection。在 `workspace.list` 请求进行中安装的集合还会取代该过期基线携带的集合。各分组视图在所有位置隐藏集合成员，而会话行本身仍留在列表 store 中。

SlotsService 分别为 renderer 提供 `useSessions` 与 `useWorkspaces` 的裸 observable；web-react 创建钩子。Workspace 业务状态不会进入 `SessionListState` 或配置项 store。

`indexSubagentDescendants()` 从保留的列表镜像中派生每个 parent 的后代总数与运行中后代数。它只沿不间断的 `origin: 'subagent'` 祖先链追踪，因此普通 fork 会开启独立的归属子树；遇到环时，追踪会停止但不会抛出异常，缺失的 parent 则会保留为无害的键，直至其摘要到达。

`SessionsService.search(query, signal)` 是基于 `session.search` RPC 的无状态单次操作。它返回经过排序的会话／snippet 对，但不会将查询条件、加载状态或错误状态写入共享 Session 列表，因此每个 UI 所有者都自行负责防抖、取消、抑制陈旧响应和回退呈现。`searchResultLimit` 将 `SESSION_SEARCH_RESULT_LIMIT`——即响应 schema 自身强制执行的上限——作为注入的呈现数据重新公开，使客户端插件无需复制该值。它是协议常量而非逐连接状态，因此连接 handle 不携带它。

## New Session 与 blank 镜像

`WorkspacesService.connectWorkspace(workspaceId)` 解析 New Session 流程最终落入的会话：先在列表镜像中复用该 workspace 的既有空会话（`blank && cwd == workspace.path && sessionIds.includes(id)`——host 自己的成员规则，绝不只按 cwd，避免劫持 cwd 匹配但未入账的空白会话），未命中则调用 `session.create({workspaceId})`，返回会话 id 由调用方 open。`SessionSummary.blank` 镜像主机派生的空日志位，在客户端只降不升：由 `session.list`／`host/session-added` 帧播种，本地首次获 Host 接受的 `prompt()`（RPC 成功响应时——受理即证明用户消息已入主机日志；首讯被拒则会话保持 blank、保持可复用）与任何 `running: true` 状态帧翻为 false，每次列表重拉重新对齐。列表界面隐藏 blank 行；store 保留全部行。`SessionsService.create` 接受可选的、由调用方预先分配的 SessionId，失败时抛出 `SessionCreateError`（携带 `requestedSessionId`）。

## 待处理队列投影

`ConversationSnapshot.queue` 是 Host 提供的 `agent.inbox.nextTurn` 权威瞬态快照；待处理的 next-step steering（中途引导）不进入此投影。每行携带其 `MessageId`、所有内容块均为文本时的完整可编辑文本，以及扁平化预览。Host 根据持久 `agent/inbox/spliced` 变更派生完整 `session/queue` 快照，并在重连时发送基线；面向单条消息的 `agent/inbox/inserted`、`claimed` 与 `discarded` 通知不用于重建该投影。`Session.updateQueue()` 经 Host 侧 `Inbox.splice()` 发送编辑／移除操作，客户端不做乐观变更，因此下一份 Host 快照是唯一可见的提交结果，claim 竞态则会返回 `queue-item-not-found`。

## 面向人的 transcript（文本记录）

`ConversationSnapshot.nodes` 是面向人的 transcript，不是模型 surface。`TranscriptAdapter` 按日志顺序投影原始窗口。每个 append 来源的 surface 事件（`isAppendSurfaceEvent`）落在它自己的日志位置上，每次落地的压缩（compaction）检查点还会贡献一个 `CompactionSummaryNode` 标记；适配器从不查询 surface 顺序。`SteeringHistory` 会重放该窗口中的持久 `agent/inbox/spliced` 记录：用户来源的消息从 `next-step` 被领取，并以相同身份落成 `user/message` 时，会投影为 `SteeringMessageNode`；从 `next-turn` 领取的消息仍是用户节点，非用户来源的 next-step 输入仍是上下文。`ConversationSnapshot.turnEnds` 把该窗口中的每个已完成轮次映射到其 `turn/end` seq；它独立于 transcript 保留轮次完成状态，使呈现层能够在启用操作前要求存在真实边界。于是一次落地的压缩会保留它在模型侧遮蔽掉的对话：标记报告模型从哪里开始看不见那段历史，而不是把它抹掉。仅模型可见的 replacement 副本不进入记录：被裁剪的 `tool/result` 和重新生成的 `assistant/message` 只为模型重写一个节点，不标记任何边界。检查点是携带压缩 seam 插件来源、且**替换**了一段 surface 范围的 `user/message`；一条 append 的插件来源 `user/message` 是注入上下文，不是压缩。每个上下文节点还携带一份 `provenance` 视图：`contextProvenance()` 只读取持久来源，据此判定该行是 `inject`（注入）还是跨会话的 `recall`（召回），并用该来源已经记录的指令文件路径、被引用会话标题或插件 id 命名其生产者。客户端不保存任何插件 id 表，因此重命名或新挂载的生产者无需客户端发版即可保持可辨识，恢复的会话日志与外部日志的投影结果和实时会话完全一致；没有可读 kind 的来源则降级为无名注入。与之并列的 `contextForm()` 读取生产方声明的 `ContextForm`，这是相互独立的第二根轴：`kind` 说明上下文由谁产生，`form` 说明它是何种形态的信息，因此多个生产方可以共用一种形态。本 UI 版本不呈现的形态投影为 null，按 opaque 渲染。适配器的插件字面量通过对无 cordis 的 [`dsh-compact/checkpoint`](../../compact/compact/README.md) 叶子做仅类型导入，钉在压缩 seam 自己的声明上：在那里改名会让此处 `tsc` 失败；而对该包（package）做**值**导入会被客户端纯度门禁拒绝，包的**根**即便作为类型也无法到达（它会到达 `dsh-session` 的根，其 `Context` 合并会让 host 的 `sessions` 与本程序的冲突）。

由于投影按日志顺序，节点数组天然按 seq 单调：仅日志的 `command/run` / `command/done` 节点按 seq 插入，`Session` 按分数 seq 归并被打断的冻结节点，而检查点所引范围落在窗口之外的窗口会渲染出标记且不打印任何日志。标记的摘要文本、被替换条目数量和估算的被遮蔽 token 数量都来自检查点的 `compact/summary` 溯源；窗口切分把溯源留在窗口外时这些字段不可用，后续补上溯源的分页会解析出它们。`CommandNode.outcome.sourceEventSeq` 保留成功命令对该摘要事件的显式引用，使呈现层能够配对 `/compact` 与其检查点，而无须解析结算文案或假定两行相邻。性能契约：一次追加最多物化一个节点，并且仅在加入该节点时复制投影；不改变任何节点的事件保持上一次的数组引用（分片风暴零成本），未变化的节点保持其对象标识。

## 请求检查

`SessionHistoryInspection.requests` 是一条按时间顺序排列、以用途为判别字段的提供方请求流。助手请求始终携带数值型 `turn` 与 `step`；压缩请求携带 `step: 0`，其 `turn` 所有者可以是 `null`。这个 null 所有者表示手动压缩独立运行在两个轮次之间，并不表示它属于任一相邻轮次。`session/end-seed` 边界会在边界时刻将未匹配的压缩请求以错误状态结束，错误固定为 `Compaction was interrupted before completion.`；后续 start 会投影为独立请求，而不会覆盖这项遗留的未匹配请求。

## Code Mode 子调用树

每个 `ToolCallBlock` 都通过 `subCalls` 按启动顺序递归拥有自己的子调用。Runtime 的 `ToolCallTree` 私下维护 parent callId 到 child 的索引：`tool/code-dispatch-start` 事件落成 `RunningToolCall`，对应的 `tool/code-dispatch` 完结事件原位替换为 `ToolResultNode`，其 `callTime` 来自成对 start 事件；start 落在回放窗口之外时，完结事件会以 `callTime: null` 直接追加，绝不伪造零耗时。live mux 帧与历史回放共用这套 fold 和树投影；子调用不会成为 transcript `nodes` 中的独立 root。一次 child 变化只会复制从该 child 到所属 root 的祖先链，未变化的 sibling 和其他 root 保持对象引用稳定。会引入环，或使递归深度超过 256 个调用这一固定安全上限的协议或历史记录边会被视为已消费，但不会修改树，因此会话其余部分仍可渲染。

## Session 标题投影

`SessionManager` 独立于列表和 Session 实例到达情况，保留最近一次通过验证的 `session/title` 控制快照。seq 更高的事件会替换旧快照，标题时间戳计入列表新近程度；订阅基线会先丢弃 seq 超过其 `lastSeq` 的任何已保留标题，再接收可选的折叠标题。显式移除 Session 也会清除已保留标题。因此，面向客户端的 `SessionSummary.title` 只包含实际的持久化标题；`displayTitle` 始终存在，并依次回退到 cwd basename 和 Session id。冷态持久化会话会保持该回退值，直到打开或恢复会话，促使主机折叠并投影由日志支撑的标题。`ISession.rename` 用 unary 响应中的 `{title, seq}` 直接结算 `title` 投影格，遵循同一 seq 高者胜规则——列表行和所有 `useProjection('title')` 读者在推送帧到达前即更新；推送帧随后重放同一 seq 时为无操作。

## 模型重试投影

Session 对象会在事件 wire 边界依据生产方的完整字段契约，验证由插件负责、按提供方路由的 `llm/retry` 载荷，包括计时器、整数、状态、提供方延迟和非空诊断字段的边界。有效事件会移除对应失败步骤的流式输出片段，并在该事件的序列位置插入一条持久的重试提示。该提示在后续重试轮次开始前为 `scheduled`；源轮次中止或被 dispose 时，会将该提示标记为 `cancelled`，重试轮次则会将其标记为 `started`。normal mode 提示携带其有限上限；always mode 提示则保持显式无界。没有重试的终态 `turn/end` 错误会从持久消息与可选错误码投影出一个 `turn-error` 节点；AUTH 投影会把可能回显凭据片段的提供方文案替换为 `API key is invalid`，原始诊断仍保留在会话日志中。进入重试的失败则只保留该次尝试的重试提示。窗口重建与历史回放应用相同的投影，因此刷新既不会让已丢弃的分片重新出现，也不会丢失终态失败反馈。可见但尚未定稿的输出会在终态错误旁冻结为中断的 assistant 节点。

## 会话 fork

`ISessions.fork({sessionId, atSeq?, increaseTitle?})` 只在子会话摘要已能在本地寻址后才完成；该摘要携带源会话的谱系和 cwd，且 `blank: false`，由调用方决定是否打开。`increaseTitle: true` 会在 client 端把源会话的持久化标题改名到子会话：尾部 `(N)` 或 `（N）` 递增并保留括号样式，其余标题追加 ` (1)`；源会话没有持久化标题时跳过改名，改名失败时拒绝 promise 但保留已创建的子会话。该选项不会进入 Host fork 请求。即使响应为 `workspace-attach-failed`，其中仍会标识 Host 已发布的子会话，因此 `SessionManager` 会先将这一部分成功对账，再让 `SessionForkError` 到达调用方，避免重试创建重复的子会话。

## 会话模型选择

每个常驻 `Session` 都拥有一个 `modelSelection` 快照，其中包含当前提供方/模型目标、按提供方分组的目录、逐提供方失败记录，以及 `idle`／`loading`／`ready`／`selecting`／`error` 状态。历史记录会建立或刷新当前目标，打开选择器会刷新目录；选择失败会保留上一个目标和可用分组。目录与选择操作共用单调递增的代次，因此较旧响应无法覆盖较新的选择。重连重建会恢复 Host 报告的目标，同时不替换未变化的选择子结构。

## 模型体验

无，因为会话对象层会选择后续 Host 请求使用的提供方/模型路由，但不添加任何模型可见内容。

#### KV Cache 影响

更改目标可能改变提供方侧的缓存复用，或使其失效；该包本身不会改变提示词前缀。

## 已知限制与暂缓事项

- **`loader.unload` 是 stub**：它会抛出 not-implemented；客户端没有从 fiber dispose 到注册与样式移除的卸载链。
- **scope 拆卸由阶段驱动，目前只能有一个占用者**：已 staged 的会话精确跟随 `list.current`（staging 就是打开信号：事件窗口打开 ⟺ 会话位于 stage）；在 staged 状态下被移除的会话，其 scope 会冻结保留，直到 stage 转向其他会话，而非直到真实观察者数量降为零。解析（`binding()`／`scope()`）只是纯寻址，可安全用于渲染；渲染层经 `currentProvideInfo` observable 读取当前 bundle。并发 pane 落地时，staged 状态可以扩展为多 pane 列表。
- **插件组合包从该包导入值时必须使用 `/client` 子路径**：裸包名不在 loader externals 表中，会内联第二个模块实例；其私有 scope-tag Symbol 永远无法匹配。这是空状态 P0 的事故复盘（postmortem）所记录的问题。
