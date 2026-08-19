# mygo-api 契约层公开面盘点（@deepseek-ai/dsh-mygo-api 0.0.1-rc.1）

> 生成时间：2026-08-12 · 用途：供后续分析（CLI 扩展、webui 透传、错误词汇分工等）。
> 源码：`packages/core/mygo-api/src/`（types 1026 / adapter 1038 / fake 684 /
> error 250 / index 88 / define 17 / invariant 31 行）。全部行号以本仓库当前 HEAD 为准。
> 定位：Cordis-free 上层插件契约层——插件作者只依赖本包；manager 在挂载时把声明
> 桥接进 Cordis（index.ts:1-7 模块注）。

## 1. 运行时导出（6 项，index.ts:9-12）

| 导出 | 位置 | 签名/用途 |
|---|---|---|
| `definePlugin` | define.ts:15 | `(d: PluginDefinition) => PluginDefinition` 类型载体（identity；校验归 manager） |
| `PluginError` | error.ts:116 | 结构化错误类：稳定错误码 + 详情 + 模板化消息 |
| `formatPluginError` | error.ts:248 | 错误码 → 人类可读消息渲染 |
| `createFakeEnv` | fake.ts:682 | 测试假环境（能力桩 + 全量调用记录） |
| `fromCordisPlugin` | adapter.ts:148 | manager 侧：Cordis 函数插件 → 托管声明 |
| `toCordisPlugin` | adapter.ts:74 | 反向：声明 → Cordis 插件形状 |

## 2. PluginEnv 能力面（types.ts:247，15 面）

| 面 | 成员 | 位置 |
|---|---|---|
| 日志 | `logger.error/info/warn/debug`（限流 1000 行/分钟） | 247 起 / Logger types.ts:771 |
| 托管事件 | `on(event, listener) => Disposable` | 247 起 |
| 宿主事件 | `onHost(event, listener, options) => Disposable` | 247 起 |
| 生命周期接线 | `effect(disposer, name)`、`hostEffect(disposer, name)` | 247 起 |
| 设置/提示 | `registerSettings(staged)`、`registerPromptSection(section)` | 247 起 |
| 自定义事件 | `emit(event, payload)`（越界抛 `emit-denied`） | 247 起 |
| 作用域 | `scope(agentId) => PluginEnv` | 247 起 |
| 工具 | `registerTool/getTool/listTools` | 247 起 |
| 服务 | `provide(capability, value) => Disposable`、`get<T>(capability)`（未声明 = undefined，服务隔离） | 247 起 |
| 宿主透传 | `host: unknown`（零侵入） | 247 起 |
| 管理面（受权） | `plugins()`、`install(source, options)`、`uninstall(id)`、`updateConfig(patch)` | 247 起 |
| 文件 | `fs.read/write/append/readdir/stat` | PluginFs types.ts:710 |
| 网络 | `fetch(url, init)` | 247 起 |
| 环境变量 | `vars.get/set` | PluginVars types.ts:470 |
| 模型 | `llm.complete(request) => {content, model?, usage?}` | PluginModel types.ts:516 |
| 子进程 | `exec.run(request) => {stdout, stderr, code}` | PluginExec types.ts:556 |
| HTTP | `http.register({method, path, kind, handler, streamIdleMs})`（支持 SSE stream） | PluginHttp types.ts:616 |
| 技能 | `skills.register(def) => Disposable` | PluginSkills types.ts:652 |
| 命令 | `commands.register(def) => Disposable` | PluginCommands types.ts:692 |

## 3. 生命周期（PluginHooks，types.ts:889）

`setup?(env, config)` → `activate(env)` → 运行期 → `deactivate?(reason)`；
世代状态面 `captureState?()` / `restoreState?(state, previous)` / `dispose?()`。

## 4. manifest 契约（PluginDefinition，types.ts:51）

`id / version / kinds / requires / serviceRequires / symbolAliases / provides /
permissions / events / fileAccess / networkAccess / varsAccess / llmAccess /
execAccess / httpAccess / client / sessionWriteAccess / hostPublishAccess /
dynamicInstallAccess / stateful / swapPolicy('immediate'|'drain'|'next-idle') /
config / hooks / entrypoints / compatibility`（PluginCompatibility types.ts:137）。

## 5. 只读视图（PluginHandleInfo，types.ts:993）

`id / version / generation / origin / status('enabled'|'disabled'|'quarantined'|
'shadowed'|'uninstalled') / policyStatus('active'|'inactive'|'policy-rejected') /
reason / kinds / requires / provides / orderNeutral / source / entrypoints /
compatibility / entryFileSize`。

## 6. 错误码（43 个，5 组；error.ts:15-115）

- **声明校验（7）**：manifest-invalid、event-not-mountable、mode-ceiling-exceeded、
  capability-range-reserved、unknown-property、non-payload-name、
  unsupported-event-option
- **权限/授权（22）**：grant-missing、install-denied、ceiling-exceeded、
  source-not-allowed、protected-field、provenance-rejected、write-conflict、
  intercept-branch-conflict、ordering-cycle、veto-position-conflict、
  companion-conflict、compatibility-conflict、claims-unmanaged-incumbent、
  shadow-undeclared、claims-conflict、dependent-exists、concurrent-operation、
  plugin-not-found、swap-timeout、staging-failed、persist-failed、
  quota-registry-exceeded、package-not-resolvable
- **运行时接线（5）**：setup-registration、next-missing、undeclared-veto、
  undeclared-branch
- **配额（2）**：quota-cpu-exceeded、quota-effects-exceeded
- **能力拒绝（7）**：fs-denied、network-denied、vars-denied、llm-denied、
  exec-denied、http-denied、emit-denied

## 7. 测试面（FakePluginEnv，fake.ts:147-249）

- 桩注入：`requires/services/plugins/files/vars/llmHandler/execHandler/
  installHandler/fetchHandler/host/scopedTo`（FakePluginEnvOptions fake.ts:40-67）。
- 记录数组（25 个，只读）：listeners、hostListeners、tools、promptSections、
  provided、updateConfigCalls、scopeCalls、fsReads/fsWrites/fsAppends/fsReaddirs/
  fsStats、varsGets/varsSets、llmCalls、execCalls、httpRegistrations、
  registeredSkills、commandRegistrations、fetchCalls、effects、hostEffects、
  installCalls、uninstallCalls、emitCalls、logs。
- `trigger(event, ...args)`：按注册序手动派发监听器。

## 8. 类型面（约 60 个类型导出，index.ts:13-88）

含 `PluginDefinition/PluginEnv/PluginHooks/PluginHandleInfo/PluginSource/
InstallOptions/PluginCompatibility`、各能力面（Fs/Http/Commands/Skills/Model/
Exec/Vars）、事件（PluginEvents/EventArgs/EventListener）、工具/命令/技能定义、
`PermissionsBlock/TransformDeclaration/InterceptDeclaration`、
`AdapterContext/CordisFacade/RawCordisFunctionPlugin`、fake 记录类型等。

## 9. 消费者与边界

- 消费者：dsh-mygo 管理器（from/toCordisPlugin、PluginError）与插件作者
  （definePlugin + types + fake env）。
- 边界承诺：不依赖 Cordis；与 dsh-mygo 同版本线同节奏（rc.1）；公共类型面
  semver 内只增不删；本轮不承诺独立于 dsh-mygo 的稳定 API。

## 10. 候选决策 CD-1：错误词汇分叉（只登记，不实现）

- **现状**：两套错误词汇共存——`PluginError` 43 码（throw 面，error.ts:15-115）
  与 `ResolutionReport.code/scope`（结构化报告面，mygo `package/report.ts`）。
  `manifest-invalid` 两侧同名（PluginError error.ts:16 ↔ report.ts code 联合）。
- **候选方向**：
  - (a) 映射表：两套词汇互相映射（code ↔ report code），统一展示层；
  - (b) 「错误 vs 报告」分工原则（**建议倾向**）：挂载期/治理期失败
    MUST 走结构化报告（B7 语义，含冲突链/候选集/建议），运行时能力拒绝
    （fs/network/llm/exec/http/vars/emit 等 7 码）走 PluginError；
    具体分工（边界判定、是否引入共享枚举）待独立小轮裁决。
- **状态**：仅登记，本轮与后续实现不得预先落地任一方向。
