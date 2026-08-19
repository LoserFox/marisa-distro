/**
 * M2 — semantic link pass: writes genealogy edges into the `links` table.
 *
 * Fork lineage (child session → parent), issue ↔ sessions (executed-in),
 * capture → issue (derives, from promotion), decision → session (raised-in),
 * issue parentId (derives). Link ids are deterministic hashes of
 * (fromType, fromId, toType, toId, kind), so re-runs are idempotent — the
 * same logical edge overwrites instead of duplicating.
 * @module @fakechris/dsh-track/graph/links
 */
import type { TrackStore } from '../store.ts';
import type { Link } from '../types.ts';
export interface LinkPassResult {
    /** Links written (or would be written when dryRun). */
    links: number;
    byKind: Record<string, number>;
    sessions: number;
    issues: number;
    captures: number;
    decisions: number;
}
/** Deterministic link id — idempotent across re-runs. */
export declare function semanticLinkId(fromType: Link['fromType'], fromId: string, toType: Link['toType'], toId: string, kind: Link['kind']): string;
/**
 * Write (or preview) the semantic link pass over the whole store.
 * @param store track store.
 * @param dryRun preview counts without writing (default false).
 */
export declare function writeSemanticLinks(store: TrackStore, dryRun?: boolean): Promise<LinkPassResult>;
