import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IDisposable, IPty } from 'node-pty'
import { LocalPtySession } from '@deepseek-ai/dsh-pty-local/src/session.ts'
import type { ResolvedConfig } from '@deepseek-ai/dsh-pty-local/src/config.ts'
import type { ProcessIdentity, ProcessInspector } from '@deepseek-ai/dsh-pty-local/src/process-inspector.ts'
import type { PtySendOperation, PtySessionStatus, PtySignal } from '@deepseek-ai/dsh-pty'

class FakeTerminal {
  pid = 123
  cols = 80
  rows = 24
  process = 'bash'
  handleFlowControl = false
  writes: string[] = []
  kills: string[] = []
  throwWrite = false
  throwKill = false
  autoExitOnKill = true
  private dataListeners = new Set<(data: string) => void>()
  private exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()

  readonly onData = (listener: (data: string) => void): IDisposable => {
    this.dataListeners.add(listener)
    return { dispose: () => this.dataListeners.delete(listener) }
  }

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void): IDisposable => {
    this.exitListeners.add(listener)
    return { dispose: () => this.exitListeners.delete(listener) }
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data)
  }

  emitExit(exitCode = 0, signal?: number): void {
    for (const listener of this.exitListeners) listener({ exitCode, ...signal !== undefined ? { signal } : {} })
  }

  write(data: string): void {
    if (this.throwWrite) throw new Error('write failed')
    this.writes.push(data)
  }

  kill(signal?: string): void {
    if (this.throwKill) throw new Error('kill failed')
    this.kills.push(signal ?? 'SIGHUP')
    if (this.autoExitOnKill) this.emitExit(0, signal === 'SIGKILL' ? 9 : 15)
  }

  resize() {}
  clear() {}
  pause() {}
  resume() {}

  asPty(): IPty {
    return this
  }
}

class FakeInspector implements ProcessInspector {
  pgid: number | undefined = 456
  waiting = false
  members: ProcessIdentity[] = []
  alive = new Set<number>()
  groups: Array<[number, PtySignal]> = []
  processes: Array<[number, 'SIGTERM' | 'SIGKILL']> = []
  throwGroup = false
  throwProcess = false
  removeOnSignal = true

  foregroundPgid() { return this.pgid }
  isStdinWaiting() { return this.waiting }
  processTree() { return this.members }
  isAlive(identity: ProcessIdentity) { return this.alive.has(identity.pid) }
  signalGroup(pgid: number, signal: PtySignal) {
    if (this.throwGroup) throw new Error('group failed')
    this.groups.push([pgid, signal])
  }
  signalProcess(identity: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL') {
    if (this.throwProcess) throw new Error('process raced')
    this.processes.push([identity.pid, signal])
    if (this.removeOnSignal) this.alive.delete(identity.pid)
  }
}

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    backendType: 'shell', shellPath: '/bin/bash', shellArgs: [], rows: 24, cols: 80,
    scrollbackLines: 10, scrollbackMaxBytes: 128, maxReadBytes: 64,
    pollIntervalMs: 10, exactProbeAfterMs: 20, idleSilenceMs: 50, handoffGraceMs: 10, timeoutMs: 100,
    disposeGraceMs: 20,
    ...overrides,
  }
}

afterEach(() => { vi.useRealTimers() })

async function initialize(session: LocalPtySession, terminal: FakeTerminal): Promise<void> {
  const pending = session.initialize()
  terminal.emitData('\x1b]133;D;0\x07dsh> ')
  await vi.advanceTimersByTimeAsync(10)
  await pending
}

describe('LocalPtySession readiness and output', () => {
  it('captures prompt MOTD, writes submit explicitly, and settles exact stdin waits', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)
    expect(session.motd).toBe('dsh> ')

    inspector.waiting = true
    const operation = session.startSend({ text: 'python3', submit: true })
    expect(terminal.writes).toEqual(['python3', '\r'])
    inspector.pgid = 789
    terminal.emitData('Python\r\n>>> ')
    await vi.advanceTimersByTimeAsync(20)
    expect(await operation.done).toMatchObject({ waitReason: 'stdin_read', viewport: 'Python\n>>> ', sessionStatus: { kind: 'running' } })
    expect(operation.cancel()).toBe(false)
  })

  it('does not reuse a pre-write stdin wait as post-write readiness', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)

    inspector.waiting = true
    const operation = session.startSend({ text: 'echo ready', submit: true })
    let settled = false
    void operation.done.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(20)
    expect(settled).toBe(false)

    inspector.waiting = false
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(false)
    inspector.waiting = true
    await vi.advanceTimersByTimeAsync(10)
    expect((await operation.done).waitReason).toBe('stdin_read')
  })

  it('tracks a pre-write wait exit before exact probing begins', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config({
      exactProbeAfterMs: 50,
      idleSilenceMs: 100,
      timeoutMs: 200,
    }))
    await initialize(session, terminal)

    inspector.waiting = true
    const operation = session.startSend({ text: 'fast command', submit: true })
    let settled = false
    void operation.done.then(() => { settled = true })
    inspector.waiting = false
    await vi.advanceTimersByTimeAsync(10)
    inspector.waiting = true
    await vi.advanceTimersByTimeAsync(30)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(true)
    expect((await operation.done).waitReason).toBe('stdin_read')
  })

  it('distinguishes inferred idle, timeout, exit signal, and operation reads', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)
    inspector.pgid = undefined

    const inferred = session.startSend({ text: 'sleep', submit: false })
    terminal.emitData('working')
    expect(inferred.readOutput()).toEqual({ delta: 'working', truncated: false })
    await vi.advanceTimersByTimeAsync(60)
    expect((await inferred.done).waitReason).toBe('inferred_idle')

    const timeout = session.startSend({ text: 'blocked', submit: false })
    await vi.advanceTimersByTimeAsync(40)
    terminal.emitData('.')
    await vi.advanceTimersByTimeAsync(40)
    terminal.emitData('.')
    await vi.advanceTimersByTimeAsync(30)
    expect((await timeout.done).waitReason).toBe('timeout')

    const exiting = session.startSend({ text: 'exit', submit: true })
    terminal.emitExit(7, 9)
    expect(await exiting.done).toMatchObject({ waitReason: 'session_exit', sessionStatus: { kind: 'exited', exitCode: 7, signal: 'SIGKILL' } })
    expect(() => session.startSend({ text: '', submit: false })).toThrow('has exited')
  })

  it('cancels with foreground-group SIGINT, observes AbortSignal, and contains write failures', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)

    const controller = new AbortController()
    const operation = session.startSend({ text: 'sleep', submit: true, signal: controller.signal })
    expect(() => session.startSend({ text: 'again', submit: true })).toThrow('active send')
    controller.abort()
    expect(inspector.groups).toContainEqual([456, 'SIGINT'])
    expect(terminal.writes).not.toContain('\x03')
    terminal.emitData('\x1b]133;D;130\x07dsh> ')
    await vi.advanceTimersByTimeAsync(10)
    await operation.done

    const aborted = new AbortController()
    aborted.abort()
    expect(() => session.startSend({ text: '', submit: false, signal: aborted.signal })).toThrow('aborted before write')

    terminal.throwWrite = true
    const failed = session.startSend({ text: 'x', submit: false })
    await expect(failed.done).rejects.toThrow('write failed')
    const failedInternal = failed as unknown as { append(text: string): void; fail(error: unknown): void }
    failedInternal.append('ignored')
    failedInternal.fail(new Error('ignored'))
  })

  it('handles startup exit, unknown exit signals, cancel-write failure, and stale polls', async () => {
    vi.useFakeTimers()
    const startupTerminal = new FakeTerminal()
    const startup = new LocalPtySession(startupTerminal.asPty(), new FakeInspector(), config())
    const initializing = startup.initialize(new AbortController().signal)
    startupTerminal.emitExit(1)
    await expect(initializing).rejects.toThrow('exited during startup')
    expect(startup.status()).toEqual({ kind: 'exited', exitCode: 1, signal: null })

    const terminal = new FakeTerminal()
    const session = new LocalPtySession(terminal.asPty(), new FakeInspector(), config())
    await initialize(session, terminal)
    const operation = session.startSend({ text: '', submit: false })
    const operationInternal = operation as unknown as {
      append(text: string): void
      settle(reason: 'timeout', status: PtySessionStatus, inherited: boolean): void
    }
    operationInternal.append('')
    const sessionInternal = session as unknown as {
      pollReadiness(operation: PtySendOperation): void
      interrupt(operation: PtySendOperation): void
      statusValue: PtySessionStatus
      appendOutput(text: string): void
    }
    sessionInternal.appendOutput('')
    sessionInternal.pollReadiness({} as PtySendOperation)
    sessionInternal.interrupt({} as PtySendOperation)
    sessionInternal.statusValue = { kind: 'exited', exitCode: 2, signal: null }
    sessionInternal.pollReadiness(operation)
    await operation.done
    operationInternal.settle('timeout', { kind: 'running' }, false)

    const unknownTerminal = new FakeTerminal()
    const unknown = new LocalPtySession(unknownTerminal.asPty(), new FakeInspector(), config())
    unknownTerminal.emitExit(1, 999)
    expect(unknown.status()).toEqual({ kind: 'exited', exitCode: 1, signal: null })

    const cancelTerminal = new FakeTerminal()
    const cancelInspector = new FakeInspector()
    const cancel = new LocalPtySession(cancelTerminal.asPty(), cancelInspector, config())
    await initialize(cancel, cancelTerminal)
    const cancellable = cancel.startSend({ text: '', submit: false })
    cancelInspector.throwGroup = true
    expect(cancellable.cancel()).toBe(true)
    await expect(cancellable.done).rejects.toThrow('group failed')
    expect(cancellable.cancel()).toBe(false)

    const missingGroupTerminal = new FakeTerminal()
    const missingGroupInspector = new FakeInspector()
    const missingGroup = new LocalPtySession(missingGroupTerminal.asPty(), missingGroupInspector, config())
    await initialize(missingGroup, missingGroupTerminal)
    missingGroupInspector.pgid = undefined
    const unresolved = missingGroup.startSend({ text: '', submit: false })
    expect(unresolved.cancel()).toBe(true)
    await expect(unresolved.done).rejects.toThrow('cannot resolve foreground process group')
  })

  it('does not treat zero-output startup silence as readiness and fails on startup timeout', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const session = new LocalPtySession(terminal.asPty(), new FakeInspector(), config())
    let settled = false
    const initializing = session.initialize().then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(60)
    expect(settled).toBe(false)
    terminal.emitData('\x1b]133;D;0\x07dsh> ')
    await vi.advanceTimersByTimeAsync(10)
    await initializing

    const timeoutTerminal = new FakeTerminal()
    const timeout = new LocalPtySession(timeoutTerminal.asPty(), new FakeInspector(), config())
    const timedOut = expect(timeout.initialize()).rejects.toThrow('startup timeout')
    await vi.advanceTimersByTimeAsync(100)
    await timedOut
  })

  it('preserves the caller abort reason when startup cannot resolve a foreground group', async () => {
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    inspector.pgid = undefined
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    const controller = new AbortController()
    const reason = new Error('startup cancelled')

    const initializing = session.initialize(controller.signal)
    const rejected = expect(initializing).rejects.toBe(reason)
    controller.abort(reason)

    await rejected
  })

  it('waits for printable prompt text when the startup marker is split from PS1', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const session = new LocalPtySession(terminal.asPty(), new FakeInspector(), config())
    let settled = false
    const initializing = session.initialize().then(() => { settled = true })

    terminal.emitData('\x1b]133;D;0\x07')
    await vi.advanceTimersByTimeAsync(20)
    expect(settled).toBe(false)

    terminal.emitData('dsh> ')
    await vi.advanceTimersByTimeAsync(10)
    await initializing
    expect(session.motd).toBe('dsh> ')
  })

  it('retains a prompt marker until the startup shell regains the foreground group', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)

    const operation = session.startSend({ text: 'run', submit: true })
    let settled = false
    void operation.done.then(() => { settled = true })
    inspector.pgid = 789
    terminal.emitData('\x1b]133;D;0\x07dsh> ')
    await vi.advanceTimersByTimeAsync(50)
    expect(settled).toBe(false)

    inspector.pgid = 456
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(true)
    expect((await operation.done).waitReason).toBe('stdin_read')
  })

  it('holds the idle fallback for the configured handoff grace, not one poll', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config({ handoffGraceMs: 40 }))
    await initialize(session, terminal)

    const operation = session.startSend({ text: 'run', submit: true })
    let settled = false
    void operation.done.then(() => { settled = true })
    inspector.pgid = 789
    terminal.emitData('\x1b]133;D;0\x07dsh> ')
    // One poll past the silence bound would already have settled inferred_idle.
    await vi.advanceTimersByTimeAsync(70)
    expect(settled).toBe(false)

    inspector.pgid = 456
    await vi.advanceTimersByTimeAsync(10)
    expect((await operation.done).waitReason).toBe('stdin_read')
  })

  it('falls back to inferred idle when a foreground child emits an inherited prompt marker', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    await initialize(session, terminal)

    const operation = session.startSend({ text: 'bash -i', submit: true })
    inspector.pgid = 789
    terminal.emitData('\x1b]133;D;0\x07child> ')
    await vi.advanceTimersByTimeAsync(100)

    expect((await operation.done).waitReason).toBe('inferred_idle')
  })
})

describe('LocalPtySession bounds, signals, and teardown', () => {
  it('validates pagination and enforces line/UTF-8 bounds', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const session = new LocalPtySession(
      terminal.asPty(),
      new FakeInspector(),
      config({ scrollbackLines: 3, scrollbackMaxBytes: 12, maxReadBytes: 6 }),
    )
    expect(session.read({})).toMatchObject({ text: '' })
    await initialize(session, terminal)
    const operation = session.startSend({ text: '', submit: false })
    terminal.emitData('一\n二\n三\n四')
    await vi.advanceTimersByTimeAsync(60)
    expect((await operation.done).truncated).toBe(true)
    const page = session.read({ offset: 0, count: 3 })
    expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(6)
    expect(page.truncated).toBe(true)
    expect(session.read({ offset: 999 })).toMatchObject({ text: '', lineBegin: 999, lineEnd: 999 })
    expect(() => session.read({ offset: -1 })).toThrow('offset')
    expect(() => session.read({ count: 0 })).toThrow('count')

    const tinyTerminal = new FakeTerminal()
    const tiny = new LocalPtySession(tinyTerminal.asPty(), new FakeInspector(), config({ maxReadBytes: 1 }))
    await initialize(tiny, tinyTerminal)
    const tinyOperation = tiny.startSend({ text: '', submit: false })
    tinyTerminal.emitData('一')
    await vi.advanceTimersByTimeAsync(60)
    await tinyOperation.done
    expect(tiny.read({ offset: 0, count: 1 }).text).toBe('')
  })

  it('signals verified groups and refuses unresolved or shell-targeted hard kills', async () => {
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const session = new LocalPtySession(terminal.asPty(), inspector, config())
    expect(await session.signal('SIGINT')).toEqual({ delivered: true, targetPgid: 456 })
    inspector.pgid = terminal.pid
    await expect(session.signal('SIGKILL')).rejects.toThrow('use terminal_close')
    inspector.pgid = undefined
    await expect(session.signal('SIGTERM')).rejects.toThrow('cannot resolve')
  })

  it('closes idempotently, contains signal races, and reports survivors', async () => {
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    inspector.members = [{ pid: 123, started: 'a' }]
    inspector.alive.add(123)
    inspector.throwProcess = true
    terminal.throwKill = true
    const session = new LocalPtySession(terminal.asPty(), inspector, config({ disposeGraceMs: 1 }))
    const closing = session.close('test')
    expect(session.close('other')).toBe(closing)
    await expect(closing).rejects.toThrow('surviving pids: 123')
    expect(() => session.startSend({ text: '', submit: false })).toThrow('closing')
  })

  it('settles an active send as session_exit when closed mid-operation', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const session = new LocalPtySession(terminal.asPty(), new FakeInspector(), config({ disposeGraceMs: 50 }))
    await initialize(session, terminal)
    const operation = session.startSend({ text: 'run', submit: true })
    // The shell returns to its prompt while the send is active; a running
    // readiness poll would otherwise mis-settle this as stdin_read once close
    // begins, so teardown must stop polling before its grace period.
    terminal.emitData('\x1b]133;D;0\x07dsh> ')
    terminal.autoExitOnKill = false
    const closing = session.close('mid-send')
    await vi.advanceTimersByTimeAsync(20)
    terminal.emitExit(0, 15)
    expect((await operation.done).waitReason).toBe('session_exit')
    await closing
  })

  it('keeps the shell alive until SIGKILL recipients leave the process table', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    inspector.members = [{ pid: 124, started: 'child' }]
    inspector.alive.add(124)
    inspector.removeOnSignal = false
    const session = new LocalPtySession(terminal.asPty(), inspector, config({ disposeGraceMs: 20 }))

    let settled = false
    const closing = session.close('test').then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(20)
    expect(inspector.processes).toContainEqual([124, 'SIGKILL'])
    expect(terminal.kills).toEqual([])
    expect(settled).toBe(false)

    inspector.alive.delete(124)
    await vi.advanceTimersByTimeAsync(20)
    await closing
    expect(terminal.kills).toEqual(['SIGTERM'])
    expect(settled).toBe(true)
  })

  it('rescans for descendants forked during TERM before stopping the shell', async () => {
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    let reads = 0
    inspector.processTree = () => {
      reads += 1
      if (reads === 1) {
        inspector.alive.add(124)
        return [{ pid: 124, started: 'first' }]
      }
      if (reads === 2) {
        inspector.alive.add(125)
        return [{ pid: 125, started: 'late' }]
      }
      return []
    }
    const session = new LocalPtySession(terminal.asPty(), inspector, config())

    await session.close('test')

    expect(inspector.processes).toEqual([[124, 'SIGTERM'], [125, 'SIGKILL']])
    expect(terminal.kills).toEqual(['SIGTERM'])
  })

  it('retains captured survivors that are reparented out of the teardown rescan', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    const captured = { pid: 124, started: 'captured' }
    let reads = 0
    inspector.alive.add(captured.pid)
    inspector.processTree = () => reads++ === 0 ? [captured] : []
    inspector.signalProcess = (identity, signal) => {
      inspector.processes.push([identity.pid, signal])
      if (signal === 'SIGKILL') inspector.alive.delete(identity.pid)
    }
    const session = new LocalPtySession(terminal.asPty(), inspector, config({ disposeGraceMs: 20 }))

    const closing = session.close('test')
    await vi.advanceTimersByTimeAsync(25)
    await closing

    expect(inspector.processes).toEqual([[124, 'SIGTERM'], [124, 'SIGKILL']])
    expect(terminal.kills).toEqual(['SIGTERM'])
  })

  it('allows teardown to retry after a descendant-survivor failure', async () => {
    vi.useFakeTimers()
    const terminal = new FakeTerminal()
    const inspector = new FakeInspector()
    inspector.members = [{ pid: 124, started: 'child' }]
    inspector.alive.add(124)
    inspector.removeOnSignal = false
    const session = new LocalPtySession(terminal.asPty(), inspector, config({ disposeGraceMs: 10 }))

    const first = session.close('first')
    const rejected = expect(first).rejects.toThrow('surviving pids: 124')
    await vi.advanceTimersByTimeAsync(25)
    await rejected
    expect(terminal.kills).toEqual([])

    inspector.alive.delete(124)
    const second = session.close('retry')
    expect(second).not.toBe(first)
    await second
    expect(terminal.kills).toEqual(['SIGTERM'])
  })
})
