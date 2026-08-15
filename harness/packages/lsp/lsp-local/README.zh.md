# @deepseek-ai/dsh-lsp-local

[English](README.md) | 中文

`ctx.lsp` 的**通用本地 stdio 语言服务器后端**。一个插件实例接受一张命名服务器表，并逐配置项注册一个隔离的提供方。这是通用主机，而不是语言服务器目录或安装器：部署需要显式配置命令与映射，预设应放在 `cordis.yml` overlay 中。

Namespace 插件（`name`／`inject`／`Config`／`apply`，无默认导出）。

## 功能

- 在注册前解析每项服务器局部设置；无效映射或注册冲突会回滚较早配置项，因此加载失败不会留下提供方路由。
- 每个 `(server id, canonical workspace realpath)` 惰性 single-flight 一个服务器进程。存活服务器错误不会回放；如果选中的池化传输在只读查询之前或期间失败，提供方会等待其 dispose（资源释放）完成，并在新进程上重试该查询一次。
- 每次查询都使用兼容性优先的**临时打开**序列：通过 Node API 规范化并读取源文件、`textDocument/didOpen`（版本 1、完整文本）、所请求操作，然后执行 `textDocument/didClose`，该操作位于 `finally` 中。写入 `didOpen` 失败或取消时，会在池复用该实例前将其终止。文档在每次调用后关闭，因此第一版不需要 `didChange`、内容 cache 或文档 LRU。
- 通过一条逐 Workspace、可中止的队列，串行执行每个源读取／打开／查询／关闭生命周期，因此排队调用只会在轮到自身时读取当前源；不同 Workspace 并行运行。
- 协议 shutdown 失败后，经由子进程 seam 终止服务器后代树（POSIX 进程组信号；Windows `taskkill /T /F`）。树终止的投递结果与所有进程组信号一样被就地吸收，不向外抛出（投递与服务器退出存在竞态）；服务器是否完全停稳，由句柄的进程树存活等待确认，而非由这次终止自身的结果确认。
- 通过子进程 host namespace 中的 Node 文件系统 API 读取源文件，绝不使用 `ctx.fs`，也不发出 `fs/observed`：只有 LSP 结果对模型可见，因此查询不满足先读后写策略。

## 配置

`servers` 记录的 key 是在 `ctx.lsp` 上保留的稳定提供方 id；每个值具有以下形状：

| 服务器 key | 默认值 | 含义 |
|---|---|---|
| `command` | （必填） | 要 spawn 的可执行文件：绝对路径，或在加载时从子进程 PATH 解析。不使用 shell 启动。 |
| `args` | `[]` | 传给可执行文件的参数。 |
| `env` | `{}` | 合并到已清理 credential 的环境之上的额外 env（匹配 `KEY`／`PASSWORD`／`SECRET`／`TOKEN` 的变量不会转发）；显式 `DSH_*` 条目在 seam 清除环境中同名值之后合并。 |
| `extensionToLanguage` | （必填） | 小写、以点开头的扩展名 → LSP language id（例如 `{ '.ts': 'typescript' }`）。 |
| `initializationOptions` | `null` | 转发给服务器的静态 `initialize` 选项。 |
| `configuration` | `null` | 每个 `workspace/configuration` 配置项的静态答案。 |
| `maxMessageBytes` | `16000000` | 从服务器接受的单条 framed 消息最大大小。 |
| `maxStderrBytes` | `1000000` | 为诊断保留的 stderr 尾部最大大小。 |
| `maxDocumentBytes` | `4000000` | 该主机可打开的源文件大小上限。 |
| `shutdownTimeoutMs` | `5000` | 升级前用于优雅 `shutdown`／`exit` 的预算。 |
| `killGraceMs` | `2000` | 请求取消及 SIGTERM→SIGKILL 升级的宽限期。 |

`servers` 必须至少包含一个配置项，每个 id 都必须非空。定时器预算必须是正整数，且不超过 Node 的 `2_147_483_647` ms 定时器上限。所有可执行文件都会在清理 credential 后于加载时解析；后面的坏配置项会阻止所有提供方注册。进程在第一次匹配查询时惰性启动。

## 协议行为

初始化会声明 `general.positionEncodings: ['utf-16']`、`workspace: { workspaceFolders: true, configuration: true }`、`textDocument.hover.contentFormat: ['markdown', 'plaintext']`，以及定义与实现使用的 `linkSupport: true`，且不进行动态注册。服务器返回的能力具有最终决定权：不受支持的操作，或缺少临时打开／关闭的同步方式，会使查询失败。服务器省略 `positionEncoding` 时默认为 `utf-16`；其他值都属于协议错误。客户端通过静态配置回答 `workspace/configuration`，接受生命周期记账请求，并拒绝 `workspace/applyEdit`：它绝不应用编辑或运行命令。导航直接映射 `Location`，并从 `LocationLink` 的 `targetUri` + `targetSelectionRange` 映射；hover 规范化会取得有效的 `MarkupContent.value`，保留 string `MarkedString`，把带 language tag 的值渲染为围栏代码，并用一个空行连接数组。缺失结果、格式错误的范围或位置，以及格式错误的 hover 编码，都会以结构化 `LSP_MALFORMED_RESPONSE` 错误的形式失败。

## 安全边界

提供方信任其配置的服务器，不提供任何沙箱隔离。它通过 Node API 规范化并读取源文件，拒绝缺失、非普通文件、非 UTF-8、过大，或规范路径位于规范 Workspace 外部的源文件（符号链接别名共享一个实例）。结果位置可以在外部，但外部路径不能成为查询源。因此，第一版要求可信的主机本地部署；受限、远程或虚拟 Workspace 需要另一个提供方。

## 模型体验

通过 `dsh-tool-lsp` 间接影响；该工具呈现此提供方的规范化结果，该主机自身不贡献提示词或 schema。

#### KV Cache 影响

不会直接失效；请求前缀变更由 `dsh-tool-lsp` 负责。

## 已知限制与暂缓事项

- **仅限可信主机本地环境**：没有沙箱隔离，也没有私有 cache／temp 写入契约；支持不受信任 binary 或受限／远程／虚拟 Workspace，需要后续的进程／文件系统契约及不同提供方（见 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md)）。限制逻辑先解析 `realpath`，再通过一个带 `O_NOFOLLOW | O_NONBLOCK` 的 handle 打开源文件（最终组件符号链接防护，并以非阻塞方式拒绝 FIFO），同时进行有界读取；并发修改方如果在解析与打开之间把*祖先*目录替换为符号链接，会造成残余 TOCTOU。在该可信部署模型下接受此风险，不使用不可移植的 `openat` 逐 segment 遍历来封闭。
- **临时打开兼容性下限**：同步能力省略打开／关闭（或声明 `None`）的服务器不受支持，即使关闭文档查询能够工作；与一个 TypeScript 服务器兼容，并不表示支持其他语言。
- **逐服务器／Workspace 串行化延迟**：共享同一个服务器与 Workspace 的并行 agent（智能体）会在一个进程后排队；长生命周期 Workspace 进程会占用内存直到 dispose。
