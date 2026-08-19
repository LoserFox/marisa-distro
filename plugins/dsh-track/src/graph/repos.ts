/**
 * M2b — repo-touch project induction: a session's PROJECT is the git
 * repository its tool calls actually touched (file_path / workdir / `git -C`
 * targets), NOT the session's cwd directory name. A workspace cwd like
 * ~/source/dsh/explorer is not a project — the user works on dsh-track,
 * dsh-harness-ops, the dsh web harness etc. from inside it, and those are
 * the repos we resolve from the paths in the log.
 *
 * Resolution is fs-backed but pure w.r.t. the log: the same events yield the
 * same repo set for a given filesystem, so re-runs are stable. The graph
 * builder attaches `header.repos` at build time (service layer), and
 * induceProjects groups by repo URL instead of cwd.
 * @module @fakechris/dsh-track/graph/repos
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'

/** One repository a session's tool calls touched. */
export interface RepoRef {
  /** origin remote URL (canonical project identity), when readable. */
  url: string
  /** Repo root (the dir containing .git). */
  root: string
  /** Display name — basename of the root (dsh-track, dsh-harness-ops…). */
  name: string
}

/** Cache: path (or any dir under it) -> repo root, so walk-ups are once-only. */
const rootCache = new Map<string, string | undefined>()

/** Cache: repo root -> origin URL. */
const urlCache = new Map<string, string>()

export function _clearRepoCache(): void {
  rootCache.clear()
  urlCache.clear()
}

/** True when `dir` looks like a git worktree (.git dir or .git file). */
function hasGitMarker(dir: string): boolean {
  try {
    const st = statSync(dir + '/.git')
    return st.isDirectory() || st.isFile()
  } catch {
    return false
  }
}

/**
 * Nearest enclosing git repo root for a path, walking up (max 16 levels).
 * Handles worktrees (.git is a file pointing at a gitdir). Returns undefined
 * when no repo encloses the path.
 */
export function repoRootOf(path: string): string | undefined {
  const cached = rootCache.get(path)
  if (cached !== undefined || rootCache.has(path)) return cached
  let d = path
  for (let i = 0; i < 16 && d.length > 1; i++) {
    if (hasGitMarker(d)) {
      // Worktree: .git is a file "gitdir: <path>/.git/worktrees/<name>".
      const marker = d + '/.git'
      let root = d
      try {
        if (statSync(marker).isFile()) {
          const m = readFileSync(marker, 'utf8').match(/gitdir:\s*(.+)/)
          if (m) {
            let gitDir = m[1]!.trim()
            if (gitDir.includes('$GIT_DIR')) gitDir = gitDir.replace(/\$GIT_DIR/g, d)
            // gitdir is <repo>/.git/worktrees/<name> → repo root is the
            // part before /<repo>/.git (strip /worktrees/<name> suffix).
            const stripped = gitDir.replace(/\/worktrees\/[^/]+$/, '')
            const parent = dirname(stripped)
            if (parent && parent !== '.' && existsSync(parent)) root = parent
          }
        }
      } catch { /* keep d as root */ }
      rootCache.set(path, root)
      return root
    }
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  rootCache.set(path, undefined)
  return undefined
}

/** Origin remote URL of a repo root (pure fs read of .git/config). */
export function repoUrlOf(root: string): string | undefined {
  const cached = urlCache.get(root)
  if (cached !== undefined) return cached || undefined
  try {
    const config = readFileSync(root + '/.git/config', 'utf8')
    const origin = config.match(/\[remote\s+"?origin"?\][^\[]*?url\s*=\s*(\S+)/)
    const url = origin?.[1]
    urlCache.set(root, url ?? '')
    return url
  } catch {
    urlCache.set(root, '')
    return undefined
  }
}

/** Display name from a repo URL tail (dsh-track, dsh-harness-ops…). */
export function nameOfUrl(url: string): string {
  const tail = (url.split('/').pop() ?? url).replace(/\.git$/, '')
  return tail || url
}

/** Resolve one absolute path to a RepoRef (or undefined when outside any repo). */
export function repoRefOf(path: string): RepoRef | undefined {
  const root = repoRootOf(path)
  if (!root) return undefined
  const url = repoUrlOf(root)
  return { url: url ?? root, root, name: nameOfUrl(url ?? root) }
}

/**
 * Absolute paths mentioned in one tool/call event's arguments. `arguments`
 * is a JSON string; we extract file paths / workdirs / `git -C` targets.
 */
export function pathsOfEvent(data: unknown): string[] {
  const out: string[] = []
  const args = (data as { arguments?: unknown })?.arguments
  if (typeof args !== 'string') return out
  let text = args
  try { text = JSON.parse(args) } catch { /* keep raw string */ }
  if (typeof text !== 'string') {
    // Already an object: pull string fields that look like paths.
    const obj = text as Record<string, unknown>
    for (const key of ['file_path', 'path', 'workdir', 'command', 'cwd']) {
      const v = obj[key]
      if (typeof v === 'string') {
        for (const p of pathsIn(v)) out.push(p)
      }
    }
    return [...new Set(out)]
  }
  return [...new Set(pathsIn(text))]
}

/** All absolute paths in a text blob (quotes/brackets stripped). */
function pathsIn(text: string): string[] {
  const out: string[] = []
  // file_path/workdir/path keys, git -C targets, and bare absolute paths.
  const re = /(?:file_path|workdir|path|cwd)\s*[:=]\s*"?([/][^\s"'\\,]+)|git\s+-C\s+([/][^\s"'\\,]+)|([/][^\s"'\\,)]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const p = (m[1] ?? m[2] ?? m[3])!
    out.push(p.replace(/[`'"\\]+$/, ''))
  }
  return out
}

/**
 * Repos touched by tool calls in a seq window [start, end). Requirement-level
 * project attribution: an issue's span (sourceSpan.seqStart..seqEnd) resolves
 * to the repo the work in that window actually touched — not the session's
 * first repo. Falls back to all-session repos when the window is empty.
 */
export function reposOfEventsInRange(
  events: readonly { type?: unknown; seq?: unknown; data?: unknown }[],
  start: number,
  end: number,
): RepoRef[] {
  const seen = new Set<string>()
  const out: RepoRef[] = []
  for (const e of events) {
    if (e.type !== 'tool/call') continue
    const seq = typeof e.seq === 'number' ? e.seq : -1
    if (seq < start || seq >= end) continue
    for (const p of pathsOfEvent(e.data)) {
      const ref = repoRefOf(p)
      if (!ref) continue
      const key = ref.url
      if (seen.has(key)) continue
      seen.add(key)
      out.push(ref)
    }
  }
  return out
}

/**
 * Sorted tool-call seq -> repos-touched index for a session. Build once per
 * session; requirement spans binary-search into it instead of rescanning all
 * events per issue (the attribution hot path).
 */
export interface RepoTouchIndex { seq: number; repos: RepoRef[] }
export function buildRepoTouchIndex(
  events: readonly { type?: unknown; seq?: unknown; data?: unknown }[],
): RepoTouchIndex[] {
  const idx: RepoTouchIndex[] = []
  for (const e of events) {
    if (e.type !== 'tool/call') continue
    const seq = typeof e.seq === 'number' ? e.seq : -1
    const refs = pathsOfEvent(e.data)
      .map((p) => repoRefOf(p))
      .filter((r): r is RepoRef => r !== undefined)
    if (refs.length === 0) continue
    idx.push({ seq, repos: refs })
  }
  idx.sort((a, b) => a.seq - b.seq)
  return idx
}
/** First repos touched at or after `start` (binary search), up to `end`. */
export function reposInRange(idx: RepoTouchIndex[], start: number, end: number): RepoRef[] {
  let lo = 0, hi = idx.length - 1, pos = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (idx[mid]!.seq >= start) { pos = mid; hi = mid - 1 }
    else lo = mid + 1
  }
  if (pos < 0) return []
  const seen = new Set<string>()
  const out: RepoRef[] = []
  for (let k = pos; k < idx.length && idx[k]!.seq < end; k++) {
    for (const r of idx[k]!.repos) {
      if (seen.has(r.url)) continue
      seen.add(r.url)
      out.push(r)
    }
  }
  return out
}

/**
 * Repos touched by one session's events, in first-seen order (deduped).
 * Deterministic for a given log + filesystem.
 */
export function reposOfEvents(events: readonly { type?: unknown; data?: unknown }[]): RepoRef[] {
  const seen = new Set<string>()
  const out: RepoRef[] = []
  for (const e of events) {
    if (e.type !== 'tool/call') continue
    for (const p of pathsOfEvent(e.data)) {
      const ref = repoRefOf(p)
      if (!ref) continue
      const key = ref.url
      if (seen.has(key)) continue
      seen.add(key)
      out.push(ref)
    }
  }
  return out
}
