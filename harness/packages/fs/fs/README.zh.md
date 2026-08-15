# @deepseek-ai/dsh-fs

[English](README.md) | 中文

**文件系统提供方 seam**：抽象 `FileSystem` 服务（`ctx.fs`），定义后端提供的存储原语，包括路径解析、stat 元数据、不跟随链接的路径元数据、读取/流式读取文本、列出目录、原子写入和应用字面量编辑，但不规定实现方式。两个变更操作都**可选**接收版本防护，因此 `ctx.fs` 本身就是完整且不受约束的文本存储 seam。本包还拥有由工具分派、策略插件监听的 `fs/*` 策略事件词汇。

本包是[文件系统家族](../README.md)中的提供方 seam 层。[工具](../tool-fs/README.md)、[策略](../fs-policy/README.md)、[本地](../fs-local/README.md)与[沙箱化](../fs-sandbox/README.md)后端分别作为消费方与实现保持独立；能力 seam 决策负责该拆分（[基础](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)、[文件系统 seam](../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md)、[提供方拆分](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.md)、[事件门禁](../../../.agents/notes/implemented/architecture/2026-06-26-file-context-as-event-gate.md)）。

## 服务 API（`ctx.fs`）

后端继承 `FileSystem` 并实现八个原语。

| 成员 | 语义 |
|---|---|
| `resolve(path, opts?)` | 把路径解析为稳定的 `FsTarget`（不透明 `targetKey`、`displayPath`）。`opts.cwd` 是相对 `path` 解析所依据的基准（调用方提供其会话工作区；绝对路径忽略该值；省略时使用后端默认值），`opts.signal` 则中止后端往返。该方法是异步的，因为远程后端可能需要 I/O。经不同路径到达的同一文件必须产生相同 `targetKey`。 |
| `stat(target, signal?)` | 返回 `FsInfo` 元数据（`version`、`type`、可选 `size`）；目标不存在时返回 `undefined`。绝不返回内容。 |
| `lstat(path, opts?, signal?)` | 当最后一个路径组件是符号链接时，不跟随该组件，返回 `FsPathInfo` 元数据。该方法采用路径形态，使消费方能在 `resolve` 跟随仓库自有的符号链接进入目标前拒绝它。 |
| `readText(target, signal?)` | 把整个普通文本文件读取为一个解码后的字符串。负责普通文件检查、UTF-8 解码和二进制/NUL 拒绝（`FS_NOT_TEXT`）。 |
| `streamText(target, signal?)` | 为大文件按解码后的分片流式读取相同文本（跨分片 UTF-8 解码仍由此处负责）。 |
| `listDir(target, signal?)` | 按稳定名称顺序列出直接子项。返回条目名称、条目类型、解析后的子目标和低成本元数据（若可用则包括 `version`/文件 `size`）；绝不读取文件内容。缺失目标抛出 `FS_NOT_FOUND`，非目录抛出 `FS_NOT_DIRECTORY`，权限失败抛出 `FS_PERMISSION_DENIED`，其他后端 I/O 失败抛出 `FS_IO_ERROR`。损坏/消失的子项可以作为无元数据的 `other` 返回；子项权限/I/O 失败会使用相同结构化代码使整个列出操作失败。 |
| `writeText(target, content, expected?, signal?)` | 原子创建/替换。`expected` 是可选的：省略 ⇒ 无条件创建或覆盖；提供 `FsWriteIntent`（`createIfAbsent`/`replaceIfVersion`）⇒ 添加防护。 |
| `editText(target, edit, expected?, signal?)` | 字面量编辑。`expected` 是可选的：省略 ⇒ 无条件编辑当前内容；提供 `{ version }` ⇒ 添加防护，并在匹配之前校验。无论哪种情况，目标缺失都报告 `FS_STALE_VERSION`。应用和写入以原子方式完成，使用同一个变更临界区。 |

无论是否有版本防护，变更都在后端的每目标锁内运行，因此无条件写入/编辑仍是原子的；「无条件」只移除*版本*前置条件，不移除原子性。

## `fs/*` 策略事件

本包声明三个事件（见已生成的[事件目录](../../../docs/cordis-catalog/events.md)），使发出方（`@deepseek-ai/dsh-tool-fs`）和策略监听器（`@deepseek-ai/dsh-fs-policy`）共享词汇，而无需让发出方依赖策略插件。`fs/write-intent` 和 `fs/edit-intent` 是单槽决策 waterfall（瀑布式事件）（监听器完整决策，绝不调用 `next()`）；`fs/observed` 是发后即忘的记录事件。它们只携带 `dsh-fs` 词汇和一个不透明 `object` 参与者，不含面向模型的概念或 agent（智能体）/会话所有者结构。

## 提供方 seam，不是策略层

`ctx.fs` 有意接近 fsspec 风格的存储原语，比字节级 `cat`/`open` 高半层，因为它会解码文本并拒绝二进制，使策略层绝不接触原始字节。它负责 UTF-8 解码、二进制拒绝、原子写入和字面量编辑临界区。它**不**负责行窗口、编号行、渲染 footer 或已观察状态。已观察状态、编辑前读取和版本防护的写入/编辑属于插件（`@deepseek-ai/dsh-fs-policy`）通过提供可选防护而添加的策略，并非提供方行为，因此沙箱化/远程后端不会继承任何面向模型的观察策略。

`editText` 留在该 seam 上，不由策略层通过读取加写入组合，因为版本防护、字面量匹配和原子重写必须处于同一临界区内，才能正确归因错误并实现一方胜出/一方陈旧的并发；远程后端也可以将其实现为原生比较并编辑操作。

## 词汇

`FsTargetKey` / `FsVersion` 是带品牌的不透明 id（见[品牌 id Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-branded-ids.md)）；消费方不得解析 `targetKey` 或解释 `version`，只有 `displayPath` 用于模型/UI 输出。`FsWriteIntent` 是显式的防护写入意图（`createIfAbsent` 创建缺失目标，并以 `FS_NOT_OBSERVED` 拒绝现有目标；`replaceIfVersion` 只在观察版本上替换，否则为 `FS_STALE_VERSION`）；从 `writeText` 中省略该值就是第三种无条件状态。`FsPathInfo` 是可报告 `symlink` 的不跟随链接元数据形态，区别于目标级 `FsInfo`。失败会抛出 `FsError`（继承 `HarnessError`；见[结构化错误分类 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-11-structured-error-taxonomy.md)），并携带稳定的 `FsErrorCode`（`FS_NOT_FOUND`、`FS_NOT_DIRECTORY`、`FS_NOT_TEXT`、`FS_NOT_REGULAR_FILE`、`FS_PERMISSION_DENIED`、`FS_IO_ERROR`、`FS_STALE_VERSION`、`FS_NOT_OBSERVED`、`FS_AMBIGUOUS_EDIT`、`FS_EDIT_NOT_FOUND`、`FS_ABORTED`）；工具注册表公开 `{ name, code }`，并将其附在 `isError` 结果上。完整契约见 `src/types.ts`。

## 无 I/O deadline

文件系统原语接受可选 `AbortSignal`，但不会启动 deadline。本地 I/O 只能尽力取消：超时无法强制进行中的 `fsync` 或 `rename` 停止，因此固定 deadline 会承诺后端无法提供的控制能力。基于进程的发现功能拥有独立的超时契约。

## 模型体验

通过 `dsh-tool-fs` 间接产生影响；该消费方把提供方文本和错误渲染为有界且保留的文件系统工具结果。

#### KV Cache 影响

不会直接使缓存失效；上述消费方负责请求前缀的任何变化。

## 已知限制与暂缓事项

- **契约只支持文本**：后端以 `FS_NOT_TEXT` 拒绝二进制/非 UTF-8 内容；二进制安全操作是[工具 schema Agent Note](../../../.agents/notes/implemented/feature/2026-06-17-filesystem-tool-schemas.md)有意延期的工作。
- **只有八个原语**：没有删除、重命名/移动、复制或监视；`listDir` 只支持一层，递归、glob、分页和搜索不在范围内，见[目录列出 Agent Note](../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md)。
- **没有 I/O deadline**：取消只能在原语边界尽力执行。
- **先解析后操作使远程后端每次工具调用需要两次往返**：折叠或缓存解析由这种后端自行决定。
