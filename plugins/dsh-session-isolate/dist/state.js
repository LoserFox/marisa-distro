/**
 * Durable per-session isolation state: one record per session that owns a
 * linked worktree. Stored at `~/.dsh/session-isolate/state.json` (atomic
 * replace; whole-value discipline like the DSH projection checkpoints).
 * @module dsh-session-isolate/state
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
/** Root directory of the isolation ledger (overridable for tests). */
export function stateRoot() {
    return join(process.env.DSH_SESSION_ISOLATE_ROOT ?? join(homedir(), '.dsh'), 'session-isolate');
}
/** Directory that hosts linked worktrees (per-user, outside any checkout). */
export function worktreesRoot() {
    return join(process.env.DSH_SESSION_ISOLATE_ROOT ?? join(homedir(), '.dsh'), 'worktrees');
}
let cached;
async function load() {
    if (cached !== undefined)
        return cached;
    try {
        const raw = await readFile(join(stateRoot(), 'state.json'), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
            throw new Error('unrecognized state layout');
        }
        cached = parsed;
    }
    catch {
        cached = { version: 1, sessions: {} };
    }
    return cached;
}
async function save(next) {
    cached = next;
    const root = stateRoot();
    await mkdir(root, { recursive: true });
    const target = join(root, 'state.json');
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temp, target);
}
/** All isolation records, keyed by session id. */
export async function allRecords() {
    return { ...(await load()).sessions };
}
/** One session's record, or undefined when the session is not isolated. */
export async function recordOf(sessionId) {
    return (await load()).sessions[sessionId];
}
/** Upsert one session's record. */
export async function putRecord(sessionId, record) {
    const state = await load();
    await save({ ...state, sessions: { ...state.sessions, [sessionId]: record } });
}
/** Update only the mutable fields of one session's record. */
export async function updateRecord(sessionId, patch) {
    const state = await load();
    const current = state.sessions[sessionId];
    if (current === undefined)
        return;
    await save({ ...state, sessions: { ...state.sessions, [sessionId]: { ...current, ...patch } } });
}
/** Drop one session's record (keeps the worktree and branch on disk). */
export async function forgetRecord(sessionId) {
    const state = await load();
    if (state.sessions[sessionId] === undefined)
        return;
    const sessions = { ...state.sessions };
    delete sessions[sessionId];
    await save({ ...state, sessions });
}
/** Directory that will host the worktree for one session (derived, not yet created). */
export function worktreePathFor(repoRoot, sessionId) {
    const basename = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').split('/').at(-1) ?? 'repo';
    const short = sessionId.replace(/^session-/, '').slice(0, 8);
    return join(worktreesRoot(), `${sanitize(basename)}-${short}`);
}
/** Branch name for one session. */
export function branchFor(sessionId) {
    return `iso/${sessionId.replace(/^session-/, '').slice(0, 8)}`;
}
function sanitize(name) {
    return name.replace(/[^A-Za-z0-9._-]/g, '_');
}
/** Resolve a junction target only when it exists (guard against stale links). */
export async function existingDir(path) {
    try {
        const stat = await import('node:fs/promises').then(m => m.stat(path));
        if (stat.isDirectory())
            return path;
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** Parent directory of a path, for mkdir calls. */
export function parentOf(path) {
    return dirname(path);
}
//# sourceMappingURL=state.js.map