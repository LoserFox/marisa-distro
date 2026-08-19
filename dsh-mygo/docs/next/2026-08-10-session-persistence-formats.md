# dsh 会话持久化格式分析（jsonl / sqlite）— 供 mygo 多格式读取与字段提取

Status: 分析 + jsonl/sqlite/rdb 读取器已实现（2026-08-10）

## 0. 结论

- jsonl 与 sqlite 两套后端共享同一抽象契约（`PersistenceBackend` +
  `PersistenceCoordinator`）和同一事件信封（`SessionEvent`：
  `type/seq/time/data` + surface 条件字段），只是物理编码不同。
- 元数据（`SessionHeader`）与事件日志**分开存储**：jsonl 首行
  `type: "session"`；sqlite 存 `sessions` 表。事件词表版本
  `SESSION_FORMAT_VERSION = 0`（预发布、不迁移）；sqlite 物理 schema
  `SCHEMA_VERSION = 13`（版本不符拒绝，不迁移）。
- mygo 要“支持多种格式 + 自动提取字段”，建议做一个 **format-agnostic 的
  SessionReader 层**：header 解析 → 事件解码（含 chunk-run 解包）→ 字段
  投影；jsonl 直读、sqlite 查询、rdb（未来）适配其重编号语义。

## 1. 抽象契约（两后端共享）

`packages/session/session-persistence/src/coordinator.ts`：

```ts
interface PersistenceBackend<TornMarker = unknown> {
  name: string
  loadStored(id, signal?): Promise<StoredPrefix<TornMarker> | undefined>
  readStoredRevision(id, signal?): Promise<SessionPersistenceRevision | undefined>
  loadStoredFrom?(id, fromSeq, signal?): Promise<StoredSuffix | undefined>  // sqlite 实现，jsonl 省略
  appendBatch(meta, events, isMaterialized): Promise<void>                 // 懒物化 + 首批原子
  commitRepair(meta, tornMarker, closers): Promise<void>                   // 截断 torn tail + 合成 closers
  list(signal?): Promise<SessionHeader[]>
  close?(): Promise<void>
}
```

- revision 是 source-qualified：`<storeId>:incarnation:<incarnation>:revision:<revision>`；
  jsonl 用文件 stat 派生，sqlite 用 `sessions.revision` 每事务递增。
- `locate()`：jsonl 返回 transcript 绝对路径；sqlite 返回 `undefined`
  （无独立 per-session 文件）。
- 崩溃恢复：两后端都以最后一个 `turn/end` 为界，之后的 torn tail 截断并补
  合成 `turn/end { reason: { kind: 'interrupted' } }`。
- 懒物化：jsonl “无文件直到首次 append”；sqlite “sessions 行不存在 = 未
  物化”，首批 append 与物化原子提交。

## 2. JSONL 物理格式

目录布局（`format.ts`）：

```text
<root>/<projectKey(cwd)>/  ── `--<slug>--`，分隔符转 `-`，超长截断
  <encodeSegment(sessionId)>/  ── 全编码：安全字符保留，其余 `~XXXX`（防穿越）
    session.jsonl[.zstd]
```

文件内容：

1. 第 1 行 header：`{"type":"session","version":0,"id",...,"delegationDepth"}`
   （可选字段缺失即省略，禁用字段如 `sandboxMode` 显式报错）。
2. 之后每行一个 JSON 事件信封；surface 事件带 `sourceEventSeqs` /
   `surfaceOp`（`append` 或 `replace{start,end}`）。
3. **chunk 流打包**（`packChunkRuns`）：`assistant/chunk` 增量按 run 合并成
   `text-chunks` / `reasoning-chunks` / `tool-call-chunks` 存储行，带
   `seq0/time0` 锚点 + `dt` 增量数组 + `texts` 数组（token 边界保留）。
   读取必须 `decodeStorageRecord` 展开。
4. 压缩：默认 `zstd`（concatenated-frame 容器，追加/损坏恢复友好），可配
   `none`；文件后缀 `.jsonl.zstd` / `.jsonl`。真实样本：
   `~/.dsh/sessions/--home-rosen-workspace-dsh_dev--/session-d52800aa-*/session.jsonl.zstd`。
5. revision：`stat` 前后比对（读中写入检测），`fileRevision(identity)`。

## 3. SQLite 物理格式

`session-persistence-sqlite/src/schema.ts`（`SCHEMA_VERSION = 13`，
`application_id = 0x44534850`，STRICT 表，WAL 默认，owner-only 建库）：

```sql
persistence_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), store_id TEXT NOT NULL)
sessions (id TEXT PRIMARY KEY, version, created_at, cwd, parent_session,
          seed_length, origin, incarnation, revision, delegation_depth)
events   (seq, type, time, data TEXT, source_event_seqs TEXT, surface_op TEXT)
```

- `events` 与 `SessionEvent` 1:1：`data` 为 payload JSON，surface 元数据单独
  两列（JSON 编码或 NULL）。
- 支持 `loadStoredFrom`（按 `seq >= fromSeq` 后缀读），jsonl 无此能力。
- revision：`storeId:incarnation:<incarnation>:revision:<revision>`。
- 崩溃尾语义与 jsonl 一致（以最后一个 `turn/end` 为界截断）。

## 4. 事件词表（自动提取字段的目标面）

`packages/core/session/src/types.ts` `SessionEventMap`（+ 插件声明合并）：

| 类别 | 事件 | 提取价值 |
|---|---|---|
| surface | `user/message` / `assistant/message` / `tool/result` | 对话文本、助手最终消息 + `usage`、工具结果文本与 `meta` |
| 生命周期 | `turn/start` / `turn/end(reason)` / `step/start` / `step/end` | 轮次边界、结束原因、步骤轨迹 |
| 流 | `assistant/chunk`（打包成 chunks 行） | token 级重放（读取需解包） |
| 工具 | `tool/call`（`name` + 原始 `arguments` 串 + `callId`） | 工具调用轨迹 |
| 其他 | `todo/write`、`request/header`、`request/context`、`session/end-seed` | UI/请求快照、seed 边界 |

surface 语义：只有三种 surface 事件能带 `surfaceOp/sourceEventSeqs`；
`replace{start,end}` 来自压缩，读取时不能简单线性拼接。

## 5. mygo 落点建议

新增 `mygo/src/session-reader.ts`（format-agnostic）：

```ts
interface SessionReader {
  list(): Promise<SessionHeader[]>              // 按后端枚举
  read(id): Promise<{ header: SessionHeader; events: SessionEvent[] } | undefined>  // chunk 已解包
}
```

- jsonl reader：扫 project 目录 → session 目录 → 双后缀探测 → zstd 解帧 →
  逐行 parse → `decodeStorageRecord`。
- sqlite reader：`PRAGMA query_only` 打开 → `sessions`/`events` 查询 →
  `JSON.parse(data)`。
- rdb reader（未来）：适配三表事件存储的**稠密 seq 重映射**（上游 seq ≠
  库内 seq，rdb 已知技术债），或直接走官方 service。
- 字段提取：`extractFields(events)` 投影器——surface 文本、工具轨迹、
  `tool/result.meta`（渲染卡）、`usage`、轮次/步骤边界、`end-seed`。
- 与运行时关系：**优先复用宿主 service**（`ctx.sessionPersistence.inspect /
  load`，格式无关），文件直读作为离线/诊断通道；两条路径的事件信封一致。

## 6. 待验证点

- sqlite 后端是否也对 chunk 事件做 run 打包（schema 注释是 1:1 `data`
  JSON；实现需确认编码边界）。
- rdb 的 `assistant/chunk` 丢弃 + 稠密重编号对“自动提取字段”的影响
  （surface 语义可投影，但 seq 引用需重映射）。
- `node:zlib` zstd 在目标 Node 版本的可用性（0809 已用，无碍）。

## 7. 实现记录（2026-08-10）

- `mygo/src/session-reader.ts`：format-agnostic 读取器。
  - `JsonlSessionReader`：扫描项目/会话目录，`session.jsonl[.zstd]`
    直读；本地实现 zstd 多帧扫描（`scanZstdFrames` + `decompressZstd`，
    Node 一次只解第一帧）；`decodeStorageRecord` 本地展开
    `text-chunks` / `reasoning-chunks` / `tool-call-chunks`（与
    `@deepseek-ai/dsh-session/chunk-rows` 语义一致）。
  - `SqliteSessionReader`：`PRAGMA query_only` 打开，读
    `sessions`/`events`（按 `session_id` 过滤），事件 1:1。
  - `extractFields`：surface 文本、工具调用/结果、`tool/result.meta`
    卡片、usage、turn/step 边界、`session/end-seed`。
- 测试：`session-reader.spec` 4 用例（纯文本 + chunk-run 展开、zstd 双帧、
  目录 reader、sqlite 读写、字段投影）；全量 423 用例绿。
- 真数据验证：3080 的 session-d52800aa…（23407 事件，23305 个
  assistant/chunk 从打包 run 解出；抽出 5 个 visualize meta 卡）。
- 未做：rdb reader（三表 + 稠密 seq 重映射）、把读取器接进面板/服务。

## 8. RDB reader 实现记录（2026-08-10）

- `RdbSessionReader`：读 `t_sessions` / `t_events` / `t_session_events`
  三表；`buildSeqMap`（上游 seq → 稠密 seq，first-wins）重映射
  `sourceEventSeqs` 与 `replace{start,end}`；torn tail 语义与官方
  `scanRows` 一致（最后一个 `turn/end` 前的孔=提交区损坏报错，之后的孔/
  坏行=截断并返回 `tornFrom`）。
- 坑：事件查询列是 snake_case（`f_kind`…），`RdbEventRow` 接口是
  camelCase，首次实现 `JSON.parse(row.fData)` 全 undefined——SQL 加别名
  修复，测试先暴露（tornFrom=0）再定位。
- 测试：`session-reader.spec` 新增 RDB 用例（稠密重映射、replace 范围
  重映射、torn tail 截断）；全量 424 用例绿。
