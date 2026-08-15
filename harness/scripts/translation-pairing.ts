/**
 * Pure parsing and structural helpers for the bilingual-document pairing
 * gate. Kept separate from the CLI so corpus discovery and signature behavior
 * can be regression-tested without reading or mutating the repository tree.
 */

import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { Nodes } from 'mdast'

/** Validated shape of `scripts/translation-pairing.manifest.json`. */
export interface TranslationPairingManifest {
  /** Source documents exempt from pairing because they are generated, instructional, or bilingual by construction. */
  excluded: string[]
}

const README_ARTIFACT = /(?:^|\/)readme(?:\.md|\.zh\.md|\.i18n\.yaml)$/i
const NON_SOURCE_DIRECTORIES = new Set([
  'node_modules',
  'lib',
  '.pnpm-store',
  '.cache',
  'coverage',
  '.sessions',
  '.storages',
  'tmp',
  'dist-exe',
  '__pycache__',
  '.pytest_cache',
  '.artifacts',
  'vendor',
])

/** Glob traversal exclusions corresponding to the non-source path predicate. */
export const TRANSLATION_SCOPE_GLOB_EXCLUDES = [
  '.agents/notes/archived/**',
  '**/node_modules/**',
  '**/lib/**',
  '**/.pnpm-store/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/.doc-typecheck-*/**',
  '**/.node-next-types-*/**',
  '**/.sessions/**',
  '**/.storages/**',
  '**/tmp/**',
  '**/dist-exe/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  'apps/web/dist/**',
  '.artifacts/**',
  'python/sdk-runtime/src/deepseek_harness_runtime/runtime/dsh-jsonrpc-agent-*/**',
  'python/sdk-runtime/src/deepseek_harness_runtime/runtime/node/**',
  'vendor/**',
]

/** Whether a repository-relative path belongs to a dependency or generated tree. */
function isTranslationSourceExcluded(file: string): boolean {
  const segments = file.split('/')
  return segments.some(segment => NON_SOURCE_DIRECTORIES.has(segment)
      || segment.startsWith('.doc-typecheck-')
    || segment.startsWith('.node-next-types-'))
    || file.startsWith('apps/web/dist/')
    || file.startsWith('python/sdk-runtime/src/deepseek_harness_runtime/runtime/dsh-jsonrpc-agent-')
    || file.startsWith('python/sdk-runtime/src/deepseek_harness_runtime/runtime/node/')
}

/** Whether one discovered Markdown or sidecar path belongs to the bilingual source corpus. */
export function isTranslationScopeFile(file: string): boolean {
  return !file.startsWith('.agents/notes/archived/')
    && !isTranslationSourceExcluded(file) && (README_ARTIFACT.test(file)
    || file.startsWith('.agents/notes/')
    || file.startsWith('docs/')
    || file.startsWith('python/'))
}

/** Read the manifest exclusion list or fail before enforcement starts. */
function excludedField(record: Record<string, unknown>): string[] {
  const value = record.excluded
  if (!Array.isArray(value)) {
    throw new Error('translation-pairing.manifest.json: excluded must be an array of strings')
  }
  const entries: unknown[] = value
  if (!entries.every((entry): entry is string => typeof entry === 'string')) {
    throw new Error('translation-pairing.manifest.json: excluded must be an array of strings')
  }
  return entries
}

/** Parse and validate the checked-in bilingual manifest. */
export function parseTranslationPairingManifest(content: string): TranslationPairingManifest {
  const value: unknown = JSON.parse(content)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('translation-pairing.manifest.json: expected an object')
  }
  const record = value as Record<string, unknown>
  const unsupported = Object.keys(record).filter(field => field !== 'excluded')
  if (unsupported.length > 0) {
    throw new Error(`translation-pairing.manifest.json: unsupported field(s): ${unsupported.join(', ')}; every in-scope document is required`)
  }
  return { excluded: excludedField(record) }
}

/**
 * Normalize one CLI pair argument to its English anchor path: any of the
 * pair's three files (`foo.md`, `foo.zh.md`, `foo.i18n.yaml`) or the bare
 * `foo` stem names the same pair, and platform separators are accepted.
 *
 * @param argument - Repo-relative path as passed on a command line.
 * @returns The pair's `foo.md` anchor path with `/` separators.
 */
export function pairAnchorOfArgument(argument: string): string {
  const normalized = argument.split('\\').join('/').replace(/^\.\//, '')
  if (normalized.endsWith('.zh.md')) return `${normalized.slice(0, -'.zh.md'.length)}.md`
  if (normalized.endsWith('.i18n.yaml')) return `${normalized.slice(0, -'.i18n.yaml'.length)}.md`
  if (normalized.endsWith('.md')) return normalized
  return `${normalized}.md`
}

/** A parsed `verify-translation-pairing` invocation. */
export interface TranslationPairingCliRequest {
  mode: 'check' | 'list' | 'write'
  /** `corpus` runs discovery over the whole tree; `pairs` touches only the named anchors. */
  scope: 'corpus' | 'pairs'
  /** English anchor paths, empty for corpus scope. */
  anchors: string[]
}

/**
 * Parse and validate `verify-translation-pairing` CLI arguments.
 *
 * Check accepts optional pair paths; `--write` requires either pair paths or
 * `--all` so a bulk re-record is always an explicit choice — a bare
 * `--write` would silently bless every drifted pair in the tree, including
 * ones the caller never confirmed. `--list` is corpus-only.
 *
 * @param argv - Arguments after the script name.
 * @returns The validated request.
 * @throws Error when flags or their combination are invalid.
 */
export function parseTranslationPairingCliArgs(argv: string[]): TranslationPairingCliRequest {
  const flags = argv.filter(argument => argument.startsWith('--'))
  const anchors = [...new Set(argv.filter(argument => !argument.startsWith('--')).map(pairAnchorOfArgument))].sort()
  const unknown = flags.filter(flag => !['--list', '--write', '--all'].includes(flag))
  if (unknown.length > 0) throw new Error(`unknown flag(s): ${unknown.join(', ')}`)
  const listMode = flags.includes('--list')
  const writeMode = flags.includes('--write')
  const allMode = flags.includes('--all')
  if (listMode && (writeMode || allMode || anchors.length > 0)) {
    throw new Error('--list reports the whole corpus and takes no other flags or paths')
  }
  if (allMode && !writeMode) throw new Error('--all only applies to --write')
  if (writeMode) {
    if (anchors.length > 0 && allMode) throw new Error('--write takes either pair paths or --all, not both')
    if (anchors.length === 0 && !allMode) {
      throw new Error('--write requires the pair(s) you confirmed (any file of a pair), or --all to re-record every complete pair; recording pairs you did not review blesses unconfirmed content')
    }
    return { mode: 'write', scope: allMode ? 'corpus' : 'pairs', anchors }
  }
  if (listMode) return { mode: 'list', scope: 'corpus', anchors: [] }
  return { mode: 'check', scope: anchors.length > 0 ? 'pairs' : 'corpus', anchors }
}

/** The structural surface compared between the two sides of a pair. */
export interface TranslationStructureSignature {
  /** Heading depths in document order (h2 -> 2). */
  headings: number[]
  /** Fenced code blocks verbatim: info string plus content, in order. */
  code: string[]
  /** Row and column count of each table, in order. */
  tables: string[]
  /** Kind, ordered-list start, and direct item count of each list, in order. */
  lists: string[]
  /** Every link target in order; the language switcher is excluded. */
  links: string[]
}

/** Parse Markdown with the same GFM extensions used by the pairing gate. */
export function parseTranslationMarkdown(content: string): Nodes {
  return fromMarkdown(content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

/** Whether the tree contains a link to exactly `target`. */
export function linksTo(tree: Nodes, target: string): boolean {
  let found = false
  const visit = (node: Nodes): void => {
    if (node.type === 'link' && node.url === target) found = true
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(tree)
  return found
}

/** Collect the ordered structural signature, skipping one switcher target. */
export function translationStructureSignature(tree: Nodes, switcherTarget: string): TranslationStructureSignature {
  const sig: TranslationStructureSignature = { headings: [], code: [], tables: [], lists: [], links: [] }
  const visit = (node: Nodes): void => {
    switch (node.type) {
      case 'heading':
        sig.headings.push(node.depth)
        break
      case 'code':
        sig.code.push(`\`\`\`${node.lang ?? ''}${node.meta ? ` ${node.meta}` : ''}\n${node.value}`)
        break
      case 'table':
        sig.tables.push(`${node.children.length}x${node.children[0]?.children.length ?? 0}`)
        break
      case 'list':
        sig.lists.push(node.ordered
          ? `ordered:start=${node.start ?? 1}:items=${node.children.length}`
          : `bullet:items=${node.children.length}`)
        break
      case 'link':
        if (node.url !== switcherTarget) sig.links.push(node.url)
        break
      default:
        // Every other node kind is prose or a container, not part of the signature.
        break
    }
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(tree)
  return sig
}

/** Render a signature element for an error message, truncated for readability. */
function show(value: string | number | undefined): string {
  if (value === undefined) return 'nothing'
  const text = JSON.stringify(value)
  return text.length > 72 ? `${text.slice(0, 72)}…` : text
}

/** Return the first divergence for each structural field; empty means equal. */
export function translationStructureDiff(
  source: TranslationStructureSignature,
  zh: TranslationStructureSignature,
): string[] {
  const out: string[] = []
  const fields: [string, (string | number)[], (string | number)[]][] = [
    ['heading (depth)', source.headings, zh.headings],
    ['code block', source.code, zh.code],
    ['table (row x column count)', source.tables, zh.tables],
    ['list (kind, start, item count)', source.lists, zh.lists],
    ['link target', source.links, zh.links],
  ]
  for (const [field, sourceValues, zhValues] of fields) {
    const length = Math.max(sourceValues.length, zhValues.length)
    for (let index = 0; index < length; index++) {
      if (sourceValues[index] !== zhValues[index]) {
        out.push(`${field} #${index + 1} diverges between the pair: ${show(sourceValues[index])} vs ${show(zhValues[index])}`)
        break
      }
    }
  }
  return out
}
