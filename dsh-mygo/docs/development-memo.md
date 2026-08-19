# dsh-mygo 开发备忘录

> 记录“去掉权限核心、只保留 HMR 与插件管理”之后画过的饼、已经兑现的部分，
> 以及明确的“不做/暂不支持”边界。本文档随代码演进更新。

## 设计原则（重构后的定调）

- **只留两条主线**：HMR（generation/swap/staging/dispatch）与插件管理（安装/启停/卸载/替换/恢复）。
- **0 侵入**：mygo 直接使用宿主 API，不修改 dsh core（dsh-tools、dsh-host-webserver、storage 等保持原样）。
- **HMR 优先**：插件更新/替换走七步 replace 协议（capture → stage → swap → dispose），进程与进行中的 session 不重启。
- **两层 HMR 分工（2026-08-10 确认）**：配置级变更（install/enable/disable/
  uninstall、P3 bundle 行级开关）走宿主 patch HMR（写 cordis.patch.yml →
  hmr.registerConfig 重放），mygo 只做预检/幂等/回滚；代码级更新
  （replace/updateRaw/自更新）保留七步替换协议，**不做简化**。
- **显式不支持优于硬适配**：旧版工作区插件、依赖核心能力补丁的插件、无法纳入受管生命周期的插件，给出明确错误或标记，而不是把整个后端拖崩。

## 已实现（✓）

1. **HMR + 插件管理核心**：generation/swap/staging/dispatch、snapshots、sqlite registry、install / enable / disable / replace / uninstall / recover。
2. **零侵入 raw 接入**：`fromCordisPlugin` / `adoptRaw`、透明 facade（`on` / `inject` / `provide` / `tools` / `systemPrompt` / `httpServer` / `skills` / `commands` / `effect` / timer 拦截，其余透传宿主）。
3. **类插件（Service 子类）**：`adoptRaw` 识别类构造器，按 `new raw(ctx, config)` 挂载（token-meter / compact-basic 模式）。
4. **停用语义**：工具保持注册，dispatch 侧拦截并回报“插件已停用”。
5. **卸载语义**：uninstall tombstone（`status: uninstalled` + `tools[]`）持久化，重装前 `clearUninstallTombstone`；卸载后调用提示“插件不存在/已卸载”。
6. **unknown-tool 零侵入**：不改 dsh-tools，mygo 监听 `tools/execute` waterfall 拦截。
7. **启动支持检查 + 守卫桥接**：桥接动态导入 + `checkSupport`（入口形状 / requires 可用性），坏插件跳过挂载只记日志，后端照常启动。
8. **面板安装器（设置页）**：github / folder / archive 三种安装；`installDeps` 自动依赖 + 构建；`setup` 前置命令、`startCommand` 覆盖、`skipBuild`。
9. **外部应用模式**：独立 `mygo-apps` 根、启停（进程组）、卸载不同步标识（`syncUninstall: false`）、沙箱 `none` / `workspace`、操作审计 JSONL。
10. **远程更新**：GitHub 安装记录 `remote { url, ref, commit }`；扫描/检查更新（`git ls-remote`）；插件走 `updateRaw`（HMR 热替换，进程与 session 不重启），外部应用停 → 换码 → 恢复启动。
11. **mygo 自身更新**：`install.sh` 首次安装并写入 `~/.dsh/mygo-self.json`（远端 + commit）；检查更新包含 `dsh-mygo` 自身；更新时替换/重建 mygo/mygo-api/panel 并触发 Loader 热重载（受管插件由 recover() 恢复）。
12. **HTTP 桥**：`rawHttpBridge` 支持流式 `pipe` 与二进制 body（按 content-type 返回字节）；路由 view 注册时快照，卸载/替换时宿主 disposer 安全。
13. **显式不支持清单**：
    - 0804/0805 时代工作区插件（嵌套私有 `@deepseek-ai/dsh-*` + `workspace:` 协议）→ “版本过老，面板不支持直接安装”（dsh-working-activity）。
    - 依赖渲染器能力补丁的插件（split-panes 的 `SessionScope`、working-activity 的 webui patch）→ 待上游合入，面板不硬适配。
    - apply 内 `ctx.plugin` 组合子插件的插件（dsh-rewind）→ 明确报错“暂不支持”，激活失败干净回收，不再 fatal。
14. **medium-reset 适配**：0808/0809 storage-domain 无 `recovery: 'reset'` / `domain/reset` / `KvFacet.destroy`，注册表介质损坏 fail-loud（registry-domain 去 recovery、事件词表去 `domain/reset`、audit 去 `medium-reset`）。

## 画过但还没兑现（待办/饼）

- **通用修复（三层，从 dsh-sfw/tps/stickers 等失败收敛而来）**：
  1. facade 宿主透传通用化：tools / systemPrompt / commands / skills / httpServer 全部包成
     “已知成员走受管、未知成员 `ctx.get(服务)` 透传宿主”的 Proxy（tapIndex 已验证模式，未推广）；
  2. 构建环境通用化：npm 失败后用 checkout 的 pnpm 兜底（原生支持 `workspace:`/`link:`、
     prepare 能解析 workspace 类型），或把插件临时注册为 checkout workspace 包构建；
  3. 安装策略路由：按 manifest 特征自动选路（client half 无产物→build；workspace: 协议→pnpm；
     build 不可移植→prepare；宿主高级 API→透传+支持检查；实在不行→显式拒绝并给原因）。
- **[OK] 2026-08-10 已兑现第 1 层**：hostPassthrough 通用代理（tools/systemPrompt/
  skills/commands/httpServer）+ 外层属性访问先 `env.get` 再 host 回退（raw
  `inject` 服务不再抛 "without inject"）；ext-compat 复测 9/9 facade-service-gap
  插件 real 挂载成功，5 个 rejected-facade-gap 的宿主方法透传在 web 组合验证
  通过。宿主副作用生命周期见下（已修）。
- **[OK] 2026-08-10 修复面板 ESM 缓存**：重装同 id 插件时 Node 按 URL 缓存模块，
  adoptRaw 拿到旧代码；安装路径导入追加 `?mygo=<ts>` 绕过（query 会被
  fileURLToPath/相对解析剥离，import.meta.url 使用者不受影响）。
- **[OK] 2026-08-10 修复宿主副作用生命周期**：facade 对注册类宿主方法
  （tapIndex/registerUpgrade/registerFallback/registerProvider/context）包装，
  返回的 disposer 经 `env.hostEffect` 单独登记（插件丢弃返回值也兜底登记）；
  disable 执行 host-effect disposers（页面改写/upgrade 路由/技能 provider
  停用即恢复），普通 effect 保留以维持工具“已停用”拦截语义；enable 检测到
  曾撤销则走 HMR replace 重挂重新 apply；卸载/替换先执行 host-effect 再执行
  普通 disposers。
- **[OK] 2026-08-10 修复静态 adopt 竞态**：install 写桥接行触发 Loader 热重载 +
  面板 adoptRaw 可能双 apply，宿主副作用重复注册（already registered）；
  adoptStatic 对同 id 同版本已 enabled 的静态行幂等返回。
- **[OK] 2026-08-10 浏览器端 client 状态门卫**：sfw/ads 类 UI 插件的可见效果在
  浏览器端 client 半部；node 侧 disable 只撤 index.html 注入，client 读不到
  注入时回退本地默认（sfw 默认 enabled:true）→ WebUI 不更新。桥接生成时在
  原 client bundle（保留原注册 id）后追加状态门卫：materialize 时同步查
  `/api/mygo/plugins`，非 enabled 不调原 apply。强刷后浏览器端按 mygo 状态
  生效；已有桥接启动时自动升级。残余边界：已打开页面的实时撤销需要宿主
  client fiber 卸载能力（0 侵入做不到），刷新后必然生效。
- **[OK] 2026-08-10 安装链路通用修复**：config 校验失败给可读 schema 描述；
  npm install 剥全部 @deepseek-ai/*（registry 404）；adoptStatic per-id 锁
  串行化双 adopt；宿主服务冲突（Service 类插件 super 注册同名服务）包装成
  host-conflict 明确消息。
- **session-persistence-rdb：显式不支持**：extends 宿主 SessionPersistence
  （与组合 jsonl 冲突）+ 构造顺序缺陷（settings.register 先于 super，失败后
  namespace 永久残留）。正确用法：替换组合行部署，非 mygo 面板安装对象。
- 外部应用沙箱 `strict` 档（目前只有 `none` / `workspace`）。
- systemd / launchd 自启托管、进程自启检测。
- apply 内 `ctx.plugin` 子插件组合的真实支持（把子挂载纳入 mygo 生命周期；目前显式拒绝）。
- 渲染器能力类插件在 0809 的适配（split-panes 补丁、working-activity、gomoku 缺 client half）。
- 事件词表生成 hook（`gen-cordis-catalog`）移植到 0809；README / i18n / 文档补齐。
- 旧受管权限 API 开发文档：**不写**（权限层已删，生态插件原生支持，不需要旧式权限 API 文档）。
- 明确不做：往 storage-domain 回补 medium-reset（与 0 侵入冲突）。

## 已知边界

- 0 侵入只保证 mygo 自身不改核心；生态插件若依赖核心能力补丁（如 `SessionScope`），需上游合入或显式标记不支持。
- 守卫桥接保护正常安装流程；Loader 层“行引用的包完全不存在”仍会失败（正常安装不会产生这种行）。
- 远程更新仅覆盖带 `remote` 记录的 GitHub 安装；folder / archive 安装按前提不参与。

## 已知问题

- **[OK] 2026-08-10 已修（managed tool 演示面）**：facade `tools.register`
  曾丢弃 `output.render` / `output.presentationMeta` / `presentCall` /
  `presentResult`，导致 dsh-visualize 类工具的 `tool/result` meta 恒为
  null、浏览器端回退 generic 文本（卡片不渲染）。已透传三处（mygo-api
  类型 + adapter 映射 + registryToolView），回归测试
  `tool-presentation.spec`；旧 session 已落库的 null meta 无法回补，需新
  调用验证。
- **[OK] 2026-08-10 已修（bundle CLI 定位）**：BundleRail 的 checkout 此前用
  固定 `../../..`，在构建产物 `packages/cordis/mygo/lib` 下会解析到
  `packages/`，导致 `dsh 可执行文件不存在`。改为向上查找
  `packages/client/tsdown.client.ts` / `apps/cli/src/bin.ts` 标记
  （`resolveCheckout`）。已用真实 bundle 验证。
- **[OK] 2026-08-10 session-reader 三层格式**：`mygo/src/session-reader.ts`
  实现 jsonl（zstd 多帧 + chunk-run 解包）、sqlite、rdb（稠密 seq
  重映射 + torn tail）三种读取器 + `extractFields` 字段投影；设计见
  `docs/next/2026-08-10-session-persistence-formats.md`。
- **[OK] 2026-08-10 mygo-rdb 扩展插件（依赖 dogfood）**：mygo 在统一依赖图
  暴露隐式 provider（`dsh-mygo` + `service:mygo-core`）；扩展插件
  `extension/mygo-rdb` 声明 `depends service:mygo-core >=0.1.0` +
  `provides service:mygo-session-reader`，工具 `session_list` /
  `session_read` 自动识别 rdb/sqlite/jsonl 三种格式；package.json 声明
  `@deepseek-ai/dsh-mygo` 依赖以便面板链接工作区包。3080 已现场安装
  验证 capability 依赖被隐式 provider 满足。
- **[OK] 2026-08-10 host 替换 companion**：`HOST_REPLACEMENT_DEFAULTS`
  （rdb→禁用 jsonl）+ `dsh.mygo.hostDisables` 声明；启用写 host 块、
  停用/卸载移除还原；staging 临时实例真实 rdb 安装/停用/启用/卸载闭环
  验证通过。
- **[OK] 2026-08-10 已修（HTTP 桥 req async iterable）**：dsh-better-sidebar
  用 `for await (const chunk of req)` 读 body（Node IncomingMessage 语义），
  mygo `rawHttpBridge` 的 req shim 没有 `Symbol.asyncIterator` → 报
  “req is not async iterable”。已给 shim 补 async generator（yield 缓冲
  body），`/sidebar/api` 实测从崩溃变为正常业务响应（400/404 信封）。

- **未复现（2026-08-10 受控压测）**：历史事件——旧版面板卸载 sp-1 后 alpha
  的安装目录与 profile 行一度丢失。独立临时 DSH_HOME + 8 个演示插件，
  顺序卸载（其余 10 个目录/行原封不动）+ 3 轮并发同 id 卸载/重装与跨 id
  并行（每轮后 dirs==rows，固定集 alpha/beta/gamma/cap-alpha/sp-1 的
  目录/行/API 全存活），均未复现。结论：更可能是旧代码缺口（卸载无依赖
  保护、syncBridgeRows 无并发守卫）或当时的面板人工操作；若再出现，先抓
  `~/.dsh/profiles/web/cordis.patch.yml`、INSTALL_DIR 清单与运行日志。

- **[OK] 2026-08-10 已修（原 disable 不撤销 WebUI 副作用）**：停用现在执行
  host-effect disposers（tapIndex 改写、upgrade 路由、技能 provider 恢复），
  保留普通 effect 以维持工具“已停用”拦截语义；启用走 HMR replace 重挂。
  已知残余边界：未列进注册白名单的宿主方法（非注册类调用）返回的副作用仍由
  插件自行管理；插件若手动调用宿主 disposer，会早于 mygo 释放（宿主 disposer
  幂等，无重复释放问题）。

## 下版核心目标（2026-08-09 已定：插件兼容性检查与插件间依赖）

下版（0.2.0 方向）以“兼容性检查 + 插件间依赖”为核心——这也是 Fabric 生态的
主要优势之一。0806 两篇 proposed 笔记（`docs/next/`）作为参考：笔记本身写于
权限层时代，机制挂点需按 mygo 现状重写，但问题定义、约束词汇与报错形式不过时。

**2026-08-10 v1 已落地**（详见 `docs/next/2026-08-10-mygo-manifest-v1.md`）：
声明式 `dsh.mygo` 段（entrypoints + compatibility）、`ctx.entrypoints`
聚合服务（define/get/keys、按代 token 撤回）、requires/breaks 版本化检查
（install/adopt/replace/uninstall/enable/恢复对账/plan/checkSupport/面板预检），
新增 `compatibility-conflict` 错误码与零依赖 semver 范围匹配器；测试全绿。

- **兼容性约束（requires / breaks）**：包级、版本化、纯校验不解算。[OK] v1
  - `requires`：栈内必须有满足版本的包；`breaks`：栈内不得有版本落在禁止区间的包。
    只做两个硬级别，不做 recommends/suggests 软级别；不移植 ModSolver，不选版本
    （pnpm 负责），不为 capability 引入版本制（服务 id 不带 range，
    `name@range` 错误保留）。
  - [OK] 2026-08-10 P1 v2：Fabric 五级词汇（depends/recommends/suggests/
    conflicts/breaks）+ `depends` 硬边传递闭包（环检测、链报告、
    missing/installed-disabled/version-mismatch 状态区分）+ 软边单层警告 +
    派生 provider 冲突 + reconcile 级联禁用 + enable 预检 + 传递卸载拦截；
    设计见 `docs/next/2026-08-10-dependency-vocabulary-v2.md`。
  - 版本锚定已装 package.json（git / tarball / path 安装同参与）。
  - 检查点：install / update、启动组合、HMR swap、运行时动态安装；违反时输出
    “声明者 + 约束文本 + 已装版本”的约束链报告（学 Fabric ResultAnalyzer），
    沿用 fail-loud / `hmr/config-update-failed` 语义。
- **插件间依赖**：现有 requires/provides 是服务 id 级且已有 dependents 计算
  （plan.ts），但缺面向用户的报告与停用/卸载/替换时的级联提示；下版把依赖图
  变成可解释、可检视的能力（“卸载 X 会连带停用 Y：Y requires X 提供的服务”）。
  [OK] v1 已有约束链报告与卸载拦截；依赖图级联提示（服务级）仍待做。
  - [OK] 2026-08-10 P2：激活求解器（`solveActivation`）——required-by 连带
    enable、capability（service:/cap:）provider 确定性选择、breaks 最小
    变更消解、advisory 安装/升级建议；`plan()` 返回 actions；install
    支持 `autoResolve`；disable 新增下游保护（dependent-exists）与
    `force` 级联停用；卸载保护扩展到 capability 提供者（受害者 provides
    含能力时拦截）；面板错误响应带 details + 客户端错误 banner（涉及插件
    高亮、自动滚动）；设计见
    `docs/next/2026-08-10-activation-solver-v2.md`。
  - [OK] 2026-08-10 P3 核心：bundle 轨（`BundleRail`）——profile manifest
    原子读写 + `dsh plugin` CLI 转发 + patch 行解析 + companion 块 +
    统一依赖图（bridge/bundle 跨轨求解与级联）；in-box bundle 按 realpath
    排除；面板 rail 徽标与 Bundle 安装入口；设计见
    `docs/next/2026-08-10-bundle-rail-v3.md`；收尾：opt-in enable 块
    （fabric 类自带 disabled 行反向激活）、install 校验回滚、host-conflict
    确认清单。
- **声明式贡献（entrypoints）作为配套通道**：静态数据（skill 根、命令、策略行等）
  无需插件代码即可贡献给扩展点，贡献随 HMR 原子撤回；需要先补包级声明式 manifest
  （`mygo.json` 或 package.json 的 `dsh.mygo` 段），key 有属主、顺序即安装序。
  [OK] v1（package.json `dsh.mygo` 段；`mygo.json` 独立文件未做，暂不需要）。
- **验收（第一版）**：两个插件 `breaks` 冲突时，安装/启动给出可读报告并拒绝生效；
  HMR 引入冲突时保留上一好代并广播失败；静态贡献无需代码即进入
  `ctx.entrypoints.get(key)`，`dump-config`-家族命令可检视贡献集与约束集。

---

## 2026-08-10 v0.2.0 修复批次：facade 兼容缺口 A→D（已上线 3080）

审计文档：`docs/next/2026-08-10-facade-compat-gaps.md`（含实施记录）。
全量测试：mygo-api 39 + mygo 445 全绿；tsc + tsdown 构建通过；已同步
0809 / -fresh / staging（3080 运行新代码）。

- **A. ctx.on 宿主事件桥**：实测修正审计结论——词汇内宿主事件经 dispatch 本来
  就能触发；真缺口是词汇外事件被静默 declare、`ctx.once` 走宿主 passthrough
  泄漏、`prepend` 被丢弃。改为 unclaimed 事件挂宿主 `ctx.on`/`once`，
  disposer 进 `hostEffectDisposers`（disable/HMR replace 都撤销）；
  测试 `host-event-bridge.spec.ts` 9 例。
- **B. HTTP 桥**：`rawHttpBridge` 重写——`res.pipe`（dsh-stickers 根因）、
  `flushHeaders`/`statusMessage`、SSE live stream（逐 chunk 转发，空闲
  `streamIdleMs` 关闭，不再缓冲 30s）、req `once`/`setEncoding`/`close` 等；
  顺带修了 push 双发 bug。测试 `http-bridge.spec.ts` 5 例；3080 实测
  stickers PNG 200 + 完整字节，sidebar 业务 API 正常。
- **C. 工具字段**：`timeoutMs` / `isConcurrencySafe` / `finalizeContent`
  从 facade 透传到宿主注册视图（`tool-presentation.spec.ts` 2 例）。
- **D. skills 发布视图**：保留插件声明的 invocation/source/provider/rank，
  缺省才回退 managed 默认（`skill-view.spec.ts` 2 例）。

## 2026-08-10 安装器支持官方 `.dsh-plugin` 仓库格式（dsh-browser-panel）

背景：dsh-external 新仓库（dsh-browser-panel 等）改用官方 repository-plugin
格式——真实包在仓库 `.dsh-plugin/` 子目录，`package.json#dsh.entry` 声明编译
入口，仓库只提交源码（无 lib）。旧安装器只认仓库根入口，报“未找到插件入口”。

落地（`vendor/dsh-mygo-panel/src/index.ts`）：
- `locatePluginRoot` 识别 `/.dsh-plugin`（含单层内层目录里的 `.dsh-plugin`），
  入口按 `dsh.entry`/`main` 声明解析（`resolveEntryDeclared`，允许产物未构建）；
- `.dsh-plugin` 包强制走“安装依赖 + 构建”：npm install 加 `--ignore-scripts`
  （官方 `prepare` 依赖未发布的 `dsh-plugin-prepare`，跳过），再 `npm run build`
  产出入口与 client half；安装清单记录 `installDeps: true`，远程更新同样先构建
  再 HMR swap；
- 实测：临时 DSH_HOME + staging 实例，安装 dsh-browser-panel 成功——插件启用、
  lib/index.js + lib/client.js 构建完成、桥接行生成、`/browser-panel` 返回
  JSON 200、`/browser-panel/stream` 流式 200 不挂起。

## 2026-08-10 dsh-git-graph 安装死结 + 宿主服务启动竞态（已修）

现象：dsh-client-ui-git-graph 安装成功但桥接行在 boot 时
“宿主缺少服务：workspace” 跳过挂载；manager 无记录 → 面板看不到、无法卸载，
重装又报“已安装，请先卸载或清理安装目录”，死结。

根因（临时日志证实）：workspace 服务（WorkspaceRegistry）是异步
`[Service.init]`，bridge 的 checkSupport 在它 ACTIVE 之前跑，
`ctx.get('workspace', strict=true)` 返回 undefined；桥接模板此前只对
“兼容性冲突”重试，缺服务直接放弃。第 3 次重试时 workspace 已可用。

落地（`vendor/dsh-mygo-panel/src/index.ts`）：
- 桥接模板 v3：checkSupport 对“宿主缺少服务”也重试（500ms × 5，覆盖异步
  宿主服务晚于桥接行激活的竞态）；`regenerateBridges` 按 `bridge template v3`
  标记升级存量桥接（下次面板挂载自动重写）；
- 安装器残留恢复：installFromRoot 目标目录已存在但 manager 无活记录时，自动
  清理旧目录/桥接/行并覆盖重装，不再死结；活插件仍保持硬拦截；
- 实测：3080 重启后 git-graph 第 3 次重试拿到 workspace 并 enabled；
  `/git/events` SSE 200 实时帧正常（同时验证 B 的流式语义）；桥接已升级 v3。

## 2026-08-10 配置自动化三件套（首装模板 / 可展开配置 / 配置助手）

背景：session-persistence-rdb 首装报“请在安装时填写 config”，用户不知道
schema 要求什么，形成怪圈。需求：首装自动按模板配置、受管页可展开可配置项、
实在不会配时拉 subagent 分析插件配置并给出建议。

落地：
- **首装自动模板**（服务端 `buildConfigTemplate` + `installFromRoot` 兜底）：
  导入插件入口读 schemastery Config（结构内省：object/union/const/默认值），
  生成 JSON 模板；再扫描仓库内 `config*.json` 样例做已知键深合并，最后用
  schema 本身校验归一；调用方未传 config 时自动使用模板，不再报怪圈。
  安装前预览（`/api/mygo/install-plan`）尽力返回 `configTemplate`，客户端
  自动填入配置框（可编辑）。源码仓库未装依赖时预览拿不到（导入失败），
  安装路径在装好依赖后兜底生成——rdb 实测从“manifest invalid config”变为
  真实宿主冲突（settings 命名空间已存在）。
- **受管页可展开配置**：`GET/POST /api/mygo/plugins/:id/config`；新增
  manager `configOf(id)` 读取当前生效配置；卡片“配置”按钮展开 schema 字段
  列表，保存走 HMR `updateConfig`。表单参考 schemastery WebUI 约定：服务端
  透出 `role`/`extra`/`min`/`max`/`step`/`pattern`，客户端按字段类型渲染
  控件（文本框/textarea/数字 min+step/布尔/select（union const 或 role
  select options）/const 只读/嵌套对象分组），JSON 模式作为高级编辑保留，
  两种模式可切换；保存表单时直接提交字段树。
- **配置助手（可对话，无需预选插件）**：原生受管插件页侧边展开聊天区块，
  全局单一会话——不要求先选插件，助手从对话上下文识别插件（必要时先
  `mygo_helper_status` 列已装插件，不确定就问用户）；插件卡片“助手”按钮只是
  打开聊天并预填“帮我看看 X 的配置”。UI 重做：卡片式面板、左右气泡（用户
  高亮右对齐/助手左对齐）、输入中三点动画、自动滚动、示例快捷填入、底部
  输入行+发送按钮。服务端 `POST /api/mygo/config-helper`（start/chat/status/
  stop）：每轮在服务端累积 messages 作为子代理 prompt；父会话优先取当前
  session/活动 agent，否则自建临时父代理（agentOptions 取自
  `ctx.agentDefaultModel.currentSelection()`），stop 时 dispose
  run/agent/临时父代理并清面板记录。
- **helper-only skill + 工具面**：mygo 注册 `mygo-config-helper` skill 与
  `mygo_helper_*` 工具（status/check/install/config/update_config），仅在
  有助手会话期间注册（引用计数随会话创建/关闭增减），stop 后自动注销；工具
  execute 校验调用方 agent 必须是当前助手会话；子代理 toolFilter 白名单
  = helper 工具 + skill/read/bash/glob/grep。skill 定义默认流程：安装先
  check（拉源/本地检查/入口/requires/配置模板/兼容性计划）→ 确认后 install
  （config 缺省自动模板，installDeps 建议 true）→ status 确认；配置先
  config 读 schema/当前值 → 文件补充分析 → update_config 应用。实测多轮
  对话：助手正确调用 mygo_helper_config 返回字段表并继续上下文；stop 后
  面板记录清空。注意：子代理的持久化会话与普通 subagent 一样留在
  ~/.dsh/sessions（框架管理），面板侧记录已同步清空。
- 已知边界：带宿主 settings 命名空间的插件（dsh-better-sidebar 等）HMR
  replace 时旧代注册未释放，`updateConfig` 仍报 “settings namespace …
  already registered”（既有 HMR 边界，见上一条备忘录）；无该冲突的插件
  配置保存正常。

## 2026-08-10 配置助手调试持久化清理

配置助手每轮对话会创建子代理会话，无活动会话时还会自建临时父代理；这些会话
会落在 `~/.dsh/sessions/<cwd-slug>/<sessionId>/`（jsonl 后端）。用户要求调试
结束后全干掉。

落地：`ConfigHelperState.debugSessions` 记录助手创建的所有会话
（子代理 run.id + 临时父代理 sessionId，各带 cwd）；`stopConfigHelper` 在
dispose run/agent/父代理之后调用 `cleanupHelperDebugSessions`——经
`ctx.sessionPersistence.locate({ id, cwd })` 定位后端产物路径（jsonl 为
`session.jsonl.zstd`），删除整个会话目录，best-effort。实测：stop 后当前
对话的子代理与临时父会话目录即消失；此前调试遗留的所有助手会话也已手动清理。
 非 jsonl 后端（如 rdb）`locate` 返回 undefined 时跳过删除。

## 2026-08-10 配置助手“正在回复中”卡死修复

现象：上一轮还在运行/状态卡住时再发消息，报“助手正在回复中，请稍候”，
刷新后也无法恢复。修复三点：
- 发送排队：`chatWithConfigHelper` 在运行中收到新消息不再抛错，而是写入
  `messages` + `pending` 标记并返回 `queued: true`；当前轮结束后立即自动
  启动下一轮（`runHelperTurn` 抽出复用，result 回调里检查 pending 续跑）；
- 超时自愈：`HELPER_RUN_TIMEOUT_MS = 5min`，chat/status 发现运行超时即
  abort 当前 run 并允许重新发送，不再永久卡死；
- 打开面板同步：客户端打开助手区块时先查一次 status，恢复进行中的运行与
  历史消息并继续轮询（刷新后不再显示陈旧空面板）。
实测：运行中连发两句，第二句返回 queued:true 不报错，两轮依次完成共 4 条
消息；stop 后本会话所有子代理+临时父会话目录被清理。

## 2026-08-10 配置助手改为正经临时对话（continuable 会话）

用户要求：别再用“每轮把历史塞 prompt”的一次性子代理，改成真正的临时对话。
落地：
- 每次助手会话创建一个专用临时父代理（`agents.create`，cwd=checkout，
  origin subagent）+ 一个 continuable 子会话（`subagents.startContinuable`，
  provider spawn，初始 prompt = 助手指令，toolFilter = helper 工具 +
  skill/read/bash/glob/grep，persona 只读）；
- 每轮用户消息走 `subagents.followup(parent, childId, content, {source:
  {kind:'user'}})`，等待 `agent.whenIdle()`（5min 超时，超时
  `interrupt`），再从 `sessionPersistence.inspect(childId)` 读取本轮新增的
  `assistant/message`（事件结构为 `data.message.content`）作为回复；
- 会话是持久 child session，多轮上下文由框架真实记忆（不再重放 transcript）；
  排队逻辑保留：运行中来的消息进 `pendingTurns`，当前轮结束后自动续跑；
- stop：`interrupt` + `drainDescendants([parentAgent])` 释放 child、
  `parentHandle.dispose()`、按 debugSessions 删除 child+parent 会话目录、
  注销 helper-only skill/工具面；
- 实测：同一 childId 连续两轮对话正常（第二轮能记住第一轮内容并引用源码
  行号）；stop 后会话目录全部清除。

## 2026-08-10 装载顺序修复 + rdb(postgres) 组合替换验证 + registry-store 接缝

### 装载顺序修复（面板安装器）
installFromRoot 改为“先 adoptRaw 成功、再写桥接行”：此前先写桥接行会让
loader 的 patch HMR 抢跑热挂桥，与直接 adoptRaw 双跑同一个插件，settings
namespace 等宿主注册在失败时残留。修复后首次安装的错误从误导性的
“settings namespace already registered”变为真正的 host-conflict
（插件提供宿主已注册的 sessionPersistence 服务），profile patch 无残留。
注意：session-persistence-rdb 自身构造顺序缺陷（settings.register 先于
super()、失败不清理）仍会在单次失败 staging 后于进程内残留 namespace，
重试需重启。

### 组合替换验证（临时实例，端口 41786，PG 容器 mygo-pg）
profile patch：禁用 base bundle 的 `session-persistence-jsonl` 行 + 插入
`session-persistence-rdb`（postgres 连接串，name 直指 __spr-manual 的
src/index.ts，并补齐其 node_modules 的 @deepseek-ai/cordis/schemastery
链接）。结果：实例正常启动，PG 建立 rdb 五表（t_sessions/t_events/
t_session_events/t_schema_meta/t_persistence_state），jsonl 已禁用，
mygo 面板正常；mygo-rdb 扩展安装启用。
结论：**mygo-rdb 的 session reader 不支持 postgres**（detectReaders 只探测
`sessions/sessions.sqlite` 文件与 jsonl 目录树，postgres 后端无本地产物），
组合替换可用、读取需补 PostgresSessionReader。

### registry-store 接缝（核心 + mygo-rdb 扩展）
- 核心：`RegistryStore` 增加可选 `check()`；`RegistryPersistence.open`
  接受外部 store（`mygoRegistryStore` 宿主服务），存在则跳过内置 sqlite
  域并先跑 round-trip 自检，失败 fail loud；audit/snapshots 仍走文件；
- mygo-rdb：新增 `lib/store.js`（`RdbRegistryStore`，sqlite+postgres 双臂，
  `t_mygo_meta/status/gens` 三表，键值语义与 SqliteRegistryStore 一致，
  损坏行 RegistryRowError、schema_version、check 心跳）与
  `lib/store-provider.js`（组合行注册 `mygoRegistryStore`）；package.json
  增加 pg 依赖与 `./store`、`./store-provider` exports；
- 测试：registry-store.spec 3 例（外部 store 优先 + check、check 失败 fail
  loud、rdb(sqlite) 全操作序列 + 损坏行隔离）；核心 store/t3-t4/service/
  lifecycle 144 例无回归；postgres 臂用真实 PG 容器验证
  （check/write/read/usage/delete 全部通过）。
- 部署形态：store-provider 作为宿主组合行，必须排在 `dsh-mygo` 行之前；
  迁移导入（sqlite/json → rdb）与 audit 迁入 rdb 留作下一步。

### session 侧 PostgresSessionReader（mygo-rdb）

补上会话读取的 postgres 支持：
- 核心导出 `RdbEventRow` / `rdbRowToHeader`（session-reader.ts），供扩展复用
  稠密序列重映射与 torn-tail 语义；
- mygo-rdb 新增 `lib/session-reader-pg.js`：`PostgresSessionReader`（pg Pool，
  只读三表 JOIN，行映射走 `scanRdbRows` + `rdbRowToHeader`，与 sqlite 臂语义
  完全一致）；`lib/index.js` 的 detectReaders 增加 `rdb-postgres` 臂，连接串
  自动从 `session-persistence-rdb` settings namespace 读取（postgres 时），
  环境变量 `DSH_RDB_POSTGRES` 兜底；
- `session_read` format 增加 `rdb-postgres`；
- 实测（真实 PG 容器）：手工构造 session-pg-1 三表数据 → list 返回
  header、readById 还原 3 事件、extractFields 得到 messages/toolCalls/turns
  全部正确；临时实例（41786）已更新扩展并重启，mygo-rdb 启用。

说明：`store-provider` 指宿主组合行（lib/store-provider.js），它创建
`RdbRegistryStore` 并注册为 `mygoRegistryStore` 服务，让 mygo 管理器把插件
注册表持久化（status/gens）切到 rdb；它和会话读取无关，且必须排在
`dsh-mygo` 行之前挂载。

### 安装 extension 自动迁移 + 接管（已完成并验证）

- 迁移放在核心 `RegistryPersistence.open`（manager 初始化、恢复之前）：
  外部 store 存在且空、无迁移标记时，从内置 sqlite 注册表域逐行搬运
  status/gens 原始 KV（保留 opaque JSON 原样，损坏行照旧 quarantine），
  写 `migrated_from_sqlite` 标记；非空或已标记则跳过（不合并）；
- 接管：store-provider 同步 `ctx.root.provide('mygoRegistryStore', store)`
  （**必须在 root 上 provide**——loader 给每行建独立 isolate 映射，行级
  provide 会把 impl 键到另一个隔离符号下，兄弟行 get 不到；这是本次排查
  的关键坑），manager 初始化 `ctx.get('mygoRegistryStore')` 拿到后即全程用
  rdb，旧 sqlite 域不再打开；
- 验证（临时实例 :41786 + PG mygo-pg）：旧 sqlite 注册表塞 legacy-probe
  （status+gens，注意 storage-domain 值是 JSON 二次编码）→ 重启 → 日志
  “已从 sqlite 注册表迁移 2 行到外部 rdb 存储”，PG t_mygo_status/gens 出现
  对应行、meta 出现迁移标记，manager 报告 external registry store present
  true 并从 rdb 恢复；registry-store.spec 新增迁移/跳过 2 例（共 5 例全绿）。
- 待办：sqlite→rdb 会话导入（session 侧另开）。真实 3080 组合部署 + audit
  迁入已完成，见下文“3080 真实部署”一节。

### 卸载自动接管测试 + 卸载 extension 自动回 sqlite

在临时实例（41786 + PG mygo-pg，rdb 接管中）验证：
1. **卸载插件落到 rdb**：卸载 mygo-rdb（static 桥接行）→
   `t_mygo_status` 写入 `{status:"uninstalled", currentGen:0}` tombstone，
   profile 桥接行移除；重启后 adoptStatic 读到 rdb tombstone 跳过，插件
   不复活（plugins 为空、tombstone 保留）。
2. **卸载 extension 自动回 sqlite**：面板卸载 `mygo-rdb` 时新增
   `removeStoreProviderRows()`——把 profile 里的 `mygo-rdb-store` 组合行
   一并移除；重启后 manager 不再看到 `mygoRegistryStore`，自动回退内置
   sqlite 路线（日志无“外部存储”行）；恢复期把 sqlite 里 legacy-probe 重新
   quarantine 并写回 sqlite（证明读写都在 sqlite），PG 不再变化。

注意：面板安装的插件是 static adopt，不写注册表；动态 install 才写。
另外临时实例的 mygo-rdb 若更新了依赖（pg），需要同步其 node_modules
（panel 重装 installDeps 会装；手工拷 lib 时记得补 pg 链接），否则桥接
加载即致命错误。

### 作用域澄清（2026-08-10 用户确认）

**mygo-rdb 的预期功能不包括 session 迁移**——它只维护 mygo 自身在不通用
后端（rdb/postgres）的注册表持久化（store + store-provider + sqlite→rdb
迁移）。session 持久化与迁移属于 `session-persistence-rdb` 插件的职责；
此前临时写的 `lib/migrate-sessions.js` 已从 mygo-rdb 删除，如需 session
迁移应放到 session-persistence-rdb 侧（其自身声明“不迁移、不兼容即拒绝”，
要迁得在那边单独做）。

### 带 mygo 的插件盘点（3080，2026-08-10）

规则：`X-mygo` 不是独立插件，而是面板为插件 `X` 生成的投影桥——node 半
导入 `X` 的入口并 adoptRaw，client 半带 mygo 状态门禁（停用后浏览器 half
不再生效）。盘点到 3080 全部 8 组：桥目录、checkout 链接、client half
全部一致。

| 真实插件 | 来源 | 入口 | client | 桥 |
|---|---|---|---|---|
| dsh-better-sidebar | DSH-better-sidebar.git | src/index.ts | ✓ | ✓ |
| dsh-d399 | dsh-d399 | lib/index.js | ✓ | ✓ |
| dsh-sfw | dsh-sfw.git | src/index.ts | ✓ | ✓ |
| dsh-stickers | dsh-stickers.git | lib/index.js | ✓ | ✓ |
| dsh-visualize | dsh-visualize.git | lib/index.js | ✓ | ✓ |
| multimedia-webui-input | dsh-multimedia-webui-input.git | lib/index.js | ✓ | ✓ |
| mygo-rdb | 本地 folder | lib/index.js | ✗ | ✓ |
| whale-girl | whale-girl.git | index.mjs | ✗ | ✓ |

注意：临时实例（41786）与 3080 共用 staging checkout，临时实例安装
mygo-rdb/dummy-plugin 时会把 `node_modules/@dsh-external/*-mygo` 链接指向
/tmp——已把 mygo-rdb-mygo 链接纠正回 3080 的桥、删除 dummy 链接；以后临时
实例尽量用独立 checkout 或测完清理链接。

## 2026-08-10 3080 真实部署：rdb 注册表接管 + audit 迁入（已验证）

### audit 迁入 rdb（核心 + mygo-rdb）

- 核心 `packages/cordis/mygo/src/persistence.ts` 新增 `AuditSink`
  接口（append/since/byPlugin/tail）：`RegistryPersistence.open` 发现外部
  store 实现 `appendAudit` 时把 audit 路由到外部 store，否则回退文件
  AuditLog；
- mygo-rdb `lib/store.js` 新增 `t_mygo_audit` 表（sqlite AUTOINCREMENT /
  pg SERIAL）、`appendAudit`（超过 5000 条按 id 修剪）、
  `readAudit/since/byPlugin/tail`；
- 测试：registry-store.spec 新增外部 audit 路由 + sqlite audit 写读断言，
  7 例全绿；core lib 已同步 dsh-mygo / 0809 / fresh / staging。

### 3080 组合部署（真实环境，PG mygo-pg）

- 稳定部署目录 `/home/rosen/.dsh/mygo-rdb-store-deploy/`（store-provider.js
  + store.js + node_modules 链接：dsh-mygo→staging、pg→__spr-manual、
  schemastery）；
- 3080 profile 插入 `mygo-rdb-store` 行（在 dsh-mygo 之前），配置
  `postgresql://postgres:postgres@127.0.0.1:5432/postgres`，行前备份
  `/home/rosen/.dsh/backups/20260810-pre-rdb-store/cordis.patch.yml`；
- 重启后日志 `外部存储已有迁移标记，跳过`，3080 全程用 PG；API 插件集
  9 桥 enabled（better-sidebar/d399/plan-execute/sfw/stickers/visualize/
  multimedia-webui-input/mygo-rdb/whale-girl）+ tool-json、plugin-check 两
  bundle；
- audit 落 rdb 实证：本次启动写入 2 条（`quarantine` damaged-record、
  `mount` dsh-stickers gen 11），t_mygo_audit 可查。

### 排查出的迁移缺口 + 手动补迁（本次重点）

迁移标记在 18:13 被**临时实例 41786 抢先写入**（它迁移的是自己 home 的
sqlite，只有 legacy-probe 2 行；3080 主 home sqlite 里 24 status + 5 gens
的历史从未迁过）。3080 启动看到标记即跳过，主库历史被晾在 sqlite。

处理（备份在前，全部无删除、只 upsert 缺失 key）：

1. 备份：pg_dump 四张表到
   `/home/rosen/.dsh/backups/20260810-pre-3080-backfill/t_mygo_pre_backfill.dump`，
   sqlite3 `.backup` 一致性快照 registry.sqlite；
2. 用部署 store.js 的 `importRawStatus/importRawGeneration` 把主 sqlite
   的 24+5 行 JSON 解码一次（storage-domain 双编码）后原样 upsert 进 PG，
   已存在 key 跳过；
3. meta 写入 `backfill_3080_sqlite` trace（statusAdded 24 / gensAdded 5 /
   errors 0）；
4. 复验：t_mygo_status 26 行、t_mygo_gens 7 行（legacy-probe、dsh-stickers
   保留），audit 仍 2 条，3080 API 正常。

经验：迁移标记是全局单 key（`migrated_from_sqlite`），**第一个实例写标记
后，同库其他实例的历史会被跳过**；多个 home 共用一个 PG 库时容易踩。
后续可考虑把标记改成按 profile 作用域，或在部署真实实例前先确认主库历史
已迁。

### 运行环境核对（3080 收尾）

- 运行时 checkout：`/home/rosen/.dsh/source/current` → staging
  `staging-20260809T193011Z`，其 `node_modules/@dsh-external/` 9 个桥链接
  全部指向 `/home/rosen/.dsh/mygo-plugins/*-mygo`，无 dummy/测试残留；
- 工作区 `test-r05En1cU-0809-fresh` 的 @dsh-external 仍有指向
  `/tmp/dsh-mygo-verify-home.j8RQiq` 的测试链接（alpha/beta 等），不影响
  source/current 的服务，属旧 checkout 残留，等临时实例停掉后可清理；
- 41786 临时实例仍在运行（DSH_HOME=/tmp/dsh-rdb-test.ApWdhf），未动。

## 2026-08-10 settings 命名空间重复注册修复（dsh-plan-execute 配置保存失败）

### 报错

webui 修改 dsh-plan-execute 配置点保存 →
`staging failed at staging: Error: settings namespace "plan-execute" is already
registered`。走的是面板 `POST /api/mygo/plugins/:id/config` →
`updateConfig` → HMR replace。

### 根因（两层）

1. **宿主 settings 注册表是全局的**：mygo 的 replace 协议先 stageNew（激活新
   generation）再释放旧 generation，新 generation 的 `apply` 里
   `installSettingsSection` 直接往宿主 settings 服务注册同名 namespace，
   与仍在位的旧 generation 冲突；
2. **facade 透传把注册挂在了错误的 fiber 上**：zero-intrusion facade 对
   `ctx.settings` 走宿主属性透传，拿到的是绑定 manager fiber 的宿主服务实例，
   `register()` 内部的 effect 挂到 manager fiber，永远不会随 generation 释放
   ——即使绕过 staging 冲突，旧注册也清不掉。

另外踩到一个字段名坑：staged registration 里暂存 scope 的字段最初叫
`scope`，被 `existingScopes()` 当成 agent scope 层，导致 replace 时同一
generation 激活两遍、重复注册；已改名 `stagedScope`。

### 修复（mygo 侧，宿主代码零改动）

- facade 新增 staged settings surface：`ctx.settings` / `ctx.inject(['settings'])`
  在 staging 期间拦截 `register`，不碰宿主注册表；scope 的 `get()/watch()`
  先用 entry config + 已存 user section 本地解析（`describe()` 读 user），
  commit 后再 attach 到宿主 live scope；
- 提交时机后移：settings 注册进 generation 的 `settingsRegistrations`，
  `applyRegistrations` 只收集不执行；replace 路径在**旧 generation 释放完成
  后**（`releaseGeneration` 现在 async 并 await settings owner fiber 卸载）
  再 `commitSettingsRegistrations`；install/recovery/adoptStatic 在 persist
  成功后提交；
- 每 generation 用真实 Cordis 子插件 fiber（`ctx.plugin({ inject:
  ['settings'], ... })`）承载注册，fiber dispose 即注销 namespace，随
  generation 释放（uninstall/replace/disable 都清理）；
- disable 同步释放 settings owner（和 host 副作用同一语义），enable 走
  replace 自动重挂；
- 无宿主 settings 服务时 surface 为 undefined，保持旧透传语义。

### 验证

- 新增 2 例回归（lifecycle.spec：FakeSettingsService 模拟真实 per-fiber 注册
  语义）：hot-config replace 不重复注册且值随新 config 更新；disable 后
  namespace 消失、enable 后恢复；
- mygo-api + mygo 全部 453 例测试通过（39 files）；
- staging checkout 两个包 lib 已重建，待 3080 重启后真实复验
  （POST /api/mygo/plugins/dsh-plan-execute/config）。

## 2026-08-10 HMR 重写：swap 顺序改为宿主原生 fiber.update 语义（取消特判）

### 体系问题（用户确认）

配置更新（`updateConfig`）此前绕开“两层 HMR 分工”里配置级走宿主 patch HMR
的约定，复用代码级七步 replace；七步是 **stage-first**（新 generation 先
apply、旧 generation 后 release），settings namespace / webserver
upgrade/fallback 这类**全局 seat 语义注册**会在 staging 阶段撞到仍在位的
旧代，连续出现 “settings namespace … already registered” 与
“webserver: duplicate upgrade route”。前两轮修法（settings 提交后移 +
`DEFERRED_HOST_REGISTRATION_METHODS`）本质是逐面打补丁：任何未来新增的
seat 语义宿主 API 都会再炸一次。

### 重写（mygo 侧，宿主代码零改动）

- **replace/adoptStatic 改为 dispose-first（对齐 Cordis `fiber.update`
  = dispose → restart 语义）**：quiescence（drain/next-idle）→ 先完整释放
  旧 generation（host 副作用、dispatch 注册、settings owner、hooks）→
  再 stageNew 应用新代 → applyRegistrations/表替换 → persist →
  commitSettings。新代 apply 时旧代座位已全部释放，settings/upgrade/
  fallback 不再需要任何 deferral 特判；
- **删除 deferred host-registration 整套机制**：`StagedHostRegistration`、
  `PluginEnv.registerHostRegistration`、`StagingEnv.registerHostRegistration`、
  `commitHostRegistrations`、`DEFERRED_HOST_REGISTRATION_METHODS` 全部移除；
  `registerUpgrade` / `registerFallback` 回到普通注册类方法（apply 即注册，
  返回的 disposer 进 hostEffectDisposers，disable/release 撤销）；
- **settings 保留 per-generation owner fiber**（那是正确的绑定方式），只去掉
  “等旧代释放后再提交”的 deferral 措辞——dispose-first 后顺序天然满足；
- **失败回滚**：dispose-first 后 stage 失败不再能“旧代原地存活”，改为
  `restoreIncumbent()`：用旧代的 manifest/config/state 重新 stageNew →
  applyRegistrations → 表替换 → commitSettings → 恢复 record（store 不动，
  它仍指向旧代）；回滚自身失败则记录置 `quarantined / rollback-failed`；
- **config 预检前移**：`replaceWithDefinition` 在释放旧代前先
  `resolveConfig(definition, config)`，非法配置 fail-fast，连瞬时降级都不
  发生；
- **releaseGeneration 返回“释放完成”的 promise**：in-flight 事件未清时
  replace 现在等待（不再像旧实现那样先提交新代、旧代后台续命）；
- **adoptStatic config-diff**：同 id 同版本但 config 不同的静态行重采纳不再
  幂等短路，走一次热替换（Loader patch HMR 重放桥接行时会带着新 config
  重新 adoptRaw）；
- **面板配置持久化**：`POST /api/mygo/plugins/:id/config` 在 updateConfig
  成功后把当前 config 写回桥接行（`syncBridgeRows({id: configOf(id)})`），
  重启后 Loader 按新 config 装载（此前静态桥接行一直保留安装时 config，
  重启即回退）。

### 影响与取舍

- replace 现在是“等旧代完全释放 → 应用新代”：in-flight 事件未结束前调用
  会阻塞（drain/next-idle 有超时；immediate 也等 idle），不再有“新代先上线、
  旧代后台续命”的 retained-generation 窗口——这是原生 fiber.update 的语义；
- 旧实现里 4 个 retained-generation 测试改写为断言新语义（replace 等待
  全部 in-flight 事件结束后才释放/激活）；real-composition 的并发 auto-disable
  测试改用 in-flight parallel 事件卡住 releaseGeneration 复现锁竞争；
- 新增回归：adoptStatic 同版本 config 变化热替换 + 幂等短路；
- 全量：mygo-api 39 + mygo 445（lifecycle 110、real-composition 16 等）全绿；
  tsc + tsdown 构建通过；已同步 0809 / -fresh / staging（3080 重启后生效，
  复验：POST /api/mygo/plugins/dsh-better-sidebar/config 不再 duplicate）。

### 3080 现场复验（2026-08-10）

- 配置保存（better-sidebar / plan-execute）均返回“配置已更新（HMR 生效）”，
  日志无 duplicate / already registered / staging failed；稳态下每次保存只
  +1 generation、只有一次 replace（Loader 重放为幂等短路）；
- 每次重启后**第一次**配置保存会有一次额外的 Loader 重放收敛：manager
  重新 recover，把旧版本遗留的 `source:{type:'static'}` 注册表行
  （package-not-resolvable）和损坏行 quarantine（audit class=quarantine，
  无害、不重复），随后保存回到 +1 稳态；根因是旧 updateConfig 会把静态
  桥接插件写进 rdb gens，新代码已通过“配置写回桥接行”避免继续产生这类行；
- 环境依赖：3080 的 rdb 注册表需要 PG（mygo-pg 容器 + Docker Desktop），
  重启 3080 前先确认 127.0.0.1:5432 在线，否则 boot 会
  “registry backend self-check failed: connect ECONNREFUSED 127.0.0.1:5432”
  fail-loud。

## 2026-08-10 P4 定档：只做 BOM

原 P3 提案 §6“不做（P4+）”四项目标经逐项核对后定档：

- **`.dsh-plugin` 官方仓库轨**：已在 0.2.0 兑现（安装器支持 + dsh-browser-panel
  实测，见上文“安装器支持官方 .dsh-plugin 仓库格式”）；
- **版本自动升级**：已在 0.2.0 兑现（插件远程更新走 updateRaw HMR + mygo
  自更新，见“远程更新”一节）；
- **市场/发现**：移出 P4，暂不做（现状只有已装 GitHub 插件的检查更新与
  一次性 ext-compat 审计，无产品化发现通道）；
- **BOM（套件版本矩阵）**：**P4 只做这一项**。范围草案与开放问题见
  `docs/next/2026-08-10-p4-bom-scope.md`。

### BOM 成员模型（2026-08-10 确认）

**mygo 自身是 BOM 的一等成员**：统一依赖图里已有隐式节点
（`compatibilitySet()` 注入 `dsh-mygo`，provides `service:mygo-core`，
enabled），extension（如 mygo-rdb）已经用 `depends service:mygo-core`
依赖它，BOM 不包含它反而不一致。成员 rail：`self`（mygo）、`bridge`
（托管插件）、`bundle`（profile 组合行）、`app`（外部应用，保留
`syncUninstall:false` 语义）。`hostPackages` 只做记录/校验，版本注入仍
独立待办。

**前置项：mygo 版本事实动态化**。`MYGO_MANAGER_VERSION` 目前硬编码
`'0.1.0'`（lifecycle.ts），与包版本 0.1.1 已不一致；BOM 对账/升级前需改为
动态来源（package.json version + `~/.dsh/mygo-self.json` 的 remote/commit）。
升级顺序：BOM apply 中 mygo 自更新排最后（Loader 热重载 + recover 重挂），
失败回退 mygo-self.json last-good + staging 目录。

### BOM 定位（2026-08-10 再确认：依赖代表物优先）

BOM 的首要用途是**生态依赖参考物**：把统一依赖图序列化成一份版本化、可
发布的清单（成员 id / 版本区间 / provides / requires / breaks / conflicts /
entrypoints / 来源），给开发者在已有插件体系上搭新插件时做参考——照着
BOM 声明 `dsh.mygo` 依赖、校验新插件版本区间是否落在生态兼容带内。形态
学 Fabric：`intent` 段（fabric.mod.json 风格的区间）+ `lock` 段（聚合
POM 风格的精确版本/commit），机器可读 JSON + 人类可读 Markdown 双输出；
数据源 = 统一依赖图（compatibilitySet + bundle rail + mygo 自身 +
hostPackages 记录），随 mygo 版本化。运行期套件锁定为第二用途，P4 先做
"导出/参考/校验"，套件生命周期（install/upgrade suite）留接口或 P5。

### BOM 方案定档（2026-08-10：Plan B + 极薄壳脚手架）

- **Plan B**：`bom export`（导出）+ 只读 `bom check`（读回 BOM lock 与当前
  profile 集合对账，缺失/多余/版本漂移/约束违例链报告，零修改）做掉；
- **脚手架保留，极薄壳**：`mygo bom scaffold <id>` 独立脚本，读
  `dsh.bom.json` 写 package.json（`dsh.mygo` 骨架，自动填
  `depends service:mygo-core` 当前版本带）+ src/index.ts + README.md；
  不交互、不装依赖、不 git init、不发布；
- **生命周期明确不做**：install/upgrade/remove/apply/reconcile 等会改状态的
  操作只保证 BOM 格式向前兼容，留 P5。
- 正式提案：`docs/next/2026-08-10-p4-bom-design.md`。

边界澄清：rdb 持久化（mygo-rdb / store-provider / session-reader）与 HMR
稳定性收尾（immediate 挂起、ESM 缓存降级疑点、quarantine 清表）不属于
P4，另行跟踪。

## 2026-08-10 0810 ClientModuleHost 边界（实测确认）

0810 的浏览器 roster（`packages/client/modules` ClientModuleHost）对每个
loader 条目名缓存“是否为 client 包”判定：

- **包名新增/删除：有运行时增量 HMR**（`internal/plugin` → dirty set →
  flush → `processOne`），全新名字能直接进 roster（实测：运行中卸载再装
  dsh-web-review，boot 图即时出现、bundle 路由 200）；
- **bundle 代码重建：有 HMR**（`onRebuilt(id, rev)` 重新哈希，rev 变化通知
  浏览器拉新 bundle）；
- **包“分类/元数据”变化：无 HMR，重启生效**——`pkgMeta` 否定判定（包不可
  解析 / 无 `dsh.client` / platform 非 web）永不过期，正向缓存
  （clientPath/inject）也冻结；这是宿主设计（注释：plugin-set changes take
  effect on restart），不是缺陷。

对我方桥接的影响：正常安装新插件（全新桥接名 + 生成时带 `dsh.client`）运行
时可进 roster；**升级路径“无 client half → 新增 client half”必须重启**
（旧版本已把该桥接名判为 null）。面板已兼容双字段（`dshClient` 0809 +
`dsh.client` 0810），gate 的 rawId 按 bundle 真实注册 id 提取（0810 为绝对
路径，0809 为包名，回退包名）。**官方 bundle 同理**：安装后浏览器半部要
重启才进 roster（0809/0810 实测一致；node 半部即时生效，/webview-proxy
这类路由不用重启）。0809 侧 bundle 还需要顶层 `dshClient`——BundleRail
安装时从 `dsh.client` 自动注入（`dsh.mygo.legacyClientInjected` 标记，
卸载还原），0810 原生读 `dsh.client`，注入无害。
