# mygo facade 兼容缺口审计（2026-08-10，只查不改）

针对 dsh-external 生态插件的真实用法（ext-compat/repos 115+ 仓库源码）与
mygo facade / HTTP 桥 / 发布视图逐面对照。

## A. ctx.on 宿主事件监听 —— 最严重

**机制**：facade `ctx.on` → `env.on` → `DispatchMachine`；dispatch 只接收
托管插件 `ctx.emit` 的自定义事件（`emitManaged`），**不存在宿主事件 →
dispatch 的桥**（service.ts 仅自行订阅 `tools/execute` 做墓碑拦截）。

**后果**：
- 事件在 EVENT_VOCABULARY 内（agent/*、session/event、llm/stream、
  session/created 等 58 个）→ 插件能挂载，但监听器**永不触发**（静默失效）；
- 词汇外事件（如 `connection/reset`、`settings/changed`）→ 挂载即抛
  `event-not-mountable`。

**受影响插件**（真实源码证据）：
- `dsh-engram-relay`：`ctx.on('llm/stream' / 'agent/turn-stopping' / 'agent/pre-step')`
- `dsh-session-cluster`：`ctx.on('agent/created' / 'agent/disposed' / 'agent/inbox/*')`
- `dsh-rewind` / `dsh-involute` / `dsh-alphasolve` / `dsh-evolve` / `distill` 等

修复方向：facade `ctx.on` 对非托管事件回退宿主 `ctx.on`，或建 host→dispatch
转发桥（只读不改，未实施）。

## B. HTTP 桥 req/res shim 不完整

已修：`for await (const chunk of req)`（async iterator）——dsh-better-sidebar
事件。

仍缺（`rawHttpBridge`）：
- **`res.pipe`**：`dsh-stickers` 用 `createReadStream(path).pipe(response)`，
  shim 无 pipe → `pipe is not a function`（很可能就是“贴纸不显示”的根因）。
- **`res.flushHeaders` / SSE 语义**：`dsh-remote-web-ui`、`dsh-git-graph`、
  `dsh-opencode-server` 写 `text/event-stream`；shim 无 flushHeaders，且响应
  在 handler 结束后一次性返回，流式输出丢失；handler 不调 `end` 会卡 30s
  超时。
- req/res 其余 node 语义（`setEncoding`/`readable`/`socket`/`aborted`/
  `destroy`/`statusMessage`）：当前仓库 src 未发现使用，但生态可能来。

## C. 工具注册扩展字段被丢

facade `tools.register` 收窄后保留 name/description/parameters/output.schema/
execute/outputRender/outputPresentationMeta/presentCall/presentResult；
宿主 `ToolDefinition` 还支持但被丢弃：
- `timeoutMs`（`dsh-tool-regex`、`dsh-tool-markdown`）→ 托管工具无超时；
- `isConcurrencySafe`（`dsh-engram-relay`）→ 并发安全声明失效；
- `finalizeContent` → 结果内容变换丢失。

## D. skills/commands 发布视图语义改写

- `skillProviderView` 强制 `invocation {modelInvocable:true, userInvocable:true}`
  + `source/provider` 改为 managed 值——插件声明被覆盖（`dsh-101`）；
  `whenToUse` 保留 ✓。
- `commandView` 保留 `input.hint` ✓；`promptSectionView` 收窄
  name/order/text，仓库当前用法一致 ✓。

## E. 已知文档化缺口

- `ctx.plugin` 组合子 → 显式拒绝（dsh-rewind / dsh-evolve / dsh-checkpoint）。
- `env-required` / `deps-missing` / `api-drift`（宿主缺 API，非 mygo 面）。

## F. 已验证没问题

- `ctx.get('服务')` 会回退宿主（sandboxPolicy / sessionPersistence / agents /
  sessions 等）——dsh-visualize / dsh-bash-encoding / dsh-opencode-server 可用。
- settings/sessions/loader 等属性访问走 host passthrough（dsh-better-sidebar
  已实测）。
- client half 原生加载（无收窄），slots 等客户端 API 不受影响。
- 旧报告的 facade-service-gap / systemPrompt.context 类，host passthrough
  落地后应已修复（未逐条重测）。

## 建议优先级（未实施）

1. ctx.on 宿主事件桥（严重，静默或挂载失败）；
2. res.pipe + flushHeaders/SSE 语义（dsh-stickers 实际损坏）；
3. tools timeoutMs / isConcurrencySafe / finalizeContent 透传；
4. skills 发布视图保留插件声明（invocation/source/provider）。

---

## 实施记录（2026-08-10，A→B→C→D 已全部落地）

### A. ctx.on 宿主事件桥 [OK]

先做了一次实测修正：最小 harness 下，词汇内宿主事件（emit/waterfall/scoped/
carrier thisArg）经 dispatch 的 real listener 是能触发的，审计原文
“监听器永不触发”不成立。真正的缺口在：

- **词汇外宿主事件**（`connection/reset` 等）此前被 `applyRegistrations`
  静默 `declareEvent` 成托管自定义事件，语义混乱；
- **`ctx.once`** 走 host passthrough 直接绑定宿主 fiber，disable/卸载后
  不撤销，存在 HMR 泄漏；
- `prepend` 等 Cordis 选项被 facade 丢弃。

落地：
- `StagingEnv.on` 按“静态宿主词汇 + 插件声明 custom events”路由：claimed →
  托管 dispatch（原样）；unclaimed → 新增 `host-listener` 注册，直接挂宿主
  `ctx.on`，disposer 进 `hostEffectDisposers`（disable/replace/uninstall
  均撤销）；
- facade 新增 `once`（→ `env.onHost`），`prepend` 在宿主桥路径生效；
- 测试 `host-event-bridge.spec.ts`（9 例：emit/waterfall/scoped/carrier/
  词汇外桥接/disable 撤销/HMR replace 撤销/once/prepend）。

### B. HTTP 桥 req/res shim [OK]

`rawHttpBridge` 重写：
- `res.pipe(source)`（dsh-stickers 的 `createReadStream().pipe(response)`）；
- `res.flushHeaders` / `statusMessage` / `getHeaders` / `hasHeader` /
  `removeHeader` / `writeHead(status, reason, headers)`；
- **SSE 流式语义**：`res.write` 不 `end` 时返回 live `stream`，宿主管线
  `dispatchHttpRoute` 逐 chunk 转发，流在 `res.end()` / pipe 源结束 /
  `streamIdleMs`（默认 30s）空闲超时后关闭——不再缓冲 30s 或卡死；
- req 补 `once` / `setEncoding` / `readable` / `complete` / `aborted` /
  `destroy` / `socket` / `close` 事件（SSE 订阅清理用）；
- 修复了一个投递 bug：push 同时入队并带值唤醒 waiter，导致每 chunk 双发，
  改为“入队 + 通知”，消费循环自行取队首。

测试 `http-bridge.spec.ts`（5 例：静态 JSON、pipe 文件、SSE 流式 + end、
SSE 空闲超时关闭、statusMessage/flushHeaders + req 异步迭代）。
现场（3080 新代码实例）实测：`/api/dsh-stickers/01-daily-chat.png` 返回
200 + `image/png` + 完整 1.38MB PNG（此前贴纸不显示的断点）；sidebar
`POST /sidebar/api/session.cwd` 返回真实业务 JSON。

### C. 工具字段透传 [OK]

`PluginToolDefinition` 增加 `timeoutMs` / `isConcurrencySafe` /
`finalizeContent`；facade `tools.register` 与 `registryToolView` 透传；
`tool-presentation.spec.ts` 覆盖（2 例）。

### D. skills 发布视图保留插件声明 [OK]

`skillProviderView` 的 list/get 改为：插件声明的 `invocation` / `source` /
`provider` / `rank` / `resourceBase` / `path` / `metadata` 优先，缺省回退
`{modelInvocable:true,userInvocable:true}` / `runtime` / `managed-<id>` /
0；`PluginSkillDefinition` 类型补全对应字段；`skill-view.spec.ts` 覆盖
（声明保留 + 缺省回退，2 例）。

全量：mygo-api 39 例 + mygo 445 例全部通过；tsc + tsdown 构建完成；
已同步 0809 / -fresh / staging-20260809T193011Z（3080 正在运行新代码）。
