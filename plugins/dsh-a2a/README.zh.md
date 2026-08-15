# @dpskh/a2a —— DeepSeek Harness 的 Agent2Agent 实时 mesh

[English](README.md) | 中文

一个包、一个入口插件。挂载 `@dpskh/a2a` 0.3 即获得**实时 A2A mesh**：hub 主机（`ctx.a2aHub`：基于 storage 域的项目注册表与不可变消息历史，可选监听 hub 服务器，同时承载实时 WebSocket）、mesh 客户端（`ctx.a2aMesh`：每个已连接 agent 一个 WebSocket presence，串行注入）、`a2a_peers` / `a2a_message` / `a2a_history` 工具族与 `/a2a` 命令面。Presence 即存活的 socket；消息是唯一的持久记录——运行于可信私有网络上的实时聊天。

## 配置

```yaml
- id: a2a
  name: '@dpskh/a2a'
  config:
    hub:                      # optional: run the mesh hub server
      host: 127.0.0.1
      port: 43123             # base bind port
      maxPort: 43223          # optional: walk up on EADDRINUSE
    mesh:                     # optional: mesh client
      project: main           # project to connect to (defaults to main)
      agentId: main           # local agent this presence belongs to
      name: main              # roster name; defaults to the agent id
      autoConnect: true       # connect when the configured agent registers
      persistConnections: false # remember each session's last connection and rejoin it
      reconnectMs: 500        # initial reconnect delay (doubles to 10 s)
```

hub 需要路由的存储后端：挂载 `@deepseek-ai/dsh-storage`、一个后端（`storage-json` 或 `storage-sqlite`）以及 `@deepseek-ai/dsh-storage-domain`，并将后端路由到 `a2a` 域。入口插件组合 hub 主机服务（`ctx.a2aHub`）、mesh 客户端（`ctx.a2aMesh`），以及——当配置了 mesh 时——工具与命令插件（cordis 依据其 inject 依赖激活）。已移除的 0.2 mesh 配置字段（`persistBindings`、`autoRejoin`、`pollIntervalMs`、`heartbeatMs`、`caps`）会被忽略，以便兼容复制的 0.2 配置。

## Mesh

- **Hub**（`ctx.a2aHub`）：权威项目注册表与追加式消息历史（每个项目单调递增的序号、项目作用域的 `messageRef`，如 `demo:42`）。可选的 hub 服务器通过 HTTP 提供项目/历史路由，并在 `/v1/connect` 提供实时 WebSocket（协议版本 3）。
- **Presence**：presence 存在当且仅当某条 WebSocket 存活。注册名在项目内唯一；同名后到的连接是新的 presence，不继承任何旧状态。Hub 重启清空全部 presence，消息历史则幸存。
- **消息**：不可变，按 `messageId` 幂等（重试相同内容返回原消息；用相同 id 发不同内容会以 `MessageIdConflictError` 失败）。定向发送在接收时解析接收方的当前 presence，接收方不在场立即失败；项目广播冻结当前 presence 快照（排除发送者），绝不回填后来的加入者。`replyTo` 在同一项目历史内提供因果性。文本与附件共享 4 MiB 解码内容预算；每条消息最多八个附件，以 base64 传输（更小时使用 gzip）。
- **投递**：面向发送者的内存内结果——`delivered` 证明接收方客户端已注入该消息，`failed` 是物化/注入错误，`disconnected` 是确认前关闭的 socket。
- **Mesh 客户端**（`ctx.a2aMesh`）：每个已连接的 agent 拥有一条连接（项目 + 注册名）。入站消息按 hub 分配的序号串行推送，并注入所属 agent 的会话（空闲时作为后续回合，忙碌时作为纯上下文），附件物化到系统临时目录下。连接处于期望状态时，意外断开会自动退避重连；被拒绝的 claim（名字被占用、项目未知、协议不匹配）会停止期望该连接。`a2a/presence-changed` 事件宣告本机连接/断开；`a2a/delivery` 事件宣告投递结果。被销毁的 agent 会自动断开其 presence。开启 `persistConnections` 后，每次成功连接都会把 `agentId → (项目, 注册名)` 记录到 `a2a-connections` settings 命名空间，注册时带有记录的 agent 会重连到记录的项目与名字——这是 GUI 的路径（会话 id 动态、未配置静态 `agentId`）；显式断开会删除该记录。每个 membership 还维护一份本地对话活动视图（`idle` / `conversing` / `working`，根据发送、投递与入站消息推断——活动状态不经过 hub 线缆），并通过 `status()` 暴露给连接图动画；活动状态变化会发出 `a2a/change`，浏览器据此实时刷新。

## 工具与命令

- `a2a_peers` —— 列出当前项目内精确的注册名清单。
- `a2a_message` —— 发送给一个当前 peer（`target: {type: 'agent', name}`），或广播给所有当前 peer（`target: {type: 'project'}`），可带 `replyTo`、附件文件路径与幂等 `messageId`。回复被动到达——发送后绝不等待或轮询。
- `a2a_history` —— 使用 `before`、`after`、`limit` 或 `from` 回顾更早的项目消息（仅限过往上下文）。
- `/a2a hub`、`/a2a project create|list|delete`、`/a2a connect <project> [--as <name>]`、`/a2a disconnect`、`/a2a status`、`/a2a peers`、`/a2a history [--before <ref>] [--after <ref>] [--limit <n>] [--from <name>]`、`/a2a help`。

## Web 协作控制界面

`@dpskh/ui-a2a` 按会话消费一份 Host `a2a.snapshot`：连接身份、实时成员清单和项目。本地或远端成员变化会发出 `host/a2a-changed`；浏览器重新拉取快照，使概览页、项目页、徽标与快捷面板共享同一个状态源。成员清单是主要视图；辅助拓扑在最多六名 peer 时使用轨道，超过后改用网格，并在窄布局隐藏。浏览器绝不连接 Hub WebSocket。

## 信任模型

mesh 假定完全可信的私有网络：hub 端点不认证调用者，调用者提供的项目与成员身份是可信声明。切勿将 hub 暴露到公网或不可信网络。

## 模型体验

间接地，通过 `a2a_*` 工具、`/a2a` 命令与注入的入站信封，项目成员 id、消息引用、连接结果和已投递消息可以进入对话。

#### KV 缓存影响

插件配置与工具定义不变时前缀稳定；项目、成员清单或历史变化不会改变 schema。

## 已知限制与待办

- **仅限在线接收方** —— 接收方当前不在场时定向发送立即失败；没有离线投递或持久化成员清单。
- **每客户端单一 hub** —— 一个 mesh 客户端同时只连接一个 hub；多 hub 扇出延后。
- **内存内投递结果** —— `delivered`/`failed`/`disconnected` 不持久化；丰富投递元数据延后。
- **临时目录附件物化** —— 入站附件落在系统临时目录下；可配置的会话作用域位置延后。
