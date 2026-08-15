/**
 * Sidechain panel file mentions (browser half).
 *
 * Builds the `MarkdownFileMentions` resolver for one child transcript from
 * the files the child's tool calls produced (see `producedPaths` in
 * sidechain-view.ts). Matching mirrors the main chat's ui-deliverables
 * semantics: a token names a file when it equals a produced path exactly,
 * or equals the basename of exactly one produced path (ambiguous basenames
 * stay inert). Opening resolves the path against the child session's cwd
 * and routes through the host's workspace opener.
 */

import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'

/** The trailing path segment (handles both separators). */
function basenameOf(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

/**
 * Resolve a workspace-relative path into the Host-facing absolute spelling,
 * mirroring the runtime's `resolveWorkspacePath` (kept local so this module
 * stays value-import-free and node-testable): absolute and Windows-style
 * paths pass through; relative paths join onto the session cwd.
 */
function resolveAgainstCwd(cwd: string | undefined, path: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\')) return path
  if (cwd === undefined || cwd === '') return path
  const base = cwd.replace(/[/\\]+$/, '')
  const rel = path.replace(/^[/\\]+/, '')
  return `${base}/${rel}`
}

/** The single produced path whose basename is exactly `value`, else undefined. */
function onlyPathWithBasename(paths: readonly string[], value: string): string | undefined {
  const matches = paths.filter(path => basenameOf(path) === value)
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Build a transcript-scoped file-mention resolver.
 *
 * Produced locations are absolute; model prose usually names the file
 * relative to the session cwd (or just its basename). A token matches when
 * it equals a produced path exactly, equals the produced path relative to
 * the cwd, or equals the basename of exactly one produced path.
 * @param produced - produced file paths (first-seen order, unique).
 * @param cwd - the child session's workspace root (match + path base).
 * @param openPath - host opener for absolute paths (workspaces.openPath).
 * @returns the resolver.
 */
export function fileMentionsFor(
  produced: readonly string[],
  cwd: string | undefined,
  openPath: (path: string) => void,
): MarkdownFileMentions {
  const byAbsolute = new Set(produced)
  const byCwdRelative = new Set(
    produced
      .map(path => relativeTo(cwd, path))
      .filter((path): path is string => path !== undefined),
  )
  return {
    resolve(value) {
      const path = byAbsolute.has(value)
        ? value
        : byCwdRelative.has(value)
          ? value
          : onlyPathWithBasename(produced, value)
      if (path === undefined) return undefined
      const target = resolveAgainstCwd(cwd, path)
      // Never hand a bare relative path to the host opener: without a cwd
      // (the child's list row not yet arrived) a relative produced path would
      // open nowhere meaningful — keep the mention inert instead.
      if (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(target)) return undefined
      return {
        open: () => { openPath(target) },
        label: basenameOf(path),
        title: target,
      }
    },
  }
}

/** The produced path spelled relative to the cwd, when it lives under it. */
function relativeTo(cwd: string | undefined, path: string): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  const base = cwd.replace(/[/\\]+$/, '') + '/'
  if (!path.startsWith(base)) return undefined
  return path.slice(base.length)
}
