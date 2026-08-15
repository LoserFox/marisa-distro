/**
 * Cordis catalog-specific projection over the compiler-independent Typert
 * model. This module owns Cordis validation and text projection mechanics;
 * callers supply repository-specific type classifications and inherited data.
 * @module @deepseek-ai/dsh-typert-generator
 */

import { WorkspaceAnalyzer, WorkspaceCaches } from './analyzer.ts'
import { childTypeNodeIds } from './model.ts'
import { TypeGraphRenderer } from './renderer.ts'
import type {
  FaceModel,
  MemberModel,
  ParameterModel,
  SignatureModel,
  SourceDeclarationModel,
  SourceLocation,
  TypeNodeId,
} from './model.ts'

type Mode = 'emit' | 'waterfall' | 'parallel' | 'serial'

/** The fenced-block info string for generated signature blocks (skipped by
 * doc-typecheck, since a bare signature fragment is not standalone-compilable). */
const FENCE = 'ts cordis-catalog'

/** Append fail-closed signature type-link violations from the retained type tree. */
function checkTypeLinks(
  where: string,
  names: readonly string[],
  policy: CordisCatalogPolicy,
  violations: string[],
): void {
  for (const name of names) {
    if (Object.hasOwn(policy.linkedTypePages, name)
      || policy.foundationTypeNames.has(name)
      || Object.hasOwn(policy.typeLinkExemptions, name)) continue
    violations.push(
      `${where} references unclassified type '${name}'. Add it to linkedTypePages with its documentation page, `
      + 'to foundationTypeNames if TypeScript or the framework owns it, or to typeLinkExemptions with '
      + 'the non-catalog documentation owner.',
    )
  }
}

/** Throw one aggregated diagnostic for every unclassified signature type. */
function reportTypeLinkViolations(gate: string, violations: string[]): void {
  if (violations.length === 0) return
  throw new Error(
    `${gate}: ${violations.length} signature type-link coverage violation(s):\n`
    + violations.map(violation => `  ${violation}`).join('\n'),
  )
}

/** One harness event, extracted from an `interface Events` block. */
export interface EventEntry {
  /** Scoped name, e.g. `agent/request`. */
  name: string
  /** The scope prefix, e.g. `agent` (everything before the first `/`). */
  scope: string
  /** Full signature text (the method-signature member, JSDoc stripped). */
  signature: string
  /** Original declaration JSDoc, dedented from its containing interface. */
  jsDoc: string
  /** Dispatch mode from the `@mode` tag. */
  mode: Mode
  /** Description prose (JSDoc minus the `@mode` tag), one line per paragraph. */
  doc: string
  /** Source pointer `packages/…/file.ts:line` of the declaration. */
  source: string
}

/** One public service method and the source contract attached to it. */
export interface ServiceMethodEntry {
  /** Public method signature (body stripped). */
  signature: string
  /** Original method JSDoc, dedented from its containing class. */
  jsDoc: string
}

/** One harness service, extracted from an `interface Context` block. */
export interface ServiceEntry {
  /** The `ctx.<key>` name, e.g. `llm`. */
  key: string
  /** The service class/interface name, e.g. `LlmService`. */
  type: string
  /** Whether the service class is abstract (a seam interface). */
  abstract: boolean
  /** Class-level JSDoc prose, one line per paragraph. */
  doc: string
  /** Public methods (bodies stripped), in source order. */
  methods: ServiceMethodEntry[]
  /** Source pointer of the class declaration. */
  source: string
}

/** A terse inherited-tier entry supplied by the catalog policy. */
export interface InheritedEntry {
  /** Display name of the inherited event or context member group. */
  name: string
  /** One-line description rendered into the catalog. */
  summary: string
  /** Source pointer such as `vendor/…:line`. */
  source: string
}

/** Repository policy consumed by the Cordis catalog parsing and rendering logic. */
export interface CordisCatalogPolicy {
  /** Type names linked from signatures to their documentation pages. */
  readonly linkedTypePages: Readonly<Record<string, string>>
  /** TypeScript or framework types that need no repository documentation link. */
  readonly foundationTypeNames: ReadonlySet<string>
  /** Repository types deliberately documented outside the linked data catalog. */
  readonly typeLinkExemptions: Readonly<Record<string, string>>
  /** Manually curated framework events inherited by every plugin. */
  readonly inheritedEvents: readonly InheritedEntry[]
  /** Manually curated framework context members inherited by every plugin. */
  readonly inheritedServices: readonly InheritedEntry[]
}

/** Complete model-level Cordis projection used by every text renderer. */
export interface CordisCatalogModel {
  readonly events: readonly EventEntry[]
  readonly services: readonly ServiceEntry[]
}

/** Repository-specific Cordis validation and projection over one Typert face. */
export class CordisCatalogProjector {
  private readonly renderer: TypeGraphRenderer

  /**
   * @param face - analyzed host face containing package business semantics.
   * @param sourceDeclarations - exported declarations available to the runtime type closure.
   * @param policy - caller-owned type classifications and inherited Cordis data.
   */
  constructor(
    private readonly face: FaceModel,
    private readonly sourceDeclarations: readonly SourceDeclarationModel[],
    private readonly policy: CordisCatalogPolicy,
  ) {
    if (face.face !== 'host') throw new Error(`cordis catalog requires the host face, received ${face.face}`)
    this.renderer = new TypeGraphRenderer(face.graph)
  }

  /**
   * Validate and project the host model's Cordis surface.
   * @returns every validated service and event projected from the host model.
   */
  project(): CordisCatalogModel {
    return {
      events: this.collectEvents(),
      services: this.collectServices(),
    }
  }

  /**
   * Render the model-facing static API consumed by `tool-cordis`.
   * @param model - validated Cordis catalog projection from this projector.
   * @returns the model-facing TypeScript catalog source.
   */
  renderRuntimeApi(model: CordisCatalogModel): string {
    return renderRuntimeApi(
      model.services,
      model.events,
      this.runtimeTypes(model.services),
      this.policy.inheritedServices,
    )
  }

  private collectEvents(): EventEntry[] {
    const entries: EventEntry[] = []
    const violations: string[] = []
    const typeLinkViolations: string[] = []
    for (const packageModel of this.face.packages) {
      for (const event of packageModel.events) {
        const source = pointer(event.location)
        const where = `event '${event.name}' (${source})`
        const node = this.renderer.node(event.signature)
        if (node.kind !== 'function') {
          violations.push(`${where} is not represented by a callable type.`)
          continue
        }
        checkTypeLinks(where, signatureTypeNames(this.renderer, node.signature), this.policy, typeLinkViolations)
        const parsed = parseJsDoc(event.jsDoc ?? '')
        const mode = event.mode
        if (!isMode(mode)) {
          violations.push(`${where} is missing an @mode tag. Add '@mode emit|waterfall|parallel|serial' to its JSDoc (see AGENTS.md).`)
        }
        const last = node.signature.parameters.at(-1)
        const hasNext = last?.name === 'next'
        if (isMode(mode) && hasNext && mode !== 'waterfall') {
          violations.push(`${where} has a trailing 'next' parameter (structurally a waterfall) but is tagged '@mode ${mode}'. Fix the tag or the signature.`)
        }
        if (isMode(mode) && !hasNext && mode === 'waterfall') {
          violations.push(`${where} is tagged '@mode waterfall' but has no trailing 'next' parameter. A waterfall delegates via next().`)
        }
        if (parsed.doc === '') {
          violations.push(`${where} has no description prose. Say what happened / what a listener may do, above the block tags.`)
        }
        checkParams(
          where,
          'event',
          node.signature.parameters,
          parsed.params,
          parameter => parameter.receiver || (hasNext && parameter === last),
          violations,
        )
        if (isMode(mode)) {
          entries.push({
            name: event.name,
            scope: event.name.split('/')[0] ?? event.name,
            signature: event.text,
            jsDoc: event.jsDoc ?? '',
            mode,
            doc: parsed.doc,
            source,
          })
        }
      }
    }
    reportViolations('gen-cordis-catalog', violations)
    reportTypeLinkViolations('gen-cordis-catalog', typeLinkViolations)
    return entries
  }

  private collectServices(): ServiceEntry[] {
    const entries: ServiceEntry[] = []
    const violations: string[] = []
    const typeLinkViolations: string[] = []
    for (const packageModel of this.face.packages) {
      for (const service of packageModel.services) {
        const declaration = this.renderer.declaration(service.symbol)
        if (declaration.kind !== 'class'
          || !/^packages\/[^/]+\/[^/]+\/src\/[^/]+\.ts$/.test(service.location.file)
          || declaration.location.file !== service.location.file) continue
        const doc = parseJsDoc(declaration.jsDoc ?? '').doc
        const source = pointer(declaration.location)
        if (doc === '') {
          violations.push(`service ctx.${service.key} (${source}): class ${declaration.name} has no JSDoc.`)
        }
        const methods: ServiceMethodEntry[] = []
        for (const memberId of service.members) {
          const member = this.renderer.member(memberId)
          if (member.kind !== 'method' || member.name.startsWith('[')) continue
          const where = `service method ctx.${service.key}.${member.name} (${pointer(member.location)})`
          checkTypeLinks(where, signatureTypeNames(this.renderer, member.signature), this.policy, typeLinkViolations)
          methods.push({ signature: member.text, jsDoc: member.jsDoc ?? '' })
          if (member.jsDoc === undefined) {
            violations.push(`${where} has no JSDoc.`)
            continue
          }
          const parsed = parseJsDoc(member.jsDoc)
          if (parsed.doc === '') violations.push(`${where} has no description prose above its block tags.`)
          checkParams(where, 'service', member.signature.parameters, parsed.params,
            parameter => parameter.receiver, violations)
          checkReturns(where, member.signature, parsed.returns, this.renderer, violations)
        }
        entries.push({
          key: service.key,
          type: declaration.name,
          abstract: declaration.abstract,
          doc,
          methods,
          source,
        })
      }
    }
    reportViolations('gen-cordis-catalog', violations)
    reportTypeLinkViolations('gen-cordis-catalog', typeLinkViolations)
    return entries.sort((left, right) => left.key.localeCompare(right.key))
  }

  private runtimeTypes(services: readonly ServiceEntry[]): { name: string; declaration: string }[] {
    const declarations = new Map<string, string>()
    const ambiguous = new Set<string>()
    for (const declaration of this.sourceDeclarations) {
      if (declaration.face !== 'host' || declaration.kind === 'enum'
        || !/^packages\/[^/]+\/[^/]+\/src\/[^/]+\.ts$/.test(declaration.location.file)) continue
      if (declarations.has(declaration.name)) {
        ambiguous.add(declaration.name)
        continue
      }
      declarations.set(
        declaration.name,
        declaration.text.length > MAX_DECL_CHARS
          ? `${declaration.text.slice(0, MAX_DECL_CHARS)} /* …truncated — full shape in source */`
          : declaration.text,
      )
    }
    for (const name of ambiguous) declarations.delete(name)
    return referencedTypes(services.flatMap(service => service.methods.map(method => method.signature)), declarations)
  }
}

/**
 * Analyze the host project once and return both the model and its projection.
 * @param scanRoot - workspace root containing `tsconfig.host.json`.
 * @param policy - caller-owned type classifications and inherited Cordis data.
 * @returns the configured projector and its validated catalog model.
 */
export function projectCordisCatalog(scanRoot: string, policy: CordisCatalogPolicy): {
  readonly projector: CordisCatalogProjector
  readonly model: CordisCatalogModel
} {
  const caches = new WorkspaceCaches()
  const discovery = new WorkspaceAnalyzer({
    root: scanRoot,
    faces: ['host'],
    checkDiagnostics: false,
    caches,
  }).discoverPackages()
  const packages = discovery.filter(candidate => candidate.faces.includes('host'))
    .map(candidate => candidate.package)
  const workspace = new WorkspaceAnalyzer({
    root: scanRoot,
    faces: ['host'],
    packages,
    checkDiagnostics: false,
    caches,
  }).analyzeInBatches()
  const face = workspace.faces.find(candidate => candidate.face === 'host')
  if (face === undefined) throw new Error('gen-cordis-catalog: Typert produced no host face')
  const sourceDeclarations = new WorkspaceAnalyzer({
    root: scanRoot,
    faces: ['host'],
    checkDiagnostics: false,
    caches,
  }).indexSourceDeclarations()
  const projector = new CordisCatalogProjector(face, sourceDeclarations, policy)
  return { projector, model: projector.project() }
}

/**
 * Collect all modeled events for relationship-document consumers.
 * @param scanRoot - workspace root containing `tsconfig.host.json`.
 * @param policy - caller-owned Cordis catalog policy.
 * @returns all validated event entries.
 */
export function collectEvents(scanRoot: string, policy: CordisCatalogPolicy): EventEntry[] {
  return [...projectCordisCatalog(scanRoot, policy).model.events]
}

/**
 * Collect all modeled services for relationship-document consumers.
 * @param scanRoot - workspace root containing `tsconfig.host.json`.
 * @param policy - caller-owned Cordis catalog policy.
 * @returns all validated service entries.
 */
export function collectServices(scanRoot: string, policy: CordisCatalogPolicy): ServiceEntry[] {
  return [...projectCordisCatalog(scanRoot, policy).model.services]
}

interface ParsedJsDoc {
  readonly doc: string
  readonly params: ReadonlyMap<string, string>
  readonly returns: string | null
}

function parseJsDoc(raw: string): ParsedJsDoc {
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*?\s?/, '').replace(/\s+$/, ''))
  const blocks: string[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let item: string[] = []
  let inTags = false
  const join = (parts: readonly string[]): string => parts.join(' ').replace(/\s+/g, ' ').trim()
  const flushItem = (): void => {
    if (item.length > 0) list.push(join(item))
    item = []
  }
  const flushList = (): void => {
    flushItem()
    if (list.length > 0) blocks.push(list.join('\n'))
    list = []
  }
  const flushParagraph = (): void => {
    flushList()
    if (paragraph.length > 0) blocks.push(join(paragraph))
    paragraph = []
  }
  for (const line of lines) {
    const tagLine = line.trimStart()
    if (tagLine.startsWith('@')) {
      flushParagraph()
      inTags = true
      continue
    }
    if (inTags) continue
    if (line.trim() === '') {
      flushParagraph()
      continue
    }
    if (/^-\s+/.test(line)) {
      flushItem()
      if (paragraph.length > 0) {
        blocks.push(join(paragraph))
        paragraph = []
      }
      item.push(line)
      continue
    }
    if (item.length > 0) item.push(line)
    else paragraph.push(line)
  }
  flushParagraph()

  const params = new Map<string, string>()
  let returns: string | null = null
  let sink: ((text: string) => void) | undefined
  for (const line of lines) {
    const param = /^@param\s+(\[?[\w$]+\]?)\s*(?:[-—–]\s*)?(.*)$/.exec(line)
    if (param !== null) {
      const name = (param[1] ?? '').replace(/^\[|\]$/g, '')
      let value = param[2] ?? ''
      params.set(name, value)
      sink = (text) => {
        value = value === '' ? text : `${value} ${text}`
        params.set(name, value)
      }
      continue
    }
    const returnsTag = /^@returns?(?:\s+[-—–]?\s*(.*))?$/.exec(line)
    if (returnsTag !== null) {
      let value = returnsTag[1] ?? ''
      returns = value
      sink = (text) => {
        value = value === '' ? text : `${value} ${text}`
        returns = value
      }
      continue
    }
    if (line.startsWith('@') || line.trim() === '') sink = undefined
    else sink?.(line.trim())
  }
  return {
    doc: blocks.join('\n\n').replace(/\{@link\s+([^}]+)\}/g, '$1').trim(),
    params,
    returns,
  }
}

function checkParams(
  where: string,
  surface: string,
  parameters: readonly ParameterModel[],
  tags: ReadonlyMap<string, string>,
  isExempt: (parameter: ParameterModel) => boolean,
  violations: string[],
): void {
  for (const parameter of parameters) {
    if (parameter.binding !== 'identifier') {
      violations.push(`${where}: parameter '${parameter.name}' is a binding pattern; the ${surface} surface needs simple identifier parameters so @param can name them.`)
      continue
    }
    if (isExempt(parameter)) continue
    const description = tags.get(parameter.name)
    if (description === undefined) violations.push(`${where} is missing @param ${parameter.name}.`)
    else if (description.trim() === '') violations.push(`${where}: @param ${parameter.name} has an empty description.`)
  }
  for (const tag of tags.keys()) {
    if (!parameters.some(parameter => parameter.binding === 'identifier' && parameter.name === tag)) {
      violations.push(`${where}: @param ${tag} does not match any parameter (stale tag?).`)
    }
  }
}

function checkReturns(
  where: string,
  signature: SignatureModel,
  returns: string | null,
  renderer: TypeGraphRenderer,
  violations: string[],
): void {
  const type = renderer.renderType(signature.returns)
  if (type === 'void' || type === 'Promise<void>') return
  if (returns === null) violations.push(`${where} is missing @returns (return type: ${type}).`)
  else if (returns.trim() === '') violations.push(`${where}: @returns has an empty description.`)
}

function reportViolations(gate: string, violations: readonly string[]): void {
  if (violations.length === 0) return
  throw new Error(
    `${gate}: ${String(violations.length)} JSDoc completeness violation(s) (see AGENTS.md):\n`
    + violations.map(violation => `  ${violation}`).join('\n'),
  )
}

function pointer(location: SourceLocation): string {
  return `${location.file}:${String(location.line)}`
}

function isMode(mode: string | undefined): mode is Mode {
  return mode === 'emit' || mode === 'waterfall' || mode === 'parallel' || mode === 'serial'
}

function signatureTypeNames(renderer: TypeGraphRenderer, signature: SignatureModel): string[] {
  const names = new Set<string>()
  const visited = new Set<TypeNodeId>()
  const visitSignature = (current: SignatureModel): void => {
    for (const parameter of current.typeParameters) {
      if (parameter.constraint !== undefined) visit(parameter.constraint)
      if (parameter.default !== undefined) visit(parameter.default)
    }
    for (const parameter of current.parameters) visit(parameter.type)
    visit(current.returns)
  }
  const visitMember = (member: MemberModel): void => {
    if (member.kind === 'property') visit(member.type)
    else visitSignature(member.signature)
  }
  const visit = (id: TypeNodeId): void => {
    if (visited.has(id)) return
    visited.add(id)
    const node = renderer.node(id)
    if (node.kind === 'reference' && node.target.kind !== 'type-parameter') names.add(node.name)
    if (node.kind === 'type-query') names.add(node.expression)
    for (const child of childTypeNodeIds(node)) visit(child)
    if (node.kind === 'object') for (const member of node.members) visitMember(member)
    if (node.kind === 'function' || node.kind === 'constructor') visitSignature(node.signature)
  }
  visitSignature(signature)
  return [...names].sort()
}

/** Declarations longer than this render as a truncated stub. */
const MAX_DECL_CHARS = 1500

/** Render one value as a single-quoted TypeScript literal. */
function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`
}

/** Resolve and sort the word-bounded transitive type closure referenced by seed text. */
function referencedTypes(
  seeds: readonly string[],
  declarations: ReadonlyMap<string, string>,
): { name: string; declaration: string }[] {
  const included = new Map<string, string>()
  let frontier = [...seeds]
  while (frontier.length > 0) {
    const next: Array<string> = []
    for (const [name, declaration] of declarations) {
      if (included.has(name)) continue
      const pattern = new RegExp(`\\b${name}\\b`)
      if (frontier.some(text => pattern.test(text))) {
        included.set(name, declaration)
        next.push(declaration)
      }
    }
    frontier = next
  }
  return [...included]
    .map(([name, declaration]) => ({ name, declaration }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function firstSentence(doc: string): string {
  const line = doc.split('\n', 1)[0] ?? ''
  const match = /^(.*?[.!?])(?:\s|$)/.exec(line)
  return (match?.[1] ?? line).trim()
}

/** Render the byte-compatible model-facing API catalog. */
function renderRuntimeApi(
  services: readonly ServiceEntry[],
  events: readonly EventEntry[],
  types: readonly { name: string; declaration: string }[],
  inheritedServices: readonly InheritedEntry[],
): string {
  const lines: string[] = [
    '/**',
    ' * Generated by scripts/gen-cordis-api.ts — do not edit by hand; run',
    ' * `pnpm run gen-cordis-api` to regenerate (freshness-gated by',
    ' * `pnpm run verify-cordis-api` in doc-sync).',
    ' *',
    ' * The machine-readable cordis API catalog `cordis_inspect` serves to the',
    ' * model: harness services (summary + public method signatures/JSDoc),',
    ' * harness events (mode + signature/JSDoc), and the inherited `ctx` surface. Produced by',
    ' * the same AST walk as docs/cordis-catalog, so this data and the rendered',
    ' * docs cannot diverge.',
    ' *',
    ' * @module @deepseek-ai/dsh-tool-cordis/api-catalog',
    ' */',
    '',
    '/** One public service method and its source-owned contract. */',
    'export interface ServiceApiMethod {',
    '  /** Public method signature with its body stripped. */',
    '  signature: string',
    '  /** Original method JSDoc, with only container indentation removed. */',
    '  jsDoc: string',
    '}',
    '',
    '/** One harness `ctx.<key>` service: its one-line summary and public methods. */',
    'export interface ServiceApiEntry {',
    '  /** The `ctx.<key>` name, e.g. `tools`. */',
    '  key: string',
    '  /** First sentence of the service class JSDoc. */',
    '  summary: string',
    '  /** Public methods, bodies stripped, in source order. */',
    '  methods: readonly ServiceApiMethod[]',
    '}',
    '',
    '/** One harness event: its dispatch mode, exact signature, and one-line summary. */',
    'export interface EventApiEntry {',
    '  /** The scoped event name, e.g. `agent/status`. */',
    '  name: string',
    '  /** The dispatch mode from the declaration\'s `@mode` tag. */',
    '  mode: string',
    '  /** The exact listener signature, whitespace-normalized. */',
    '  signature: string',
    '  /** Original event JSDoc, with only container indentation removed. */',
    '  jsDoc: string',
    '  /** First sentence of the event JSDoc. */',
    '  summary: string',
    '}',
    '',
    '/** One inherited (cordis core + loader/hmr/timer) `ctx` member group with its summary. */',
    'export interface InheritedApiEntry {',
    '  /** The `ctx` member name(s), e.g. `ctx.on / ctx.once`. */',
    '  name: string',
    '  /** One-line summary of what the member does. */',
    '  summary: string',
    '}',
    '',
    '/** One named type shape the service signatures reference. */',
    'export interface TypeApiEntry {',
    '  /** The exported type/interface name, e.g. `BashRunResult`. */',
    '  name: string',
    '  /** The full declaration text, comments stripped. */',
    '  declaration: string',
    '}',
    '',
    '/** Every harness `ctx.<key>` service, sorted by key. */',
    'export const SERVICE_API: readonly ServiceApiEntry[] = [',
  ]
  for (const service of services) {
    lines.push('  {')
    lines.push(`    key: ${quote(service.key)},`)
    lines.push(`    summary: ${quote(firstSentence(service.doc))},`)
    if (service.methods.length === 0) {
      lines.push('    methods: [],')
    } else {
      lines.push('    methods: [')
      for (const method of service.methods) {
        lines.push('      {')
        lines.push(`        signature: ${quote(method.signature)},`)
        lines.push(`        jsDoc: ${quote(method.jsDoc)},`)
        lines.push('      },')
      }
      lines.push('    ],')
    }
    lines.push('  },')
  }
  lines.push(
    ']',
    '',
    '/** Every harness event, sorted by name. */',
    'export const EVENT_API: readonly EventApiEntry[] = [',
  )
  for (const event of [...events].sort((left, right) => left.name.localeCompare(right.name))) {
    lines.push('  {')
    lines.push(`    name: ${quote(event.name)},`)
    lines.push(`    mode: ${quote(event.mode)},`)
    lines.push(`    signature: ${quote(event.signature)},`)
    lines.push(`    jsDoc: ${quote(event.jsDoc)},`)
    lines.push(`    summary: ${quote(firstSentence(event.doc))},`)
    lines.push('  },')
  }
  lines.push(
    ']',
    '',
    '/** Shapes of every exported type the SERVICE_API signatures reference (transitively), sorted by name. */',
    'export const TYPE_API: readonly TypeApiEntry[] = [',
  )
  for (const type of types) {
    lines.push('  {')
    lines.push(`    name: ${quote(type.name)},`)
    lines.push(`    declaration: ${quote(type.declaration)},`)
    lines.push('  },')
  }
  lines.push(
    ']',
    '',
    '/** The inherited `ctx` surface (cordis core + loader/hmr/timer), in curated order. */',
    'export const INHERITED_CTX_API: readonly InheritedApiEntry[] = [',
  )
  for (const inherited of inheritedServices) {
    lines.push(`  { name: ${quote(inherited.name)}, summary: ${quote(inherited.summary)} },`)
  }
  lines.push(']', '')
  return lines.join('\n')
}
/** Render the cross-link "Types:" line for a signature, or '' if none apply. */
function typeLinks(signature: string, linkedTypePages: Readonly<Record<string, string>>): string {
  const seen = new Set<string>()
  for (const name of Object.keys(linkedTypePages)) {
    if (new RegExp(`\\b${name}\\b`).test(signature)) seen.add(name)
  }
  if (seen.size === 0) return ''
  const links = [...seen].sort().map(n => `[${n}](../core-data-structures/${linkedTypePages[n]})`)
  return `Types: ${links.join(' · ')}`
}

/** Render one harness event entry. */
function renderEvent(e: EventEntry, linkedTypePages: Readonly<Record<string, string>>): string[] {
  const out = [`### \`${e.name}\` — ${e.mode}`, '']
  if (e.doc) out.push(e.doc, '')
  out.push('```' + FENCE, e.jsDoc, e.signature, '```', '')
  const links = typeLinks(e.signature, linkedTypePages)
  if (links) out.push(links, '')
  out.push(`Source: [\`${e.source}\`](../../${e.source.split(':')[0]})`, '')
  return out
}

/** Render one harness service entry. */
function renderService(s: ServiceEntry, linkedTypePages: Readonly<Record<string, string>>): string[] {
  const kind = s.abstract ? ' (abstract seam)' : ''
  const out = [`## \`ctx.${s.key}\` — \`${s.type}\`${kind}`, '']
  if (s.doc) out.push(s.doc, '')
  if (s.methods.length) {
    const declarations = s.methods.flatMap((method, index) => [
      ...(index > 0 ? [''] : []),
      method.jsDoc,
      method.signature,
    ])
    out.push('```' + FENCE, ...declarations, '```', '')
    const links = typeLinks(s.methods.map(method => method.signature).join('\n'), linkedTypePages)
    if (links) out.push(links, '')
  }
  out.push(`Source: [\`${s.source}\`](../../${s.source.split(':')[0]})`, '')
  return out
}

/** The shared generated-file banner comment. */
const BANNER = [
  '<!-- Generated by scripts/gen-cordis-catalog.ts — do not edit by hand.',
  '     Run `pnpm run gen-cordis-catalog` to regenerate. -->',
  '',
]

/** The shared GENERATED + freshness-gate + fence notice paragraph. */
const GATE_NOTICE = 'This file is GENERATED from source (`scripts/gen-cordis-catalog.ts`) and verified fresh by `pnpm run verify-cordis-catalog` (part of `doc-sync`) — do not edit it by hand. Signature blocks use a `ts cordis-catalog` fence and include the original source JSDoc immediately before each event or service method. doc-typecheck skips these bare declaration fragments; type names in a signature link to the page that documents them.'

/**
 * Render the events catalog deterministically.
 * @param events - validated event entries to render.
 * @param policy - type links and inherited events supplied by the caller.
 * @returns the complete generated Markdown document.
 */
export function renderEvents(events: EventEntry[], policy: CordisCatalogPolicy): string {
  const lines: string[] = [
    ...BANNER,
    '# Cordis Events Catalog',
    '',
    'Every cordis event a plugin can listen to: exact signature, dispatch mode, and original declaration JSDoc. This is one axis of the **wiring** reference a plugin author works against — the callable `ctx.<key>` surface is the sibling [services catalog](services.md), and [core-data-structures/](../core-data-structures/core.md) catalogs the *data structures* these signatures move around.',
    '',
    GATE_NOTICE,
    '',
    'The **harness tier** below (the `@deepseek-ai/dsh-*` packages) is the vocabulary this repo owns, grouped by scope. The **inherited tier** at the end is the cordis-core + loader/hmr/timer event surface a plugin also sees — pinned vendor source, summarized tersely. The event-dispatch methods themselves are generated in the [Cordis core Events API](core/events.md).',
    '',
    'Dispatch modes: **emit** (fire-and-forget), **waterfall** (each listener gets `next()` and may transform or veto — see [waterfall semantics](../cordis-primer.md#cordis-waterfall-semantics)), **parallel** (awaited fan-out; all listeners run), **serial** (awaited in registration order until one returns a bail value — anything other than `null`, `false`, or `undefined`).',
    '',
  ]
  const scopes = [...new Set(events.map(e => e.scope))].sort()
  for (const scope of scopes) {
    lines.push(`## \`${scope}/*\``, '')
    for (const e of events.filter(x => x.scope === scope).sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(...renderEvent(e, policy.linkedTypePages))
    }
  }
  lines.push(
    '## Inherited events (cordis core + loader/hmr/timer)',
    '',
    'The framework events every plugin also sees, beyond the harness vocabulary above. This is pinned vendor source ([vendoring policy](../../vendor/README.md)); it is summarized here so the page is a complete picture of the event bus, without elevating framework internals to the harness tier\'s prominence.',
    '',
  )
  for (const e of policy.inheritedEvents) {
    lines.push(`- \`${e.name}\` — ${e.summary} ([\`${e.source}\`](../../${e.source.split(':')[0]}))`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Render the services catalog deterministically.
 * @param services - validated service entries to render.
 * @param policy - type links and inherited services supplied by the caller.
 * @returns the complete generated Markdown document.
 */
export function renderServices(services: ServiceEntry[], policy: CordisCatalogPolicy): string {
  const lines: string[] = [
    ...BANNER,
    '# Cordis Services Catalog',
    '',
    'Every `ctx.<key>` service a plugin can call: the exact public interface with original method JSDoc, plus the class JSDoc. This is one axis of the **wiring** reference a plugin author works against — the events a plugin listens to are the sibling [events catalog](events.md), and [core-data-structures/](../core-data-structures/core.md) catalogs the *data structures* these signatures move around. An abstract seam (e.g. `ctx.bash`) is implemented by a separate package; the interface is what consumers code against.',
    '',
    GATE_NOTICE,
    '',
    'The **harness tier** below (the `@deepseek-ai/dsh-*` packages) is the vocabulary this repo owns. The **inherited tier** at the end is the cordis-core + loader/hmr/timer `ctx` surface a plugin also sees — pinned vendor source, summarized tersely. Detailed Context, Fiber, Registry, and Service APIs are generated in the [Cordis core API](core/context.md).',
    '',
  ]
  for (const s of services) lines.push(...renderService(s, policy.linkedTypePages))
  lines.push(
    '## Inherited `ctx` members (cordis core + loader/hmr/timer)',
    '',
    'The framework `ctx` surface every plugin also sees, beyond the harness services above. This is pinned vendor source ([vendoring policy](../../vendor/README.md)); it is summarized here so the page is a complete picture of what `ctx` offers, without elevating framework internals to the harness tier\'s prominence.',
    '',
  )
  for (const s of policy.inheritedServices) {
    lines.push(`- \`${s.name}\` — ${s.summary} ([\`${s.source}\`](../../${s.source.split(':')[0]}))`)
  }
  lines.push('')
  return lines.join('\n')
}
