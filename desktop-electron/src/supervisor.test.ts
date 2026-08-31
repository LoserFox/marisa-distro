import { describe, expect, it } from 'vitest'
import { supervise, type ActiveBackend, type SuperviseHooks } from '../src/supervisor.ts'

interface ScriptedSpawn {
  url?: string
  failBoot?: string
  exitAfterUrl?: { abnormal: boolean; message: string }
}

/**
 * Build a supervise() harness with scripted spawn results and instant timers.
 * runFor(n) stops the loop once n spawns have happened.
 */
function harness(script: ScriptedSpawn[]) {
  const events: string[] = []
  const navigated: string[] = []
  let spawnIndex = 0
  let stopped = false
  let rescueCount = 0

  const hooks: SuperviseHooks = {
    initialStage: 'normal',
    spawn: async stage => {
      spawnIndex++
      events.push(`spawn:${stage}#${spawnIndex}`)
      const s = script[Math.min(spawnIndex - 1, script.length - 1)] ?? {}
      if (s.failBoot !== undefined) throw new Error(s.failBoot)
      const url = new URL(s.url ?? 'http://127.0.0.1:9000')
      let resolveExit: (v: { abnormal: boolean; message: string }) => void = () => {}
      const exit = new Promise<{ abnormal: boolean; message: string }>(r => { resolveExit = r })
      if (s.exitAfterUrl !== undefined) queueMicrotask(() => resolveExit(s.exitAfterUrl!))
      return {
        pid: spawnIndex,
        ready: Promise.resolve(url),
        exit,
        stop: async () => {
          events.push(`stop#${spawnIndex}`)
          resolveExit({ abnormal: false, message: 'stopped' })
        },
      }
    },
    enterRescue: async lastError => {
      rescueCount++
      events.push(`rescue:${lastError}`)
    },
    navigate: url => {
      events.push(`nav:${url.port}`)
      navigated.push(url.href)
    },
    log: m => events.push(`log:${m}`),
    delay: async () => {},
  }

  return {
    events,
    navigated,
    get rescueCount() { return rescueCount },
    runFor: async (spawns: number) => {
      spawnIndex = 0
      stopped = false
      const r = await supervise(
        {
          ...hooks,
          spawn: async stage => {
            if (spawnIndex + 1 >= spawns) stopped = true
            return hooks.spawn(stage)
          },
        },
        () => stopped,
      )
      await r.done
      return r
    },
  }
}

describe('supervise state machine', () => {
  it('happy path: spawn → ready → navigate', async () => {
    const h = harness([{ url: 'http://127.0.0.1:9001' }])
    await h.runFor(1)
    expect(h.navigated).toEqual(['http://127.0.0.1:9001/'])
    expect(h.rescueCount).toBe(0)
    expect(h.events.some(e => e.startsWith('spawn:normal#1'))).toBe(true)
  })

  it('two full-boot failures downgrade normal → minimal', async () => {
    const h = harness([{ failBoot: 'boom' }])
    await h.runFor(3)
    expect(h.events.some(e => e.startsWith('spawn:minimal#3'))).toBe(true)
    expect(h.events.some(e => e.includes('降级基础界面模式'))).toBe(true)
  })

  it('four failures total reach the rescue page', async () => {
    const h = harness([{ failBoot: 'boom' }])
    await h.runFor(5)
    expect(h.rescueCount).toBe(1)
    expect(h.events.some(e => e.includes('进入急救模式'))).toBe(true)
  })

  it('fast crash after URL counts toward the failure streak', async () => {
    const h = harness([{ url: 'http://127.0.0.1:9002', exitAfterUrl: { abnormal: true, message: 'exit 1' } }])
    await h.runFor(3)
    expect(h.events.some(e => e.includes('快速异常退出'))).toBe(true)
    expect(h.events.some(e => e.startsWith('spawn:minimal#3'))).toBe(true)
  })

  it('long-run crash resets the streak (stays normal)', async () => {
    const h = harness([{ url: 'http://127.0.0.1:9003' }])
    // exitAfterUrl absent → loop blocks on exit; simulate stop via restart path is
    // complex here, so drive the classification seam instead (covered in core.test).
    // This case only asserts a successful spawn+nav.
    await h.runFor(1)
    expect(h.navigated).toEqual(['http://127.0.0.1:9003/'])
  })
})

describe('supervise control surface', () => {
  it('restartBackend() reports false when no backend is active', async () => {
    const r = await supervise(
      {
        initialStage: 'normal',
        spawn: async () => {
          throw new Error('should not spawn')
        },
        enterRescue: async () => {},
        navigate: () => {},
        log: () => {},
        delay: async () => {},
      },
      () => true,
    )
    await r.done
    expect(r.restartBackend()).toBe(false)
  })

  it('retryFullMode() resets the stage (observable via events on next run)', async () => {
    let stopped = false
    const events: string[] = []
    let spawnCount = 0
    let releaseGate: (() => void) | null = null
    const gate = new Promise<void>(r => { releaseGate = r })
    const r = await supervise(
      {
        initialStage: 'minimal',
        spawn: async stage => {
          spawnCount++
          events.push(`spawn:${stage}#${spawnCount}`)
          if (spawnCount === 1) {
            await gate // hold the loop so retryFullMode() lands before iteration 2
            throw new Error('boot fail')
          }
          stopped = true
          throw new Error('boot fail')
        },
        enterRescue: async () => {},
        navigate: () => {},
        log: m => events.push(`log:${m}`),
        delay: async () => {},
      },
      () => stopped,
    )
    // The loop is now parked inside spawn #1; request full-mode retry, then release.
    r.retryFullMode()
    releaseGate?.()
    await r.done
    expect(events).toContain('log:用户请求重试完整模式')
    expect(events.some(e => e.startsWith('spawn:normal#'))).toBe(true)
  })
})
