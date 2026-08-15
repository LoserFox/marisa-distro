# Decision: 开放性窄缝——ctx.pet 服务 + client CustomEvent 契约

Status: implemented

## Problem

dsh-pet 是积累型宠物，账本语义（零负反馈、纯向上积累、XP/称号派生）是产品核心承诺；但插件是封闭的——其他插件无法感知宠物的状态或驱动其显示。架构演进设计（docs/architecture-evolution.md）要求「开放性」：表现层开放、语义层封闭、安全面封闭。需要生态原生机制（registry 的 ctx.provide/inject）提供窄缝，且不破坏账本不变量。

## Decision

- **Node half `ctx.provide('pet', { snapshot, onSignal })`**：
  - `snapshot()` 返回只读 `{ pet, activity }`（账本快照 + 活动派生）——不暴露任何写面（账本语义由 dsh-pet 独占，防第三方破坏积累不变量）。
  - `onSignal(fn)` 订阅账本信号：`celebrate`（任务完成）、`levelUp`（升级）、`failure`（失败）、`session`（new/resume）；返回退订函数。
  - 其他插件 `inject: ['pet']` 消费；服务缺席时消费方应容忍（dsh-pet 自己处理 sessions 缺席即先例）。
- **src/signals.mjs 信号器**：轻量发布/订阅，零宿主依赖可单测；订阅者异常隔离（单个抛错不影响其余与宠物本体）。5 条单测（订阅/退订/异常隔离/空安全/size）。
- **client CustomEvent 契约**（document 冒泡，第三方 bundle 零耦合驱动显示层）：
  - `dsh-pet:say` `{ text }` → 气泡说话
  - `dsh-pet:fx` `{ type: 'hearts' }` → 爱心爆发
  - `dsh-pet:status` `{ text }` → 状态卡 note 覆盖（2.5s 恢复）
  - detail 校验后消费；dispose 时移除监听。
- **端到端实证**：临时消费插件 `inject: ['pet']` 成功注入（snapshot 返回 {pet,activity}、onSignal 可用），无 web 错误；验证后清理（不入库）。

## Alternatives considered

**A：extend `Service` 类提供服务。** Cordis 标准方式，但要求 `import { Service } from 'cordis'`——引入 cordis 运行时依赖，破坏 dsh-pet 刻意保持的零依赖（deps-link 脆弱性）；`ctx.provide(name, value)` 已足够——弃。

**B：client half 提供跨插件 API（如 ctx.ui.mount 式）。** registry 生态无跨插件 client API 惯例（官方 UI 槽已回退，「插件自建缝」是心智模型）——CustomEvent 是零耦合、无依赖声明的自建缝，契合生态——弃。

**C：开放写面（第三方可改账本/互动）。** 直接违反「语义层封闭」原则，账本不变量（零负反馈、纯积累）可被任意第三方破坏——永久封闭（设计决策，非技术取舍）。

## Consequences

- 其他插件可感知宠物（快照 + 信号）并驱动显示层（CustomEvent），零耦合、零依赖声明；账本语义保持封闭。
- 已知边界：信号在 Node half 事件触发时广播（onTaskDone/agent/session-start）；client 轮询驱动的状态变化（think/wait）不在信号面（那是 client 内部事实）；CustomEvent 无事件名注册表（文档契约，第三方按文档使用）。
- 关联：docs/architecture-evolution.md 开放性节；本记录是架构演进第 4 项的落地。
