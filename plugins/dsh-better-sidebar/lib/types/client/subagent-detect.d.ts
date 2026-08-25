/**
 * Pure subagent-membership helpers over the sessions list feed (structural
 * mirror world — no runtime imports). Used by the sidebar's auto-activation
 * effect and the Subagent page:
 *
 * - {@link directSubagentCount}: direct durable children of one session,
 * - {@link detectNewDirectSubagent}: the 0 → N transition that means "a new
 *   subagent just spawned under the current session" (the auto-open trigger),
 * - {@link countSubagentDescendants}: uninterrupted subagent-origin lineage
 *   totals (mirror of the official `indexSubagentDescendants` over the
 *   plugin's own summary rows).
 */
import type { SidebarSessionList, SidebarSessionSummary, SidebarSubagentCatalog } from '../context-types.ts';
/**
 * Side Chat threads ride the subagent origin (main-list hiding + the RPC
 * ownership fence) but they are NOT subagent topology: they carry the
 * durable 'Side: ' label and live as sidebar tabs. Excluding them here
 * keeps the auto-open trigger and the Subagent page counts clean.
 */
export declare function isSideThreadSummary(summary: SidebarSessionSummary): boolean;
/** Count the direct subagent children of one session (durable `origin` rows). */
export declare function directSubagentCount(byId: SidebarSessionList['byId'], sessionId: string): number;
/**
 * The main agent of the current session's tree: walk the durable parent
 * chain upward until the first non-subagent session. The Subagent page shows
 * THIS root's full topology regardless of how deep the current selection is
 * (a session whose row is still hydrating, or a broken chain, degrades to
 * the session itself).
 */
export declare function rootAncestor(byId: SidebarSessionList['byId'], sessionId: string | undefined): string | undefined;
/**
 * Collect every catalog branch (an entry with `hasChildren`) reachable from
 * the root — the set of catalogs the always-expanded topology consumes.
 * Cycles fail soft.
 */
export declare function collectBranchIds(catalogs: Readonly<Record<string, SidebarSubagentCatalog>>, rootId: string | undefined): string[];
/**
 * Whether a new direct subagent appeared under `sessionId` between two
 * consecutive list snapshots (the count crossed 0 → >0). Switching to a
 * session that already has subagents yields `false` (its baseline starts at
 * the current count), so the auto-open never fights an existing layout.
 */
export declare function detectNewDirectSubagent(prev: SidebarSessionList, next: SidebarSessionList, sessionId: string): boolean;
/** Descendant totals of one session through an uninterrupted subagent-origin chain. */
export interface SubagentDescendantTotals {
    count: number;
    runningCount: number;
}
/**
 * Index every subagent descendant under each ancestor it reaches through an
 * uninterrupted subagent-origin chain (same semantics as the official
 * `indexSubagentDescendants`; cycles fail soft).
 */
export declare function countSubagentDescendants(byId: SidebarSessionList['byId'], sessionId: string): SubagentDescendantTotals;
