/**
 * Supervision constants — desktop/main.go + rescue_health.go values.
 */

/** Max wait for the `dsh web: ` readiness line (120s: tsx cold start + full profile load needs 30-60s+). */
export const URL_TIMEOUT_MS = 120_000
/** First restart backoff (desktop/main.go restartBackoff). */
export const RESTART_BACKOFF_MS = 1_000
/** Restart backoff cap (maxRestartWait). */
export const MAX_RESTART_WAIT_MS = 30_000
/** Grace period between graceful and forced tree kills (serverStopGrace). */
export const SERVER_STOP_GRACE_MS = 5_000
/** normal → minimal downgrade after this many consecutive boot failures. */
export const NORMAL_FAILURES_BEFORE_MINIMAL = 2
/** minimal → rescue escalation after this many consecutive minimal failures. */
export const MINIMAL_FAILURES_BEFORE_RESCUE = 2
/** A post-URL crash within this window counts toward the failure streak (stableRunTime). */
export const STABLE_RUN_MS = 120_000

/** Exponential backoff: double from RESTART_BACKOFF_MS up to MAX_RESTART_WAIT_MS. */
export function nextBackoff(current: number): number {
  if (current >= MAX_RESTART_WAIT_MS) return MAX_RESTART_WAIT_MS
  const doubled = current * 2
  return Math.min(doubled, MAX_RESTART_WAIT_MS)
}
