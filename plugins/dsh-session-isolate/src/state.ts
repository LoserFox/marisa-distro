/**
 * Durable per-session isolation state: one record per session that owns a
 * linked worktree. Stored at `~/.dsh/session-isolate/state.json` (atomic
 * replace; whole-value discipline like the DSH projection checkpoints).
 * @module dsh-session-isolate/state
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** One session's isolation record. */
export interface IsolationRecord {
  /** Repository root (the shared checkout that owns the worktree). */
  readonly repo: string
  /** Absolute path of this session's linked worktree. */
  readonly worktree: string
  /** Branch the worktree is checked out on (`iso/<shortId>`). */
  readonly branch: string
  /** ISO timestamp of creation. */
  readonly createdAt: string
  /** Last turn number committed automatically (or undefined before the first). */
  readonly lastTurn?: number
  /** Directories junction-linked from the main checkout (node_modules etc.). */
  readonly linked?: readonly string[]
}

interface StateFile {
  readonly version: 1
  readonly sessions: Record<string, IsolationRecord>
}

/** Root directory of the isolation ledger (overridable for tests). */
export function stateRoot(): string {
  return join(process.env.DSH_SESSION_ISOLATE_ROOT ?? join(homedir(), '.dsh'), 'session-isolate')
}

/** Directory that hosts linked worktrees (per-user, outside any checkout). */
export function worktreesRoot(): string {
  return join(process.env.DSH_SESSION_ISOLATE_ROOT ?? join(homedir(), '.dsh'), 'worktrees')
}

let cached: StateFile | undefined

async function load(): Promise<StateFile> {
  if (cached !== undefined) return cached
  try {
    const raw = await readFile(join(stateRoot(), 'state.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StateFile>
    if (parsed?.version !== 1 || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
      throw new Error('unrecognized state layout')
    }
    cached = parsed as StateFile
  } catch {
    cached = { version: 1, sessions: {} }
  }
  return cached
}

async function save(next: StateFile): Promise<void> {
  cached = next
  const root = stateRoot()
  await mkdir(root, { recursive: true })
  const target = join(root, 'state.json')
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

/** All isolation records, keyed by session id. */
export async function allRecords(): Promise<Record<string, IsolationRecord>> {
  return { ...(await load()).sessions }
}

/** One session's record, or undefined when the session is not isolated. */
export async function recordOf(sessionId: string): Promise<IsolationRecord | undefined> {
  return (await load()).sessions[sessionId]
}

/** Upsert one session's record. */
export async function putRecord(sessionId: string, record: IsolationRecord): Promise<void> {
  const state = await load()
  await save({ ...state, sessions: { ...state.sessions, [sessionId]: record } })
}

/** Update only the mutable fields of one session's record. */
export async function updateRecord(sessionId: string, patch: Partial<IsolationRecord>): Promise<void> {
  const state = await load()
  const current = state.sessions[sessionId]
  if (current === undefined) return
  await save({ ...state, sessions: { ...state.sessions, [sessionId]: { ...current, ...patch } } })
}

/** Drop one session's record (keeps the worktree and branch on disk). */
export async function forgetRecord(sessionId: string): Promise<void> {
  const state = await load()
  if (state.sessions[sessionId] === undefined) return
  const sessions = { ...state.sessions }
  delete sessions[sessionId]
  await save({ ...state, sessions })
}

/** Directory that will host the worktree for one session (derived, not yet created). */
export function worktreePathFor(repoRoot: string, sessionId: string): string {
  const basename = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').split('/').at(-1) ?? 'repo'
  const short = sessionId.replace(/^session-/, '').slice(0, 8)
  return join(worktreesRoot(), `${sanitize(basename)}-${short}`)
}

/** Branch name for one session. */
export function branchFor(sessionId: string): string {
  return `iso/${sessionId.replace(/^session-/, '').slice(0, 8)}`
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

/** Resolve a junction target only when it exists (guard against stale links). */
export async function existingDir(path: string): Promise<string | undefined> {
  try {
    const stat = await import('node:fs/promises').then(m => m.stat(path))
    if (stat.isDirectory()) return path
    return undefined
  } catch {
    return undefined
  }
}

/** Parent directory of a path, for mkdir calls. */
export function parentOf(path: string): string {
  return dirname(path)
}
