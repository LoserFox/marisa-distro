/**
 * The live-preview route of the Subagent page ('subagents.live'): one
 * request per refresh instead of N per-child `subagents.history` calls.
 *
 * The route takes the already-resolved topology root (`rootSessionId`),
 * enumerates the whole descendant tree ONCE through the host subagent
 * runtime (`ctx.get('subagents')` / `listDescendants`), keeps only rows the
 * catalog reports running (`activity: 'running'` — the same gate the client
 * renders cards on), and folds the newest text/tool activity from each
 * child's attached session event log. It never touches DSH source and never
 * reads the model's `job_output` cursor.
 *
 * Degradation contract:
 * - `ctx.get('subagents')` missing or `listDescendants` failure → 503 (the
 *   Subagent page has no topology to show in such deployments anyway).
 * - One child's events missing/corrupt → that child is skipped, the rest of
 *   the batch still returns.
 */
import type { Context } from './context-types.ts';
import { type LastActivity } from './subagent-activity.ts';
/** The live-preview routes of the /sidebar JSON API. */
export interface SidebarSubagentLiveRoutes {
    /**
     * Fold one tree's running subagent histories into a compact live map.
     * @param payload - `{ rootSessionId }`.
     * @returns `{ live: Record<childSessionId, LastActivity> }`; children with
     *   no text/tool yet are omitted.
     */
    live(payload: unknown): Promise<{
        live: Record<string, LastActivity>;
    }>;
}
/**
 * The recent-message window of the live preview: only the last 12 surface
 * messages of a child's log are folded, matching the old per-card
 * `subagents.history({ maxMessages: 12 })` window. Keeps stale tool calls
 * out of the preview and bounds the backward scan per child.
 */
export declare const LIVE_WINDOW_MESSAGES = 12;
/**
 * Build the live-preview routes bound to the plugin context.
 * @param ctx - host plugin context.
 */
export declare function buildSubagentLiveApi(ctx: Context): SidebarSubagentLiveRoutes;
