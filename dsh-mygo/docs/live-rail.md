# live rail：运行期装卸（r7）

> 范围：mygo 面板/CLI 安装卸载 bundle 插件从「重启实例生效」升级为
> 「运行期生效」。机制依据：2026-08-15 spike 实证（往 profile
> `cordis.patch.yml` 写 `- insert:` 行，host `watchUserPatches` 事务性
> live 重放；删行即活卸载）+ P6 端到端真机验证（五场景全过）。
> 实现落点：mygo 核心 `src/live-rail.ts` / `src/patch-io.ts`，接入
> `lifecycle.ts` / `loader-profile/src/face.ts` / 面板卸载路由。

## 1. 双轨制：boot rail 与 live rail 互斥

- **boot rail** = profile manifest 的 `dsh.profile.bundles`（boot 时
  composeEntries 物化）。保留给：base bundles（dsh-base/dsh-web-app）、
  mygo 三件套、官方 CLI `dsh plugin add` 装的包。
- **live rail** = profile `cordis.patch.yml` 里 mygo 受管块
  （`# >>> mygo live block: <pkg>` / `# <<< ...` 包裹）内嵌的 bundle
  patch 行原文。mygo 面板在实例运行时装的新插件走这里。
- **单轨规则（硬）**：一个包同一时刻只能在一轨。同 id 双 insert 在
  boot 是 exit=1 致命错误（spike D1），在 live 会毒化整次重放
  （spike D2）。因此：
  - live 安装的包在写块**之前**先退出 `dsh.profile.bundles`
    （`LifecycleEngine.removeFromBootRail`；先于预检——否则离线组合树
    含新包自己的行，预检自撞假阳性，P6 e2e 实测抓出并修复）；
  - `face.ts reconcilePlugins` 排除 live 块在管的包（CLI 侧操作不会把
    live 包重新对账进 bundles）；
  - live 块持久化在 patch 文件里，重启后 boot 从 profile patch 层照常
    物化，无需迁移。
- 关键 host 事实：live 重放的 bundle 层是 **boot 时冻结**的
  （`composeLive` 闭包捕获 `composed.bundlePatches`），每次重放只重读
  profile patch 与 home patch。所以「先移出 bundles 再写块」的顺序下，
  运行期永远不会双物化；崩溃窗口只丢激活不毁 boot。

## 2. 装卸顺序约束（spike 硬证据）

- **安装**：pnpm 落盘（`dsh plugin add`）→ 移出 bundles → 离线组合预检
  → 写受管块 → 轮询验证激活。反了会 import 失败连坐整次重放回滚。
- **卸载（live rail 包）**：剥受管块 → 验证 dispose → pnpm remove →
  reconcile → `removePatchRows` 兜底（残留定向行/disable 块/live 块）。
- **卸载（boot rail 包且实例在跑）**：写受管 disable 块（bundle-rail
  companion 块口径）live 摘 fiber → 验证 → 走既有流程。
- 实例未在跑（CLI 场景）：只写文件，下次 boot 生效；CLI 文案按
  `activated: 'live' | 'pending-restart'` 区分。

## 3. 防护点

1. **id 撞车预检**：写块前用 host 的 `loadProfile` + `composeEntries`
   （`@deepseek-ai/dsh-app-boot`，运行期经 profiles/node_modules 兜底
   软链解析 host 自带副本）离线组合，新 insert 行 id 与现有组合树撞车
   即拒绝并回滚。host import/组合失败时降级跳过 + warn，不阻断安装
   （预检是增强不是门槛，写后验证兜底）。
2. **空数组占位**：patch 文件顶层始终是合法 YAML 数组；任何写盘空内容
   回落 `[]`（patch-io 强制；空文件 boot fail-loud）。
3. **config 整体替换**：id 定向行 config 是覆盖不是 merge（row-config
   的 upsert 语义即据此）。
4. **烘焙隔离**：不碰 Include 子树运行期 API（create/remove/update 会
   触发 `write()` 烘焙 cordis.yml），不触发插件自 dispose；一切变更经
   patch 文件重放通道（事务性，失败整次回滚、旧树不动）。
5. **写后验证**：live 重放失败是静默的（watcher 吞错），写完经
   `verifyEntryState` 轮询 `loader.entries()` 的 fiber 态（默认 10s），
   超时回滚（安装：剥块 + 回 bundles + 整包卸载；卸载：重写块恢复）。
6. **写盘通道**：全部 mygo 写盘走 `patch-io.mutatePatchFile`（进程内
   串行 + tmp+rename 原子写 + 空回落 `[]`）；行文本必须直写或
   tmp+rename，禁止 truncate 中间态（空文件被 watcher 抓到会让该次
   重放静默失败）。

## 4. P5 对账：boot 撞车无窗口，对账是运行期防线

- 同一包同时出现在 bundles 与 live 块 = 下次 boot 同 id 双 insert
  exit=1。boot 挂死时 mygo 自身也是组合的一部分、**没有对账窗口**；
  `prepareProfile` 只重写 cordis.yml，不留 boot 前钩子。
- 因此对账在实例活着时做（`PluginManagerService` init）：启动一次 +
  目录级 watch profile manifest（debounce 500ms）运行期对账。
  `reconcileLiveRailOverlap` 发现重叠 → **bundle 赢**，剥 live 块 +
  warn。典型触发：官方 CLI 在实例运行期 `dsh plugin add` 同包（旁路）。
- 剥块后运行中该包的 live 行随重放摘掉（当前会话停用），重启后由
  bundle 层物化恢复——两害相权：不剥则下次 boot 必死。
- 启动时一次性对账另覆盖版本漂移场景：bundle 升级后行 id 变化，boot
  不撞车但 live 块内容是旧 patch，对账剥块让 bundle 层接管。

## 5. 可观测性

- 对账 warn 走 `ctx.logger.warn`，**不进进程 stdout 日志**（host 日志
  路由如此）；对账是否发生以盘态为准（live 块消失、bundles 含包）。
- 安装/卸载回执带 `activated` / 文案区分「刷新页面后生效」与「重启
  实例后生效」；面板插件行 `rail` 区分 live/bundle/bridge。
- live 重放静默失败的兜底 = verifyEntryState 超时回滚 + 报错，不假设
  写文件即生效。

## 6. 免刷新 UI（rc8）

live 装卸后，打开中的页面免刷新看到插件 UI 出现/消失。host 现状：node
半 client-modules 图随 `internal/plugin` 事件自动更新（新插件的
`/plugins/<id>/client.js` 立即可服务），但 graph 帧只在 SSE 连接时推
一次、client-hmr 浏览器半显式忽略 graph 帧（EXT-4 提案未合入）。mygo
侧自建一条通道：

- **node 半（面板）**：live 轨装卸成功（安装验证激活 / 卸载验证
  dispose）后，`/api/mygo/events` SSE 广播
  `{ type: 'live-rail', op: 'mount'|'unmount', id: <包名>, url? }`
  （帧格式与 host `/plugins/events` 同款；url 取 host 图行，含 rev）。
  boot 轨的重启生效路径不发帧。
- **client 半（面板）**：订阅该端点，串行 queue 页内应用图变更，动词
  复用 client-hmr 同款——mount：`modules.invalidate` → `prefetch`
  （boot 图表外的新行回落为直接 script 加载 bundle 注册工厂）→
  `loader.create({ name })`；unmount：registry-first 删 callback →
  drain inertia → 清 fiber → 撤 `style[data-plugin]` → `loader.remove`。
  loader/modules 不可达（headless）时不订阅、不报错；帧处理失败 warn
  并提示刷新页面兜底。
- **与 EXT-4 的关系**：EXT-4 合入后两通道并存不冲突——host graph 帧
  管全量图（含非 mygo 来源的图变化），mygo 帧只管自己 live 轨的操作；
  两侧 mount/unmount 均幂等（已挂载/未挂载 no-op），重复帧无害。

## 7. 已知限制

- **冻结层守卫**：boot 轨已物化（frozen bundlePatches 在实例存活期
  不变）的包再经面板安装时，保持 boot 轨不写 live 块（写块会构成运行
  期同 id 双 insert 毒化后续每次重放；rc8 e2e 实测抓出）。
- **client 图行免刷新仅限新面板 bundle 页面**：rc8 通道由面板 client
  半承载，老 bundle 打开的页面仍需刷新一次拿到新面板代码。EXT-4 合入
  后由 host graph 帧统一接管。
- live 块内容不随 CLI 升级自动刷新（块内是安装时 bundle patch 原文；
  行 id 漂移时由 P5 启动对账剥块让 bundle 层接管）。块刷新机制留后续。
- pack 整合包不做 live 安装（pack restore 仍走注册进 profile 的既有
  路径）。
- `BundleRail.install` 在 CLI add 成功但 member 解析失败时无回滚
  （pre-existing；P6 e2e 经 fixture exports 缺陷踩到，会在
  deps/bundles 留残，需手工 `dsh plugin remove`）。
