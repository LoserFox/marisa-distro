import type { Context } from './context-types.ts';
import { AgentPtyRegistry } from './agent-pty.ts';
/**
 * Bound a string to a byte limit, marking truncation. Truncation never
 * splits a multi-byte UTF-8 sequence: when the byte cap lands inside one,
 * the walk-back retreats to the sequence's leading byte so the retained
 * prefix decodes cleanly (a split would decode to U+FFFD).
 * @internal exported for the unit tests, like {@link snapshotOf}.
 */
export declare function boundBytes(text: string, maxBytes: number): {
    text: string;
    truncated: boolean;
};
/**
 * Register the eight terminal tools against the host tool registry. The
 * `resolveCwd` callback threads the live session cwd (authoritative from the
 * session store, falling back to the process cwd) so a freshly-created
 * terminal lands in the right directory without the model passing it.
 * Every uuid-keyed tool first asserts the terminal belongs to the calling
 * session (`registry.assertOwned`), so one agent can never reach another
 * session's terminals.
 * @param ctx - host plugin context (carries the tools service).
 * @param registry - the agent-owned terminal registry.
 * @param resolveCwd - live cwd resolver for one session id.
 * @returns a disposer that unregisters all eight tools (the caller gates
 * registration on the side-card setting and calls this to turn them off).
 */
export declare function registerTools(ctx: Context, registry: AgentPtyRegistry, resolveCwd: (sessionId: string) => string, readShellOverrides: () => {
    shell?: string;
    shellArgs?: string[];
}): () => void;
