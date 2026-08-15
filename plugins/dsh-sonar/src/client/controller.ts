import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { SONAR_READ_RPC, SONAR_WRITE_RPC } from '../types.ts'
import type { TeamworkProjection, ViewContentType, ViewEntry, ViewReadMode, ViewStatus, ViewUiConfig, ViewWriteMode } from '../types.ts'

export interface ViewClientState {
  status: 'loading' | 'ready' | 'error'
  data: ViewStatus | null
  error: string | null
}

export interface CandidateDraft {
  type: ViewContentType
  sourceId: string
  readMode: ViewReadMode
  writeMode: ViewWriteMode
  writeTarget?: string
  title: string
  summary: string
  content: string
  teamwork?: TeamworkProjection
}

export class ViewController {
  private state: ViewClientState = { status: 'loading', data: null, error: null }
  private readonly listeners = new Set<() => void>()
  private generation = 0

  constructor(private readonly connection: ConnectionHandle) {}

  getSnapshot(): ViewClientState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setState(update: Partial<ViewClientState>): void {
    this.state = { ...this.state, ...update }
    for (const listener of this.listeners) listener()
  }

  async load(silent = false): Promise<void> {
    const generation = ++this.generation
    if (!silent) this.setState({ status: 'loading', error: null })
    try {
      const result = await this.connection.rpc.call(SONAR_READ_RPC, 'status', {})
      if (generation !== this.generation) return
      if (!result.ok) throw new Error(result.error.message)
      this.setState({ status: 'ready', data: result.value as ViewStatus, error: null })
    } catch (error) {
      if (generation !== this.generation) return
      this.setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async write(method: string, params: Record<string, unknown>): Promise<void> {
    try {
      const result = await this.connection.rpc.call(SONAR_WRITE_RPC, method, params)
      if (!result.ok) throw new Error(result.error.message)
      await this.load(true)
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async read<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
    try {
      const result = await this.connection.rpc.call(SONAR_READ_RPC, method, params)
      if (!result.ok) throw new Error(result.error.message)
      await this.load(true)
      return result.value as T
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  propose(draft: CandidateDraft): Promise<void> {
    return this.write('propose', {
      ...draft,
      operation: 'add',
      proposedBy: 'user',
    })
  }

  decide(id: string, decision: 'accept' | 'reject'): Promise<void> {
    return this.write('decide', { id, decision })
  }

  setSourceEnabled(id: string, enabled: boolean): Promise<void> {
    return this.write('setSourceEnabled', { id, enabled })
  }

  query(query: string, type?: ViewContentType): Promise<ViewEntry[] | null> {
    return this.read<ViewEntry[]>('query', { query, type, readMode: 'query' })
  }

  readEntry(id: string): Promise<ViewEntry | null> {
    return this.read<ViewEntry>('read', { id })
  }

  organize(id: string, targetType: ViewContentType = 'memory'): Promise<void> {
    return this.write('organize', { id, targetType })
  }

  private async writeSettings(method: 'saveSettings' | 'resetSettings', config?: ViewUiConfig): Promise<boolean> {
    try {
      const expectedRevision = this.state.data?.configuration?.revision
      const result = await this.connection.rpc.call(SONAR_WRITE_RPC, method, { config, expectedRevision })
      if (!result.ok) throw new Error(result.error.message)
      await this.load(true)
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  saveSettings(config: ViewUiConfig): Promise<boolean> {
    return this.writeSettings('saveSettings', config)
  }

  resetSettings(): Promise<boolean> {
    return this.writeSettings('resetSettings')
  }

  dispose(): void {
    this.generation += 1
    this.listeners.clear()
  }
}
