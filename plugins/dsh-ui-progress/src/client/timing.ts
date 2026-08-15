/**
 * Shared timing helpers for the progress surfaces: compact duration
 * formatting and a ticking clock for the live elapsed/ETA readouts. The
 * clock is a component-internal behavioral hook — it subscribes to nothing
 * external (no session or framework state), so it stays inside presentation
 * components. The first-token anchor hook stamps the live token-rate window
 * the same way: from the snapshot's partial alone.
 */
import { useEffect, useRef, useState } from 'react'
import type { PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'
import { liveTokenRate, weightedPartialChars } from './token-rate.ts'

/**
 * Compact duration: one decimal always under a minute (17.0s, 3.4s), folded
 * whole-second steps from the minute mark on (1m0s, 2m42s). The fold check
 * uses the rounded tenth so 59.96s reads 1m0s instead of 60.0s.
 * @param ms - duration in milliseconds.
 * @returns display string.
 */
export function formatElapsed(ms: number): string {
  const tenths = Math.round(ms / 100) / 10
  if (tenths < 60) return `${tenths.toFixed(1)}s`
  const whole = Math.round(tenths)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/**
 * Whole-second ETA: 45s / 2m42s / 5h / 5h20m. An estimate, so no sub-second
 * precision; hours kick in at the hour mark.
 * @param ms - remaining-time estimate in milliseconds.
 * @returns display string.
 */
export function formatEta(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1_000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`
}

/**
 * Ticking clock: Date.now() refreshed at the rate the elapsed display
 * needs — every 100ms while the elapsed since `start` is under a minute
 * (0.1s steps), once per second from the minute mark on (folded 1s steps).
 * Frozen when disabled or anchorless; callers gate reads on the same flags.
 * The effect ticks once immediately on enable so a resumed readout is not
 * stale for up to one interval.
 * @param enabled - whether the clock should tick.
 * @param start - epoch-ms anchor the elapsed is measured from (turn start,
 *   call time); null disables the clock.
 * @returns the latest epoch-ms timestamp.
 */
export function useNow(enabled: boolean, start: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled || start === null) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = (): void => {
      if (!alive) return
      setNow(Date.now())
      // 0.1s steps below a minute, folded 1s steps from the minute mark on.
      const delay = Date.now() - start < 60_000 ? 100 : 1_000
      timer = setTimeout(tick, delay)
    }
    tick()
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [enabled, start])
  return now
}

/**
 * First-visible-token anchor for the live token-rate window: the epoch-ms
 * instant the current streaming partial first carried estimated tokens
 * (one render behind the real chunk event at most — a live readout does not
 * need event-exact boundaries). Stamped once per (turn, step): a new step's
 * partial re-opens the decode window, a null partial or a stopped turn
 * closes it.
 * @param running - whether the session turn is running.
 * @param partial - the live streaming partial (snapshot-derived).
 * @returns the anchor, or null while no token stream is live.
 */
export function useFirstTokenAt(running: boolean, partial: PartialAssistant | null): number | null {
  const [anchor, setAnchor] = useState<number | null>(null)
  const key = partial === null ? null : `${partial.turn}\u0000${partial.step}`
  const hasTokens = partial !== null && weightedPartialChars(partial) > 0
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (!running || key === null || !hasTokens) {
      lastKey.current = null
      setAnchor(null)
      return
    }
    if (lastKey.current !== key) {
      lastKey.current = key
      setAnchor(Date.now())
    }
    // Same key with live tokens: keep the existing anchor (stamped once).
  }, [running, key, hasTokens])
  return anchor
}

/**
 * Sliding-window cadence of the live token-rate readout: the displayed tok/s
 * is the average over the most recent window of this length, refreshed once
 * per window — chunk-level arrivals are smoothed into a stable figure that
 * changes at most every window instead of on every stream chunk.
 */
export const TOKEN_RATE_WINDOW_MS = 1_000

/**
 * Sliding-window token rate for the live chip: the average estimated tokens
 * gained per second over the most recent window, recomputed once per window
 * and only when tokens actually arrived (a fully empty window keeps the
 * previous reading so a paused stream does not flicker to zero). A fresh
 * anchor re-opens the window; disabling clears the reading.
 * @param enabled - whether the stream is live (running, no pending wait, anchor set).
 * @param anchor - first-visible-token epoch ms (window origin for the first sample).
 * @param tokens - current estimated streamed tokens (latest per-render value).
 * @param windowMs - smoothing window; defaults to {@link TOKEN_RATE_WINDOW_MS}.
 * @returns the windowed tokens/sec, or null before the first full window or while disabled.
 */
export function useWindowedTokenRate(
  enabled: boolean,
  anchor: number | null,
  tokens: number,
  windowMs: number = TOKEN_RATE_WINDOW_MS,
): number | null {
  const [rate, setRate] = useState<number | null>(null)
  const windowStartRef = useRef<{ time: number; tokens: number } | null>(null)
  const tokensRef = useRef(tokens)
  tokensRef.current = tokens

  useEffect(() => {
    if (!enabled || anchor === null) {
      windowStartRef.current = null
      setRate(null)
      return
    }
    if (windowStartRef.current === null) {
      windowStartRef.current = { time: Date.now(), tokens: tokensRef.current }
    }
    const timer = setInterval(() => {
      const start = windowStartRef.current
      if (start === null) return
      const now = Date.now()
      const gained = tokensRef.current - start.tokens
      if (gained > 0) {
        setRate(liveTokenRate(gained, start.time, now))
      }
      // Advance the window baseline either way so the average always covers
      // the most recent window.
      windowStartRef.current = { time: now, tokens: tokensRef.current }
    }, windowMs)
    return () => { clearInterval(timer) }
  }, [enabled, anchor, windowMs])

  return rate
}
