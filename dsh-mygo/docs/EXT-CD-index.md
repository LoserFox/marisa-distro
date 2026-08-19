# EXT / CD 索引

> 汇聚仓库中散落的 EXT（外部依赖/官方需求）与 CD（候选决策）条目。
> 各文档原有提及处不动；本索引只做汇聚，随新条目追加。

## EXT 外部依赖 / 官方需求

| 编号 | 内容 | 状态 | 出处 |
|---|---|---|---|
| EXT-1 | cordis↔dsh 版本对照表权威来源（`@deepseek-ai/cordis` rc.1 ↔ dsh rc.1 ↔ `^4.0.0-rc.7`） | 未决；无法确认时收割器对不可映射 peer 输出「无法归一」告警，不猜测 | design-r3-backlog.md「外部依赖」 |
| EXT-2 | 官方 launcher 插件子命令注册面（字面 `dsh mygo …` 需官方扩展点）；design-r5 §7 webui 官方侧需要沿用同一编号 | 未决；正式命令面用 `dsh --profile <p> mygo …`，不 hook apps/cli | design-r5-cli.md §9 C1 / §7.3 |
| EXT-3 | 需求 1：官方把 `@deepseek-ai/dsh-client-ui-plugin-config`（0811 形态）发布到 npm rc 线；需求 2：官方把 settings 网关显式 allowlist 改为插件可声明的暴露机制（`api-proxy.ts:120-127` 注释自述 deferred work） | 未决；已登记 | cli-verification.md §8.6 |
| EXT-4 | client-hmr 浏览器半 graph 帧处理（live rail 运行期装卸后，打开中的页面免刷新看到新插件行）：host 补丁提案 `patches/client-hmr-graph-host.patch`（不 apply，快照 47f9438） | 提案已登记，待 host 维护者合入；合入前 UI 文案统一提示「刷新页面后生效」 | patches/README.md「client-hmr-graph-host.patch」/ docs/live-rail.md |

## CD 候选决策

| 编号 | 内容 | 状态 | 出处 |
|---|---|---|---|
| CD-1 | 错误词汇分叉：PluginError 43 码（throw 面）vs ResolutionReport code/scope（报告面）；`manifest-invalid` 两侧同名。候选：(a) 映射表；(b) 「错误 vs 报告」分工原则（倾向：挂载期/治理期走报告、运行时能力拒绝走 PluginError） | 仅登记，待独立小轮裁决 | docs/next/2026-08-12-mygo-api-surface.md §10 |
| CD-2 | 面板 folder 安装静态账（桥接行+安装目录+静态记录）vs `dsh.lock/v1` 账本分叉；候选：(a) 统一走 lockfile；(b) 静态账为合法一等路径；(c) 两账并表标注来源 | 仅登记，待独立小轮裁决 | docs/next/2026-08-12-cd-2-panel-adoptraw-ledger.md |
