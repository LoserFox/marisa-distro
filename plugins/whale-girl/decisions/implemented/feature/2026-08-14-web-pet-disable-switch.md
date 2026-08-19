# Decision: 网页端宠物渲染开关

Status: implemented

## Problem

桌面伴侣（dsh-desktop-pet，外部 HTTP 消费者）与网页端宠物并存时出现「两条大肥鱼」：同一 DSH profile 上同时渲染两个宠物。外部消费者无法卸载网页端宠物，用户也没有关闭入口。

## Decision

网页端宠物渲染由两个互补机制控制：

**手动开关（配置）**：体验层配置项 `enabled`（默认 `true`，settings 可配，热生效）。client `apply()` 挂载后先取配置判定：`enabled: false` 时不启动任何计时器/轮询/SSE 并立即卸载；挂载期 host 隐藏，禁用时不闪一下再消失。运行中热切换为 `false`（configRevision 变化 → `applyClientConfig`）立即卸载；重新启用需刷新页面。配置缺失（旧 Node half）视为启用，向后兼容。

**桌面伴侣在场心跳（自动）**：`POST /whale-girl/presence`（显示层写面，跨源校验 + body 上限，与 `/interact` 同级安全面，见 `src/presence.mjs`）。桌面端运行期间每 15s 续命（`{ online: true }`，TTL 45s），干净退出时发 `{ online: false }` 即时下线。`/state` 下发 `companionOnline` 布尔；在场期间网页端 client 隐藏宠物（`syncInert` 的 `companion` 分支），心跳过期后自动恢复显示——桌面端被杀/崩溃也不会让网页端永久隐藏。

Node half 端点（`/state` `/events` `/interact` `/config` `/assets`）不受影响——桌面伴侣等外部消费者照常读取账本与信号。

## Alternatives considered

**桌面伴侣启动时调用无状态隐藏端点（如 `POST /visibility { visible: false }` 直到显式恢复）。** 崩溃恢复差：桌面进程被 kill 后网页端宠物永久隐藏直到再次显式恢复；多消费者并发语义复杂。心跳 + TTL 变体解决该缺陷（本决策采用），无状态版本弃。

**仅在桌面伴侣侧隐藏（不动 whale-girl）。** 网页端宠物对普通浏览器用户仍渲染，问题未根治；关闭入口属于 whale-girl 的能力面。

## Consequences

- 双宠物场景默认自动消除：桌面端在线即隐藏网页端宠物，退出/崩溃后 ≤45s 自动恢复；手动 `enabled` 开关仍可用作兜底。
- `enabled` 与 presence 都是显示层控制，不影响账本、信号与外部消费契约（`docs/external-consumers.md` 已更新 presence 契约）。
- 重新启用 `enabled` 需刷新页面——已知边界，记录于 config 注释与本文。
