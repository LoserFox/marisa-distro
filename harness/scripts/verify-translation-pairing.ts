/**
 * Enforce complete English/Chinese pairs, matching structure, and recorded git
 * blob hashes for every in-scope document. The manifest contains only explicit
 * exclusions, which may have neither a counterpart nor a sidecar.
 * `--list` reports state; `--write <pairs...>` records the named confirmed
 * pairs (`--write --all` records every complete pair); a check or write named
 * with pair paths touches only those pairs, so update iteration does not pay
 * for a corpus scan. Translation quality remains a review responsibility.
 * See `docs/i18n/README.md` for the owning contract.
 */

import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { gitBlobHash, storeGitBlob } from './translation-pairing-git.ts'
import {
  linksTo,
  parseTranslationMarkdown,
  parseTranslationPairingCliArgs,
  parseTranslationPairingManifest,
  isTranslationScopeFile,
  TRANSLATION_SCOPE_GLOB_EXCLUDES,
  translationStructureDiff,
  translationStructureSignature,
} from './translation-pairing.ts'

const root = resolve(import.meta.dirname, '..')
let request: ReturnType<typeof parseTranslationPairingCliArgs>
try {
  request = parseTranslationPairingCliArgs(process.argv.slice(2))
} catch (error) {
  console.error(`verify-translation-pairing: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
const listMode = request.mode === 'list'
const writeMode = request.mode === 'write'

/** Discover source Markdown and pairing sidecars before applying the corpus predicate. */
const SCOPE_PATTERNS = [
  '**/*.md',
  '**/*.i18n.yaml',
  '.agents/notes/**/*.md',
  '.agents/notes/**/*.i18n.yaml',
]

const manifest = parseTranslationPairingManifest(readFileSync(join(root, 'scripts/translation-pairing.manifest.json'), 'utf8'))

/**
 * An excluded entry ending in `/` excludes the whole directory. The trailing
 * slash IS the path boundary — `docs/tool-catalog/` cannot prefix-match a
 * sibling like `docs/tool-catalog-notes/x.md` — so directory entries in the
 * manifest must keep their trailing slash.
 */
function isExcluded(file: string): boolean {
  return manifest.excluded.some(entry => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))
}

/** The three paths of a pair, derived from the English-file path. */
function pairPaths(source: string): { zh: string; meta: string } {
  return { zh: source.replace(/\.md$/, '.zh.md'), meta: source.replace(/\.md$/, '.i18n.yaml') }
}

const META_LINE = /^([^:#]+\.md): ([0-9a-f]{40})$/

/** Parse a `foo.i18n.yaml` consistency record: basename → recorded blob hash. */
function parseMeta(content: string): Map<string, string> | undefined {
  const out = new Map<string, string>()
  for (const line of content.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    const match = META_LINE.exec(line)
    if (!match?.[1] || !match[2]) return undefined
    out.set(match[1], match[2])
  }
  return out
}

/** Render a `foo.i18n.yaml` consistency record. */
function renderMeta(source: string, sourceHash: string, zh: string, zhHash: string): string {
  return [
    '# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each',
    '# side as of the last confirmed-consistent state. Both languages carry equal authority;',
    '# after editing either side, bring the other along and re-record with:',
    `#   pnpm run verify-translation-pairing --write ${source}`,
    `${basename(source)}: ${sourceHash}`,
    `${basename(zh)}: ${zhHash}`,
    '',
  ].join('\n')
}

// Enumerate the scope once: the whole corpus, or exactly the named pairs'
// three files (a named pair whose files are absent is caught by the same
// completeness rules that cover discovered remnants).
const files = new Set<string>()
if (request.scope === 'pairs') {
  for (const anchor of request.anchors) {
    for (const file of [anchor, ...Object.values(pairPaths(anchor))]) {
      if (existsSync(join(root, file))) files.add(file)
    }
    // A named anchor with no files on disk still enters the source list so
    // the check reports it instead of silently passing an empty scope.
    if (!existsSync(join(root, anchor))) files.add(anchor)
  }
} else {
  for (const pattern of SCOPE_PATTERNS) {
    for (const match of globSync(pattern, { cwd: root, exclude: TRANSLATION_SCOPE_GLOB_EXCLUDES })) {
      const normalized = match.split(sep).join('/')
      if (isTranslationScopeFile(normalized)) { files.add(normalized) }
    }
  }
}
const translations = [...files].filter(f => f.endsWith('.zh.md')).sort()
const metas = [...files].filter(f => f.endsWith('.i18n.yaml')).sort()
const sources = [...files].filter(f => f.endsWith('.md') && !f.endsWith('.zh.md')).sort()

if (request.scope === 'pairs') {
  const rejected = request.anchors.filter(anchor => !isTranslationScopeFile(anchor) || isExcluded(anchor))
  const absent = request.anchors.filter(anchor => ![anchor, ...Object.values(pairPaths(anchor))].some(file => existsSync(join(root, file))))
  if (rejected.length > 0 || absent.length > 0) {
    for (const anchor of rejected) {
      console.error(`verify-translation-pairing: ${anchor} is not an in-scope pair (excluded or outside the documentation corpus; see docs/i18n/README.md)`)
    }
    for (const anchor of absent) {
      console.error(`verify-translation-pairing: ${anchor} names no pair on disk (none of its three files exist)`)
    }
    process.exit(2)
  }
}

// --write: (re)record both hashes for the requested complete pairs, creating
// missing records. A named pair that cannot be recorded (missing counterpart)
// fails loud; corpus scope (--all) skips pairless sources as before.
if (writeMode) {
  let written = 0
  for (const source of sources) {
    if (isExcluded(source)) continue
    const { zh, meta } = pairPaths(source)
    if (!existsSync(join(root, source)) || !existsSync(join(root, zh))) {
      if (request.scope === 'pairs') {
        console.error(`verify-translation-pairing: cannot record ${source}: missing ${existsSync(join(root, source)) ? zh : source}`)
        process.exit(2)
      }
      continue
    }
    const sourceContent = readFileSync(join(root, source))
    const zhContent = readFileSync(join(root, zh))
    // A consistency record is also a recovery pointer for the briefing
    // generator. Persist both snapshots even when the sidecar text is already
    // current, because the bytes may exist only in this working tree.
    const record = renderMeta(source, storeGitBlob(root, sourceContent), zh, storeGitBlob(root, zhContent))
    if (existsSync(join(root, meta)) && readFileSync(join(root, meta), 'utf8') === record) continue
    writeFileSync(join(root, meta), record)
    console.log(`verify-translation-pairing: recorded ${meta}`)
    written++
  }
  console.log(`verify-translation-pairing: ${written} record(s) written; run the check to validate the pairs.`)
  process.exit(0)
}

const errors: string[] = []
const state = new Map<string, 'ok' | 'out-of-sync' | 'missing'>()

// 1. Every discovered, non-excluded source merges bilingual.
for (const source of sources) {
  if (isExcluded(source)) continue
  const { zh } = pairPaths(source)
  if (!existsSync(join(root, zh))) {
    errors.push(`${source}: in-scope documentation must merge bilingual (docs/i18n/README.md); add the counterpart and record the pair`)
    state.set(source, 'missing')
  }
}

// 2. Every pair that exists at all is complete and consistent. Anchor on the
// union of .zh.md files and .i18n.yaml records so a half-deleted pair is
// caught from either remnant.
const pairAnchors = new Set<string>()
for (const zh of translations) pairAnchors.add(zh.replace(/\.zh\.md$/, '.md'))
for (const meta of metas) pairAnchors.add(meta.replace(/\.i18n\.yaml$/, '.md'))

for (const source of [...pairAnchors].sort()) {
  const { zh, meta } = pairPaths(source)
  const have = { source: existsSync(join(root, source)), zh: existsSync(join(root, zh)), meta: existsSync(join(root, meta)) }

  if (isExcluded(source)) {
    if (have.zh) errors.push(`${zh}: ${source} is excluded from pairing (generated or bilingual-by-construction); this translation must not exist`)
    if (have.meta) errors.push(`${meta}: ${source} is excluded from pairing; this consistency record must not exist`)
    continue
  }
  const missing = Object.entries(have).filter(([, ok]) => !ok).map(([k]) => (k === 'source' ? source : k === 'zh' ? zh : meta))
  if (missing.length > 0) {
    errors.push(`${source}: incomplete pair — missing ${missing.join(', ')} (pairs merge whole: both languages plus the .i18n.yaml record)`)
    continue
  }

  const sourceContent = readFileSync(join(root, source))
  const zhContent = readFileSync(join(root, zh))
  const record = parseMeta(readFileSync(join(root, meta), 'utf8'))
  if (!record || record.size !== 2 || !record.has(basename(source)) || !record.has(basename(zh))) {
    errors.push(`${meta}: malformed consistency record (expected exactly \`${basename(source)}: <40-hex>\` and \`${basename(zh)}: <40-hex>\`)`)
    continue
  }

  let consistent = true
  for (const [file, content] of [[source, sourceContent], [zh, zhContent]] as const) {
    const current = gitBlobHash(content)
    if (record.get(basename(file)) !== current) {
      errors.push(`${file}: out of sync — content no longer matches the pair's last confirmed-consistent state in ${meta} (bring the other side along, then re-record with --write)`)
      consistent = false
    }
  }
  if (!consistent) {
    state.set(source, 'out-of-sync')
    continue
  }

  const sourceTree = parseTranslationMarkdown(sourceContent.toString('utf8'))
  const zhTree = parseTranslationMarkdown(zhContent.toString('utf8'))
  if (!linksTo(zhTree, basename(source))) {
    errors.push(`${zh}: missing language switcher — no link to ${basename(source)}`)
  }
  if (!linksTo(sourceTree, basename(zh))) {
    errors.push(`${source}: missing language switcher — no link back to ${basename(zh)}`)
  }
  for (const divergence of translationStructureDiff(
    translationStructureSignature(sourceTree, basename(zh)),
    translationStructureSignature(zhTree, basename(source)),
  )) {
    errors.push(`${source} ↔ ${zh}: ${divergence}`)
  }
  if (!state.has(source)) state.set(source, 'ok')
}

// Complete the state map for --list: any in-scope, non-excluded document with no pair is missing.
for (const source of sources) {
  if (!isExcluded(source) && !state.has(source)) state.set(source, 'missing')
}

if (listMode) {
  const order = { 'out-of-sync': 0, missing: 1, ok: 2 } as const
  const rows = [...state.entries()].sort((a, b) => order[a[1]] - order[b[1]] || a[0].localeCompare(b[0]))
  for (const [file, status] of rows) {
    console.log(`${status.padEnd(11)} ${file}${status === 'missing' ? '  (required)' : ''}`)
  }
  const counts = { 'ok': 0, 'out-of-sync': 0, 'missing': 0 }
  for (const status of state.values()) counts[status]++
  console.log(`verify-translation-pairing: ${counts.ok} ok, ${counts['out-of-sync']} out-of-sync, ${counts.missing} missing (of ${state.size} in scope)`)
  process.exit(0)
}

if (errors.length === 0) {
  console.log(request.scope === 'pairs'
    ? `verify-translation-pairing: ${pairAnchors.size} named pair(s) consistent; the corpus-wide check still runs in doc-sync.`
    : `verify-translation-pairing: ${pairAnchors.size} pair(s) checked across all in-scope documentation, all consistent.`)
  process.exit(0)
}

console.error('verify-translation-pairing: bilingual pairing contract violated (see docs/i18n/README.md):')
for (const message of errors) console.error(`  ${message}`)
process.exit(1)
