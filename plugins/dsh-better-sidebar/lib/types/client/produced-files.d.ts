/** Paths a tool-result view reports as produced, by render intent. */
export declare function producedPaths(view: unknown): readonly string[];
/**
 * Files produced by the turn the assistant at `seq` closes. Accumulation
 * resets on turn boundaries (a user message, or a node reporting a different
 * turn number); paths keep first-seen order and appear once.
 * @param nodes - snapshot nodes in surface order (structural, unknown-safe).
 * @param seq - the closing assistant's seq (the render site's anchor).
 * @returns produced paths; empty when the turn wrote nothing.
 */
export declare function producedForClosing(nodes: readonly unknown[], seq: number): readonly string[];
/**
 * Claim the turn-tail chain only when the closing turn produced files.
 * @param owner - the turn-tail owner currency ({nodes, seq}).
 * @returns produced paths as the matched value, or null to decline.
 */
export declare function selectProducedFiles(owner: unknown): readonly string[] | null;
/**
 * Resolve a (possibly relative) path against the session cwd for the sidebar.
 * Absolute detection mirrors the host (see client/paths.isAbsolutePath):
 * POSIX roots, drive letters and UNC shares must not be joined onto the cwd.
 */
export declare function resolveSidebarPath(cwd: string | undefined, path: string): string;
