# Adam Radar 高热度插件与 Marisa 插件清单复核

日期：2026-08-15  
目标：面向**联网可用、开箱即用**的 Marisa Distro，而不是 sealed/offline 发行包。  
发现入口：[`AdamPlatin123/awesome-dsh-plugins`](https://github.com/AdamPlatin123/awesome-dsh-plugins)；结论回溯到各插件第一方仓库与本地 rc.6 组合。

## 结论摘要

1. Radar 是自动发现与运行探测仓库，不是安全精选榜。它自己明确写明“运行可用也不等于安全审计”。Star 应当提高审计优先级，但不能替代源码、兼容性和真实功能验证。
2. 2026-08-15 15:09（UTC+8）的 Radar Top 20 中，很多高 Star 项目是替代桌面端、TUI、独立应用、基础引擎或大合集，不是应该叠加到 Marisa 的单插件。
3. 当前最合理的动作不是从 31 个继续无差别累加，而是：升级一个已有高热度基座，新增三个低配置交互插件，再提供四个联网/迁移可选组件。
4. 联网能力允许 CDN、在线搜索和插件市场进入候选；但需要用户另装 CLI、浏览器扩展或申请 API Key 的能力仍不算“默认开箱即用”，只能放 Optional。

## Top 20 适配判断

Star 数采用 Radar 页面 2026-08-15 15:09（UTC+8）快照；数字会变化，只用于排序信号。

| 项目 | Star 快照 | 判断 | 原因 |
|---|---:|---|---|
| [`dsh-web-ui`](https://github.com/zhu1090093659/dsh-web-ui) | 2177 | **不装全家桶；选择性吸收** | 与现有 better-sidebar、Git、视觉、通知大量重复；聚合包还要求 hoisted 布局并放行原生构建脚本。可单独评估 task-board。 |
| [`modlens`](https://github.com/liustack/modlens) | 1465 | **Optional 替代视觉后端** | 单工具、活跃、证据格式好；但没有现成引擎时仍需 Antigravity 登录或 API Key，与现有 vision-toolkit 重叠，不能同时默认。 |
| [`TokenTracker`](https://github.com/xiufengsun/TokenTracker) | 1313 | **不纳入插件包** | 是跨 31 种工具的独立原生应用，不是 Marisa profile 插件；用户可以独立安装。 |
| [`dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI) | 1004 | **不纳入桌面默认包** | 是替代交互前端，和当前 Wails/Web 桌面路线并列而非叠加能力。 |
| [`PicGo-Core`](https://github.com/PicGo/PicGo-Core) | 971 | **不直接纳入** | 是上传引擎而非完整 DSH 插件，并且必须配置图床。 |
| [`DSH-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) | 872 | **保留并升级** | 当前 Marisa 已有 0.10.3；上游 0.12.x 增加服务化扩展、按需加载和 Windows 修复。应升级验证，而不是再装另一套侧栏。 |
| `sandbase-harness` | 580 | **不纳入** | 替代 Agent runtime，不是当前 DSH profile 的增强插件。 |
| [`dsh-vision-toolkit`](https://github.com/Anionex/dsh-vision-toolkit) | 372 | **保留，重新验收** | 当前已经集成，具备 OCR、grounding、pixel diff 和 progressive exposure；Radar 的环境判定与本地已做的 rc.6 兼容移植冲突，应以本整合包真实冒烟为准。 |
| [`dsh-agent-teams`](https://github.com/NanmiCoder/dsh-agent-teams) | 278 | **暂缓** | 功能强，但 Radar 最新快照判为运行级不兼容，并新增九个协调工具；修复前不替换官方 subagent。 |
| `Bigfish` / `oh-dsh` / 其他 desktop | 188/175 等 | **不纳入** | 都是与 Marisa 竞争的完整发行版或桌面外壳。 |
| [`dsh-at-file`](https://github.com/omdsh-dev/dsh-at-file) | 154 | **Core 新增** | 高热度单插件，零密钥、无网络、只插入工作区内路径引用，不提前读入内容；直接改善日常输入。Radar 失败不能替代本地 rc.6 安装测试。 |
| [`dsh-browser`](https://github.com/Lum1104/dsh-browser) | 107 | **Optional Browser Add-on** | 功能完整并有审批/源站边界，但仍需用户在 Chrome 开发者模式加载扩展，不是默认零操作体验。 |
| [`modsearch`](https://github.com/liustack/modsearch) | 98 | **Optional Web Pack** | 可以替换/增强原生 web search 并提供 read_page、X search；但首选引擎需要浏览器登录，其他引擎通常需要 Key。 |
| [`dsh-visualize`](https://github.com/Nagi-ovo/dsh-visualize) | 88 | **不新增** | 与当前 dsh-genui 能力高度重复，并额外新增模型工具；保留现有 GenUI 即可。 |

## 优化后的发行清单

### A. 当前版本立即处理

| 动作 | 插件 | 默认状态 | 理由 |
|---|---|---|---|
| 升级 | [`DSH-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) | 开 | 高 Star、现有核心基座；先从 0.10.3 升到审计锁定的 0.12.x，验证 Windows、严格 pnpm 和已有扩展。 |
| 新增 | [`dsh-at-file`](https://github.com/omdsh-dev/dsh-at-file) | 开 | 最明确的高 Star 单插件生产力增益。 |
| 新增 | [`dsh-annotation`](https://github.com/omdsh-dev/dsh-annotation) | 开 | 约 45 Star、纯客户端、无密钥；选中回答片段后批注追问，适合代码审查和长回复修订。 |
| 新增 | [`dsh-outline`](https://github.com/urzeye/dsh-outline) | 开 | 长对话实时大纲、搜索与跳转，不新增模型工具；先做与 better-sidebar 的布局冲突测试。 |

`dsh-plugin-connection-banner` 可以保留在 QA 队列，但不再排在上述三项之前；`dsh-client-shortcuts` 在自定义快捷键持久化修复前不进入正式 Core。

### B. 随包提供的 Optional

| 插件 | 默认状态 | 进入条件/边界 |
|---|---|---|
| [`dsh-message-edit`](https://github.com/Moeblack/dsh-message-edit) | 关 | 完成新会话、刷新、恢复、异常退出和多标签页 QA 后开放。 |
| [`dsh-chat-import`](https://github.com/Nwflower/dsh-chat-import) | 关 | 143 次提交、支持 13 类会话来源；属于迁移功能，默认不暴露十多个 import 工具。 |
| [`modsearch`](https://github.com/liustack/modsearch) | 关 | 设置页检测现有引擎；已登录/已有 Key 时一键启用，否则显示引导，不伪装成零配置。 |
| [`dsh-browser`](https://github.com/Lum1104/dsh-browser) | 关 | 做“安装 Chrome 扩展”引导页；插件本体可预装，扩展未连接时不向模型暴露 browser 工具。 |
| `@linxin666/dsh-client-ui-task-board` | 关 | 只从 dsh-web-ui 单独引入任务看板，不引入全家桶；关闭定时自动执行，直到权限与多实例验证完成。 |
| `dsh-market` 或一个经过审计的 Marketplace | 关 | 联网整合包可提供插件发现，但安装前展示来源、commit、许可证、权限提示；不能自动更新核心锁定插件。 |

### C. 二选一能力，不得同时默认

- 视觉：默认保留 `dsh-vision-toolkit`；`modlens` 仅作为替代后端。两者同时启用会造成重复工具与模型选择项。
- 生成式界面：保留当前 `dsh-genui`；不再增加 `dsh-visualize`。
- 侧栏/文件/Git：保留并升级 `better-sidebar`；不安装 `dsh-web-ui-all`、side-panel、file-explorer 等重复实现。
- 子代理：先保留官方 rc.6 subagent；`dsh-agent-teams`、`yet-another-subagent`、`dsh-subagent-tools` 只能选一条实验路线。

## 这轮明确拒绝或暂缓的插件

- [`dsh-bash-terminal`](https://github.com/MAXeaglet/dsh-bash-terminal)：方向与 Shell 切换需求一致，但当前仅约 1 Star，安装需要 patch 官方 settings 白名单，文档中的“模型不能改变 shell”与工具枚举描述还存在不一致，且 shell 以用户同权限运行。可借鉴实现，不能直接进入发行版。
- [`dsh-plugin-web-access`](https://github.com/junhongchashui/dsh-plugin-web-access)：只有 2 次提交，`browser_eval` 可执行任意页面 JavaScript；等待成熟。
- [`dsh-test-runner`](https://github.com/suimi8/dsh-test-runner)：只有 1 次提交且安装仍需 allowBuilds；思路好但成熟度不足。
- [`dsh-lens`](https://github.com/NexusAgentX/dsh-lens)：会常驻暴露大量工具并启动语言服务；适合未来 Developer Pack，不适合当前默认组合。
- [`dsh-mcp-adapter`](https://github.com/NexusAgentX/dsh-mcp-adapter)：渐进式 MCP 方向正确，但仓库仍新；进入 Experimental 前需要与官方 MCP client 的迁移和双连接防护测试。
- `dsh-turn-rewind`、Git 全操作插件、自动续跑：会改变工作区或自动发送消息，继续默认关闭。

## 统一验收门

每个新插件必须在固定 tag/commit 后完成：许可证与源码审计、strict-pnpm ESM resolve/import、`dump-config` 无 pending、standalone 冷启动、真实 UI/工具冒烟、刷新/恢复/多标签页、卸载回滚，以及 `request/header` 工具目录对比。联网插件还要记录出站域名、登录/Key 状态、失败降级和是否把页面内容或凭据送入模型。

最终建议不是“追求最高插件数”，而是把发行体验组织成：**Core 开箱即用、Optional 一键启用、Experimental 明确风险**。联网只放宽资源来源，不放宽稳定性与安全门槛。
