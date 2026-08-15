/**
 * Model-facing `code_map` tool over the pooled LSP clients. v0 exposes
 * `document_symbols`: the full symbol tree of one file (nested children,
 * kinds, 1-based line ranges), rendered as an indented text map.
 *
 * Self-declared minimal contracts (this plugin is a standalone repo with no
 * SDK dependency; the host Harness provides the real services at runtime).
 * @module @dsh-external/dsh-code-map/tools
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  LspClientPool,
  matchServer,
  symbolKindName,
  type CallHierarchyResult,
  type HierarchyItem,
  type LspServerSpec,
  type MapRange,
  type SymbolEntry,
  type SubprocessSeam,
  type TypeHierarchyResult,
} from './lsp-client.ts'
import { TypeHierarchyAnalyzer } from './ts-hierarchy.ts'

/** Minimal tool contract the host `tools` registry provides (subset). */
export interface ToolDefinition {
  name: string
  description: string
  /** Object-rooted JSON Schema (the same shape `defineTool` compiles to). */
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: Record<string, unknown>, value: unknown): unknown
  }
  execute(args: Record<string, unknown>, exec: ToolExecution): Promise<unknown>
  timeoutMs?: number
}

/** Minimal execution context the tool registry supplies. */
export interface ToolExecution {
  readonly signal: AbortSignal
  readonly agent?: { readonly sessionId?: string }
}

/** Minimal Cordis context carrying the tools and subprocess services. */
export interface ToolsContext {
  tools: {
    register(tool: ToolDefinition): () => void
  }
  subprocess: SubprocessSeam
}

/** One configured language server with its extension mapping. */
export interface ServerConfig extends LspServerSpec {
  /** Lowercase leading-dot extension → LSP language id. */
  extensionToLanguage: Record<string, string>
  args: string[]
}

/** Tool limits. */
export interface CodeMapOptions {
  /** Largest number of rendered symbol entries before an omission marker. */
  maxSymbols: number
  /** Largest complete rendered result in characters, including truncation metadata. */
  maxResultChars: number
  /** Tool-call timeout budget in ms. */
  timeoutMs: number
  /** Configured servers (extension-routed). */
  servers: Record<string, ServerConfig>
  /** Resolved server spec used when none is configured for the file (typescript). */
  defaultServer: ServerConfig
}

const MAX_DOCUMENT_BYTES = 4_000_000

/** Operations the `code_map` tool exposes (v0 + v1). */
const OPERATIONS = ['document_symbols', 'call_hierarchy', 'type_hierarchy'] as const

/**
 * Register the `code_map` tool on `ctx.tools`.
 * @param ctx - the plugin context carrying `tools` and `subprocess`.
 * @param options - resolved tool budgets and server table.
 * @returns a disposer releasing the tool registration and the client pool.
 */
export function registerCodeMapTool(ctx: ToolsContext, options: CodeMapOptions): () => void {
  const pool = new LspClientPool(ctx.subprocess)
  const analyzer = new TypeHierarchyAnalyzer()
  const disposeTool = ctx.tools.register(defineCodeMapTool(pool, analyzer, options))
  return () => {
    disposeTool()
    analyzer.dispose()
    pool.disposeAll()
  }
}

function defineCodeMapTool(pool: LspClientPool, analyzer: TypeHierarchyAnalyzer, options: CodeMapOptions): ToolDefinition {
  return {
    name: 'code_map',
    description:
      'Query language-server symbol maps for precise codebase structure. v1 operations:\n' +
      '  document_symbols — complete symbol tree of one file (functions, classes, exports, nested members), with kinds and 1-based line ranges.\n' +
      '  call_hierarchy — callers (incoming) and callees (outgoing) of the symbol at file_path:line (optionally character).\n' +
      '  type_hierarchy — supertypes and subtypes of the type at file_path:line (optionally character).\n' +
      'Outline a file with document_symbols first, then explore references and inheritance with call/type_hierarchy.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: OPERATIONS,
          description: 'document_symbols: outline a file; call_hierarchy: callers/callees of a symbol; type_hierarchy: super/subtypes of a type.',
        },
        file_path: { type: 'string', description: 'The source file to query, relative to the workspace or absolute.' },
        line: { type: 'number', description: '1-based line of the symbol (call_hierarchy / type_hierarchy).' },
        character: { type: 'number', description: '1-based column within `line` (call_hierarchy / type_hierarchy); defaults to 1 (line start).' },
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'supertypes', 'subtypes', 'both'],
          description: 'call_hierarchy: incoming (callers) / outgoing (callees) / both (default). type_hierarchy: supertypes / subtypes / both (default).',
        },
        workspace_root: { type: 'string', description: 'Optional workspace root for project resolution; defaults to the file directory.' },
      },
      required: ['operation', 'file_path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'file_path'],
        properties: {
          kind: { type: 'string', enum: [...OPERATIONS] },
          file_path: { type: 'string' },
          symbols: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'kind', 'startLine', 'endLine'],
              properties: {
                name: { type: 'string' },
                kind: { type: 'number' },
                detail: { type: 'string' },
                startLine: { type: 'number' },
                endLine: { type: 'number' },
                children: { type: 'array', items: { type: 'object' } },
              },
            },
          },
          root: { oneOf: [HIERARCHY_ITEM_SCHEMA, { type: 'null' }] },
          incoming: { type: 'array', items: CALL_EDGE_SCHEMA },
          outgoing: { type: 'array', items: CALL_EDGE_SCHEMA },
          supertypes: { type: 'array', items: HIERARCHY_ITEM_SCHEMA },
          subtypes: { type: 'array', items: HIERARCHY_ITEM_SCHEMA },
        },
      },
      render: (args, value) => {
        if (typeof value !== 'object' || value === null) return [{ type: 'text', text: String(value) }]
        const result = value as Record<string, unknown>
        const direction = typeof args.direction === 'string' ? args.direction : 'both'
        if (result.kind === 'call_hierarchy') {
          const payload = result as unknown as CallHierarchyResult & { file_path: string }
          return [{ type: 'text', text: renderCallHierarchy(payload, direction, options.maxResultChars) }]
        }
        if (result.kind === 'type_hierarchy') {
          const payload = result as unknown as TypeHierarchyResult & { file_path: string }
          return [{ type: 'text', text: renderTypeHierarchy(payload, direction, options.maxResultChars) }]
        }
        const payload = result as { file_path: string; symbols: SymbolEntry[] }
        return [{ type: 'text', text: renderSymbolTree(payload.symbols, payload.file_path, options.maxSymbols, options.maxResultChars) }]
      },
    },
    timeoutMs: options.timeoutMs,
    async execute(args, exec) {
      const operation = args.operation
      if (operation !== 'document_symbols' && operation !== 'call_hierarchy' && operation !== 'type_hierarchy') {
        throw new Error(`code-map: unsupported operation ${String(operation)}`)
      }
      const filePath = resolve(String(args.file_path))
      const workspaceRoot = typeof args.workspace_root === 'string' && args.workspace_root !== ''
        ? resolve(args.workspace_root)
        : dirname(filePath)
      const { spec, languageId } = matchServer(filePath, options.servers)
      const source = await readFile(filePath, 'utf8')
      if (Buffer.byteLength(source, 'utf8') > MAX_DOCUMENT_BYTES) {
        throw new Error(`code-map: ${filePath} exceeds ${MAX_DOCUMENT_BYTES} bytes`)
      }
      const client = pool.get(workspaceRoot, spec)
      if (operation === 'document_symbols') {
        const payload = await client.documentSymbols(pathToFileUrl(filePath), languageId, source, exec.signal)
        return { kind: 'document_symbols', file_path: filePath, symbols: normalizeDocumentSymbols(payload) }
      }
      const position = { line: parseLine(args.line), character: parseCharacter(args.character) }
      if (operation === 'call_hierarchy') {
        const result = await client.callHierarchy(pathToFileUrl(filePath), languageId, source, position, exec.signal)
        return { kind: 'call_hierarchy', file_path: filePath, ...result }
      }
      const result = analyzer.analyze(filePath, position)
      return { kind: 'type_hierarchy', file_path: filePath, ...result }
    },
  }
}

/** Normalize LSP documentSymbol responses (both DocumentSymbol[] and SymbolInformation[]) to the tree shape. */
export function normalizeDocumentSymbols(payload: unknown): SymbolEntry[] {
  if (!Array.isArray(payload)) return []
  const entries: SymbolEntry[] = []
  for (const item of payload) {
    const symbol = normalizeOne(item)
    if (symbol !== null) entries.push(symbol)
  }
  return entries
}

function normalizeOne(item: unknown): SymbolEntry | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  const name = record.name
  if (typeof name !== 'string') return null
  const kind = typeof record.kind === 'number' ? record.kind : 0
  const range = record.range as { start?: { line?: unknown; character?: unknown }, end?: { line?: unknown; character?: unknown } } | undefined
  const startLine = range?.start?.line !== undefined && typeof range.start.line === 'number' ? range.start.line + 1 : 0
  const endLine = range?.end?.line !== undefined && typeof range.end.line === 'number' ? range.end.line + 1 : 0
  const children = Array.isArray(record.children)
    ? record.children.map(normalizeOne).filter((child): child is SymbolEntry => child !== null)
    : []
  return {
    name,
    kind,
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    startLine,
    endLine,
    children,
  }
}

/** Render the symbol tree as an indented text map. */
export function renderSymbolTree(
  symbols: readonly SymbolEntry[],
  filePath: string,
  maxSymbols: number,
  maxResultChars: number,
): string {
  const lines: string[] = [`symbols of ${filePath}:`]
  let count = 0
  let omitted = 0
  const walk = (entries: readonly SymbolEntry[], depth: number): void => {
    for (const entry of entries) {
      if (count >= maxSymbols) { omitted += 1; continue }
      count += 1
      const range = entry.startLine > 0 ? ` L${entry.startLine}-${entry.endLine}` : ''
      const detail = entry.detail !== undefined && entry.detail !== '' ? `  # ${entry.detail.replaceAll('\n', ' ')}` : ''
      lines.push(`${'  '.repeat(depth)}${symbolKindName(entry.kind)} ${entry.name}${range}${detail}`)
      walk(entry.children, depth + 1)
    }
  }
  walk(symbols, 0)
  if (omitted > 0) lines.push(`… ${omitted} more symbols omitted (max ${maxSymbols})`)
  const text = lines.join('\n')
  return text.length <= maxResultChars ? text : `${text.slice(0, maxResultChars)}\n… truncated`
}

function dirname(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return index <= 0 ? '.' : filePath.slice(0, index)
}

function pathToFileUrl(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const withScheme = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${withScheme}`
}

/** Shared JSON-schema shape for a hierarchy item (v1 output). */
const HIERARCHY_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'kind', 'uri', 'selectionRange'],
  properties: {
    name: { type: 'string' },
    kind: { type: 'number' },
    detail: { type: 'string' },
    uri: { type: 'string' },
    selectionRange: {
      type: 'object',
      additionalProperties: false,
      required: ['startLine', 'startCharacter', 'endLine', 'endCharacter'],
      properties: {
        startLine: { type: 'number' },
        startCharacter: { type: 'number' },
        endLine: { type: 'number' },
        endCharacter: { type: 'number' },
      },
    },
  },
} as const

/** Shared JSON-schema shape for a call-hierarchy edge (from/to + call sites). */
const CALL_EDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fromRanges'],
  properties: {
    from: HIERARCHY_ITEM_SCHEMA,
    to: HIERARCHY_ITEM_SCHEMA,
    fromRanges: {
      type: 'array',
      items: HIERARCHY_ITEM_SCHEMA.properties.selectionRange,
    },
  },
} as const

/** Parse the 1-based `line` argument into an LSP 0-based line. */
function parseLine(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('code-map: call_hierarchy/type_hierarchy require a positive integer `line` (1-based)')
  }
  return value - 1
}

/** Parse the optional 1-based `character` argument into an LSP 0-based column. */
function parseCharacter(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('code-map: `character` must be a positive integer (1-based) when provided')
  }
  return value - 1
}

/** Render a hierarchy item as `path:line  name (Kind)`. */
function renderHierarchyItem(item: HierarchyItem): string {
  return `${uriToDisplay(item.uri)}:${item.selectionRange.startLine}  ${item.name} (${symbolKindName(item.kind)})`
}

/** Render call-site line numbers (deduped, ascending) as `L12, L30`. */
function renderRanges(ranges: readonly MapRange[]): string {
  if (ranges.length === 0) return 'L?'
  const lines = [...new Set(ranges.map((range) => range.startLine))].sort((a, b) => a - b)
  return lines.map((line) => `L${line}`).join(', ')
}

/** Render the v1 call-hierarchy result, filtered by `direction`. */
export function renderCallHierarchy(
  result: CallHierarchyResult & { file_path: string },
  direction: string,
  maxResultChars: number,
): string {
  const lines: string[] = []
  const root = result.root
  if (root === null) {
    lines.push(`no symbol found at ${result.file_path}`)
  } else {
    lines.push(`call hierarchy of ${root.name} (${symbolKindName(root.kind)}) @ ${uriToDisplay(root.uri)}:${root.selectionRange.startLine}:`)
    if (direction === 'incoming' || direction === 'both') {
      lines.push(`  callers (${result.incoming.length}):`)
      if (result.incoming.length === 0) lines.push('    (none)')
      for (const edge of result.incoming) {
        lines.push(`    ${renderRanges(edge.fromRanges)}  ${renderHierarchyItem(edge.from)}`)
      }
    }
    if (direction === 'outgoing' || direction === 'both') {
      lines.push(`  callees (${result.outgoing.length}):`)
      if (result.outgoing.length === 0) lines.push('    (none)')
      for (const edge of result.outgoing) {
        lines.push(`    ${renderRanges(edge.fromRanges)}  ${renderHierarchyItem(edge.to)}`)
      }
    }
  }
  const text = lines.join('\n')
  return text.length <= maxResultChars ? text : `${text.slice(0, maxResultChars)}\n… truncated`
}

/** Render the v1 type-hierarchy result, filtered by `direction`. */
export function renderTypeHierarchy(
  result: TypeHierarchyResult & { file_path: string },
  direction: string,
  maxResultChars: number,
): string {
  const lines: string[] = []
  const root = result.root
  if (root === null) {
    lines.push(`no type found at ${result.file_path}`)
  } else {
    lines.push(`type hierarchy of ${root.name} (${symbolKindName(root.kind)}) @ ${uriToDisplay(root.uri)}:${root.selectionRange.startLine}:`)
    if (direction === 'supertypes' || direction === 'both') {
      lines.push(`  supertypes (${result.supertypes.length}):`)
      if (result.supertypes.length === 0) lines.push('    (none)')
      for (const item of result.supertypes) lines.push(`    ${renderHierarchyItem(item)}`)
    }
    if (direction === 'subtypes' || direction === 'both') {
      lines.push(`  subtypes (${result.subtypes.length}):`)
      if (result.subtypes.length === 0) lines.push('    (none)')
      for (const item of result.subtypes) lines.push(`    ${renderHierarchyItem(item)}`)
    }
  }
  const text = lines.join('\n')
  return text.length <= maxResultChars ? text : `${text.slice(0, maxResultChars)}\n… truncated`
}

/** Strip the `file://` scheme for display; drop the extra slash on Windows drives. */
function uriToDisplay(uri: string): string {
  const rest = decodeURIComponent(uri.replace(/^file:\/\//, ''))
  return /^\/[A-Za-z]:/.test(rest) ? rest.slice(1) : rest
}
