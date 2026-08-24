/**
 * DSH Session Isolate: per-session Git worktree isolation.
 *
 * Every session that opts in (or is forked through `iso_fork`) gets its own
 * linked worktree and `iso/<id>` branch. Automatic turn-end commits land on
 * the session branch only; the shared checkout's index, HEAD, refs, and
 * working tree are never touched except by the explicit, user-approved
 * `iso_export` merge. This is the "each session keeps its own Git record"
 * mechanism, layered on top of the shared workspace model.
 * @module dsh-session-isolate
 */
import { Service } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { mkdir, symlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { addWorktree, branchDiffStat, branchLog, branchWorktree, commitAll, currentBranch, deleteBranch, findRepoRoot, isRegisteredWorktree, mergeIntoMain, removeWorktree, runGit, } from './git.js';
import { allRecords, branchFor, forgetRecord, putRecord, recordOf, updateRecord, worktreePathFor, worktreesRoot, } from './state.js';
import { registerTools } from './tools.js';
export * from './git.js';
export * from './state.js';
export * from './types.js';
/** Candidate dependency directories junction-linked from the main checkout into a fresh worktree. */
const LINK_CANDIDATES = [
    'node_modules',
    'harness/node_modules',
    'desktop/node_modules',
];
/** Cordis service exposed as `ctx.sessionIsolate`. */
export class SessionIsolateService extends Service {
    static inject = ['tools'];
    committed = new Map();
    constructor(ctx, config = {}) {
        super(ctx, 'sessionIsolate');
        registerTools(ctx, this);
        ctx.inject(['agents'], (scope) => { this.install(scope); });
        void this.reconcileStartup(ctx).catch((error) => {
            ctx.logger.warn(`[session-isolate] startup reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
    /** Idle-boundary turn commits for every isolated session. */
    install(ctx) {
        ctx.on('agent/created', ({ agent }) => { this.maybeCommitTurn(ctx, agent); });
        ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle')
            this.maybeCommitTurn(ctx, agent); });
        queueMicrotask(() => { for (const agent of ctx.agents.list())
            this.maybeCommitTurn(ctx, agent); });
    }
    /** Forget state records whose worktrees no longer exist (crash/cleanup leftovers). */
    async reconcileStartup(ctx) {
        const records = await allRecords();
        for (const [sessionId, record] of Object.entries(records)) {
            if (!existsSync(record.worktree)) {
                await forgetRecord(sessionId);
                ctx.logger.info(`[session-isolate] dropped stale record for ${sessionId} (worktree gone)`);
            }
        }
    }
    /**
     * Auto-commit one session's worktree after its turn ended. Deduplicated by
     * the last `turn/end` seq; never commits the shared checkout.
     */
    maybeCommitTurn(ctx, agent) {
        if (agent.status !== 'idle')
            return;
        const end = agent.session.events.findLast(event => event.type === 'turn/end');
        const turn = end?.data?.turn;
        if (end === undefined || !Number.isSafeInteger(turn) || turn < 0)
            return;
        if ((this.committed.get(agent.id) ?? -1) >= end.seq)
            return;
        this.committed.set(agent.id, end.seq);
        void recordOf(agent.id).then((record) => {
            if (record === undefined)
                return;
            void agent.runMaintenance(async (signal) => {
                if (signal.aborted)
                    return;
                await this.commitTurn(agent.id, record, turn);
            }).catch((error) => {
                ctx.logger.warn(`[session-isolate] turn commit failed for ${agent.id}: ${error instanceof Error ? error.message : String(error)}`);
            });
        });
    }
    /** Commit the worktree to its session branch. Returns true when a commit was made. */
    async commitTurn(sessionId, record, turn) {
        const made = await commitAll(record.worktree, `turn ${turn} (session isolation)`);
        await updateRecord(sessionId, { lastTurn: turn });
        return made;
    }
    /**
     * Ensure `agent`'s session owns an isolated worktree. Creates the worktree
     * and branch on first use; reuses the existing record afterwards. Throws
     * with a user-facing message when the session has no Git workspace.
     */
    async ensureIsolated(agent) {
        const cwd = agent.session.header.cwd;
        if (cwd === undefined)
            throw new Error('this session has no workspace directory; isolation needs a Git checkout');
        const repo = await findRepoRoot(cwd);
        if (repo === undefined)
            throw new Error(`workspace is not inside a Git repository: ${cwd}`);
        const existing = await recordOf(agent.id);
        if (existing !== undefined && existsSync(existing.worktree)) {
            return { repo: existing.repo, worktree: existing.worktree, branch: existing.branch, created: false, linked: existing.linked ?? [] };
        }
        const worktree = worktreePathFor(repo, agent.id);
        const branch = branchFor(agent.id);
        if (!(await isRegisteredWorktree(repo, worktree))) {
            await addWorktree(repo, worktree, branch);
        }
        const linked = await linkDependencies(repo, worktree);
        await putRecord(agent.id, {
            repo,
            worktree,
            branch,
            createdAt: new Date().toISOString(),
            linked,
        });
        return { repo, worktree, branch, created: true, linked };
    }
    /** Status snapshot for one session's isolation. */
    async statusOf(agent) {
        const record = await recordOf(agent.id);
        if (record === undefined)
            return { isolated: false };
        if (!existsSync(record.worktree))
            return { isolated: false };
        const branchCommits = await branchLog(record.repo, 'HEAD', record.branch);
        const diffStat = await branchDiffStat(record.repo, record.branch);
        const uncommitted = await hasChanges(record.worktree);
        return {
            isolated: true,
            repo: record.repo,
            worktree: record.worktree,
            branch: record.branch,
            branchCommits: branchCommits === '' ? undefined : branchCommits,
            diffStat: diffStat === '' ? undefined : diffStat,
            uncommitted,
        };
    }
    /** Commit the session worktree now (manual fallback for the auto-commit). */
    async commitNow(agent, message) {
        const record = await recordOf(agent.id);
        if (record === undefined || !existsSync(record.worktree)) {
            throw new Error('this session is not isolated yet; call iso_start first');
        }
        const made = await commitAll(record.worktree, message ?? `session checkpoint (${agent.id})`);
        return { committed: made, branch: record.branch, worktree: record.worktree };
    }
    /**
     * Merge the session branch into the MAIN checkout. This is the only
     * operation that mutates the shared checkout; it is explicit and
     * user-visible. Returns the merge outcome; on conflict the caller should
     * offer `iso_abort_merge`.
     */
    async exportToMain(agent) {
        const record = await recordOf(agent.id);
        if (record === undefined || !existsSync(record.worktree)) {
            throw new Error('this session is not isolated yet; call iso_start first');
        }
        const head = await currentBranch(record.repo);
        const result = await mergeIntoMain(record.repo, record.branch, `merge session ${agent.id} (${record.branch})`);
        if (result.ok) {
            return { merged: true, branch: record.branch, message: `merged ${record.branch} into ${head} on the main checkout` };
        }
        return {
            merged: false,
            branch: record.branch,
            message: `merge failed (exit ${result.code})`,
            conflict: result.stderr || result.stdout,
        };
    }
    /** Abort an in-progress merge on the main checkout. */
    async abortMergeOnMain(agent) {
        const record = await recordOf(agent.id);
        if (record === undefined)
            throw new Error('this session is not isolated');
        await runGit(record.repo, ['merge', '--abort']);
        return { aborted: true };
    }
    /** Remove the linked worktree; keeps the branch by default. */
    async cleanup(agent, options) {
        const record = await recordOf(agent.id);
        if (record === undefined) {
            throw new Error('this session is not isolated');
        }
        if (existsSync(record.worktree)) {
            await removeWorktree(record.repo, record.worktree);
        }
        let branchDeleted = false;
        if (options.deleteBranch) {
            await deleteBranch(record.repo, record.branch);
            branchDeleted = true;
        }
        await forgetRecord(agent.id);
        return { worktreeRemoved: true, branchDeleted, branch: record.branch };
    }
    /**
     * Fork this session into a NEW session whose cwd is the isolated worktree.
     * The child inherits the parent's composition (same tools) and its history
     * up to the last completed turn; everything the child does afterwards lands
     * in the session's own worktree and branch, never in the shared checkout.
     */
    async forkIsolated(agent) {
        const isolated = await this.ensureIsolated(agent);
        const events = agent.session.events;
        const boundary = events.findLast(event => event.type === 'turn/end');
        const cut = boundary === undefined ? 0 : boundary.seq + 1;
        const childId = `session-${randomUUID()}`;
        const parentCtx = agent.ctx;
        const agentPresets = this.ctx.agentPresets;
        const seed = events.slice(0, cut);
        await this.ctx.agents.create({
            sessionId: childId,
            seed,
            meta: {
                cwd: isolated.worktree,
                parentSession: agent.id,
                seedLength: cut,
            },
            setup: (agentCtx) => {
                // Join the parent's exact standing composition; rosterless hosts fall
                // back to the default preset mount.
                if (agentPresets !== undefined) {
                    const joined = agentPresets.composeFrom(agentCtx, parentCtx);
                    if (joined === undefined)
                        return agentPresets.mount(agentCtx);
                }
                return undefined;
            },
        });
        return { sessionId: childId, worktree: isolated.worktree, branch: isolated.branch };
    }
}
/** Junction-link ignored dependency directories from the main checkout into the worktree. */
async function linkDependencies(repo, worktree) {
    const linked = [];
    for (const candidate of LINK_CANDIDATES) {
        const target = join(repo, candidate);
        const link = join(worktree, candidate);
        if (!existsSync(target) || existsSync(link))
            continue;
        try {
            await mkdir(join(worktree, relative(worktree, link)), { recursive: true }).catch(() => undefined);
            await symlink(target, link, 'junction');
            linked.push(candidate);
        }
        catch {
            // Dependency linking is best-effort; a worktree without node_modules can
            // still be used for Git-isolated file work.
        }
    }
    return linked;
}
/** Whether the worktree has uncommitted changes. */
async function hasChanges(worktree) {
    const result = await runGit(worktree, ['status', '--porcelain']);
    return result.ok && result.stdout.trim() !== '';
}
export default SessionIsolateService;
//# sourceMappingURL=index.js.map