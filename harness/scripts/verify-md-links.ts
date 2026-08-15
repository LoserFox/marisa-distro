/**
 * Verify that relative Markdown links, images, and definitions resolve. URL,
 * root-absolute, and in-page targets are excluded; query strings and fragments
 * do not affect resolution against the source file. The checker never rewrites,
 * and symlinked instruction files are deduped.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import type { Nodes } from 'mdast'
import { parseMarkdown, visitMarkdown } from './markdown.ts'
import { isArchivedAgentNotePath, uniqueRepoFiles } from './repo-files.ts'

const root = resolve(import.meta.dirname, '..')

/** Repo-authored Markdown checked for relative links. */
const PATTERNS = [
  'README.md',
  'README.zh.md',
  '.agents/notes/**/*.md',
  'docs/**/*.md',
  'packages/*/*.md',
  'packages/*/*/*.md',
  'examples/**/*.md',
  'AGENTS.md',
  'packages/AGENTS.md',
  '.agents/skills/**/*.md',
  'skills/**/*.md',
]

/** A broken relative link: a target path that does not resolve to a file. */
interface Violation {
  file: string
  /** 1-based line where the link/image/definition node starts. */
  line: number
  url: string
}

/**
 * True for targets this gate must NOT check: scheme-qualified URLs (`https:`,
 * `mailto:`, …), protocol-relative (`//host`), root-absolute (`/path`), and
 * pure in-page anchors (`#frag`). Everything else is a relative path we own.
 */
function isExternalOrAnchor(url: string): boolean {
  if (url.startsWith('#')) return true
  if (url.startsWith('//')) return true
  if (url.startsWith('/')) return true
  // A scheme like `https:` / `mailto:` — a colon before any slash, dot, or hash.
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
}

/**
 * Strip the `#fragment` and `?query` from a link target, then percent-decode
 * the remaining path so an encoded target (`My%20File.md`, `READ%4DE.md`)
 * probes the real filename on disk, the way a Markdown renderer resolves it. A
 * malformed escape (`%zz`) makes `decodeURIComponent` throw; we keep the raw
 * path in that case so the link is reported as broken (a `%zz` target is not a
 * file anyone meant to link) rather than crashing the gate.
 */
function pathPart(url: string): string {
  const raw = url.replace(/[#?].*$/, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    // decodeURIComponent throws only on a malformed percent-escape; the raw
    // string is then a path no renderer resolves, so fall through to the
    // existence check, which reports it broken.
    return raw
  }
}

/** Find every broken relative cross-link in one Markdown file via its AST. */
function findViolations(absPath: string): Violation[] {
  const file = relative(root, absPath)
  const dir = dirname(absPath)
  const source = readFileSync(absPath, 'utf8')
  const tree = parseMarkdown(source)
  const out: Violation[] = []

  const check = (url: string, node: Nodes): void => {
    if (isExternalOrAnchor(url)) return
    const target = pathPart(url)
    // A bare `#anchor` reduced to empty path is a same-file anchor — skip.
    if (target === '') return
    const resolved = resolve(dir, target)
    if (!existsSync(resolved)) {
      out.push({ file, line: node.position?.start.line ?? 0, url })
    }
  }

  visitMarkdown(tree, (node: Nodes): void => {
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && 'url' in node) {
      check(node.url, node)
    }
  })
  return out
}

// Archived notes remain valid link targets, but their historical outbound links are frozen.
const files = uniqueRepoFiles(root, PATTERNS, isArchivedAgentNotePath)
const all = files.flatMap(file => findViolations(file.abs))
const checked = files.length

if (all.length === 0) {
  console.log(`verify-md-links: ${checked} file(s) checked, all relative cross-links resolve.`)
  process.exit(0)
}

console.error('verify-md-links: broken relative cross-links found (target does not exist):')
for (const v of all) {
  console.error(`  ${v.file}:${v.line}  ${v.url}`)
}
process.exit(1)
