// 桌面伴侣在场信号（显示层）：心跳写面 + 过期语义。
// 契约：桌面端（外部 HTTP 消费者）周期性 POST /whale-girl/presence { online: true }
// 续命，退出/崩溃后心跳过期 → 网页端宠物自动恢复（崩溃安全，无需手动开关）。
// 零宿主依赖、可单测。
export const PRESENCE_TTL_MS = 45000 // 心跳有效窗口（桌面端每 15s 续命一次）

/** 心跳续命/下线：返回新的在场截止时刻（online=false 立即下线）。 */
export function pokePresence(companionUntil, nowMs, online = true) {
  return online ? nowMs + PRESENCE_TTL_MS : 0
}

/** 当前是否处于桌面伴侣在场窗口内（companionUntil 为截止时刻）。 */
export function companionOnline(companionUntil, nowMs) {
  return companionUntil > nowMs
}
