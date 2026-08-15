# Anchored Standard 与零配置生产力插件调研

日期：2026-08-15  
范围：Marisa Distro / DeepSeek Harness `0.1.0-rc.6` standalone 组合  
方法：以插件源码、README、`package.json`、测试与当前本地 Harness 实现为准；`awesome-dsh-plugins` 仅用作发现入口，不把其兼容标签当作结论。

## 结论

1. **加入 Anchored Standard，但只作为实验预设，不能设为默认。** 它最有价值的地方不是“首轮少两个工具”，而是首轮完整复现 Minimal 的 persona、工具 schema 与自动上下文抑制，第二次请求再恢复 Standard 能力。
2. **它不证明 Linux 本身提分。** 作者在 Windows native 上报告 Project2 两跑 98/99，并把收益定位到首请求 scaffold；但这是个人冻结题、仅两跑，不是公共 benchmark，也不能推广到其他模型或任务。
3. **用户自行安装 MSYS2 是合理的体积方案，但目前还不能直接接上。** 当前 rc6 的 `pty-local` 明确只实现 Linux/macOS process inspector，在 Windows 启动会抛 `unsupported platform win32`。仅在设置中找到 `bash.exe` 还不够；必须先补 Windows/MSYS2 的持久 PTY 生命周期、前台进程判断、取消与清理实现。
4. 默认核心应优先增加**不扩充模型工具 schema、无密钥、无外部服务、无网络依赖**的 UI/工作区能力。推荐顺序为：`dsh-at-file`、连接状态横幅、`dsh-outline`；快捷键插件在设置持久化完成后进入核心。
5. 高价值但会改写会话行为、自动发送消息、扫描历史或显著增加体积的插件应进入 Optional/Experimental，而不是为了数量全部默认加载。

## Anchored Standard：它实际是什么

上游仓库是 [`xiaobright/dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard)。本报告检查并建议固定到提交 [`95b98af`](https://github.com/xiaobright/dsh-anchored-standard/commit/95b98af6552d8e6176f80ac1b17b9d1186bfebf7)，不要直接追随 `main`。

当前实现的首轮契约是：

- persona 固定为 Minimal 的 `You are a helpful software engineer assistant.`，并关闭 Harness identity/runtime context；
- API 首次可见工具严格限制为持久 `bash` 与 `str_replace_editor`；
- 首次请求抑制自动注入的 `agent-instructions` 与 `skill-catalog`；
- 会话出现首个 durable `tool/call` 或 `assistant/message` 后，后续请求恢复完整 Standard 工具与正常上下文注入；
- 晋升状态从 session events 推导，刷新/恢复后不会退回首轮；缺少 bootstrap 工具时退化为完整工具目录并记录一次警告。

这些行为可以直接在 [`tool-bootstrap.mjs`](https://github.com/xiaobright/dsh-anchored-standard/blob/95b98af6552d8e6176f80ac1b17b9d1186bfebf7/preset/tool-bootstrap.mjs) 和 [`agent.cordis.yml`](https://github.com/xiaobright/dsh-anchored-standard/blob/95b98af6552d8e6176f80ac1b17b9d1186bfebf7/preset/agent.cordis.yml) 中核对。仓库运行时代码没有第三方依赖；本地执行其 39 项 Node 测试全部通过。作者声明不发起网络请求、不加遥测，但它最终恢复 Standard 的 shell/文件等能力，因此安全边界仍等同于所选 Standard 预设及 DSH 权限系统，而不是“只读插件”。

### 证据强度

评测仓库 [`xiaobright/modeltest`](https://github.com/xiaobright/modeltest) 明确将自身定义为个人、自托管、冻结的工程维护题，不是公共 benchmark。其报告数据是 Standard 91、PTC 92、Minimal 99/96、Anchored Standard 98/99；Anchored 只有两跑。可信结论只能写成：**在这个任务、这个模型和这组设置下，首轮 scaffold 很可能比“始终只有两个工具”或 Linux 平台本身更关键。** 不能宣传成通用提分保证。

### rc6 与 MSYS2 边界

上游 Anchored 是基于 DSH `0.1.0-rc.5` 的完整 Standard composition 快照；其 README 也要求上游变化后重新审查。Marisa 当前是 rc6，因此不应整目录照搬，应只移植 bootstrap hook，并以 Marisa 自己的 rc6 Standard composition 为基底。

更重要的是，本地 rc6 [`pty-local/src/process-inspector.ts`](../harness/packages/pty/pty-local/src/process-inspector.ts) 的 `createProcessInspector()` 只支持 `linux` 与 `darwin`，Windows 直接抛错；虽然 [`pty-local/src/config.ts`](../harness/packages/pty/pty-local/src/config.ts) 允许配置任意 `shellPath`/`shellArgs`，但设置 MSYS2 的 `usr/bin/bash.exe` 仍绕不过 Windows process inspector。

因此 MSYS2 模式必须满足以下门槛后才能对用户开放：

- 设置页发现并验证用户指定的 MSYS2 根目录和 `usr/bin/bash.exe`，不修改系统 PATH；
- 新增 Windows PTY/process inspector，验证持久 cwd/env、前台命令完成、Ctrl-C、超时、后台子进程和退出清理；
- Anchored 新会话启动前做 preflight；缺少 Bash 时明确阻止进入，而不是悄悄退化成 Standard；
- 记录实际首轮 `request/header`，验收工具名必须恰为 `bash`、`str_replace_editor`；第二次请求再验收完整目录；
- Anchored 只在新会话选择，不能把已经以 Full/Standard 开始的会话中途切换过去。

这条路线比把 MSYS2 塞进单 EXE 更省体积，也符合“用户自行安装”的决定；但在 Windows PTY 端口完成之前，WSL/Linux 仍是现成可用的精确持久 Bash 路径。

## 插件候选审计

| 插件 | 生产力价值 | 配置/外部依赖 | rc6 与风险判断 | 建议 |
|---|---|---|---|---|
| [`dsh-at-file` 0.6.0](https://github.com/omdsh-dev/dsh-at-file) | Composer 输入 `@` 搜索工作区文件/目录；只插入相对路径标记 | 默认即用；唯一运行依赖 `zod`；不读文件内容、不展开目录内容 | peer 范围兼容 DSH；路径限定在活动工作区，默认排除 VCS、依赖、缓存和构建目录。聚合榜的失败原因不能替代本组合的真实安装测试 | **Core 首选** |
| [`dsh-plugin-connection-banner` 0.1.0](https://github.com/yinren112/dsh-plugin-connection-banner) | 连接中断时显示 Harness 原生重连横幅 | 无配置、无依赖、无轮询 | client-only，复用公开 `hostDescription`、`shell.overlay` 与原生组件；不影响模型 schema | **Core 首选** |
| [`dsh-outline` 0.1.2](https://github.com/urzeye/dsh-outline) | 长对话按用户问题和 Markdown 标题生成实时大纲、搜索、收藏、跳转 | npm 预构建，默认即用，无运行依赖/外部服务 | rc6 peer 明确；大纲数据来自 session event stream，不靠 DOM 抓内容；滚动定位仍使用稳定 data attributes，需做布局冲突测试 | **Core 候选** |
| [`dsh-client-shortcuts` 0.1.0](https://github.com/blue-a11y/dsh-client-shortcuts) | 全局快捷键、冲突检测、保留键拦截、设置页改键 | client-only、无运行依赖 | rc6 peer 明确；当前自定义键位刷新后丢失，聚焦输入框仍依赖 DOM 查询 | **Core 候选，先补持久化** |
| [`dsh-message-edit` 0.2.1](https://github.com/Moeblack/dsh-message-edit) | 编辑旧消息、reroll/retry、版本树与时间线 | 无密钥/外部服务 | 针对 rc6 公共服务构建；采用 append-only 新 session 版本而非改写旧事件，但触及持久化、flush 与导航边界 | **Optional，完整故障恢复 QA 后可升 Core** |
| [`dsh-attachment-formats` 0.5.0](https://github.com/linkingoscar/dsh-attachment-formats) | PDF/Office/文本/OCR、长文档 spill + 索引卡 | `canvas`、ExcelJS、Mammoth、PDF.js、Tesseract 等重依赖；首次 OCR 约下载 24 MB 语言数据 | 功能很强，但增加 EXE/安装体积；部分注入依赖未公开 DOM/API，扫描 PDF 的完全离线体验需额外打包模型 | **Optional Documents 包** |
| [`dsh-auto-continue` 0.4.0](https://github.com/HsiangNianian/dsh-auto-continue) | 网络/非人为中断后自动排队“继续” | 设置可用，无密钥 | rc6 peer 明确，带退避、多标签互斥并跳过 abort/blocked/subagent；但属于自动发送用户消息 | **Optional，默认关闭** |
| [`dsh-context-doctor` 0.5.0](https://github.com/Zhenyu98/dsh-context-doctor) | 审计 AGENTS、Skills、工具 schema 的 token 成本、重复与冲突 | 无密钥；只读文件审计 | 自身会增加 `context_audit` 模型工具和 schema 成本；不应污染 Minimal/Anchored 首轮 | **Developer Optional** |
| [`dsh-session-search` 0.1.0](https://github.com/Tieboyh/dsh-session-search) | 跨 DSH/Codex/Claude/pi/OpenCode 搜索历史 | 默认路径可用、无数据库；每次直接只读扫描 | rc6 peer 明确，但会读取用户目录下多个产品的会话，宽搜可能昂贵，且新增两个模型工具 | **Experimental，显式授权来源** |

### 暂不默认加入

- [`dsh-plugin-mermaid`](https://github.com/lj970926/dsh-plugin-mermaid)：rc6 声明明确，但 Mermaid v11 首次渲染从 jsDelivr CDN 加载，不符合 sealed standalone 的离线开箱即用目标。若以后将 Mermaid 固定版本 vendoring 到包内，可重新评估为 Core。
- [`dsh-git-graph`](https://github.com/1841220388zzzcccxxx-star/dsh-git-graph)：不只是只读图，它暴露 checkout、merge、reset、cherry-pick、stash、tag 等写操作；还与现有 sidebar/Git 能力重叠。缺少清晰默认仓库边界和 destructive-flow 验收前不进入 Core。
- `dsh-message-navigator`：纯 JS 且轻，但直接依赖对话 DOM selector；相较之下 `dsh-outline` 用 session event stream 构建数据模型，升级韧性更好。
- 密码/secret 输入类社区插件：在独立安全审计、临时文件权限、崩溃清理和“秘密不进入模型上下文”验证完成前，不进入发行包。

## 推荐分层

### Core（默认开启，不新增模型工具）

- `dsh-at-file`
- `dsh-plugin-connection-banner`
- `dsh-outline`
- `dsh-client-shortcuts`（先补设置持久化）

这组直接改善输入、连接状态、长对话定位和键盘操作，同时不改变 Full/Standard 的模型工具目录。它们也不会破坏 Anchored 的首轮两工具约束；但显式 `@file` 内容仍属于用户输入，评测时应固定任务输入。

### Optional（随 EXE 提供开关，默认关闭或按功能包安装）

- `dsh-message-edit`
- `dsh-auto-continue`
- `dsh-attachment-formats`（Documents 重型包）
- `dsh-context-doctor`（Developer 包）

### Experimental（清楚标注风险与适用模型）

- Anchored Standard（新会话预设；优先针对 DeepSeek V4 Pro）
- Minimal（精确两工具预设）
- MSYS2 persistent Bash（Windows PTY 端口完成后）
- `dsh-session-search`（用户显式选择可扫描来源）
- 修复后的 `yet-another-subagent`（与官方 `subagent` 工具名/rc6 生命周期兼容后）

## 纳入发行版的统一验收门

每个插件不能只验证 Loader “加载成功”，至少需要：

1. 固定 tag/commit 与许可证，完成源码/安装脚本/网络/文件权限审计；
2. strict-pnpm 依赖投影和真实 ESM resolve/import；
3. standalone 冷启动、41+ 客户端模块注册、无 pending materialization；
4. 插件真实功能冒烟，而不是只看 UI 出现；
5. 新会话、刷新、恢复、异常退出、多个标签页和卸载回滚；
6. 记录 EXE 压缩体积、首次解压体积和冷启动耗时增量；
7. 对模型侧插件比较实际 `request/header` 工具 schema，确保 Minimal/Anchored 首轮没有被新增工具或自动上下文污染。

最终产品不应以“插件数量”作为卖点，而应以三层开关呈现：**Marisa Core 默认可靠，Optional 按用途开启，Experimental 明确证据边界。**
