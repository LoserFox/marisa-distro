# Desktop 与 Router 上游集成调研

日期：2026-08-16
范围：评估 `anywhere-labs/deepseek-harness-desktop` 的桌面体验实现，以及
`yjh051108/dsh-router-standard` 是否可进入 Marisa 发行组合。源码经 GitHub CLI
在 HTTP(S) 代理 `127.0.0.1:10808` 下读取；下列结论以固定提交和源码为准。

## 结论

`deepseek-harness-desktop` 在提交 `b0176832cc4c485735475f0cbd210c32d58ed20b`
（MIT）实现了 Electron 桌面壳，包含 profile 健康标记/回退、renderer 启动报告、
原生三栏布局和 profile/plugin 管理服务。Marisa 是 Wails/Go 壳，不能直接复用其
Electron 生命周期或 `desktopProfiles`/`desktopPnpm` 服务；但启动可观察性是可移植
的体验原则。本发行版已把它落实为启动页阶段、经过时间和首启恢复提示。

`dsh-router-standard` 在提交 `f9667f72d45e743f1683f36420ce34c2027fe7b2`
（MIT，v0.2.0）不是 provider/router 网关。它通过 `system-prompt/assemble` 在首个
模型请求前，依据首条用户消息替换 persona 和可见工具集合；首次持久工具调用后才
恢复完整工具目录。其 `standard` 默认模式进一步清空常规提示词段，只保留一条
RL persona，并偏好 shell + `str_replace_editor` 的首轮工具面。

因此本次不将它默认挂入 Marisa。Marisa 当前 Windows bundle 明确以
`@deepseek-ai/dsh-tool-pwsh` 取代 bash，并混合了 MyGO、plugin bundle 与 rc6
兼容补丁；router 的整份 agent composition 会重写这套首轮工具/提示词契约。把它
直接复制到默认 profile 会在没有真实会话回归的情况下改变每个新会话的行为，风险
不适合发布窗口。后续可制作独立、显式选择的 preset：保留 Marisa 的 pwsh row，
仅在隔离的 agent scope 中加载 router bootstrap，并以真实 build/fix/reload 会话
验证工具 schema、计划模式和恢复行为后再考虑默认化。

第一方来源：

- [deepseek-harness-desktop README](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/b0176832cc4c485735475f0cbd210c32d58ed20b/README.md)、[`src/main.ts`](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/b0176832cc4c485735475f0cbd210c32d58ed20b/dsh-plugin-desktop/src/main.ts)、[`renderer-boot.ts`](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/b0176832cc4c485735475f0cbd210c32d58ed20b/dsh-plugin-desktop/src/renderer-boot.ts)
- [dsh-router-standard README](https://github.com/yjh051108/dsh-router-standard/blob/f9667f72d45e743f1683f36420ce34c2027fe7b2/README.md)、[`router-bootstrap.mjs`](https://github.com/yjh051108/dsh-router-standard/blob/f9667f72d45e743f1683f36420ce34c2027fe7b2/preset/router-standard/router-bootstrap.mjs)、[`agent.cordis.yml`](https://github.com/yjh051108/dsh-router-standard/blob/f9667f72d45e743f1683f36420ce34c2027fe7b2/preset/router-standard/agent.cordis.yml)

## 已确认的 Marisa 集成面

本仓库的桌面外壳是自有 Wails/Go 组件；发行时嵌入 Node、Harness 和生成的 Marisa
profile，而不是引用外部桌面仓库。桌面元数据由 profile 的 `dsh.desktop` 生成，且
桌面启动时叠加 `desktop.overlay.yml`。因此，任何 UX 变更应首先分为以下边界：

| 候选变更 | 应落点 | 发行前必须验证 |
| --- | --- | --- |
| 原生窗口、加载态、托盘、WebView 生命周期 | `desktop/` Go/Wails shell | 真实窗口渲染；standalone 与 MSI 的安装、启动、卸载 |
| Web UI、面板、会话交互 | Harness 或 profile bundle | 生成 profile、客户端模块加载、浏览器/桌面功能冒烟 |
| 首轮 agent 行为路由 | 显式、可选的 agent preset | 提示词、工具 schema、计划模式、会话恢复和 Windows pwsh 路径 |

这三个边界可由本地 [架构说明](architecture.md)、
[profile 生成器](../profiles/marisa/generate-profile.mjs)、
[desktop overlay](../profiles/marisa/desktop.overlay.yml) 和
[desktop README](../desktop/README.md) 直接核验。路由器若进入默认 bundle，还必须
符合仓库约定：新增网络、进程、文件写入、密钥或模型访问能力须记录权限影响；插件
依赖与 bundle 挂载由 `profiles/marisa/plugins.json` 和生成器统一管理，不能绕过 profile
写入临时配置。

## 后续集成门槛

1. 固定 router commit，保留 LICENSE/NOTICE，并审计所有生命周期脚本和外部 I/O。
2. 以 Windows pwsh row 替代其 bash row；不得让可选 preset 覆盖 Marisa 默认 bundle。
3. 新增真实 session 回归：greenfield、bugfix、plan mode、reload/resume，以及第一轮
   与首个工具调用后的 schema 断言。
4. 将权限影响写入插件文档。router 本身不新增网络/密钥访问，但它会改变模型可调用的
   工具集合，属于显著行为面。
5. 执行根目录规定的安装、测试、两组 Go bundle 测试和 PR 边界检查，并完成真实窗口
   与 MSI 安装/启动/卸载验收，才可将该 preset 带入 Release。
