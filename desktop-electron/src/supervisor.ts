/**
 * Backend supervision state machine — port of desktop/main.go supervise().
 *
 * Three stages: normal (full marisa composition) → minimal (harness web
 * template) → rescue (shell-owned page). Failures share one consecutive
 * counter: boot failure, exit without URL, timeout, and fast crash after a
 * published URL. Clean exits and user restarts reset it. The page-health
 * monitor is deliberately NOT ported: upstream removed it after the 90s
 * false-rescue regressions (commit b6db5b36) pending a redesign.
 *
 * Pure orchestration: spawning, killing, and UI hooks are injected, so the
 * whole ladder is unit-testable headless.
 */

import { exitFailureClass } from './backend-stdout.ts'
import {
  MAX_RESTART_WAIT_MS,
  NORMAL_FAILURES_BEFORE_MINIMAL,
  MINIMAL_FAILURES_BEFORE_RESCUE,
  RESTART_BACKOFF_MS,
  STABLE_RUN_MS,
  URL_TIMEOUT_MS,
  nextBackoff,
} from './times.ts'
import { applyBootProfile, clearRescueState, loadRescueState, parseBootFlags, saveRescueState, type BootStage } from './rescue-state.ts'
import { childExited } from './launcher.ts'

/** One live backend iteration handed back by the spawner. */
export interface ActiveBackend {
  pid: number
  /** Resolves with the readiness URL (or rejects on boot failure). */
  ready: Promise<URL>
  /** Resolves when the backend process exits (clean or not). */
  exit: Promise<{ abnormal: boolean; message: string }>
  /** Graceful + forced tree kill wired to the real child. */
  stop: () => Promise<void>
}

export interface SuperviseHooks {
  /** Force the next iteration's stage (already parsed from CLI + persisted state). */
  initialStage?: BootStage
  /** Start one backend with the current boot profile applied. */
  spawn: (stage: Exclude<BootStage, 'rescue'>) => Promise<ActiveBackend>
  /** Show the rescue page; resolves when the user completed recovery / retry. */
  enterRescue: (lastError: string) => Promise<void>
  /** Navigate the window to the backend URL. */
  navigate: (url: URL) => void
  log: (message: string) => void
  /** Milliseconds between stage transitions in tests; defaults to real timers. */
  delay?: (ms: number) => Promise<void>
  now?: () => number
}

export interface SuperviseRun {
  /** Resolves when the supervisor stops (application quit). */
  done: Promise<void>
  /** Request stopping the current backend; the supervisor relaunches it. */
  restartBackend: () => boolean
  /** Tray "retry full mode": reset stage to normal and clear the counter. */
  retryFullMode: () => void
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Run the supervision loop until `shouldStop()` turns true. Mirrors
 * supervise(): stage ladder, failure counter, backoff, persisted state.
 */
export async function supervise(hooks: SuperviseHooks, shouldStop: () => boolean): Promise<SuperviseRun> {
  const now = hooks.now ?? Date.now
  const delay = hooks.delay ?? sleep
  const log = hooks.log
  let stage: BootStage =
    hooks.initialStage ??
    (parseBootFlags() || (loadRescueState().stage === 'rescue' ? 'rescue' : 'normal'))
  if (hooks.initialStage === undefined && parseBootFlags() !== '') {
    log(`命令行强制启动阶段：${stage}`)
  } else if (hooks.initialStage === undefined && stage === 'rescue') {
    log('上次启动停在急救模式，本次直接进入')
  }
  let failures = 0
  let backoff = RESTART_BACKOFF_MS
  let lastBootError: string | null = null
  let userRestartRequested = false
  let retryFullRequested = false
  let active: { pid: number; stop: () => Promise<void> } | null = null
  let stopRequested = false

  const run: SuperviseRun = {
    done: (async () => {
      while (!shouldStop() && !stopRequested) {
        if (retryFullRequested) {
          retryFullRequested = false
          stage = 'normal'
          failures = 0
          backoff = RESTART_BACKOFF_MS
          lastBootError = null
          saveRescueState('normal', null)
          log('用户请求重试完整模式')
        }
        if (stage === 'rescue') {
          saveRescueState('rescue', lastBootError)
          await hooks.enterRescue(lastBootError ?? '')
          stage = 'normal'
          failures = 0
          backoff = RESTART_BACKOFF_MS
          lastBootError = null
          saveRescueState('normal', null)
          continue
        }
        applyBootProfile(stage)
        active = null
        let backend: ActiveBackend | null = null
        let failed = false
        try {
          backend = await hooks.spawn(stage as Exclude<BootStage, 'rescue'>)
          active = { pid: backend.pid, stop: backend.stop }
        } catch (err) {
          failures++
          lastBootError = err instanceof Error ? err.message : String(err)
          failed = true
          log(`dsh server 启动失败：${lastBootError}（${backoff}ms 后重试）`)
        }
        if (backend !== null) {
          const startedAt = now()
          const url = await backend.ready.then(
            u => u,
            err => { throw err },
          ).catch(err => {
            failures++
            lastBootError = err instanceof Error ? err.message : String(err)
            failed = true
            log(`dsh server 启动失败：${lastBootError}（${backoff}ms 后重试）`)
            return null
          })
          if (url !== null) {
            backoff = RESTART_BACKOFF_MS
            lastBootError = null
            saveRescueState('normal', null)
            hooks.navigate(url)
            log(`dsh server ready at ${url.href}`)
            const exit = await Promise.race([
              backend.exit,
              shouldStop() ? Promise.resolve({ abnormal: false, message: 'stopping' }) : new Promise<never>(() => {}),
            ])
            const ranFor = now() - startedAt
            const cls = exitFailureClass(exit.abnormal, userRestartRequested, ranFor, STABLE_RUN_MS)
            userRestartRequested = false
            if (cls.count) {
              failures++
              lastBootError = exit.message
              failed = true
              log(`dsh server 快速异常退出（计入失败）：${exit.message}`)
            } else if (cls.reset) {
              failures = 0
              log(`dsh server 异常退出（不计失败）：${exit.message}`)
            } else {
              log(`dsh server 退出（重启）`)
            }
          }
        }
        if (shouldStop() || stopRequested) break
        if (failed) {
          if (stage === 'normal' && failures >= NORMAL_FAILURES_BEFORE_MINIMAL) {
            stage = 'minimal'
            failures = 0
            backoff = RESTART_BACKOFF_MS
            saveRescueState('minimal', lastBootError)
            log(`完整模式连续 ${NORMAL_FAILURES_BEFORE_MINIMAL} 次启动失败，降级基础界面模式（无 Marisa 定制）：${lastBootError ?? ''}`)
          } else if (stage === 'minimal' && failures >= MINIMAL_FAILURES_BEFORE_RESCUE) {
            saveRescueState('rescue', lastBootError)
            log(`极简模式连续 ${MINIMAL_FAILURES_BEFORE_RESCUE} 次启动失败，进入急救模式：${lastBootError ?? ''}`)
            stage = 'rescue'
            failures = 0
            backoff = RESTART_BACKOFF_MS
            lastBootError = null
            continue
          }
        }
        await delay(backoff)
        backoff = nextBackoff(backoff)
      }
      clearRescueState()
      if (active !== null) await active.stop()
    })(),
    restartBackend: () => {
      if (active === null) return false
      userRestartRequested = true
      void active.stop()
      return true
    },
    retryFullMode: () => { retryFullRequested = true },
  }
  return run
}

export { URL_TIMEOUT_MS, MAX_RESTART_WAIT_MS, childExited }
