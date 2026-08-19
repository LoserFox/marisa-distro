# Awesome DSH Plugins 选型复核与 Vision 最终方案

日期：2026-08-19（UTC+8），同日两轮：第一轮按保守口径初筛，第二轮按用户新标准（**插件优先、不重就默认开、智商调优类必须覆盖**）三路并发复核后修订本文。
目标：基于 [`AdamPlatin123/awesome-dsh-plugins`](https://github.com/AdamPlatin123/awesome-dsh-plugins) 当前内容，为 Marisa 选出可加入的插件，并定稿 vision（图像理解）默认方案。
方法：以本地前期调研为基线（[RESEARCH-adam-awesome-plugin-audit-20260815.md](RESEARCH-adam-awesome-plugin-audit-20260815.md)、[RESEARCH-anchored-standard-and-productivity-plugins-20260815.md](RESEARCH-anchored-standard-and-productivity-plugins-20260815.md)、[vision-plugin-research-2026-08-16.md](vision-plugin-research-2026-08-16.md)、[vision-plugin-independent-audit-2026-08-16.md](vision-plugin-independent-audit-2026-08-16.md)、[free-vision-options-2026-08-16.md](free-vision-options-2026-08-16.md)、[vision-onboarding-options-2026-08-16.md](vision-onboarding-options-2026-08-16.md)），抓 awesome 仓库当前 README/PLUGINS.md/PLUGINS-ALL.md 做差异对比，对每个候选回溯一手仓库的 README/package.json/CI/提交史/issue 核实；routing-suite 另做本地克隆源码深潜。Star 快照除注明外均为 2026-08-19（UTC+8）经 GitHub API 实测。

## 结论摘要

1. **默认开启（Core）扩到 12 个**：上轮 7 个（dsh-at-file、dsh-annotation、dsh-outline、dsh-plugin-connection-banner、dsh-mdbox、dsh-spend、dsh-smooth-stream）维持；本轮上调 **dsh-sticky-note**（零依赖便签，明示要求 rc.7）、**dsh-plugin-guard**（零依赖安装安全网，补 MyGO 市场第三方安装的风险面），智商调优类新增 **dsh-repo-context**（git 状态注入 system prompt）、**dsh-context**（315★ 上下文组成仪表盘，只读）。**dsh-win32** 按"插件优先"改判进包：npm 快照档、四个 peer 全 optional 不阻断、rc.7 注入座本地源码核实仍在，只取 process-inspector/持久 shell 子能力，CLI/快捷方式不进包。
2. **默认关闭（Optional）13 个**：维持关闭的 message-edit（会话写 QA 前置未做）、chat-import（17 个 import 工具常驻污染首轮工具目录）、modsearch（需外部 CLI/Key）、dsh-browser（需手装 Chrome 扩展）、dsh-open-file（原生重依赖）、dsh-permission-rules（需手写规则+误列构建依赖）、dsh-vision-router（与 vision-toolkit 二选一）；智商调优类新增 dsh-reasoning-settings、dsh-output-styles、billion-context-dsh、dsh-context-doctor、dsh-stream-rules、dsh-prompt-polish。
3. **智商调优类专项结论**：榜一 dsh-routing-suite（约 5982★）**深度暂缓**——其"推理路由"只是正则换 persona 句，issue #13/#34 实测证明核心路由在真实装配链路从未生效，理论基础已被作者道歉作废，且注入器拒绝自卸载、暴露无鉴权注入 API。真正有效的智商调优是**调 API 参数**（reasoning_effort）而非 prompt 玄学：默认开 dsh-context（可观测）+ dsh-repo-context（仓库感知），BYO provider 用户给 dsh-reasoning-settings（Optional）。Liang-Saint-Slider 维持拒绝（与原生双选择器同轴换皮 + 31 张肖像素材再分发权不明）。
4. **雷达自身结构变了**：README 从"Top 20 榜单"变为人工策展"Top 50（11 类）"，PLUGINS.md 是 PR 登记清单，PLUGINS-ALL.md 是全量四档运行级清单（收录 1253 仓）。生态膨胀极快，Star 全面大涨（dsh-web-ui 2177→4502、better-sidebar 872→2160、modlens 1465→3077）。
5. **Vision 最终结论不变**：默认继续用 dsh-vision-toolkit（Marisa fork）并升级到上游 0.1.32（零 Python 自举 + Windows CI）；vision-router 1.6.1 为 Optional 替换层（不并存）。降级链：匿名 Zen MiMo → 一键 GLM-4.6V-Flash → 本地 Ollama qwen3-vl:4b → OVH 兜底。
6. 8-15 的排除项全部维持：dsh-bash-terminal 仍需 patch 宿主设置白名单；市场类与 MyGO 重复；桌面/TUI/大合集/娱乐类不进入。
7. **补录 [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)（首轮极简→恢复 Standard 预设）为实验预设**：它与 routing-suite 同思路但实现干净（零依赖、39 测试全过、晋升状态从 session events 推导），用户实测 Pro 提升与该机制方向一致；8-15 结论"加入但不设默认"维持，且当时的 Windows 阻塞点（rc6 process-inspector 抛 `unsupported platform win32`）已由本轮 **dsh-win32 进包**解决——Anchored 的 Windows 持久 bash 路径首次打通。此前 8-19 报告聚焦新增条目将其漏列，属疏漏。

## awesome-dsh-plugins 当前清单 vs 2026-08-15 的差异

数据口径：8-15 审计用 Radar "Top 20"（[本地存档](RESEARCH-adam-awesome-plugin-audit-20260815.md)）；当前 README 为"精选 Top 50"，星标截至 2026-08-18 22:12（UTC+8）（[README.md](https://github.com/AdamPlatin123/awesome-dsh-plugins/blob/main/README.md)）；全量判定见 [PLUGINS-ALL.md](https://github.com/AdamPlatin123/awesome-dsh-plugins/blob/main/PLUGINS-ALL.md)（快照 20260816T183001Z 起 39 轮并集）。

### Star 大变动（8-15 快照 → 2026-08-19 gh API 快照）

| 项目 | 8-15 | 8-19 | 变化 |
|---|---:|---:|---|
| dsh-web-ui | 2177 | 4502（README Top50 口径） | +107% |
| modlens | 1465 | 3077 | +110% |
| DSH-better-sidebar | 872 | 2160 | +148% |
| dsh-TUI | 1004 | 1945（README） | +94% |
| dsh-vision-toolkit | 372 | 696 | +87% |
| dsh-agent-teams | 278 | 539（README） | +94% |
| dsh-at-file | 154 | 373 | +142% |
| dsh-browser | 107 | 296 | +177% |
| modsearch | 98 | 146 | +49% |
| dsh-annotation | ~45 | 75 | +67% |
| dsh-visualize | 88 | 176（README） | +100% |
| TokenTracker | 1313 | 1359（README） | 基本持平 |

### 新增条目（相对 8-15 Top20，出现在当前 Top50 / 登记清单，且与选型相关）

| 条目 | Star | 初判 |
|---|---:|---|
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) | 5982 | 新晋全榜第一；**深度暂缓**，见智商调优专项 |
| [dsh-market](https://github.com/dsh-market/dsh-market) | 988（README） | 与 MyGO 市场基础设施重复，拒绝 |
| [deepseek-harness-desktop](https://github.com/hairyf/deepseek-harness-desktop) | 521（README） | Tauri 桌面端，竞争前端，拒绝 |
| [mnemon](https://github.com/mnemon-dev/mnemon) | 478（README） | 跨 agent 本地记忆；产品级决策，暂缓 |
| [helloagents](https://github.com/hellowind777/helloagents) / [mobius](https://github.com/nutshellai-tech/mobius) | 688/284（README） | 大合集包，按标准排除 |
| [claude-paper](https://github.com/alaliqing/claude-paper) | 318（README） | 论文工具箱，小众低频，拒绝 |
| [dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) | 176 | 与已集成 dsh-genui 重复，维持拒绝 |
| [dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil) | 119（README） | 设计稿预览，小众，拒绝 |
| [Liang-Saint-Slider](https://github.com/BruzWJ/Liang-Saint-Slider) | 88（README） | 维持拒绝（功能同轴换皮 + 素材版权），见智商调优专项 |
| [dsh-navbar](https://github.com/vlln/dsh-navbar) | 39（README） | 与 Core 候选 dsh-outline 重复，取 outline |
| 娱乐类（petdex 3890★、dsh-deep-whale 1346★、dsh-ads 497★ 等） | — | 不符合"高频实用"；whale-girl 已集成（rc7 待重测），不再新增 |
| PLUGINS.md 新登记：dsh-mdbox、dsh-spend、dsh-smooth-stream、dsh-sticky-note、dsh-plugin-guard、dsh-permission-rules、dsh-win32、dsh-open-file 等 | 0–31 | 逐一核实见推荐表 |
| 智商调优类新扫描：dsh-repo-context、dsh-context、dsh-reasoning-settings、dsh-output-styles、billion-context-dsh、dsh-context-doctor、dsh-stream-rules、dsh-prompt-polish 等 | 0–315 | 见智商调优专项 |

### 移除/掉出

- PicGo-Core（8-15 Top20，971★）已不在当前 Top50；其"上传引擎需配图床"的拒绝理由不变。
- Vision 关键词集合对比（8-15 审计 95 URL → 当前同口径 78 URL）：主力候选均在；新增 14 个 vision URL 均为 0–51★ 小仓，无一改变 8-16 结论。
- dsh-open-eyes、dsh-open-file 的上游仓库已转移至 `hyper-dsh-plugins` 组织（gh API 重定向确认，2026-08-19）。

## 推荐清单

状态基线：Marisa 当前 DSH `0.1.0-rc.7`，已集成清单见 [plugins.md](plugins.md)。判定口径：**只有"非常重"（原生模块 / Python 运行时 / 大型依赖树 / 显著增大安装包 / 需用户装外部东西）才默认关闭**；数据完整性、工具目录污染等非重量风险亦可构成维持关闭理由，逐项写明。

### 默认开启（Core，12 个）

| 插件 | 用途 | 开箱即用程度 | 重量证据 | 权限/风险 | 验收前置 | 来源 |
|---|---|---|---|---|---|---|
| [dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 0.6.3（373★） | 输入框 `@` 引用工作区文件 | 默认即用 | 运行依赖仅 zod | 只插路径引用、不预读内容；限定活动工作区 | 本地 rc7 安装实测 | [package.json](https://github.com/omdsh-dev/dsh-at-file/blob/main/package.json) |
| [dsh-annotation](https://github.com/omdsh-dev/dsh-annotation) 1.4.0（75★） | 划选回复文字批注追问 | 默认即用、零运行依赖 | 纯客户端 | 无 | 1.3.17 起明确验证 rc.7 | [commits](https://github.com/omdsh-dev/dsh-annotation/commits) |
| [dsh-outline](https://github.com/urzeye/dsh-outline) 0.1.5（11★） | 长对话实时大纲/搜索/跳转 | 默认即用、零运行依赖 | 数据来自 session event stream | 须与 better-sidebar 做布局冲突测试；源码仓 `prepare` 快照化移除 | 布局 QA | [package.json](https://github.com/urzeye/dsh-outline/blob/main/package.json) |
| [dsh-plugin-connection-banner](https://github.com/yinren112/dsh-plugin-connection-banner) 0.1.0（0★） | 断线重连横幅 | 无配置无依赖无轮询 | client-only | 无 | — | [package.json](https://github.com/yinren112/dsh-plugin-connection-banner/blob/main/package.json) |
| [dsh-mdbox](https://github.com/Chi-hong22/dsh-mdbox) 0.1.0（0★） | 输入框列表续行/自动重编号/Tab 缩进 | 默认即用、零依赖 | 构建产物随仓提交 | 依赖 `data-composer-card` DOM 属性，DSH 改版需回归 | 与 dsh-input-history/dsh-paste-input 按键联合冒烟 | [README](https://github.com/Chi-hong22/dsh-mdbox/blob/main/README.md) |
| [dsh-spend](https://github.com/nonewind/dsh-spend) 0.4.6（6★） | 本地 token 用量/费用仪表盘 | 默认即用；内置 17 供应商/131 模型价格知识库 | 零网络出站（lib 全量 grep 验证无 fetch/XHR/WS） | 只读回放 `$DSH_HOME/sessions` | 与 dsh-ui-progress 悬浮层叠放 QA | [lib 源码](https://github.com/nonewind/dsh-spend/tree/main/lib) |
| [dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) 0.3.2（31★） | 流式渲染跟手/不闪烁 | npm 预构建、默认 preset 即用 | 有设置页卡片 | 接管对话渲染管线 | 与 dsh-genui/suggested-replies 流式联合 QA；`prepare` 快照化移除 | [package.json](https://github.com/Laplace-bit/dsh-smooth-stream/blob/main/package.json) |
| [dsh-sticky-note](https://github.com/Meredith2328/dsh-sticky-note) 0.2.2（10★）⬆上调 | 输入框旁便签/TODO | 默认即用、零依赖、无生命周期脚本 | 唯一写盘 `~/.dsh/sticky-notes`（30 天回收站） | 不联网、不注册模型工具；v0.2.2 起**要求 rc.7** = 明确兼容证据 | 与 mdbox/input-history/paste-input 快捷键联合冒烟（Ctrl+S、Ctrl+Shift+1/2/3、Tab）；左下浮层叠放 QA | [package.json](https://github.com/Meredith2328/dsh-sticky-note/blob/main/package.json) |
| [dsh-plugin-guard](https://github.com/lxzy-7/dsh-plugin-guard) 0.3.1（24★）⬆上调 | 插件安装前快照/回退/备份管理 | 快照与回退默认即用；v0.3.0 起用 rc.7 自有设置卡片 | 零运行依赖；`prepublishOnly` 快照化移除 | 写 `$DSH_HOME/rollbacks`、`$DSH_HOME/guard`；回退执行 `pnpm install --frozen-lockfile`（仅用户触发/健康检查失败）；操作面在 profile 配置，不碰发行版 vendored `plugins/` | 验证 MyGO 安装路径触发其快照钩子；回退演练（含回退可逆）；**不接 boot-guard**（面向 `dsh web` CLI，与 Wails 启动链不适配） | [README](https://github.com/lxzy-7/dsh-plugin-guard/blob/main/README.md) |
| [dsh-repo-context](https://github.com/qing3a/dsh-repo-context) 0.1.0（0★）🆕智商调优 | git 分支/脏文件/最近提交 + 仓库规范指引动态注入 system prompt | 默认配置即用；npm `@qing3a/dsh-repo-context@0.1.0` | 运行依赖仅 schemastery；`prepare`(tsc) 快照化移除 | 自述只读（git rev-parse/status/log），不写盘不联网，快照审计 grep 复验；变化才落 durable context 不污染历史 | 雷达"未测"，须本地 rc7 安装实测；注入后 request/header 对比确认 Minimal/Anchored 首轮不被污染 | [README](https://github.com/qing3a/dsh-repo-context)、[dsh-plugin-verify 7/7 实测](https://github.com/qing3a/dsh-plugin-verify) |
| [dsh-context](https://github.com/bowenliang123/dsh-context) 0.13.0（315★）🆕智商调优 | 上下文组成六分类仪表盘 + `/context` + 注入/压缩/剪枝事件流 | `dsh plugin add` 一行装、无配置项 | **playwright-core 是死依赖（浅克隆全仓核实源码零引用），快照化剔除** | 纯只读观测，不改模型行为 | 与 dsh-spend 页签共存冒烟 | [README](https://github.com/bowenliang123/dsh-context)（devDeps 钉 rc.7，作者 8-18 仍活跃） |
| [dsh-win32](https://github.com/sjh9714/dsh-win32) 0.14.0（11★）⬆改判进包 | Windows 持久 shell / process-inspector（GBK 解码、taskkill 无黑框、Ctrl-C 注入、Read-Only 写入围栏） | npm 快照档；运行时依赖仅 iconv-lite；发布包 scripts 只剩 `prepublishOnly`（移除即可） | 无原生模块；busybox-w32 沙箱变体（GPLv2）不进 MSI，用户需要时引导 `npx dsh-win32 setup --sandboxed` | cordis.patch.yml 仅 win32 时替换官方 subprocess 行；`installPresets()` 幂等写 `$DSH_HOME/.agent-presets/`（已存在不覆盖）；**bin/cli.mjs / install.ps1 不进包**，桌面快捷方式职责留在 MSI | rc.7 真实窗口 QA（持久 shell 变量/cwd 存活、Ctrl-C、超时杀进程、GBK 解码）；给上游提 issue/PR 放宽 `<0.1.0-rc.7` peer 上限（四 peer 全 optional 本就不阻断），不响应再 Marisa fork 仅改 range | [src/index.ts](https://github.com/sjh9714/dsh-win32/blob/master/src/index.ts)、本地 harness `packages/subprocess/subprocess-local/src/index.ts:45` 注入座核实 |

### 默认关闭（Optional，13 个）

| 插件 | 用途 | 维持关闭理由 | 来源 |
|---|---|---|---|
| [dsh-message-edit](https://github.com/Moeblack/dsh-message-edit) 0.2.3（31★） | 消息编辑/reroll/版本树 | 不重，但 `agents.create({seed})`+`sessions.flush()` 直写会话持久化；故障恢复 QA（异常退出/多标签/恢复）与 rc.7 实测未做——通过后建议上调 | [package.json](https://github.com/Moeblack/dsh-message-edit/blob/main/package.json) |
| [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) 0.6.1（68★） | 13 源会话迁移导入 | 默认注册 17 个 `import_*` 模型工具，低频迁移面常驻污染全部用户的首轮工具目录；读 `~/.claude`/`~/.codex` 等主目录 | [README.zh-CN](https://github.com/Nwflower/dsh-chat-import/blob/main/README.zh-CN.md) |
| [modsearch](https://github.com/liustack/modsearch) 5.4.3（146★） | 联网搜索增强 | 默认引擎需装 `agy` CLI+浏览器登录，备选引擎需 Key = 需用户装外部东西 | [README](https://github.com/liustack/modsearch/blob/main/README.md) |
| [dsh-browser](https://github.com/Lum1104/dsh-browser) 0.1.0（297★） | 浏览器操控 | 需用户手动加载未打包 MV3 扩展；项目未发布 npm（须源码构建）；扩展未连接不暴露工具 | [README](https://github.com/Lum1104/dsh-browser/blob/main/README.md) |
| [dsh-open-file](https://github.com/hyper-dsh-plugins/dsh-open-file) 0.1.1（1★） | 任意格式附件+本地 OCR | 命中"非常重"全部条款：@napi-rs/canvas 原生 + tesseract.js + pdfjs-dist；兼容表仍钉 rc.6 需重验；建议只做按需功能包 | [package.json](https://github.com/hyper-dsh-plugins/dsh-open-file/blob/main/package.json) |
| [dsh-permission-rules](https://github.com/PerryLink/dsh-permission-rules) 0.5.1（8★） | allow/deny/ask 权限规则 | 价值依赖用户手写 YAML；默认空规则全透传 = 常驻拦截+本地代理只有开销；误列 tsdown/typescript 构建依赖须裁剪 | [package.json](https://github.com/PerryLink/dsh-permission-rules/blob/main/package.json) |
| [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) 1.6.1（746★） | 图像理解替换层 | **与 dsh-vision-toolkit 二选一不得同时启用**；匿名链路图片外发、2 RPM/IP/模型；sharp 变 peer（原生）+puppeteer-core | 见 Vision 节 |
| [dsh-reasoning-settings](https://github.com/JuneLearn/dsh-reasoning-settings) 0.3.0（6★）🆕 | 第三方/中转 provider 推理档位+线格式配置；修 rc.5 子代理继承缺陷 | 对默认官方 DeepSeek 模型零增量（原生 composer 已有档位器）；价值全在 BYO provider 场景；零运行依赖；README 含推广链接需评估；同质组（better-model-provider/dsh-model-thinking/dsh-effort-tweak/dsh-provider-model-configurator）四选一代表 | [README](https://github.com/JuneLearn/dsh-reasoning-settings) |
| [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) 0.4.0（3★）🆕 | `/style` 输出风格库（Claude Code outputStyles 等价） | 默认 off 零行为变化，但非普适高频；**vendored 前须把 rc.6 精确钉的 `@deepseek-ai/dsh-storage*` 三依赖重钉 rc7**，否则 profile 双份 storage | [package.json](https://github.com/PerryLink/dsh-output-styles/blob/main/package.json) |
| [billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) 0.2.4（26★）🆕 | 模型驱动上下文压缩（ACP） | 须禁用宿主 compaction-basic 并顶替 `ctx.compaction` realm = 替换核心上下文行为，产品级决策；作者自述"测试版勿用于生产" | [README](https://github.com/Tyan66666/billion-context-dsh) |
| [dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor) 0.5.0（15★）🆕 | 注入物 token 审计 + `context_audit` 工具 | 只读、零依赖，但注册模型工具+审计向定位，默认关闭；与 dsh-context 互补（注入物质量 vs 全局组成） | [README](https://github.com/Zhenyu98/dsh-context-doctor) |
| [dsh-stream-rules](https://github.com/jiesou/dsh-stream-rules) 0.1.7（4★）🆕 | 工具调用命中自写规则时注入 steering 提示 | 需用户自写 `rules.local.js`（默认在插件目录内，对 vendored 不友好），power user 向 | [README](https://github.com/jiesou/dsh-stream-rules) |
| [dsh-prompt-polish](https://github.com/JoukoPuro/dsh-prompt-polish) 0.1.0（3★）🆕 | composer ✨ 按钮四风格改写草稿 | 零配置纯官方 slot，但每次点击烧一次用户模型调用；**未发 npm 仅 GitHub 源**，需 git 源快照；rc7 需重验 | [README](https://github.com/JoukoPuro/dsh-prompt-polish) |

仍被挡在门外：[dsh-client-shortcuts](https://github.com/blue-a11y/dsh-client-shortcuts) 0.1.0——自定义键位刷新丢失问题上游仍未修（[commits](https://github.com/blue-a11y/dsh-client-shortcuts/commits)），维持"先补持久化"。

### 明确拒绝/暂缓

| 插件 | 判定 | 理由 | 来源 |
|---|---|---|---|
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)（约 5982★） | **深度暂缓** | 见智商调优专项：核心路由从未生效、理论作废、注入器不可自卸载、无鉴权注入 API | 专项节 |
| [dsh-bash-terminal](https://github.com/MAXeaglet/dsh-bash-terminal) 0.3.14（12★） | 维持拒绝 | install.ps1 仍 patch DSH 官方设置白名单（改写宿主文件），新增 node-pty 原生依赖 | [README](https://github.com/MAXeaglet/dsh-bash-terminal/blob/master/README.md) |
| [dsh-market](https://github.com/dsh-market/dsh-market)、dsh-web-plugin-manager、deepseek-plugin-store | 拒绝 | 与 MyGO 市场基础设施（0.2.0-rc.6 锁定）重复 | [plugins.md](plugins.md) |
| [dsh-navbar](https://github.com/vlln/dsh-navbar)、dsh-turn-index、dsh-ui-quote-selection | 拒绝 | 分别与 dsh-outline（导航）/dsh-annotation（划选追问）重复，取更强者 | [PLUGINS-ALL.md](https://github.com/AdamPlatin123/awesome-dsh-plugins/blob/main/PLUGINS-ALL.md) |
| dsh-tray（qing3a/ouyinai） | 拒绝 | Marisa 桌面壳已自带托盘（`desktop/tray.go`） | 本地 desktop/ 源码 |
| dsh-balance 等余额插件家族 | 拒绝 | 需调 DeepSeek 余额 API（网络+凭据）；本地用量已由 dsh-spend 覆盖 | PLUGINS-ALL.md |
| dsh-session-pin / dsh-session-pins | 暂缓 | 会话置顶有价值，但与 better-sidebar 会话列表布局/职责冲突未评估 | PLUGINS-ALL.md |
| 记忆类（mnemon、dsh-mnemon、dsh-memory-evolve、dsh-personalize、dsh-recall、dsh-task-planner） | 暂缓 | 记忆层改变上下文注入与写盘行为，产品级决策，转记忆专项 | PLUGINS-ALL.md |
| [dsh-vision-tools](https://github.com/moon09300731/dsh-vision-tools) 0.1.2（2★） | 拒绝 | 需明文 API Key 文件（不走 DSH Credentials），与 vision-toolkit GLM 预设重复且密钥处理更差 | [README](https://github.com/moon09300731/dsh-vision-tools/blob/main/README.md) |
| TokenTracker / dsh-TUI / deepseek-harness-desktop / Bigfish / oh-dsh / helloagents / mobius / claude-paper / 娱乐类 | 维持拒绝 | 独立应用/替代前端/大合集/小众/非高频，同 8-15 理由 | [8-15 审计](RESEARCH-adam-awesome-plugin-audit-20260815.md) |
| dsh-lark / ChatCCC / dsh-interconnect / dsh-email / dsh-calendar / dsh-ssh / vpshub / dsh-ffmpeg / dsh-docker | 拒绝（不进发行包） | 需自建 bot 凭据或外部服务，面向特定运维/IM 场景 | PLUGINS.md |
| 智商调优类其余拒绝项 | 拒绝 | 见专项节对比表（dsh-tool-turbo 打包不成熟、dsh-multi-cot 时延 29×、dsh-undo 作者自述不可用、dsh-headroom 自动下载代理服务等） | 专项节 |

### 实验预设（随包，默认不启用）

| 预设 | 机制 | 证据强度 | 进包方式与边界 | 来源 |
|---|---|---|---|---|
| [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)（钉 `95b98af`，不追 main） | 首轮固定 Minimal persona（`You are a helpful software engineer assistant.`）+ 关闭 identity/runtime context + API 可见工具严格限为 `bash`/`str_replace_editor` + 抑制 `agent-instructions`/`skill-catalog` 注入；首个 durable `tool/call` 或 `assistant/message` 后恢复完整 Standard；晋升状态从 session events 推导，刷新/恢复不退化；缺 bootstrap 工具时退化完整目录并告警 | 作者 modeltest（个人冻结题，仅两跑）：Standard 91、Minimal 99/96、Anchored 98/99——**方向可信但不是公共 benchmark**；用户实测 Pro 提升与该机制方向一致；本地 39 项 Node 测试全过、零运行依赖、无网络无遥测 | 上游是 rc.5 完整 Standard 快照，**不整目录照搬**：只移植 bootstrap hook（`tool-bootstrap.mjs`）到 Marisa 自己的 rc7 Standard composition；首轮依赖持久 bash，Windows 侧由本轮进包的 **dsh-win32** process-inspector 提供（8-15 调研的 MSYS2/PTY 阻塞点即此）；安全边界等同所选 Standard 预设，非"只读"；只在新会话可选，已开始的会话不中途切换 | [8-15 Anchored 调研](RESEARCH-anchored-standard-and-productivity-plugins-20260815.md)、[tool-bootstrap.mjs](https://github.com/xiaobright/dsh-anchored-standard/blob/95b98af6552d8e6176f80ac1b17b9d1186bfebf7/preset/tool-bootstrap.mjs) |

## 智商调优（推理/提示词）类插件专项

基准事实（本地产证）：harness `2026-07-24-adapter-owned-reasoning-effort-capabilities` + `apps/web/tests/declared-reasoning.e2e.ts` 证实 **rc7 原生 composer 已有思考档位选择器**（按 adapter 声明的 `reasoningEfforts` 提供）——这是全篇"是否重复"判断的基准。扫描范围：awesome 三清单关键词（reason/think/router/route/prompt/optimi/context/cot/chain/smart/effort/slider/preset + 中文）全量命中 60+ 条，排除独立应用/前端/合集/纯 provider/记忆层后逐一回溯一手仓库。

### dsh-routing-suite 深度评估（本地克隆源码级，判定：深度暂缓）

**定性**：病毒式蹿红（壳仓 5 天约 5990★，两组件仓仅 110★/326★，星数与代码关注度严重倒挂）但里子失控的壳仓。

机制深潜（克隆 `dsh-super-injector` 钉 f4ef59f v0.3.3、`dsh-router-standard` 钉 eff787e v0.2.0）：

- 壳仓全部内容仅 `.gitmodules`+`install.ps1`+README；README 声称 preset v0.3.0 但该 bump 已被 Revert、release 404（[issue #41](https://github.com/yjh051108/dsh-routing-suite/issues/41)）。
- "推理模式路由"不换模型、不换推理档位、不改任何 API 参数：只是钩 `system-prompt/assemble` 用两个关键词正则给首条用户消息分类，换一句 persona 文本 + 首轮把工具面裁到 3-5 个（`router-core.mjs:122-134`、`coreFor` L105），首个 tool 事件后恢复。
- **核心功能从未生效**：[#13](https://github.com/yjh051108/dsh-routing-suite/issues/13) DSH 装配时序中 assemble 先于 user/message 落库 → 所有会话首轮无条件落 weak；[#34](https://github.com/yjh051108/dsh-routing-suite/issues/34) agent 平面收不到 `session/event` → 近距离引导从未生效；[#36](https://github.com/yjh051108/dsh-routing-suite/issues/36) rc.6 实测同样不生效。
- **理论基础已作废**：作者 2026-08-16 道歉函+勘误声明（`dsh-router-standard/docs/apology.md`、`statement.md`），自认核心叙事作废；实际利用的是对模型版本极度敏感的偶发小缺陷；probe 样本量 n=2。
- **rc.7 兼容性零证据**；安装链全平台翻车（#1/#25/#16/#42/#45）；无 CI。
- 注入器风险面：23 个 `dev_*` 模型工具常驻；`POST /super-injector/api/inject` **无鉴权**接受任意本地目录注入；引导器**拒绝卸载自身**（`src/index.ts:1983`）；`dev_install_package` 改写 `~/.dsh/profiles/web/{package.json,cordis.patch.yml}` 与发行版 profile/bundles 管理冲突。出站网络干净、不碰密钥（已全量 grep），但本地提权面不可接受。
- 阻塞项（修复前价值为零）：#13/#34 在 rc.7 修复并给会话日志级证据；DeepSeek 目标模型上 n≥20 对照实验重证疗效；注入 API 加鉴权+dev_* 改 lazy+支持自卸载；安装链修复；profile 边界共存方案。

### 该类候选横向对比（通过初筛者）

| 插件 | 调什么 | 档位判定 | 一句话 |
|---|---|---|---|
| [dsh-context](https://github.com/bowenliang123/dsh-context) 0.13.0（315★） | 上下文可观测（组成/历史/事件） | **默认开启** | 纯只读、钉 rc.7、npm 免构建；剔除 playwright-core 死依赖 |
| [dsh-repo-context](https://github.com/qing3a/dsh-repo-context) 0.1.0（0★） | git 状态注入 system prompt | **默认开启** | 零配置只读，补仓库实时感知；须过本地 rc7 验收门 |
| [dsh-reasoning-settings](https://github.com/JuneLearn/dsh-reasoning-settings) 0.3.0（6★） | BYO provider 推理档位/线格式 + 子代理参数修复 | Optional | 官方 DeepSeek 模型用不上（原生已有档位器）；同质组四选一代表 |
| [dsh-output-styles](https://github.com/PerryLink/dsh-output-styles) 0.4.0（3★） | `/style` 输出风格 | Optional | 默认 off；storage 依赖须重钉 rc7 |
| [billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) 0.2.4（26★） | 模型驱动压缩（ACP） | Optional | 替换宿主 compaction 后端+作者自述 beta |
| [dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor) 0.5.0（15★） | 注入物 token 审计 | Optional | 只读，与 dsh-context 互补 |
| [dsh-stream-rules](https://github.com/jiesou/dsh-stream-rules) 0.1.7（4★） | 规则命中注入 steering | Optional | 需自写规则，power user |
| [dsh-prompt-polish](https://github.com/JoukoPuro/dsh-prompt-polish) 0.1.0（3★） | ✨ 改写草稿 | Optional | 未发 npm；用户触发计费 |
| [Liang-Saint-Slider](https://github.com/BruzWJ/Liang-Saint-Slider)（88★） | 模型×档位 31 档梗图滑条 | **维持拒绝** | 见下 |

其余拒绝（一句话）：dsh-tool-turbo（理念对但 `private:true`+TS 源码当 main，打包未达标）；dsh-multi-cot（时延 ~29×/token ~20×）；dsh-undo（依赖未发布事件，作者自述不可用）；dsh-llm-fallback（与已集成 dsh-llm-fallbacks 重复）；dsh-model-router tianji-qingtian（伪造会话事件信封，触会话完整性红线）；dsh-model-modes（雷达不兼容+面向 OpenAI 系）；dsh-bash-rtk（外部 rtk 二进制）；dsh-headroom（首用自动下载本地代理服务）；context-vista/dsh-context-lens（与 dsh-context 重复取强）；dsh-prompt-studio/prompt-persona/soul-md（persona 属发行版身份职责）；dsh-zh-output/think-chinese 等（一条 persona 即可达成，锁全部会话不宜入发行）；forkprobe/internalcot/meta-orchestrator/技能包（出边界）；subagent 系（与已集成 yet-another-subagent 重叠）；审批自动化 dsh-approval-ai/yolo-mode（危险）；记忆边界项转记忆专项。

### Liang-Saint-Slider 误杀复核（结论：维持拒绝，上轮理由修正一半）

一手核实（[README](https://github.com/BruzWJ/Liang-Saint-Slider)、package.json）：它是 `conversation.input.model` slot 的 priority −1 替换渲染，31 档 = model × thinking-effort 两轴笛卡尔积——**没有引入原生 UI 之外的调优维度**（rc7 原生 composer 本就有档位器），只是把两个选择器合成一个梗图滑条。所以"功能重复"成立（非误杀），差异仅在交互形式。新增独立硬伤：31 张肖像帧素材**再分发权利不明**（README 自述需自证授权），发行版打包有法律风险；娱乐皮肤定位与发行版调性不符；peer 仅 `>=rc.6`、无测试/CI。用户想要可经市场自装。

### 该类最终结论

真正有效的"智商调优"是调 API 参数与上下文质量，不是 prompt 玄学：默认开 **dsh-context**（可观测）+ **dsh-repo-context**（仓库感知）；BYO provider 用户给 **dsh-reasoning-settings**（Optional）；等 routing-suite 阻塞项清零后再复评。

## Vision 方案最终结论

### 验证：8-16 结论哪些变了、哪些没变

| 8-16 结论 | 2026-08-19 复核结果 | 来源 |
|---|---|---|
| dsh-vision-router 最开箱即用（1.2.2，159 测试通过） | 仍成立且更成熟：已 1.6.1（746★）；但依赖面变重——sharp 变为 peer（原生）、新增 puppeteer-core；匿名 OVH 兜底链不变（2 RPM/IP/模型） | [README](https://github.com/ysr666/dsh-vision-router/blob/main/README.md)、[releases](https://github.com/ysr666/dsh-vision-router/releases) |
| dsh-vision-toolkit 最强但"需 Python 3.11" | **该反对理由已被上游消除**：v0.1.29 起无系统 Python 时自动下载 sha256 固定的独立 Python 3.13（约 35 MB，首次使用时）；v0.1.32 新增 Windows CI、修复 MAX_PATH 缓存与 NO_ADAPTER 自修复。上游已 0.1.32，Marisa vendored fork 仍是 0.1.2 | [releases](https://github.com/Anionex/dsh-vision-toolkit/releases)、本地 `plugins/dsh-vision-toolkit/package.json` |
| dsh-open-eyes 最干净（BYO provider，权限面最小） | 仓库已转移至 [hyper-dsh-plugins/dsh-open-eyes](https://github.com/hyper-dsh-plugins/dsh-open-eyes)；版本仍 0.1.0，两个 Windows 测试缺陷未修 | [commits](https://github.com/hyper-dsh-plugins/dsh-open-eyes/commits) |
| Zen `mimo-v2.5-free` 限时免费、OVH 匿名可用、GLM 强制 key | 2026-08-19 探测复核：Zen `/zen/v1/models` 仍列出 `mimo-v2.5-free`（另新增 `deepseek-v4-flash-free` 等）；OVH `/v1/models` 200；BigModel 401 强制 Bearer | 端点探测 |

### 最终决定

**默认：保留 dsh-vision-toolkit（Marisa fork）作为唯一默认 vision 集成，并将 fork 升级到基于上游 0.1.32 的重锁版本。** 理由：

1. Marisa 现有 fork（0.1.2 + 默认匿名 Zen MiMo + 设置页一键 GLM-4.6V-Flash）已实现"开箱即用识图"，无重复集成第二套的必要；toolkit 与 router 都拦截图片轮次，**不可并存**。
2. 上游 0.1.29–0.1.32 恰好修掉 Marisa 最痛的点：Windows CI、MAX_PATH 缓存崩溃、"用户需自装 Python"。升级后 toolkit 同时覆盖"粘贴问图"与"OCR/grounding/pixel diff/UI 还原"。
3. vision-router（1.6.1）降为 **Optional 替换层**：偏好"免 Python、纯 JS 工具链"的用户在设置页二选一；启用时必须先停用 vision-toolkit，并明示匿名链路的图片外发与限流。
4. dsh-open-eyes 维持"最低权限 BYO-provider 备选"定位，待上游修复 Windows 测试缺陷后再进备选链；当前不打包。

**降级链（面向默认开箱即用）：**

1. 匿名 Zen MiMo（现状默认）——零配置，但 UI 必须持续展示"限时免费、免费期数据可能用于改进模型"。
2. 设置页一键切 GLM-4.6V-Flash（需用户自己的 key，官方标完全免费）——首次粘贴真实图片前显示一次隐私告知。
3. 本地 Ollama + qwen3-vl:4b（私密档，图片不离机；不捆绑权重进 MSI，只做探测与下载引导）。
4. OVH 匿名链（仅当用户显式启用 vision-router 时兜底，展示限流与外发告知）。

**与现有集成的关系**：默认组合不变；升级 fork 属"更新 vendored 插件"，须走 fork 插件流程——更新 [docs/plugins.md](plugins.md)、附测试证据、并核对 Marisa 修改（Zen/GLM preset、client module id 兼容）是否已被上游 0.1.32 吸收。

## 统一验收门 / 后续动作

每个新进插件固定 tag/commit 后执行（沿用 [8-15 验收门](RESEARCH-adam-awesome-plugin-audit-20260815.md) 并针对本轮补充）：

1. 许可证与源码/安装脚本审计；npm 快照化一律移除 `prepare/prepublishOnly/preinstall/install/postinstall`（dsh-outline、dsh-smooth-stream、dsh-plugin-guard、dsh-message-edit、dsh-chat-import、modsearch、dsh-open-file、dsh-repo-context、dsh-output-styles 源码仓均含其一）；剔除死依赖（dsh-context 的 playwright-core）；裁剪误列依赖（dsh-permission-rules 的 tsdown/typescript）；重钉 rc.6 精确依赖（dsh-output-styles 的 dsh-storage*）。
2. strict-pnpm ESM resolve/import、`dump-config` 无 pending、standalone 冷启动。
3. **默认开启变多后的组合冒烟矩阵**（两两联合，真实窗口）：
   - 输入框区：dsh-mdbox × dsh-sticky-note × dsh-input-history × dsh-paste-input 按键与浮层
   - 侧栏/页签：dsh-outline × better-sidebar 布局；dsh-context × dsh-spend 页签共存；dsh-spend × dsh-ui-progress 悬浮层叠放
   - 渲染管线：dsh-smooth-stream × dsh-genui × dsh-suggested-replies 流式联合
   - system prompt 注入面：dsh-repo-context 注入后 request/header 对比，确认 Minimal/Anchored 首轮工具目录不被污染（dsh-chat-import 若启用须单独再测）
4. 新会话/刷新/恢复/异常退出/多标签页/卸载回滚；dsh-message-edit 额外做故障恢复 QA（通过后可上调默认开）。
5. **包体积预算**：记录每个插件的 EXE 体积、首次解压体积、冷启动增量；本轮 12 个默认开插件均为零/轻依赖，预期增量可忽略，但须在打包流水线加体积回归告警；dsh-open-file 若做按需功能包单独评估。
6. dsh-win32：rc.7 真实窗口 QA（持久 shell 变量/cwd 存活、Ctrl-C 中断、超时杀进程无控制台闪烁、GBK 解码）；上游 peer 放宽 issue/PR；与发行版终端/预设链路联合冒烟；确认 `installPresets()` 与发行版预设共存。
7. Vision fork 升级：锁上游 0.1.32 commit，重跑 Windows 真实 GUI 图集验收（沿用 [vision-onboarding-options-2026-08-16.md](vision-onboarding-options-2026-08-16.md) 固定任务表），确认 Zen 匿名默认仍可用；若 Zen 免费下线，降级 GLM 引导流程。
8. 后端 HTTP 200 不是桌面验收；发布前完成真实窗口渲染与 MSI 安装/启动/卸载验证（AGENTS.md 硬性要求）。
