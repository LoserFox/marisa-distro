/** One search: the relative paths of the matching entries (dirs included so
 *  the client can hint where matches live) plus the truncation flag. */
export interface FsSearchResult {
    matches: string[];
    truncated: boolean;
}
/** Search budgets (both injectable for tests). */
export interface FsSearchOptions {
    /** Row cap of the result list (default 200). */
    maxMatches?: number;
    /** Total entries visited before the walk gives up (default 100_000). */
    maxVisited?: number;
}
/**
 * Search `root` recursively for entries whose name contains `query`
 * (case-insensitive).
 * @param root - absolute search root.
 * @param query - the name substring; empty matches nothing.
 * @param opts - budget overrides (tests).
 * @returns the matching paths RELATIVE to `root` ('/'-separated), sorted,
 *  plus whether a budget cut the walk short. An unreadable level is skipped
 *  (permission errors never fail the whole search).
 */
export declare function searchFiles(root: string, query: string, opts?: FsSearchOptions): Promise<FsSearchResult>;
