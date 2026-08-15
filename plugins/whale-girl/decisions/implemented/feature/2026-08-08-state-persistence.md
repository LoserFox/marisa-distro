# Decision: 宠物状态持久化（<dshHome>/data/dsh-pet/state.json）

Status: implemented

## Problem

宠物状态（饥饿/心情/等级/经验）只存在于 Node half 进程闭包内：disable/enable、web 重启、宿主机重启都会清零回初始态。桌面宠物的状态连续性是其核心体验，重启丢失不可接受。

## Decision

- **落盘位置**：`<dshHome>/data/dsh-pet/state.json`（`DSH_HOME` 环境变量优先，回退 `resolve(import.meta.dirname, '../../..')`——安装路径恒为 `<dshHome>/plugins/<publisher>/<name>`）。**不放插件目录**：uninstall 删除插件目录、reinstall 整目录覆盖，状态必丢；`data/` 是 registry 领地之外的新顶层目录。
- **写入纪律**：同目录 `.tmp` + `rename` 原子提交；1s 防抖合并连续写；`ctx.effect` disposer 里清除定时器并做末次 flush（disable/卸载前保留最终状态）。写失败静默（不阻塞插件，状态仅本次运行有效）。
- **只在 feed/play 时落盘**：衰减可由 `updatedAt` 在重载时重算（`tick(saved, now)` 按真实墙钟补衰减），无需随轮询写盘。
- **加载纪律**：`normalizeState`（src/persistence.mjs 纯函数）合并 `INITIAL_STATE`、数值 clamp、`level` 按 `xp` 重算（容忍手改/旧版本越界与不一致）；缺失/损坏回退初始态。
- **on-disk 格式**：`{ hunger, mood, level, xp, updatedAt }`（pet-state 状态字段的 JSON 序列化）。

## Alternatives considered

**用官方 ctx.storage 子系统。** web profile 是否接线 json backend 无证据，且对宠物是过重依赖——不用。

**放 `<dshHome>/plugins/vlln/dsh-pet/` 内。** uninstall/reinstall 即丢，正是要解决的问题——不用。

**每次轮询都写盘。** /state 每 3s 被访问，写盘频率过高；衰减可重算，无需持久化——只在 feed/play 落盘。

## Consequences

- 宠物状态跨 disable/enable、web 重启、宿主机重启保持（衰减期间正确补算）。
- 写盘是尽力而为：失败仅损失本次运行内的状态变更，不引入故障点。
- 已知边界：并发多进程（多 web 实例）同时写同一 state.json 时无锁（.tmp+rename 保证原子性但不保证最后写者正确性）——单实例部署下不构成问题，多实例部署需另行决策。
