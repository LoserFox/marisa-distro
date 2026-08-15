/**
 * Per-session A2A directory: one host snapshot shared by the page, badge,
 * and composer panel. Host invalidations trigger one refresh; generation
 * tracking prevents stale requests from overwriting a newer mutation.
 */
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  A2aApiClient, A2aApiError, A2aApiResult, A2aProjectView, A2aSnapshot,
} from '../api.ts'

/** Shared A2A state rendered by every browser surface. */
export interface A2aDirectoryState {
  snapshot: A2aSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'mutating' | 'error'
  error: A2aApiError | null
}

/** One session's A2A controller. */
export class A2aDirectory {
  /** The shared observable snapshot. */
  readonly store: SnapshotStore<A2aDirectoryState> = createSnapshotStore({
    snapshot: null,
    status: 'idle',
    error: null,
  })

  private generation = 0
  private disposed = false
  private refreshQueued = false
  private watchAbort: AbortController | undefined

  /** React-compatible subscription without exposing an unbound store method. */
  readonly subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener)

  /** Read the current immutable directory snapshot. */
  readonly getSnapshot = (): A2aDirectoryState => this.store.getSnapshot()

  /**
   * @param a2a - typed A2A client over public Connection RPC.
   * @param sessionId - owning session.
   */
  constructor(
    private readonly a2a: A2aApiClient,
    private readonly sessionId: SessionId,
  ) {}

  /** Refresh the complete A2A state. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => {
      state.status = state.snapshot === null ? 'loading' : 'ready'
      state.error = null
    })
    const result = await this.a2a.snapshot({ sessionId: this.sessionId })
    if (this.disposed || generation !== this.generation) return
    if (!result.ok) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = result.error
      })
      return
    }
    this.store.update((state) => {
      state.snapshot = result.value
      state.status = 'ready'
      state.error = null
    })
    this.armWatch(result.value.revision)
  }

  /** Coalesce one Host invalidation into one authoritative refresh. */
  invalidate(): void {
    if (this.disposed || this.refreshQueued) return
    this.refreshQueued = true
    if (this.store.getSnapshot().status === 'mutating') return
    queueMicrotask(() => {
      if (this.disposed || !this.refreshQueued) return
      this.refreshQueued = false
      void this.load()
    })
  }

  /**
   * Connect the session, then replace state from the authoritative snapshot.
   * @param project - destination project name.
   * @param name - roster name claimed by the session.
   * @returns whether the mutation completed and the snapshot was refreshed.
   */
  async connect(project: string, name: string): Promise<boolean> {
    return this.mutate(() => this.a2a.connect({ sessionId: this.sessionId, project, name }))
  }

  /**
   * Disconnect the session, then replace state from the authoritative snapshot.
   * @returns whether the mutation completed and the snapshot was refreshed.
   */
  async disconnect(): Promise<boolean> {
    return this.mutate(() => this.a2a.disconnect({ sessionId: this.sessionId }))
  }

  /**
   * Create a project and refresh the complete state.
   * @param name - stable project name.
   * @param displayName - optional display label.
   * @returns the created project, or null when the host rejects the mutation.
   */
  async createProject(name: string, displayName?: string): Promise<A2aProjectView | null> {
    const generation = ++this.generation
    this.watchAbort?.abort()
    this.watchAbort = undefined
    this.store.update((state) => { state.status = 'mutating'; state.error = null })
    const result = await this.a2a.projectCreate({
      name,
      ...(displayName === undefined ? {} : { displayName }),
    })
    if (this.disposed || generation !== this.generation) return null
    if (!result.ok) {
      this.store.update((state) => { state.status = 'error'; state.error = result.error })
      if (this.refreshQueued) {
        this.refreshQueued = false
        void this.load()
      }
      return null
    }
    this.refreshQueued = false
    await this.load()
    return result.value.project
  }

  /** Clear one visible error without changing the last good snapshot. */
  clearError(): void {
    this.store.update((state) => {
      state.error = null
      if (state.status === 'error') state.status = state.snapshot === null ? 'idle' : 'ready'
    })
  }

  /** Host generation reset: discard stale state and re-baseline. */
  resetConnected(): void {
    if (this.disposed) return
    this.watchAbort?.abort()
    this.watchAbort = undefined
    ++this.generation
    this.refreshQueued = false
    this.store.update((state) => {
      state.snapshot = null
      state.status = 'idle'
      state.error = null
    })
    void this.load()
  }

  /** Scope teardown prevents late responses from writing. */
  dispose(): void {
    this.refreshQueued = false
    this.watchAbort?.abort()
    this.watchAbort = undefined
    this.disposed = true
    ++this.generation
  }

  private armWatch(revision: number): void {
    this.watchAbort?.abort()
    const controller = new AbortController()
    this.watchAbort = controller
    void this.a2a.watch({ sessionId: this.sessionId, revision }, controller.signal).then((result) => {
      if (this.disposed || this.watchAbort !== controller) return
      this.watchAbort = undefined
      if (!result.ok) return
      if (result.value.revision === revision) this.armWatch(revision)
      else this.invalidate()
    }).catch(() => {
      // An aborted or reset Connection call is recovered by resetConnected()
      // or the existing focus/visibility refresh.
    })
  }

  private async mutate(
    call: () => Promise<A2aApiResult<unknown>>,
  ): Promise<boolean> {
    const generation = ++this.generation
    this.watchAbort?.abort()
    this.watchAbort = undefined
    this.store.update((state) => { state.status = 'mutating'; state.error = null })
    const result = await call()
    if (this.disposed || generation !== this.generation) return false
    if (!result.ok) {
      this.store.update((state) => { state.status = 'error'; state.error = result.error })
      if (this.refreshQueued) {
        this.refreshQueued = false
        void this.load()
      }
      return false
    }
    this.refreshQueued = false
    await this.load()
    return true
  }
}
