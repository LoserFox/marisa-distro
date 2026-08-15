# 架构与兼容合同

简体中文 | [English](architecture.md)

## 产品边界

这是社区 dual-face Cordis 插件，不是官方只允许 Skills/MCP 的 repository Plugin。
选择阶段只保留浏览器 `File`；发送时由 DSH 异步 reference serializer 建立 Host
批次，以两个浏览器上传 worker 流式写入 staging，全部成功后原子发布，再返回给
模型一段以绝对附件根目录开头的紧凑路径说明。

绝对根只出现一次；后续文件名和所有权 manifest 使用相对路径。manifest 保留
完整的原始路径、实际安全路径、大小和类型映射，因此聊天气泡不必重复大量绝对
路径，模型仍可获得完整材料。

Host 始终从 live session 读取 `session.header.cwd`，浏览器不能指定目标目录。最终
目录为：

```text
<session cwd>/.dsh/tmp/attachments/<session key>/<send id>/
```

每个已提交批次都有 `.dsh-workspace-attachments.json` 所有权标记。清理只能删除
带该标记且位于当前工作区附件根下的目录。

## UI 与消息投影

插件不使用 `MutationObserver` 或 DOM 劫持。附件按钮、空白会话附件条、正式会话
附件条和设置页分别进入 DSH 的正式 Slot。DSH 原生固定宽度引用位显示回形针和
文件名开头；完整名称、文件数和总大小显示在插件附件条。

当前 DSH 对已发送用户消息使用纯文本投影，也没有第三方 message renderer Slot；
Assistant Markdown 的安全清洗不允许任意本地绝对路径/file URL。因此第一版不
伪造 Codex 风格聊天链接。发送文本会列出可读的相对文件名，完整映射留在
manifest；DSH 自己的文件工具行继续使用其原生可点击路径。等官方提供消息
renderer 或 local-file action Slot 后，再统一升级用户/AI 气泡。

## 为什么生产依赖为零

Host 只使用 Node 标准库；浏览器端是预构建的 DSH module factory，只消费 DSH
已经提供的 React/runtime/slot 服务。用户无需安装 npm 包、pnpm、专用运行时或
重建官方 DSH。

## 私有分发与安装器

每个测试者可能拿到不同私有 URL 和指纹。安装器只从当前 clone 复制文件，不从
硬编码公共地址二次下载。remote、commit、dirty 状态和实际分发的运行/安装文件摘要
共同进入审计指纹；原始 remote 不写入安装元数据。

最新版 DSH 把 profile 放在 `$DSH_HOME/profiles`。安装器先把自有插件快照发布到
`$DSH_HOME/community-plugins/multimedia-webui-input/package`，再调用
`dsh plugin --profile web add link:<snapshot>`。包内 `dsh.bundle` 指向
`cordis.patch.yml`，DSH 会把它加入 profile bundle 栈；后续 `staging-*` 源码轮换
不会影响这个稳定路径。0810+ 通过 `dsh.client` 发现 WebUI half；内容一致的顶层
`dshClient` 声明继续服务 0806 扫描器，并由测试强制两份声明保持一致。旧版 DSH
继续使用原有稳定 `node_modules` 桥接。两种路径都不修改官方 tracked 源码。

当前 `plugin-registry` 已转向官方 bundle/repository-plugin 模型，其薄控制台会从
根 `package.json` 的 `dsh.bundle` 与 `dsh.client` 识别本插件；已经退役的
`dsh.plugin.json` 不再是有效兼容面。它可以作为可选管理入口，但不能成为默认
依赖。`deepseek-harness-distro` SDK 用于开发和测试，也不替代终端安装器。

## 兼容能力探测

安装要求目标仍提供：

- 通过 `resolvePkgJson` 发现 `dsh.client` 包，同时保留 0806 扫描器所需的
  legacy `dshClient` 声明；
- `conversation.input.left`、`conversation.input.overlay`、
  `conversation.input.dock`；
- 默认消息提交前的异步 `serializeReference`；
- root scope 的 `settings.section`；
- Host HTTP 最长前缀路由。
- 最新版的原生 profile bundle 组合，以及跟随 Slot 声明生命周期的
  `slots.inject()` 注册。

发布运行包后，安装器执行目标版本对应的真实组合路径，并运行
`dsh --profile web --dump-config`。失败会回滚 profile 注册和运行包。卸载先移除
dependency 与 bundle layer，确认 composed config 已不含插件，才删除安装器自有文件。
兼容性只看能力，不看私有仓库名称或指纹。

## 传输、资源和删除规则

- 沿用 DSH Host/Origin/trusted-host 边界；
- 默认单文件 1 GiB、单次 2 GiB、10,000 文件、64 层；
- request body 带背压流式写入，不整文件进内存；
- 浏览器并发 2、Host admission 4，仅限制附件 I/O，不限制 Agent fan-out；
- 未完成批次永不发布，空闲 staging 用内存表按小时回收，不扫描工作区；
- 只有打开设置页或手动刷新时才异步统计；
- 当前会话清理同时校验 session id 和所有权标记；
- 当前工作区清理跳过 `.staging` 和所有未知/无标记目录；
- 两种删除都要求页面内第二次点击确认；
- 文件系统操作使用 Node 标准 API，面向 Windows、macOS 和 Linux。

## 当前验证基线

DSH `snapshots/20260810T155924Z-8ec407cd64`（`5f8768c5`）。该标识只记录已验证
基线，不是硬编码版本门。
