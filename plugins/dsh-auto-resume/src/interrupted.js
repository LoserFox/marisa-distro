/**
 * Interrupted-session detection shared by the client plugin and its tests.
 *
 * A session is "interrupted and resumable" when it is not running, still open,
 * and carries evidence that the last turn ended abnormally: an unfinished
 * partial stream, an assistant node flagged interrupted (user stop or repair
 * after a crash), a max-tokens turn, or an open turn-timing entry.
 */

/** Whether the session shows evidence of an aborted last turn. */
export function isInterrupted(session) {
  if (session === undefined || session === null) return false
  if (session.running || session.removed) return false
  if (session.openState !== 'open') return false
  if (session.partial !== null && session.partial !== undefined) return true
  const nodes = session.nodes
  if (Array.isArray(nodes) && nodes.length > 0) {
    const last = nodes[nodes.length - 1]
    if (last !== undefined && last !== null) {
      if (last.kind === 'assistant' && last.interrupted === true) return true
      if (last.kind === 'turn-max-tokens') return true
    }
  }
  const timings = session.turnTimings
  if (timings !== undefined && timings !== null && typeof timings.keys === 'function' && timings.size > 0) {
    let lastTurn = -1
    for (const turn of timings.keys()) if (turn > lastTurn) lastTurn = turn
    const t = timings.get(lastTurn)
    if (t !== undefined && t.endTime === undefined) return true
  }
  return false
}
