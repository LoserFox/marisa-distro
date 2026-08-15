# 文件系统

[English](filesystem.md) | 中文

可选的文件系统能力由四个部分组成：[dsh-fs](../../packages/fs/fs) 拥有 `ctx.fs` 以及带可选版本守卫的原子文本操作；[dsh-fs-local](../../packages/fs/fs-local) 实现本地磁盘后端；[dsh-fs-policy](../../packages/fs/fs-policy) 通过事件（而非服务）添加观测状态与新鲜度规则；[dsh-tool-fs](../../packages/fs/tool-fs) 直接执行面向模型的 read/write/edit 调用并渲染窗口。它位于 agent loop（智能体循环）主干之外；替换后端不会改变策略或工具 schema。

该模型是**加法式而非减法式**的：`ctx.fs` 本身就是一个完整、无约束的文本存储 seam（`write` 无条件创建或覆盖，`edit` 无条件替换字面文本）。`dsh-fs-policy` 是一个插件，通过裁决 `fs/*` waterfall（瀑布式事件）在上层*叠加*策略；移除它只会暴露裸提供方，而不会破坏工具，因为工具与策略之间没有方法级耦合。加载了 `dsh-tool-fs` 的部署通常也应加载 `dsh-fs-policy`，使默认行为为「先读后写/编辑」。

提供方源码：[`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts) 与 [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)。策略源码：[`packages/fs/fs-policy/src/types.ts`](../../packages/fs/fs-policy/src/types.ts)。读取渲染源码：[`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts)。

## 目标标识与元数据（提供方 seam）

每个操作首先将用户提供的路径解析为不透明的后端目标。消费方可以显示 `displayPath`，但禁止解析 `targetKey`（一个品牌化的不透明 id），也不得假设它是本地绝对路径。

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

后端拥有文件版本 token，即 write/edit 所守卫的新鲜度 token。策略插件存储它们以进行陈旧检查；消费方不解释其内容。两个 id 都是品牌化的不透明字符串。

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat` 返回元数据（从不返回内容），目标不存在时返回 `undefined`。`type` 让工具在读取前拒绝目录或特殊文件；`size` 让工具无需通过失败探测即可选择 `readText` 还是 `streamText`。

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat` 是路径级、不跟随链接的元数据原语。它接收路径而不是 `FsTarget`，因为 `resolve` 会有意跟随 symlink 以产生稳定标识；需要检查信任边界的消费方可以先调用 `lstat`，在解析前拒绝 `symlink`。

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir` 按稳定的名称顺序返回直接子条目。每个条目携带子项的 basename、类型、已解析目标，以及后端能报告时的廉价元数据。它禁止读取文件内容，因此 `size` 仅用于普通文件，`version` 来自元数据。已损坏或已消失的子项可以作为 `other` 返回且不带元数据；列出或解析子项元数据时的权限或后端 I/O 失败会以 `FS_PERMISSION_DENIED` 或 `FS_IO_ERROR` 使整个列表操作失败。

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## 写入与编辑守卫（提供方 seam）

`writeText` 和 `editText` 的版本守卫都是可选的：省略守卫时执行无条件的裸提供方变更，提供守卫时则执行相应的条件检查。`writeText` 的守卫是 `FsWriteIntent`：`createIfAbsent` 在目标缺失时创建，目标已存在时以 `FS_NOT_OBSERVED` 拒绝；`replaceIfVersion` 仅在目标存在且版本匹配时替换，否则报 `FS_STALE_VERSION`。省略 `expected` 则无条件创建或覆盖。联合类型本身只包含两种有守卫的意图；「无守卫」通过省略表达，因此 write 和 edit 共享同一个对称的 `expected?` 形状。

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or was undiffable (binary/non-UTF-8). LF-normalized storage text
   * (the diff basis), never a diff — a consumer computes the result-time
   * contextual diff from `before`/`after` when `before` is present, else falls
   * back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText` 是提供方级别的变更操作，而非在别处组合的 `read` 加 `write`。带守卫时，它在字面匹配之前先验证预期版本（因此对陈旧内容的编辑报 `FS_STALE_VERSION`，而非对更新内容的匹配失败）；不带守卫时，它编辑当前内容。无论哪种路径，它都应用替换并原子写入——将匹配、行尾处理、陈旧检查和原子替换保持在一个变更临界区内——目标缺失时两条路径都报 `FS_STALE_VERSION`。

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## fs 策略事件（提供方 seam 词汇）

`dsh-fs` 拥有三个事件，由工具分发、策略插件监听，使发射方（`dsh-tool-fs`）与监听方（`dsh-fs-policy`）共享词汇，而发射方无需依赖策略插件。它们只携带 `dsh-fs` 词汇加一个不透明的 `object` actor，不含面向模型的概念，也不含 agent/会话所有者结构。

`fs/write-intent` 与 `fs/edit-intent` 是**单槽决策 waterfall**：工具分发时附带一个默认 thunk（返回 `undefined`，即裸提供方），监听方完全决策而不调用 `next()`。该槽按注册顺序先到先得——由策略插件占据是部署约定，而非强制不变式。`fs/observed` 是一个即发即弃的记录事件，通过普通 `ctx.emit` 分发；其监听方必须是同步的、仅产生副作用，因为工具不会捕获该 emit 抛出的异常——抛出异常的监听方会导致工具为一次已经成功的变更返回 `isError` 结果。生成的目录在 [events.md](../cordis-catalog/events.md) 中展示确切签名。

## 执行上下文（策略插件）

策略插件只需要足够的执行上下文，通过收窄 `fs/*` 事件携带的不透明 `object` actor 来推导观测状态的所有者。`ToolExecution` 满足此形状，因此 `dsh-tool-fs` 将其执行对象作为 actor 直接传递，而无需让 `dsh-fs-policy` 导入工具、agent 或会话包。

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `@deepseek-ai/dsh-tools`' `ToolExecution` satisfies
 * this shape, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to this
 * shape without importing `dsh-tools`, `dsh-agent`, or `dsh-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsPolicyExec {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## 读取结果（消费方 / 读取渲染）

文本读取受行窗口、字节上限和后端限制约束。达到字节上限后，扫描仍会继续，但不再保留更多行，因此 `totalLines` 仍为精确值。面向模型的 `read` 工具渲染的结果纯粹是展示性的；不存在 `full`/`partial` 视图区分——授权基于新鲜度（工具直接用 stat 的版本 emit `fs/observed`），因此任何窗口化读取在文件未变时都能授权后续的 write/edit。读取窗口化与此结果形状位于 `dsh-tool-fs`（拥有读取操作的执行器）中，而非策略插件中。

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## 已观测文件状态（策略插件）

已观测状态是 `dsh-fs-policy` 插件内部持有的 `WeakMap<owner, Map<targetKey, { version }>>`。**当且仅当**所有者已读取、写入或编辑过该目标时（每次成功都 emit `fs/observed`），条目才存在，因此其存在本身就是先前观测的记录——没有单独的 `hasRead` 标志，也没有视图区分。所有者从事件 actor 推导（通常是 `exec.agent.session`），被视为不透明且从不读取。成功的 read/write/edit 会刷新该所有者对应的已记录版本；dispose（资源释放）时丢弃全部数据（HMR（热模块替换）安全）。

## 错误分类体系（提供方 seam）

文件系统故障使用稳定的 `FsErrorCode` 字符串，由 `FsError`（`HarnessError`）携带。工具注册表在错误结果上保留 `{ name, code }`，使重试、权限和 UI 层可以按 code 分支而无需解析文本。

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry surfaces `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

目录列表使用 `FS_NOT_DIRECTORY`、`FS_PERMISSION_DENIED` 与 `FS_IO_ERROR` 区分已存在但并非目录的目标、被拒绝的列表操作和意外的后端 I/O 失败。`FS_SANDBOX_DENIED` 是强制执行沙箱的后端（`dsh-fs-sandbox`）所作的策略拒绝——模式边界拒绝了写入/编辑——与 `FS_PERMISSION_DENIED`（宿主内核拒绝）不同。`FS_NOT_OBSERVED` 表示策略插件没有此所有者的先前观察记录（或 `createIfAbsent` 遇到了现有文件）。`FS_STALE_VERSION` 表示后端版本不再与观察到的版本匹配（或编辑操作遇到缺失目标）。新鲜度授权没有部分/完整之分，因此不存在 `FS_PARTIAL_OBSERVATION`。

## 服务与插件

`FileSystem`（`ctx.fs`，abstract）拥有提供方原语：`resolve`、`stat`、`lstat`、`readText`、`streamText`、`listDir`、`writeText` 与 `editText`。`dsh-fs-policy` **不注册服务**——它是一个通过 `fs/*` 事件门禁添加策略的插件：对写入/编辑意图 waterfall 作出决策（提供 `createIfAbsent`/`replaceIfVersion`/`{ version }`，或抛出 `FS_NOT_OBSERVED`），并在 `fs/observed` 上记录。执行器是 `dsh-tool-fs`：它通过 `ctx.fs` 读取/写入/编辑，分发 waterfall，并 emit 记录事件。生成的 wiring 目录在 [services.md](../cordis-catalog/services.md#ctxfs--filesystem-abstract-seam) 中展示确切的 `ctx.fs` 签名。
