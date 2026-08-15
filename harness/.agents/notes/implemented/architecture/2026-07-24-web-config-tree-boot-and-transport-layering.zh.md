# Agent Note: dsh web 的 config-tree boot 与 web 传输分层

Status: implemented

[English](2026-07-24-web-config-tree-boot-and-transport-layering.md) | 中文

> 范围：`dsh web` 如何组合（cordis.yml + cordis 之前的 boot 类 + 配置源），以及 web 传输如何跨包分层（网关 / 载体 / 绑定 / 图 / 开发期重载）。浏览器侧装载链归 [client 插件装载 note](2026-07-23-client-plugin-loading-model.md) 所有，本组合只是它的供给方。

## 问题

`dsh web` 曾是仅剩的手工装配面：`bootHost` 逐个挂 32 个插件、config 钉死在代码里（违反 no-hardcoded-tunables），client roster 是 `web.ts` 常量，而 TUI/headless 早已是 yml 组合。传输层的职责错位与之配套：webserver 自称哑载体却认识 `__DSH_BOOT__` 图、拥有 SSE（Server-Sent Events）通道、硬编码 `/api/*` 前缀；dev 的 bundle watch 寄居在 prod 注册表里靠 `watch?` 参数开关、生命周期无主；图注册表对每次 `internal/plugin` 全量重扫；单请求失败与致命 server 错误共用一个一律退出进程的 sink。还有一个用户可见缺陷：web 路径从不加载 `$DSH_HOME/.env`，`DSH_HOME=… dsh web` 读不到自定义 home 下的 API key。

## 决策

**组合结果是一棵平铺配置树。** `apps/cli/config/base.cordis.yml` 与 `apps/cli/config/web.cordis.yml` 共同持有全部行——host 运行时（32 行）、`api-gateway` 行、`webserver` 行、`dshClient` 行（浏览器 roster；modules 行同时是 host 行）。不做 spine bundle：每插件一行、每个 config 字段 yml 可改。这一立场后来推广到全仓：两个 surface 共享的配置项被抽取进 `apps/cli/config/base.cordis.yml`，各 surface 则收敛为一份 overlay（[共享 base overlay](../simplification/2026-07-29-shared-base-config-overlays.md)）。`--dev` 在 settle audit 之前由代码追加 `dsh-client-hmr` 行——prod 与 dev 的全部差异就是这一行。行序无装载语义；激活由服务可用性驱动。共享 audit 会拒绝没有 fiber 的 import、仅等待失败的 fiber 以恢复原始激活错误，并报告让 fiber 停在 `PENDING` 的服务；抛出错误前，审计会通过一个进程级检查点标记这些 rejection 的确切原因，从而让 `installFailLoud` 将 Loader 的重复通知合并为一次，而无关的未处理 rejection 仍然致命。Node app-boot 产物内嵌 `@cordisjs/plugin-include`，但将 `@cordisjs/plugin-loader` 保持为外部依赖，因此 include 的 `EntryTree` 与 host 会绑定到同一个 Loader peer，而不会让一棵配置树横跨两个 Loader 实现。

**boot 胶水由两个类组成。** `AppCLIEntry`（apps/cli）与 `AppWebEntry`（壳内核）只持有那些必须独立于 cordis、提前存在的东西：argv 事实、合成的 patch 集、解析出的 boot manifest（元数据清单）、模块系统实例、loading 页句柄——其余一律进插件。`AppCLIEntry.run()` 三段：分层 env（ambient > cwd `.env` > `$DSH_HOME/.env`，顺手关掉上述缺陷）→ patch 合成 → Loader include boot 加 activation audit。`AppWebEntry.run()` 在浏览器侧镜像它：把 `window.__DSH_BOOT__` 解析成 `BootManifest`（双视角：npm 包行给模块表、cordis 插件行给 entry 组合；畸形 wire 大声抛）、建模块系统、渲染 loading 页、immediately 层预取与 Context/Loader 准备并行、**create entry 之前等预取齐**（物化是 `tree.import` 的同步 require，不受 fiber inject 等待保护；i18n → runtime/client 这类跨包 require 边要求 immediately 层工厂全部注册完——否则有实测 10–25% 的 boot 竞态）、收编 modules entry、逐一创建图行、settle、sweep。

**每个配置源有唯一声明位置。** yml 静态值是工程默认；profile json（`./.dsh-tmp-profile/config.json`，只读、绝不创建、暂锚 cwd 直至 `$DSH_HOME` 迁移）是用户配置，经静态 `PROFILE_MAPPINGS` 表映射到目标行（`provider`/`model` → `api-gateway` 行，`persistenceRoot` → jsonl 行）；CLI（命令行界面）flags 映射到 `webserver` 行、字段集与 json 不相交；env 值经 yml `!!js` 表达式进入，绝不进映射表。patch 整体替换行 config，故 entry 类旁路 parse 重读 yml 行静态值再叠加覆盖。未映射的 json 键 fail loud。解析出的前端 `distIndex` 走同一 patch 通道——装配事实，不是用户配置。

**传输五分。** `dsh-host-apiproxy` 升格网关插件（`api-gateway` 行）：默认导出 `ApiProxyService`，config `{provider, model}`，provide `ctx.apiProxy`，传输无关、不注册路由——`createApiProxy` 从已退役的运行时包迁入。`dsh-host-webserver` 缩成朴素路由注册插件：`HttpServerService` provide `ctx.httpServer`（`register(route) → disposer`、重复 pattern 即抛、`tapIndex` 按注册序应用、`port`），激活即 listen，单请求失败答 400 并记日志，不退出进程，不认识任何 harness 概念。connection node 半拥有绑定：inject 两个服务，把 `toFetchHandler(ctx.apiProxy)` 注册在 `/api` 前缀下——将来 IPC 载体只换 connection 的传输，网关零改动。modules node 半（`ClientModuleHostService`，provide `ctx.clientModuleHost`）拥有图：单包增量扫描（无全量重扫路径——`internal/plugin` 把 fiber 的 entry 名标脏，flush 逐名对账 live entries，包括否定结论在内的包元数据会永久缓存，重哈希唯一入口 `rebuilt(id)`）、bundle 路由、index tap、`onRebuilt`/`onGraphChanged` 通知。HMR node 半拥有开发期重载：`fs.watchFile` stat 轮询、watch 集合跟随 `onGraphChanged`、`/plugins/events` SSE 路由。

**包出口纪律。** modules 包只暴露 `.`（node 半）与 `./client`（完整浏览器半：`ClientModuleSystem`、`parseBootManifest`、收编插件面）——不设专用子路径；wire 类型经根出口 re-export 给 host 侧消费方。收编握手：内核在 cordis 之前把建好的实例写入 `window.__DSH_MODULES__`；`./client` 的 apply 读取该槽位（缺少时显式抛错）并 provide `ctx.modules`。

## 后果

- 重组一个 web 部署 = 改 yml/patch；退役件（`mountWebPlugins`、`CLIENT_PACKAGES`、`createHostWebPluginRegistry`、`startWebServer`、webserver 的图/SSE/api 知识）全部删除。
- headless 已在 stacked 后续轮迁入同一组合同一入口：唯一面差异是 port 0，模型面按统一裁决获得 `ask_user_question`/workspace context/模型标题，`bootHost`/`startHost` 随 `dsh-host-runtime` 包退役。profile 写入路径、profile 迁 `$DSH_HOME`、IPC 载体仍为挂账项。
- 一个值得记住的 TypeScript 坑：`declare module 'cordis'` augmentation 所在文件若**没有任何 cordis import**，会被降级成独立 module declaration，无声打散全程序的 `Context` merge（`ctx.on`/`ctx.effect` 全程序消失）。用 `import type {} from 'cordis'` 锚定。

## 考虑过的替代方案

| 弃案 | 一行理由 |
|---|---|
| 专门的 `dsh-host-profile` 受体包 | profile json 在 patch 阶段消费完；`{provider, model}` 的唯一运行时消费方是网关自己——受体即网关 config |
| 运行时里的 `assembly` 垫层插件（provide `apiHandler`） | 它的存在只因 `createApiProxy` 住运行时；本体迁入 apiproxy 后网关自持插件身份，且 `toFetchHandler` 是绑定方自己调的纯函数 |
| 全量重扫与增量扫描并存 | 两条实现两份语义；单包路径足以覆盖激活初扫 |
| modules 包特设 `./impl` 出口 | 出口面不统一；标准 `./client` 承载完整浏览器半 |
| dev overlay / `cordis.dev.yml` | 一套 yml；`!!js` 无法条件化行存在性，`--dev` 追加一行就是全部差异 |
| env 进映射表 | 同一字段将出现 env/json 双源，需再发明优先级 |
| create 不等预取（以 `arrive()` 去重为安全依据） | 被 10–25% boot 竞态证伪：在途去重只覆盖同包双拉，不覆盖跨包同步 require 边 |
| json 直接当 loader patches 文件 | json 键名将耦合 yml 行结构，写入方要懂 cordis |
