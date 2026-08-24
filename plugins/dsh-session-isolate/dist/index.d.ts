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
import { Service, type Context } from 'cordis';
import type { SessionIsolateConfig } from './types.js';
export * from './git.js';
export * from './state.js';
export * from './types.js';
/** Live-agent facade the coordinator needs (kept structural to stay resilient). */
export interface AgentLike {
    readonly id: string;
    readonly status: 'idle' | 'running';
    readonly session: {
        readonly header: {
            readonly cwd?: string;
        };
        readonly events: readonly {
            readonly type: string;
            readonly seq: number;
            readonly data: Record<string, unknown>;
        }[];
    };
    readonly ctx: Context;
    runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
interface AgentsLike {
    list(): AgentLike[];
    create(options: CreateAgentOptionsLike): Promise<unknown>;
}
/** Structural view of CreateAgentOptions (agent factory contract). */
interface CreateAgentOptionsLike {
    readonly sessionId: string;
    readonly meta?: {
        readonly cwd?: string;
        readonly parentSession?: string;
        readonly seedLength?: number;
        readonly agentPreset?: string;
    };
    readonly seed?: readonly {
        readonly type: string;
        readonly seq: number;
        readonly time?: number;
        readonly data?: unknown;
    }[];
    readonly agentOptions?: Record<string, unknown>;
    readonly setup?: (agentCtx: Context) => unknown;
}
/** Optional preset-composition service (rosterless hosts omit it). */
interface AgentPresetsLike {
    composeFrom(agentCtx: Context, parentCtx: Context): string | undefined;
    mount(agentCtx: Context, id?: string): Promise<unknown>;
}
declare module 'cordis' {
    interface Context {
        sessionIsolate: SessionIsolateService;
        agents: AgentsLike;
        agentPresets?: AgentPresetsLike;
    }
    interface Events {
        'agent/created'(payload: {
            readonly agent: AgentLike;
        }): void;
        'agent/status'(payload: {
            readonly agent: AgentLike;
            readonly status: 'idle' | 'running';
        }): void;
    }
}
/** Cordis service exposed as `ctx.sessionIsolate`. */
export declare class SessionIsolateService extends Service {
    static inject: string[];
    private readonly committed;
    constructor(ctx: Context, config?: SessionIsolateConfig);
    /** Idle-boundary turn commits for every isolated session. */
    private install;
    /** Forget state records whose worktrees no longer exist (crash/cleanup leftovers). */
    private reconcileStartup;
    /**
     * Auto-commit one session's worktree after its turn ended. Deduplicated by
     * the last `turn/end` seq; never commits the shared checkout.
     */
    private maybeCommitTurn;
    /** Commit the worktree to its session branch. Returns true when a commit was made. */
    private commitTurn;
    /**
     * Ensure `agent`'s session owns an isolated worktree. Creates the worktree
     * and branch on first use; reuses the existing record afterwards. Throws
     * with a user-facing message when the session has no Git workspace.
     */
    ensureIsolated(agent: AgentLike): Promise<{
        readonly repo: string;
        readonly worktree: string;
        readonly branch: string;
        readonly created: boolean;
        readonly linked: readonly string[];
    }>;
    /** Status snapshot for one session's isolation. */
    statusOf(agent: AgentLike): Promise<{
        readonly isolated: boolean;
        readonly repo?: string;
        readonly worktree?: string;
        readonly branch?: string;
        readonly branchCommits?: string;
        readonly diffStat?: string;
        readonly uncommitted?: boolean;
    }>;
    /** Commit the session worktree now (manual fallback for the auto-commit). */
    commitNow(agent: AgentLike, message?: string): Promise<{
        readonly committed: boolean;
        readonly branch: string;
        readonly worktree: string;
    }>;
    /**
     * Merge the session branch into the MAIN checkout. This is the only
     * operation that mutates the shared checkout; it is explicit and
     * user-visible. Returns the merge outcome; on conflict the caller should
     * offer `iso_abort_merge`.
     */
    exportToMain(agent: AgentLike): Promise<{
        readonly merged: boolean;
        readonly branch: string;
        readonly message: string;
        readonly conflict?: string;
    }>;
    /** Abort an in-progress merge on the main checkout. */
    abortMergeOnMain(agent: AgentLike): Promise<{
        readonly aborted: boolean;
    }>;
    /** Remove the linked worktree; keeps the branch by default. */
    cleanup(agent: AgentLike, options: {
        readonly deleteBranch: boolean;
    }): Promise<{
        readonly worktreeRemoved: boolean;
        readonly branchDeleted: boolean;
        readonly branch: string;
    }>;
    /**
     * Fork this session into a NEW session whose cwd is the isolated worktree.
     * The child inherits the parent's composition (same tools) and its history
     * up to the last completed turn; everything the child does afterwards lands
     * in the session's own worktree and branch, never in the shared checkout.
     */
    forkIsolated(agent: AgentLike): Promise<{
        readonly sessionId: string;
        readonly worktree: string;
        readonly branch: string;
    }>;
}
export default SessionIsolateService;
