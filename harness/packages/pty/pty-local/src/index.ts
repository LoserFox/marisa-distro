/**
 * Local persistent PTY backend using public `node-pty` APIs, shared sandbox
 * policy, bounded output, platform readiness probes, and process-session cleanup.
 * @module @deepseek-ai/dsh-pty-local
 */

import { Context } from 'cordis'
import * as nodePty from 'node-pty'
import type { IPtyForkOptions } from 'node-pty'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { PtyBackendCleanupError } from '@deepseek-ai/dsh-pty'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { PtyBackend, PtyBackendSpawnSpec } from '@deepseek-ai/dsh-pty'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { effectiveSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { type Config, type ResolvedConfig, validateConfig } from './config.ts'
import { createProcessInspector } from './process-inspector.ts'
import type { ProcessInspector } from './process-inspector.ts'
import { LocalPtySession } from './session.ts'

export { Config } from './config.ts'
export type { Config as PtyLocalConfig } from './config.ts'

/** Cordis plugin name. */
export const name = 'pty-local'
/** Required services: PTY registry plus the one shared confinement policy. */
export const inject = ['pty', 'sandbox', 'sandboxPolicy']

interface SandboxModeFenceState {
  pty: Context['pty']
  sandboxPolicy: Context['sandboxPolicy']
}

const sandboxModeFences = new WeakMap<Agent, SandboxModeFenceState>()

function ensureSandboxModeFence(ctx: Context, owner: Agent): void {
  const existing = sandboxModeFences.get(owner)
  if (existing !== undefined) {
    existing.pty = ctx.pty
    existing.sandboxPolicy = ctx.sandboxPolicy
    return
  }
  const state: SandboxModeFenceState = { pty: ctx.pty, sandboxPolicy: ctx.sandboxPolicy }
  sandboxModeFences.set(owner, state)
  owner.ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (session !== owner.session || event.type !== 'sandbox/mode') { return }
    const currentMode = effectiveSandboxMode(session.events) ?? state.sandboxPolicy.defaultMode
    if (event.data.mode === currentMode || !state.pty.hasOwnerActivity(owner)) return
    throw new Error(
      `cannot change sandbox mode from "${currentMode}" to "${event.data.mode}" while persistent terminal sessions are open or being created; wait for creation to settle and close them first`,
    )
  }, { global: true })
}

function childEnvironment(spec: PtyBackendSpawnSpec): NodeJS.ProcessEnv {
  // node-pty owns the spawn; the base env shares the subprocess seam's scrub.
  return {
    ...scrubbedParentEnv(),
    TERM: 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    PS1: 'dsh> ',
    PROMPT_COMMAND: 'printf "\\033]133;D;%s\\007" "$?"',
    BASH_SILENCE_DEPRECATION_WARNING: '1',
    DSH_SHELL: '1',
    DSH_SESSION_ID: spec.owner.id,
    DSH_PTY_SESSION_ID: spec.sessionId,
  }
}

function spawnArgv(ctx: Context, config: ResolvedConfig, policy: SandboxExecutionPolicy): string[] {
  const argv = [config.shellPath, ...config.shellArgs]
  if (policy.mode === 'danger-full-access') return argv
  // Re-state the discriminant because object spread does not preserve its narrowed type.
  return ctx.sandbox.confine(argv, { ...policy, mode: policy.mode }).argv
}

/** Local shell backend registered under the configured type. */
export class LocalPtyBackend implements PtyBackend {
  readonly type: string

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
    private readonly inspector: ProcessInspector,
    private readonly spawnTerminal: typeof nodePty.spawn = nodePty.spawn,
    private readonly createSession: (
      terminal: ReturnType<typeof nodePty.spawn>,
      inspector: ProcessInspector,
      config: ResolvedConfig,
    ) => LocalPtySession = (terminal, inspector, config) => new LocalPtySession(terminal, inspector, config),
  ) {
    this.type = config.backendType
  }

  async spawn(spec: PtyBackendSpawnSpec): Promise<LocalPtySession> {
    spec.signal?.throwIfAborted()
    ensureSandboxModeFence(this.ctx, spec.owner)
    const policy = this.ctx.sandboxPolicy.resolve({ session: spec.owner.session })
    const argv = spawnArgv(this.ctx, this.config, policy)
    const file = argv[0]
    if (file === undefined) throw new Error('pty-local: sandbox returned empty argv')
    const options: IPtyForkOptions = {
      name: 'dumb',
      cols: this.config.cols,
      rows: this.config.rows,
      cwd: spec.cwd ?? policy.workspaceRoot,
      env: childEnvironment(spec),
    }
    const terminal = this.spawnTerminal(file, argv.slice(1), options)
    const session = this.createSession(terminal, this.inspector, this.config)
    try {
      await session.initialize(spec.signal)
      return session
    } catch (error) {
      try {
        await session.close('PTY startup failed')
      } catch (closeError: unknown) {
        throw new PtyBackendCleanupError(error, closeError)
      }
      throw error
    }
  }
}

/** Register the local PTY backend. */
export function apply(ctx: Context, config: Config): void {
  validateConfig(config)
  const inspector = createProcessInspector()
  ctx.pty.registerBackend(new LocalPtyBackend(ctx, config, inspector))
}
