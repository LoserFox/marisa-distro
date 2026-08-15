# @deepseek-ai/dsh-fs-local

[English](README.md) | 中文

`ctx.fs` 提供方 seam（[`@deepseek-ai/dsh-fs`](../fs)）的**本地文件系统实现**。它使用宿主文件系统支持八个 `FileSystem` 原语；将其作为插件加载会填充 `ctx.fs`。

```ts ignore-check
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'

await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
// ctx.fs uses the local backend; load @deepseek-ai/dsh-fs-policy for the
// freshness policy gate and @deepseek-ai/dsh-tool-fs to expose read/write/edit.
```

## 行为

- **`resolve(path, opts?)`**：相对 `path` 在调用方提供 `opts.cwd` 时以该值为基准解析（面向模型的工具会传入调用 agent（智能体）的会话 cwd；见[每会话 cwd Agent Note](../../../.agents/notes/implemented/architecture/2026-07-02-fs-per-session-cwd.md)），否则以 `config.cwd` 为基准（默认 `process.cwd()`）；绝对 `path` 会忽略两者。`opts.signal` 会在本地解析前后检查，远程同级后端则可以用它中止往返。`targetKey` 是文件的 `realpath`，因此经符号链接到达同一文件的两个输入路径会共享一个身份，写入/编辑落在链接目标上，同时保留链接。尚不存在的路径在父目录存在时使用 realpath 后的父目录加 basename；只有父目录无法解析时才回退到绝对路径。`displayPath` 是绝对但未经解析的路径。
- **`stat` / `lstat`**：返回目标元数据；目标不存在时返回 `undefined`。`stat` 为已解析目标报告 `FsInfo`（`version` 是由 bigint `dev:ino:size:mtimeNs:ctimeNs` 派生的不透明 token，`type` 为 `file`/`directory`/`other`，`size` 以字节计）；路径形态的 `lstat` 不跟随最后一个符号链接，报告 `FsPathInfo`，因此可以返回 `symlink`。两者都会在异步元数据探测前后检查取消，因此异步探测进行期间发生的中止会报告 `FS_ABORTED`，而非已失效的「不存在」结果。
- **`readText` / `streamText`**：只支持 UTF-8。`readText` 读取整个文件；`streamText` 按分片流式读取（跨分片解码），因此超大文件无需整体保存在内存中。两者都会拒绝无效 UTF-8、包含 NUL 字节的二进制样本（`FS_NOT_TEXT`）以及非普通文件目标。`read` 工具（`@deepseek-ai/dsh-tool-fs`）按大小决定调用哪个方法，并负责行窗口逻辑。
- **`listDir`**：按稳定的 `name.localeCompare()` 顺序列出一层目录。每个条目携带子项 basename、类型、解析后的子目标（`displayPath` 位于所列目录下，`targetKey` 是 realpath 身份）和低成本 stat 元数据（`version`，普通文件另有 `size`）。它绝不会打开或解码文件内容。缺失目标报告 `FS_NOT_FOUND`，文件/特殊文件目标报告 `FS_NOT_DIRECTORY`，已中止调用报告 `FS_ABORTED`，权限失败报告 `FS_PERMISSION_DENIED`，其他列出或子项元数据 I/O 失败报告 `FS_IO_ERROR`。损坏/消失的子项以无元数据的 `other` 返回，但解析子项时出现权限/I/O 失败会让整个列表以结构化 `FsError` 失败。
- **`writeText`**：原子写入。它会向排他打开的临时文件（`wx`、`0o600`）写入；该文件位于目标旁随机命名的私有暂存目录（`0o700`）内。完成写入和 fsync 后，以 rename 覆盖目标。现有文件的 mode 会保留，新文件默认为 `0o600`；Windows 上的新文件继承目标目录的 DACL，而替换会在写入前把目标 DACL 复制到空临时文件，并通过 `ReplaceFileW` 发布，使原访问策略得以保留（见 [Windows DACL 保留 Agent Note](../../../.agents/notes/implemented/bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md)）。`expected` 防护是可选（OPTIONAL）的：省略时无条件创建或覆盖；`createIfAbsent` 创建缺失目标并拒绝现有目标（`FS_NOT_OBSERVED`）；`replaceIfVersion` 只在观察到的版本上替换（目标缺失或版本不匹配均为 `FS_STALE_VERSION`）。
- **`editText`**：在同一原语之上执行原子式的字面量读取-修改-写入，并通过变更锁按目标串行化。`expected` 防护是可选（OPTIONAL）的：提供时，会在字面量匹配之前校验版本（陈旧编辑报告 `FS_STALE_VERSION`，绝不会针对较新内容报告 `FS_EDIT_NOT_FOUND`/`FS_AMBIGUOUS_EDIT`）；省略时，无条件编辑当前内容。无论哪种情况，目标缺失都报告 `FS_STALE_VERSION`。匹配时规范化为 LF，随后恢复文件主要的 CRLF/LF 风格；空 `oldString` / 零匹配报告 `FS_EDIT_NOT_FOUND`，未设置 `replace_all` 的多个匹配则报告 `FS_AMBIGUOUS_EDIT`。

包根目录的 SDK 接口包含默认/具名 `LocalFileSystem` 类和 `Config`。原始 I/O 位于 `src/fsio.ts`（不依赖 Cordis，单独进行单元测试）；`src/index.ts` 是轻量服务接线。

## 模型体验

通过 [`dsh-tool-fs`](../tool-fs/README.md) 间接产生影响；该消费方在有上限的保留结果中渲染本提供方带行窗口的 UTF-8 内容、变更确认和精确提供方消息，而版本、原子写入机制和目录元数据仍属内部实现。

#### KV Cache 影响

不会直接使缓存失效；具名消费方负责请求前缀的任何变化。

## 已知限制与暂缓事项

- **`config.cwd` 不是沙箱**：它是解析默认值，而非约束；绝对路径和 `..` 可以逃逸。请使用更严格的 `ctx.fs` 后端或 `tools/execute` waterfall（瀑布式事件）上的权限插件实施约束（见[能力 seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md#consequences)）。
- **覆盖会把整个旧文件读入内存**：只用于 UI diff；在大小阈值之上限制这次预读取的工作延期处理（`TODO(overwrite-diff-bound)`）。
- **版本 token 是 `mtimeMs:size`**：如果外部变更在文件系统时间戳粒度内保持两者不变，就能绕过陈旧防护。
- **`editText` 会把整个文件及编辑后的副本保存在内存中**：只有读取路径支持流式处理。
- **二进制检测不对称**：读取只对前 8192 字节执行 NUL 采样，编辑则扫描整个 buffer，因此 NUL 出现在后部的文件可以读取，但编辑会被拒绝。
- **每目标变更锁仅限进程内**：其他进程中的写入方只会被可选版本防护发现，绝不会被串行化。
