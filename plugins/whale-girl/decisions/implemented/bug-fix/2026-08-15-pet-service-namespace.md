# Decision: pet 服务命名空间——'pet' → 'whale-girl.pet' 避免撞名

Status: implemented

## Problem

用户报告（issue #3）whale-girl 与 `@linxin666/dsh-web-ui-all` 同装时 `dsh web` 启动崩溃：

```
failed to apply loader entry whale-girl (whale-girl): service "pet" has been registered at <pet>
```

根因：whale-girl 的 cordis 服务用了通用名 `'pet'`。cordis 服务名是全局字符串键（`ctx.provide(name)` 直写 `reflect.store[name]`，无按插件隔离），同 scope 同名服务在 `provide()` 处直接 throw（见 cordis `reflect.ts` 的 `service "${name}" has been registered at <...>`），导致整个插件树加载失败。第三方插件同样注册 `'pet'` 时必然撞名。

注：issue #3 日志里另有 `duplicate loader entry id: agent-presets`，那是 `dsh-web-ui-all` 自身的 loader entry id 重复，不在 whale-girl 侧，本记录不处理。

## Decision

- 服务名 `'pet'` → `'whale-girl.pet'`（`<plugin>.<service>` 命名，与 DSH 生态 `remote.commands` 同款；见 [2026-08-09-pet-service-openness](../feature/2026-08-09-pet-service-openness.md) 的窄缝契约）。
- 服务形状不变：只读 `snapshot()` + `onSignal(fn)`，无写面。
- 消费方注入面同步：`inject: ['whale-girl.pet']`；服务缺席时消费方仍应容忍。

## Alternatives considered

**A：保留 'pet' 并在启动时检测冲突、冲突则降级不注册。** cordis 不提供「同名共存」或「探测后优雅退让」——`provide()` 直接 throw，无 try/catch 可救的检测面（异常在 fiber effect 内，捕获也无法阻止插件树失败）；改名是唯一正解。

**B：删除 pet 服务（退掉开放性窄缝）。** 破坏「表现层开放、语义层封闭」架构承诺（architecture-evolution.md 开放性节依赖该服务）；外部消费者走 HTTP 端点（/state /sessions /presence）不经 cordis 服务，但窄缝是给其他 DSH 插件的原生机制——保留。

**C：用 Symbol 做服务名避免字符串撞名。** cordis 的 inject/provide 契约是字符串键（`inject: [name]`、`ctx[name]` 属性解析），Symbol 无法被第三方插件在 manifest 里声明注入——不可行。

## 取代检查

部分取代 [2026-08-09-pet-service-openness.md](../feature/2026-08-09-pet-service-openness.md)：其「Node half `ctx.provide('pet', ...)` / `inject: ['pet']`」服务名陈述由本记录取代为 `'whale-girl.pet'`；该记录的窄缝设计（只读快照 + 信号、无写面、CustomEvent 契约）不受影响。

## Consequences

- 服务名改为 `'whale-girl.pet'`；第三方插件 `inject: ['whale-girl.pet']` 消费，与 `remote.commands` 等 DSH 生态命名对齐。
- 无已知消费方（外部消费者经 HTTP 端点，不经 cordis 服务），改名零破坏。
- 与 `dsh-web-ui-all` 同装不再因 `'pet'` 撞名崩溃；`agent-presets` 重复属对方插件问题。
- 代码引用点：`lib/index.mjs` 的 `ctx.provide`；文档引用点：AGENTS.md、docs/architecture-evolution.md、pet-service-openness.md、remove-agent-tools.md。
