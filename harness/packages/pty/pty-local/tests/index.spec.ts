import { describe, expect, it, vi } from 'vitest'
import type { IPty, IPtyForkOptions } from 'node-pty'
import { Context } from 'cordis'
import Loader from '@cordisjs/plugin-loader'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import SandboxProvider from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import SandboxPolicyService, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import PtyService, { PtyBackendCleanupError, PtySessionId } from '@deepseek-ai/dsh-pty'
import { LocalPtyBackend } from '@deepseek-ai/dsh-pty-local'
import * as ptyLocal from '@deepseek-ai/dsh-pty-local'
import type { ResolvedConfig } from '@deepseek-ai/dsh-pty-local/src/config.ts'
import type { ProcessInspector } from '@deepseek-ai/dsh-pty-local/src/process-inspector.ts'
import type { LocalPtySession } from '@deepseek-ai/dsh-pty-local/src/session.ts'

class EmptySandbox extends SandboxProvider {
  confine(_argv: readonly string[], _policy: SandboxPolicy): ConfinedArgv {
    return { argv: [], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

class RecordingSandbox extends SandboxProvider {
  calls: { argv: readonly string[]; policy: SandboxPolicy }[] = []

  confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
    this.calls.push({ argv, policy })
    return { argv: ['/sandbox', '--', ...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

function config(): ResolvedConfig {
  return {
    backendType: 'shell', shellPath: '/bin/bash', shellArgs: [], rows: 24, cols: 80,
    scrollbackLines: 10, scrollbackMaxBytes: 100, maxReadBytes: 50,
    pollIntervalMs: 10, exactProbeAfterMs: 20, idleSilenceMs: 50, handoffGraceMs: 10, timeoutMs: 100,
    disposeGraceMs: 10,
  }
}

function agent(ctx: Context, cwd?: string): Agent {
  const id = SessionId('agent')
  const session = Session.create(id, undefined, { version: 0, id, createdAt: 0, ...cwd === undefined ? {} : { cwd } })
  return {
    id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

const inspector = {
  foregroundPgid: () => undefined,
  isStdinWaiting: () => false,
  processTree: () => [],
  isAlive: () => false,
  signalGroup() {},
  signalProcess() {},
} satisfies ProcessInspector

function spec(owner: Agent, signal?: AbortSignal) {
  return {
    sessionId: PtySessionId('pty-1'), owner, type: 'shell',
    ...signal !== undefined ? { signal } : {},
  }
}

function stubLocalSession(initialize: () => Promise<void> = () => Promise.resolve()): LocalPtySession {
  return {
    motd: '',
    initialize,
    startSend: () => { throw new Error('unused') },
    read: () => { throw new Error('unused') },
    signal: () => Promise.resolve({ delivered: true, targetPgid: 1 }),
    status: () => ({ kind: 'running' as const }),
    close: () => Promise.resolve(),
  } as unknown as LocalPtySession
}

function registerStubLocalBackend(ctx: Context, createSession: () => LocalPtySession) {
  return ctx.inject(['pty', 'sandbox', 'sandboxPolicy'], (providerCtx) => {
    providerCtx.pty.registerBackend(new LocalPtyBackend(
      providerCtx,
      { ...config(), backendType: 'stub' },
      inspector,
      (() => ({})) as never,
      createSession,
    ))
  })
}

describe('LocalPtyBackend startup rollback', () => {
  it('rejects pre-aborted setup and empty sandbox argv', async () => {
    const ctx = new Context()
    await ctx.plugin(EmptySandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'read-only', workspaceRoot: '/tmp' })
    const backend = new LocalPtyBackend(ctx, config(), inspector)
    const controller = new AbortController()
    const abortReason = new Error('spawn aborted')
    controller.abort(abortReason)
    await expect(backend.spawn(spec(agent(ctx), controller.signal))).rejects.toBe(abortReason)
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow('empty argv')
  })

  it('closes failed startup and aggregates cleanup failure', async () => {
    const ctx = new Context()
    await ctx.plugin(EmptySandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/tmp' })
    const spawnTerminal = (() => ({} as IPty)) as never

    const closed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const failed = { initialize: () => Promise.reject(new Error('startup failed')), close: closed } as unknown as LocalPtySession
    const backend = new LocalPtyBackend(ctx, config(), inspector, spawnTerminal, () => failed)
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow('startup failed')
    expect(closed).toHaveBeenCalledWith('PTY startup failed')

    const startupFailure = new Error('startup failed')
    const cleanupFailure = new Error('cleanup failed')
    const doublyFailed = {
      initialize: () => Promise.reject(startupFailure),
      close: () => Promise.reject(cleanupFailure),
    } as unknown as LocalPtySession
    const aggregate = new LocalPtyBackend(ctx, config(), inspector, spawnTerminal, () => doublyFailed)
    await expect(aggregate.spawn(spec(agent(ctx)))).rejects.toEqual(expect.objectContaining({
      name: 'PtyBackendCleanupError',
      spawnError: startupFailure,
      cleanupError: cleanupFailure,
    } satisfies Partial<PtyBackendCleanupError>))
  })

  it('resolves session mode and root together before wrapping the shell', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingSandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'read-only', workspaceRoot: '/deployment-fallback' })
    const terminal = {} as IPty
    let spawned: { file: string; args: string[]; options: IPtyForkOptions } | undefined
    const spawnTerminal = ((file: string, args: string[], options: IPtyForkOptions) => {
      spawned = { file, args, options }
      return terminal
    }) as never
    const initialized = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const session = { initialize: initialized } as unknown as LocalPtySession
    const backend = new LocalPtyBackend(
      ctx,
      { ...config(), shellArgs: ['-i'] },
      inspector,
      spawnTerminal,
      () => session,
    )
    const previous = process.env.PTY_TEST_SECRET
    process.env.PTY_TEST_SECRET = 'must-not-leak'
    const owner = agent(ctx, '/session-workspace')
    setSandboxMode(owner.session, 'workspace-write')
    try {
      expect(await backend.spawn(spec(owner))).toBe(session)
    } finally {
      if (previous === undefined) delete process.env.PTY_TEST_SECRET
      else process.env.PTY_TEST_SECRET = previous
    }

    expect(spawned).toMatchObject({
      file: '/sandbox',
      args: ['--', '/bin/bash', '-i'],
      options: {
        name: 'dumb', cols: 80, rows: 24, cwd: '/session-workspace',
        env: {
          TERM: 'dumb', PAGER: 'cat', GIT_PAGER: 'cat', PS1: 'dsh> ', BASH_SILENCE_DEPRECATION_WARNING: '1',
          DSH_SHELL: '1', DSH_SESSION_ID: 'agent', DSH_PTY_SESSION_ID: 'pty-1',
        },
      },
    })
    expect(spawned?.options.env?.PTY_TEST_SECRET).toBeUndefined()
    expect(initialized).toHaveBeenCalledWith(undefined)
    expect((ctx.sandbox as RecordingSandbox).calls).toEqual([{
      argv: ['/bin/bash', '-i'],
      policy: { mode: 'workspace-write', workspaceRoot: '/session-workspace' },
    }])
  })

  it('composes the default local session around a spawned terminal', async () => {
    const ctx = new Context()
    await ctx.plugin(EmptySandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/workspace' })
    let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined
    const terminal = {
      pid: 123, cols: 80, rows: 24, process: 'bash', handleFlowControl: false,
      onData(listener: (data: string) => void) {
        queueMicrotask(() => { listener('\x1b]133;D;0\x07dsh> ') })
        return { dispose() {} }
      },
      onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
        exitListener = listener
        return { dispose() {} }
      },
      write() {},
      kill() { exitListener?.({ exitCode: 0, signal: 15 }) },
      resize() {}, clear() {}, pause() {}, resume() {},
    } as IPty
    const backend = new LocalPtyBackend(
      ctx,
      config(),
      { ...inspector, foregroundPgid: () => terminal.pid },
      () => terminal,
    )
    const session = await backend.spawn(spec(agent(ctx)))
    expect(session.motd).toBe('dsh> ')
    await session.close('test complete')
  })
})

describe('pty-local plugin shape', () => {
  it('keeps name, inject, and Config through Loader unwrapExports', () => {
    expect('default' in ptyLocal).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(ptyLocal) as Record<string, unknown>
    expect(unwrapped.name).toBe('pty-local')
    expect(unwrapped.inject).toEqual(['pty', 'sandbox', 'sandboxPolicy'])
    expect(unwrapped.Config).toBeDefined()
  })

  it('validates config and registers the configured backend', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(PtyService)
    await ctx.plugin(EmptySandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/tmp' })
    const fiber = await ctx.plugin(ptyLocal, config())
    expect(ctx.pty.listBackends()).toEqual(['shell'])
    await fiber.dispose()
    expect(ctx.pty.listBackends()).toEqual([])
  })

  it('ignores unrelated session events and mode changes without a live owner', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(PtyService)
    await ctx.plugin(EmptySandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/tmp' })
    await ctx.plugin(ptyLocal, config())

    const session = ctx.sessions.create(SessionId('unowned-mode'))
    expect(() => {
      session.append('turn/start', { turn: 1 })
    }).not.toThrow()
    expect(() => { setSandboxMode(session, 'read-only') }).not.toThrow()
  })

  it('keeps the owner-lifetime sandbox fence after the local provider unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(PtyService)
    await ctx.plugin(RecordingSandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/tmp' })

    const session = ctx.sessions.create(SessionId('mode-owner'))
    const ownerFiber = await ctx.plugin(() => {})
    const owner: Agent = {
      id: session.id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
      status: 'idle',
      ctx: ownerFiber.ctx,
      send: () => {},
      followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: () => Promise.resolve(),
    }
    ctx.agents.register(owner)
    const providerFiber = await registerStubLocalBackend(ctx, () => stubLocalSession())
    const created = await ctx.pty.spawn(owner, { type: 'stub' })

    const unrelated = ctx.sessions.create(SessionId('unrelated-mode'))
    expect(() => { setSandboxMode(unrelated, 'read-only') }).not.toThrow()
    expect(() => {
      session.append('turn/start', { turn: 1 })
    }).not.toThrow()

    expect(() => { setSandboxMode(session, 'danger-full-access') }).not.toThrow()
    await providerFiber.dispose()
    expect(ctx.pty.listBackends()).toEqual([])
    expect(() => { setSandboxMode(session, 'read-only') }).toThrow(
      'cannot change sandbox mode from "danger-full-access" to "read-only" while persistent terminal sessions are open or being created; wait for creation to settle and close them first',
    )
    expect(session.events.filter(event => event.type === 'sandbox/mode')).toHaveLength(1)

    const replacementFiber = await registerStubLocalBackend(ctx, () => stubLocalSession())
    const second = await ctx.pty.spawn(owner, { type: 'stub' })
    await replacementFiber.dispose()
    expect(() => { setSandboxMode(session, 'read-only') }).toThrow('open or being created')

    await ctx.pty.kill(owner, created.sessionId)
    await ctx.pty.kill(owner, second.sessionId)
    expect(() => { setSandboxMode(session, 'read-only') }).not.toThrow()
    expect(session.events.filter(event => event.type === 'sandbox/mode')).toHaveLength(2)
  })

  it('also fences sandbox-mode changes across unpublished PTY creation', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(PtyService)
    await ctx.plugin(RecordingSandbox)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: '/tmp' })

    const session = ctx.sessions.create(SessionId('pending-mode-owner'))
    const ownerFiber = await ctx.plugin(() => {})
    const owner: Agent = {
      id: session.id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
      status: 'idle',
      ctx: ownerFiber.ctx,
      send: () => {},
      followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: () => Promise.resolve(),
    }
    ctx.agents.register(owner)
    const gate = Promise.withResolvers<undefined>()
    await registerStubLocalBackend(ctx, () => stubLocalSession(() => gate.promise))
    const spawning = ctx.pty.spawn(owner, { type: 'stub' })

    expect(ctx.pty.hasOwnerActivity(owner)).toBe(true)
    expect(() => { setSandboxMode(session, 'read-only') }).toThrow('open or being created')
    gate.resolve(undefined)
    const created = await spawning
    await ctx.pty.kill(owner, created.sessionId)
    expect(ctx.pty.hasOwnerActivity(owner)).toBe(false)
  })
})
