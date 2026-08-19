# Decision: 外部只读快照契约

Status: implemented

## Problem

`/whale-girl/state` 原为单个 Web client 的轮询面；读取会消费 `turnCompleted` 翻转标志。Web client 与桌面伴侣并存时，先读取者会令另一消费者丢失回合完成反馈，现有响应也没有可判定兼容性的版本。

## Decision

`GET /whale-girl/state` 是本地外部消费者可依赖的只读快照契约，响应带 `apiVersion: 1`。回合完成状态由绝对截止时间 `turnCompletedUntil` 表达，并保留派生 boolean `turnCompleted`；读取不修改截止时间，因此任意数量消费者可观察同一窗口。SSE `/whale-girl/events` 只提示消费者刷新快照，不承载唯一事件数据。

本决策部分取代 [GUI 内桌面宠物架构](../architecture/2026-08-08-in-gui-pet-architecture.md) 中「只有一个 GUI client 消费状态」的边界，但不改变宠物仍以 GUI 内形态分发的决定；外部桌面程序不进入本仓库。

## Alternatives considered

**新增仅供桌面端使用的 endpoint。** 会产生两个快照协议与漂移风险；现有 `/state` 已包含所需事实，修正其多消费者语义更小。

**把完整事件载荷放进 SSE。** 需要事件序列、重放与断线语义，远超本次只读查询需求；SSE 保持无状态刷新通知，完整事实仍由快照提供。

**继续消费式 boolean。** 多消费者存在确定性竞态，无法作为外部契约。

## Consequences

- 重复或并发读取 `/state` 不再吞掉回合完成反馈。
- client 使用服务端绝对截止时间，不因轮询重复延长庆祝动画。
- `apiVersion` 只标识 wire 破坏性变化；同版本允许增加未知字段，消费者必须忽略。
- 外部消费者仍依赖运行中的 DSH Web profile，并负责断线重连与轮询兜底。
