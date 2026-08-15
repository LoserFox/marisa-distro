/**
 * Pure derivation of one turn's produced files from finalized conversation
 * nodes — a structural replica of ui-deliverables' `producedForClosing`
 * (the mutation tools' follow-along `locations`, by render intent: a diff
 * card or a generic edit card; reads/deletes/failures produce nothing).
 * Kept dependency-free so the takeover logic is unit-testable and the
 * replica is easy to diff against upstream when it drifts.
 */
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
/** Resolve a (possibly relative) path against the session cwd for the sidebar. */
export declare function resolveSidebarPath(cwd: string | undefined, path: string): string;
