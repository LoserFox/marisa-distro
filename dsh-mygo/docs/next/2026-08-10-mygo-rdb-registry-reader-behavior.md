# mygo 读持久化行为澄清：mygo-rdb 作为后端无关的注册表读取 extension

状态：行为澄清（未实现）。本文先固定“读持久化”到底读什么、在哪读、谁在读，
再定义后端无关的目标与 extension 的职责边界。

## 1. 定位（本质）

mygo-rdb 不是“会话日志阅读器”（那是 session-reader 的另一条线），而是
**基于 mygo-core 的 extension，负责从持久化后端读回 mygo 插件管理所需的事实**：
安装/卸载/更新历史、当前状态、代记录、审计与快照指针。目标是让
“mygo 读自己的持久化”这个行为与后端（json / sqlite / rdb-postgres）解耦。

## 2. 行为定义：mygo 到底要读什么

数据契约全部来自 `RegistryStore` 与 `RegistryPersistence`：

| 数据 | 位置 | 内容 | 对应“记录” |
|---|---|---|---|
| `status` 行 | storage-domain `plugin_registry_<profile>` 域 `status` 表 | `StatusRecord{v1}`：currentGen / previousGen / status（enabled/disabled/quarantined/shadowed/uninstalled）/ reason / snapshot 指针 / tools tombstone / provenance(origin, mountedAt) | 安装/卸载/停用/启用的指针级事实 |
| `gens` 行 | 同域 `gens` 表，键 `<id>/<gen>` | `GenerationRecord{v1}`：source / manifest / resolvedConfig | 更新历史（一代一条，不可变） |
| 审计 | `plugin-state/<profile>/audit.jsonl` | `AuditEntry{v1}`（class/plugin/actor/reason/details） | 运维事件流（mount/quarantine/…） |
| 快照 | `plugin-state/<profile>/snapshots/` | stateful 插件状态文件；由 `status.snapshot{path,bytes,sha256}` 索引 | 代际状态存档 |

读的时机与入口：
- **启动恢复 / 对账（recover）**：`store.listIds()` → 逐个 `readStatus(id)` +
  `readGenerations(id)`；未知版本 quarantine、损坏行 quarantine、孤儿代 GC、
  disabled 代 mountDeclared、跨进程恢复；
- **审计读取**：审计文件（面板/诊断）；
- **快照读取**：replace/恢复时按指针定位文件。

安装/卸载/更新“历史”没有单独的 events 表：它由 `gens`（每次 replace 追加一代）
与 `status`（指针 + uninstalled tombstone + provenance）共同还原，这是 mygo
恢复语义的权威来源。

## 3. 现状：后端耦合点

- `RegistryStore` 接口本身是后端无关的（内存实现 + sqlite 实现）；
- 生产实现 `SqliteRegistryStore` 直接操作 storage-domain 的 `KvTable`（域路由
  由 profile patch 决定：`plugin_registry_web → sqlite`，其他域 → json）；
- audit 与 snapshots 走文件路径（`stateRoot/<profile>/`）；
- 恢复/对账逻辑在 `LifecycleEngine` 里只依赖 `RegistryStore`，不 import 后端
  ——所以核心其实已经“窄依赖”，缺的是一个把 `RegistryStore` 语义映射到
  rdb(postgres) 的读取实现，以及后端选择/发现机制。

## 4. 后端无关的目标（先固定行为）

- 核心只面向一个窄的只读契约（下称 `RegistryReader`）：
  `listIds / readStatus / readGenerations / readAudit / locateSnapshot`，
  不感知 sqlite / json / postgres；
- **读写分离**：写仍由 mygo 核心负责（T3 顺序、持久化优先、事务边界不能交给
  extension）；extension 只负责“从任意后端读回”，可同时暴露只读面；
- 后端选择：按 profile 配置或能力声明发现（例如 host 已用 rdb-postgres 时，
  mygo-rdb 提供 reader 并声明 `service:mygo-registry-reader`），核心回退到
  内置 sqlite store；
- 读取语义必须等价：同一组操作（装/卸/更新/停用）落在 sqlite 与
  rdb(postgres) 后，恢复/面板看到一致的状态与代历史；损坏行/未知版本同样
  quarantine。

## 5. mygo-rdb extension 的职责

- 实现 `RegistryReader` 的 rdb(postgres) 版：`t_plugins`-风格表（或复用
  session-persistence-rdb 的 `t_*` 家族约定）存 status/gens 的 opaque JSON
  行；读语义与 `SqliteRegistryStore` 一致（键 = id / `<id>/<gen>`）；
- 审计与快照：audit 行可入表也可继续文件；先定只读面 = 读回 + 定位，写入
  仍走核心；
- 通过 mygo 依赖系统声明能力（dogfood）：`provides: service:mygo-registry-reader`，
  `depends: service:mygo-core`；
- 与现有 session-reader 并存：前者读会话日志（面板/助手用），本文的 reader
  读 mygo 自身注册表（恢复/对账/面板事实源），数据契约不同，后端无关的思路
  相同。

## 6. 验收行为（可测）

1. 同一插件操作序列分别写入 sqlite store 与 rdb(postgres) store，恢复后
   `plugins()` 与代历史一致；
2. mygo 核心在 rdb 后端下不 import pg/drizzle（依赖倒置成立）；
3. 损坏行在 rdb 后端同样被 quarantine，孤儿代同样 GC；
4. extension 的能力声明通过 mygo 依赖检查（`depends service:mygo-core`）。

## 7. 未决问题（下一轮定）

- rdb(postgres) 里表结构与 opaque JSON 行的具体约定（独立建表 vs 复用
  session-persistence-rdb 的 `t_*` 家族）；
- audit/snapshots 是否一并迁入 rdb（本文先只读回 + 定位）；
- 后端选择入口：profile 配置项 vs host 服务探测（建议 profile 配置优先，
  探测兜底）。
