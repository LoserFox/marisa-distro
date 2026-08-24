/**
 * Model-facing tools of dsh-session-isolate. All tools operate on the
 * calling session's OWN worktree and branch; nothing here mutates the shared
 * checkout except iso_export (the explicit merge) and iso_abort_merge.
 * @module dsh-session-isolate/tools
 */
const OBJECT_OUTPUT = {
    schema: { type: 'object' },
    render: (_args, value) => [{ type: 'text', text: formatValue(value) }],
};
/** Register the iso_* tool family. */
export function registerTools(ctx, service) {
    const harness = ctx;
    harness.effect(() => {
        const disposers = [
            harness.tools.register({
                name: 'iso_start',
                description: 'Isolate THIS session into its own Git worktree and branch. Creates a linked worktree under ~/.dsh/worktrees and a branch iso/<session>; from now on all file work and Git commands for this session should happen INSIDE that worktree path (use the pwsh workdir argument, absolute paths in read/write, and git -C). The main checkout is never touched. Idempotent: calling again returns the existing isolation.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                output: OBJECT_OUTPUT,
                async execute(_args, exec) {
                    const agent = requireAgent(exec);
                    return service.ensureIsolated(agent);
                },
                presentCall() {
                    return { card: 'generic', title: 'Isolate session into a worktree' };
                },
            }),
            harness.tools.register({
                name: 'iso_status',
                description: 'Show this session\'s isolation state: worktree path, branch, commits ahead of the main checkout, uncommitted changes. Read-only.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                output: OBJECT_OUTPUT,
                async execute(_args, exec) {
                    const agent = requireAgent(exec);
                    return service.statusOf(agent);
                },
                presentCall() {
                    return { card: 'generic', title: 'Session isolation status' };
                },
            }),
            harness.tools.register({
                name: 'iso_commit',
                description: 'Commit all current changes in this session\'s worktree to its own iso/<session> branch. Automatic turn-end commits already do this; use this tool for an explicit checkpoint mid-turn. Never touches the main checkout.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        message: { type: 'string', description: 'Optional commit message.' },
                    },
                },
                output: OBJECT_OUTPUT,
                async execute(args, exec) {
                    const agent = requireAgent(exec);
                    const message = optionalString(objectArgs(args).message, 'message');
                    return service.commitNow(agent, message);
                },
                presentCall(args) {
                    return { card: 'generic', title: `Commit session worktree${typeof args.message === 'string' ? `: ${args.message}` : ''}` };
                },
            }),
            harness.tools.register({
                name: 'iso_export',
                description: 'Merge this session\'s iso/<session> branch into the MAIN checkout\'s current branch with --no-ff. This is the ONLY operation that modifies the shared checkout; it should be used only when the user asks to bring the session\'s work back into the main workspace. On conflict it returns the conflict output without committing — call iso_abort_merge to roll back, or resolve in the main checkout.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                output: OBJECT_OUTPUT,
                async execute(_args, exec) {
                    const agent = requireAgent(exec);
                    return service.exportToMain(agent);
                },
                presentCall() {
                    return { card: 'generic', title: 'Export session branch to main checkout' };
                },
            }),
            harness.tools.register({
                name: 'iso_abort_merge',
                description: 'Abort an in-progress iso_export merge on the main checkout (git merge --abort). Use after a conflicted iso_export.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                output: OBJECT_OUTPUT,
                async execute(_args, exec) {
                    const agent = requireAgent(exec);
                    return service.abortMergeOnMain(agent);
                },
                presentCall() {
                    return { card: 'generic', title: 'Abort merge on main checkout' };
                },
            }),
            harness.tools.register({
                name: 'iso_cleanup',
                description: 'Remove this session\'s linked worktree. The iso/<session> branch is kept by default so the work can be merged later; set delete_branch=true to delete the branch as well. Idempotent.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        delete_branch: { type: 'boolean', description: 'Also delete the iso/<session> branch. Defaults to false.' },
                    },
                },
                output: OBJECT_OUTPUT,
                async execute(args, exec) {
                    const agent = requireAgent(exec);
                    const input = objectArgs(args);
                    return service.cleanup(agent, { deleteBranch: input.delete_branch === true });
                },
                presentCall(args) {
                    return { card: 'generic', title: args?.delete_branch === true ? 'Remove worktree and branch' : 'Remove worktree' };
                },
            }),
            harness.tools.register({
                name: 'iso_fork',
                description: 'Fork THIS session into a new session that runs entirely inside this session\'s isolated worktree (creating it if needed). The child session inherits the conversation history up to the last completed turn and the same tools, but its workspace is the isolated worktree: everything the child does — file edits, git commands, builds — happens in its own worktree and iso/<branch>, completely independent of the main checkout and of other sessions. The user opens the returned session id in the GUI to continue there.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                output: OBJECT_OUTPUT,
                async execute(_args, exec) {
                    const agent = requireAgent(exec);
                    return service.forkIsolated(agent);
                },
                presentCall() {
                    return { card: 'generic', title: 'Fork session into isolated worktree' };
                },
            }),
        ];
        return () => { for (const dispose of disposers)
            dispose(); };
    });
}
function requireAgent(exec) {
    if (exec.agent === undefined)
        throw new Error('this tool requires a session');
    return exec.agent;
}
function objectArgs(args) {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return {};
    return args;
}
function optionalString(value, name) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value === '')
        throw new Error(`${name} must be a non-empty string`);
    return value;
}
function formatValue(value) {
    try {
        return `${JSON.stringify(value, null, 2)}\n`;
    }
    catch {
        return `${String(value)}\n`;
    }
}
//# sourceMappingURL=tools.js.map