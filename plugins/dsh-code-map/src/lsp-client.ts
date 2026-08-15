/**
 * Minimal LSP client for `@dsh-external/dsh-code-map`: Content-Length framing,
 * JSON-RPC request/notification over one stdio subprocess, the transient
 * didOpen→query→didClose document lifecycle, and per-workspace process
 * pooling. Self-declared host interfaces only (no SDK dependency); the host
 * Harness supplies `ctx.subprocess` at runtime.
 *
 * v0 covers `textDocument/documentSymbol` only; call hierarchy and type
 * hierarchy ride the same connection in v1.
 * @module @dsh-external/dsh-code-map/lsp-client
 */

import { type Writable } from 'node:stream'

/** One framed outbound message. */
export function encodeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
}

/** Incremental LSP message decoder (UTF-8 bodies, no charset header). */
export class MessageDecoder {
  private buffer: Buffer = Buffer.alloc(0)

  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer): unknown[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const messages: unknown[] = []
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) break
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      if (match === null) throw new Error('lsp framing: missing Content-Length header')
      const length = Number(match[1])
      if (length > this.maxBytes) throw new Error(`lsp framing: message exceeds ${this.maxBytes} bytes`)
      if (this.buffer.length < headerEnd + 4 + length) break
      const body = this.buffer.subarray(headerEnd + 4, headerEnd + 4 + length)
      this.buffer = this.buffer.subarray(headerEnd + 4 + length)
      messages.push(JSON.parse(body.toString('utf8')))
    }
    return messages
  }
}

/** Subprocess handle shape the host `subprocess` seam returns (self-declared). */
export interface SpawnHandle {
  readonly stdin?: Writable
  readonly stdout?: NodeJS.ReadableStream
  readonly done: Promise<void>
  readonly pid: number
  terminate(): void
  readonly collected?: { stderr?: { readFrom(offset: number): { text: string } } }
}

/** Minimal subprocess seam the plugin consumes. */
export interface SubprocessSeam {
  spawn(spec: {
    argv: string[]
    cwd: string
    stdio: { stdin: 'pipe'; stdout: 'pipe'; stderr: { maxBytes: number } }
    graceMs: number
    env: Record<string, string>
  }): SpawnHandle
}

/** LSP SymbolKind enum → display name (subset used by renderers). */
const SYMBOL_KINDS: Record<number, string> = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class', 6: 'Method',
  7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum', 11: 'Interface',
  12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String', 16: 'Number',
  17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key', 21: 'Null',
  22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator', 26: 'TypeParameter',
}

export function symbolKindName(kind: number): string {
  return SYMBOL_KINDS[kind] ?? `Kind(${kind})`
}

/** Normalized symbol tree entry (DocumentSymbol shape). */
export interface SymbolEntry {
  readonly name: string
  readonly kind: number
  readonly detail?: string
  /** 1-based inclusive line of the symbol's full range start. */
  readonly startLine: number
  /** 1-based inclusive line of the symbol's full range end. */
  readonly endLine: number
  readonly children: readonly SymbolEntry[]
}

/** One source range, 1-based inclusive lines and columns (model-facing). */
export interface MapRange {
  readonly startLine: number
  readonly startCharacter: number
  readonly endLine: number
  readonly endCharacter: number
}

/** A symbol participating in a call/type hierarchy edge. */
export interface HierarchyItem {
  readonly name: string
  readonly kind: number
  readonly detail?: string
  readonly uri: string
  readonly selectionRange: MapRange
}

/** Incoming call edge: `from` calls the queried symbol at `fromRanges`. */
export interface IncomingCall {
  readonly from: HierarchyItem
  readonly fromRanges: readonly MapRange[]
}

/** Outgoing call edge: the queried symbol calls `to` at `fromRanges`. */
export interface OutgoingCall {
  readonly to: HierarchyItem
  readonly fromRanges: readonly MapRange[]
}

/** Normalized v1 call-hierarchy result (LSP 3.17, one layer of edges). */
export interface CallHierarchyResult {
  /** null when no symbol exists at the requested position. */
  readonly root: HierarchyItem | null
  readonly incoming: readonly IncomingCall[]
  readonly outgoing: readonly OutgoingCall[]
}

/** Normalized v1 type-hierarchy result (LSP 3.17, one layer of edges). */
export interface TypeHierarchyResult {
  readonly root: HierarchyItem | null
  readonly supertypes: readonly HierarchyItem[]
  readonly subtypes: readonly HierarchyItem[]
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/** Server launch spec for one language server. */
export interface LspServerSpec {
  command: string
  args: readonly string[]
  /** Static answer to every `workspace/configuration` item. */
  configuration?: unknown
  /** Byte cap on a single framed response. */
  maxMessageBytes?: number
  /** Byte cap on stderr retention. */
  maxStderrBytes?: number
}

/** One pooled language-server process, lazy-initialized on first use. */
export class LspClient {
  private readonly handle: SpawnHandle
  private readonly stdin: Writable
  private readonly decoder: MessageDecoder
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private readonly maxStderrBytes: number
  private ready: Promise<void> | undefined
  private closed = false
  private readonly closeHandlers: Array<() => void> = []

  constructor(
    private readonly spec: LspServerSpec,
    private readonly workspaceUri: string,
    private readonly spawner: SubprocessSeam,
  ) {
    this.maxStderrBytes = spec.maxStderrBytes ?? 1_000_000
    this.decoder = new MessageDecoder(spec.maxMessageBytes ?? 16_000_000)
    this.handle = spawner.spawn({
      argv: [spec.command, ...spec.args],
      cwd: workspaceUriToPath(workspaceUri),
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: this.maxStderrBytes } },
      graceMs: 2_000,
      env: {},
    })
    if (this.handle.pid <= 0) {
      throw new Error('code-map: language server failed to spawn (check that the workspace directory exists and the server command is valid)')
    }
    if (this.handle.stdin === undefined || this.handle.stdout === undefined) {
      throw new Error('code-map: subprocess implementation dropped a piped protocol stream')
    }
    this.stdin = this.handle.stdin
    this.handle.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    this.handle.done.then(() => this.failAll(new Error(this.exitMessage())), (error: unknown) => {
      this.failAll(asError(error))
    })
    this.stdin.on('error', (error: Error) => { this.failAll(error) })
  }

  /** Ensure initialize completed; rejects with the handshake failure. */
  private async ensureReady(signal?: AbortSignal): Promise<void> {
    if (this.ready === undefined) {
      this.ready = this.initialize()
      this.ready.catch(() => {})
    }
    if (signal !== undefined) signal.throwIfAborted()
    await this.ready
  }

  private async initialize(): Promise<void> {
    const rootUri = this.workspaceUri
    await this.request('initialize', {
      processId: null,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        textDocument: {
          documentSymbol: { hierarchicalDocumentSymbolSupport: true, symbolKind: { valueSet: [] } },
          // 3.17 static registration: advertise the hierarchy providers used by v1.
          callHierarchy: { dynamicRegistration: false },
          typeHierarchy: { dynamicRegistration: false },
        },
      },
    })
    await this.notify('initialized', {})
  }

  /**
   * Run `fn` with one transiently-opened document, closing it afterwards.
   * Shared lifecycle for every per-file query (v0 documentSymbols, v1
   * call/type hierarchy): content is always fresh, no stale index.
   */
  private async withOpenDocument<T>(
    uri: string,
    languageId: string,
    text: string,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensureReady(signal)
    if (signal !== undefined) signal.throwIfAborted()
    let opened = false
    try {
      await this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      })
      opened = true
      return await fn()
    } finally {
      if (opened && !this.closed) {
        try { await this.notify('textDocument/didClose', { textDocument: { uri } }) } catch { /* best-effort */ }
      }
    }
  }

  /** Query document symbols for one transiently-opened document. */
  async documentSymbols(uri: string, languageId: string, text: string, signal?: AbortSignal): Promise<unknown> {
    return this.withOpenDocument(uri, languageId, text, async () =>
      this.request('textDocument/documentSymbol', { textDocument: { uri } }, signal),
      signal,
    )
  }

  /**
   * Query call-hierarchy edges for the symbol at `position` (LSP 0-based).
   * The whole prepare → incoming/outgoing sequence runs inside one document
   * open, so the root item (including its opaque `data` field) never leaves
   * the connection; only normalized views are returned.
   */
  async callHierarchy(
    uri: string,
    languageId: string,
    text: string,
    position: { line: number; character: number },
    signal?: AbortSignal,
  ): Promise<CallHierarchyResult> {
    return this.withOpenDocument(uri, languageId, text, async () => {
      const prepared = await this.request(
        'textDocument/prepareCallHierarchy',
        { textDocument: { uri }, position },
        signal,
      )
      const items = asRawItems(prepared)
      if (items.length === 0) return { root: null, incoming: [], outgoing: [] }
      const [incomingRaw, outgoingRaw] = await Promise.all([
        this.request('callHierarchy/incomingCalls', { item: items[0] }, signal),
        this.request('callHierarchy/outgoingCalls', { item: items[0] }, signal),
      ])
      return {
        root: normalizeHierarchyItem(items[0]),
        incoming: normalizeIncomingCalls(incomingRaw),
        outgoing: normalizeOutgoingCalls(outgoingRaw),
      }
    }, signal)
  }

  /** Best-effort graceful shutdown then hard terminate; idempotent. */
  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const handler of this.closeHandlers) handler()
    this.pending.forEach((pending) => { pending.reject(new Error('code-map: client disposed')) })
    this.pending.clear()
    void this.notify('exit', null).catch(() => {})
    this.handle.terminate()
  }

  get disposed(): boolean {
    return this.closed
  }

  private request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('code-map: client disposed'))
    const id = this.nextId++
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      void this.write({ jsonrpc: '2.0', id, method, params }).catch(() => {})
    })
    promise.catch(() => {})
    if (signal === undefined) return promise
    return new Promise<unknown>((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(id)
        reject(signal.reason ?? new Error('aborted'))
      }
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
        (error: Error) => { signal.removeEventListener('abort', onAbort); reject(error) })
    })
  }

  private notify(method: string, params: unknown): Promise<void> {
    return this.write({ jsonrpc: '2.0', method, params })
  }

  private write(message: unknown): Promise<void> {
    if (this.closed) return Promise.reject(new Error('code-map: client disposed'))
    return new Promise<void>((resolve, reject) => {
      this.stdin.write(encodeMessage(message), (error?: Error | null) => {
        if (error === undefined || error === null) resolve()
        else { this.failAll(error); reject(error) }
      })
    })
  }

  private onStdout(chunk: Buffer): void {
    let messages: unknown[]
    try {
      messages = this.decoder.push(chunk)
    } catch (error) {
      this.failAll(asError(error))
      this.handle.terminate()
      return
    }
    for (const message of messages) this.dispatch(message)
  }

  private dispatch(message: unknown): void {
    if (message === null || typeof message !== 'object') return
    const frame = message as Record<string, unknown>
    if (typeof frame.method === 'string' && typeof frame.id === 'number') {
      // Server→client request: answer configuration statically, reject the rest.
      void this.answerServerRequest(frame.id, frame.method, frame.params).catch(() => {})
      return
    }
    if (typeof frame.method === 'string') return // notification: ignored
    if (typeof frame.id === 'number') this.resolveResponse(frame)
  }

  private async answerServerRequest(id: number, method: string, params: unknown): Promise<void> {
    let result: unknown
    if (method === 'workspace/configuration') {
      const items = (params as { items?: unknown[] } | null)?.items ?? []
      result = items.map(() => this.spec.configuration ?? null)
    } else if (method === 'workspace/applyEdit') {
      await this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: 'applyEdit not permitted' } })
      return
    } else {
      result = null
    }
    await this.write({ jsonrpc: '2.0', id, result })
  }

  private resolveResponse(frame: Record<string, unknown>): void {
    const id = frame.id as number
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    const error = frame.error
    if (error !== null && typeof error === 'object') {
      pending.reject(new Error(String((error as Record<string, unknown>).message ?? 'LSP error response')))
      return
    }
    pending.resolve(frame.result)
  }

  private failAll(error: Error): void {
    if (this.closed) return
    this.closed = true
    for (const handler of this.closeHandlers) handler()
    const waiting = [...this.pending.values()]
    this.pending.clear()
    for (const pending of waiting) pending.reject(error)
  }

  private exitMessage(): string {
    const tail = this.handle.collected?.stderr?.readFrom(0).text ?? ''
    const trimmed = tail.trim()
    return trimmed === '' ? 'language server exited' : `language server exited; stderr: ${trimmed.slice(0, 500)}`
  }
}

/** Per-workspace client pool: one process per canonical workspace key. */
export class LspClientPool {
  private readonly clients = new Map<string, LspClient>()

  constructor(private readonly spawner: SubprocessSeam) {}

  /** Get or create the pooled client for a workspace root. */
  get(workspaceRoot: string, spec: LspServerSpec): LspClient {
    const key = workspaceRoot.toLowerCase()
    const existing = this.clients.get(key)
    if (existing !== undefined && !existing.disposed) return existing
    const client = new LspClient(spec, pathToFileUrl(workspaceRoot), this.spawner)
    this.clients.set(key, client)
    return client
  }

  /** Dispose every live client. */
  disposeAll(): void {
    for (const client of this.clients.values()) client.dispose()
    this.clients.clear()
  }
}

/** Match a file extension to a configured server id, or throw. */
export function matchServer(
  filePath: string,
  servers: Record<string, LspServerSpec & { extensionToLanguage: Record<string, string> }>,
): { serverId: string; spec: LspServerSpec; languageId: string } {
  const ext = finalExtension(filePath)
  for (const [serverId, server] of Object.entries(servers)) {
    const languageId = server.extensionToLanguage[ext]
    if (languageId !== undefined) return { serverId, spec: server, languageId }
  }
  throw new Error(`code-map: no configured server handles "${filePath}" (extension ${ext || '(none)'})`)
}

/** Normalize a file path's final extension to a lowercase leading-dot key. */
export function finalExtension(filePath: string): string {
  const base = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

/** Workspace root string → `file:` URI (Windows drive letters lowercased). */
function pathToFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const withScheme = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${withScheme}`
}

function workspaceUriToPath(uri: string): string {
  const rest = uri.replace(/^file:\/\//, '')
  // Windows drive-letter file URIs (`file:///F:/...`) keep a leading slash that
  // is not part of the path.
  return /^\/[A-Za-z]:/.test(rest) ? rest.slice(1) : rest
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Raw LSP hierarchy items, keeping opaque per-server fields (e.g. `data`). */
function asRawItems(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) return []
  return payload.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
}

/** Normalize an LSP Range (0-based) to the 1-based MapRange view. */
function normalizeRange(range: unknown): MapRange | null {
  if (typeof range !== 'object' || range === null) return null
  const { start, end } = range as {
    start?: { line?: unknown; character?: unknown }
    end?: { line?: unknown; character?: unknown }
  }
  if (typeof start !== 'object' || start === null || typeof end !== 'object' || end === null) return null
  const { line: sl, character: sc } = start
  const { line: el, character: ec } = end
  if (typeof sl !== 'number' || typeof sc !== 'number' || typeof el !== 'number' || typeof ec !== 'number') return null
  return {
    startLine: sl + 1,
    startCharacter: sc + 1,
    endLine: el + 1,
    endCharacter: ec + 1,
  }
}

/** Normalize an LSP CallHierarchyItem / TypeHierarchyItem to the model view. */
function normalizeHierarchyItem(item: Record<string, unknown>): HierarchyItem {
  const name = typeof item.name === 'string' ? item.name : '(unnamed)'
  const kind = typeof item.kind === 'number' ? item.kind : 0
  const detail = typeof item.detail === 'string' ? item.detail : undefined
  const uri = typeof item.uri === 'string' ? item.uri : ''
  const selectionRange = normalizeRange(item.selectionRange) ?? {
    startLine: 0,
    startCharacter: 0,
    endLine: 0,
    endCharacter: 0,
  }
  return { name, kind, detail, uri, selectionRange }
}

/** Normalize `callHierarchy/incomingCalls` payload. */
function normalizeIncomingCalls(payload: unknown): IncomingCall[] {
  if (!Array.isArray(payload)) return []
  const calls: IncomingCall[] = []
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue
    const { from, fromRanges } = raw as { from?: unknown; fromRanges?: unknown }
    if (typeof from !== 'object' || from === null) continue
    calls.push({
      from: normalizeHierarchyItem(from as Record<string, unknown>),
      fromRanges: normalizeRanges(fromRanges),
    })
  }
  return calls
}

/** Normalize `callHierarchy/outgoingCalls` payload. */
function normalizeOutgoingCalls(payload: unknown): OutgoingCall[] {
  if (!Array.isArray(payload)) return []
  const calls: OutgoingCall[] = []
  for (const raw of payload) {
    if (typeof raw !== 'object' || raw === null) continue
    const { to, fromRanges } = raw as { to?: unknown; fromRanges?: unknown }
    if (typeof to !== 'object' || to === null) continue
    calls.push({
      to: normalizeHierarchyItem(to as Record<string, unknown>),
      fromRanges: normalizeRanges(fromRanges),
    })
  }
  return calls
}

/** Normalize a list of LSP Ranges to 1-based MapRange views (best-effort). */
function normalizeRanges(payload: unknown): MapRange[] {
  if (!Array.isArray(payload)) return []
  return payload.map(normalizeRange).filter((range): range is MapRange => range !== null)
}
