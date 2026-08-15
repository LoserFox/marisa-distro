/** Root owner of per-session A2A directories. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { A2aDirectory } from './directory.ts'
import { createA2aApiClient } from '../api.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    a2aDirectory: A2aDirectoryService
  }
}

/** Browser A2A directory service. */
export class A2aDirectoryService extends Service {
  static inject = ['connection', 'sessions']

  private readonly directories = new Map<SessionId, A2aDirectory>()

  /**
   * @param ctx - client root context.
   */
  constructor(ctx: Context) {
    super(ctx, 'a2aDirectory')
    const refreshAll = (): void => {
      for (const directory of this.directories.values()) directory.invalidate()
    }
    ctx.effect(() => {
      const onFocus = (): void => { refreshAll() }
      const onVisibility = (): void => {
        if (document.visibilityState === 'visible') refreshAll()
      }
      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        window.removeEventListener('focus', onFocus)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }, 'ui-a2a: fallback refresh')
    ctx.on('connection/reset', () => {
      for (const directory of this.directories.values()) directory.resetConnected()
    })
  }

  /**
   * Resolve the shared directory for one session.
   * @param sessionId - owning session.
   * @returns the resident directory.
   */
  directoryFor(sessionId: SessionId): A2aDirectory {
    const existing = this.directories.get(sessionId)
    if (existing !== undefined) return existing
    const sessions = this.ctx.get('sessions') as ISessions
    const scope = sessions.scope(sessionId)
    if (scope === undefined) throw new Error(`ui-a2a: session "${String(sessionId)}" resolved no scope`)
    const connection = this.ctx.get('connection') as ConnectionHandle
    const directory = new A2aDirectory(createA2aApiClient(connection.rpc), sessionId)
    this.directories.set(sessionId, directory)
    scope.effect(() => () => {
      directory.dispose()
      this.directories.delete(sessionId)
    }, 'ui-a2a: session directory')
    return directory
  }
}
