// 会话事件边沿判定：纯函数，从官方 SessionEvent 判定 turn 边沿（零宿主依赖，可单测）。
// 契约：
// - 输入是宿主 `session/event` 回调的第二个参数（append 日志条目，结构与官方
//   `@deepseek-ai/dsh-session` 的 SessionEvent 一致）：{ type, seq, time, data }。
// - 事件类型字段是 `type`（'turn/start' | 'turn/end' | 'step/start' | ...），
//   **不是** `kind`——历史上把 kind 当 type 用导致 turn 边沿永不匹配（sessionThink
//   不亮、回合完成无庆祝），见 bug-fix 决策记录 2026-08-10-session-event-field.md。
// - 返回 null（非 turn 事件/结构异常）或 { kind: 'start' | 'end', blocked }；
//   blocked 仅 turn/end 有意义：reason.kind === 'blocked'（回合被阻塞，等待用户
//   批准/权限），其余结束原因（completed/aborted/error/max-tokens/interrupted）false。
// - turn/start 恒返回 blocked: false（开始回合不处于等待态）。

/**
 * 从一条会话事件判定 turn 边沿。
 * @param {unknown} event 宿主 session/event 回调的事件参数
 * @returns {null | { kind: 'start' | 'end', blocked: boolean }} 非 turn 事件返回 null
 */
export function parseTurnEvent(event) {
  if (event === null || typeof event !== 'object') return null
  const type = typeof event.type === 'string' ? event.type : null
  if (type === 'turn/start') return { kind: 'start', blocked: false }
  if (type === 'turn/end') {
    const reason = typeof event.data === 'object' && event.data !== null ? event.data.reason : null
    const blocked = typeof reason === 'object' && reason !== null && reason.kind === 'blocked'
    return { kind: 'end', blocked }
  }
  return null
}
