/**
 * Background-job routes of the /sidebar JSON API ('jobs.output' /
 * 'jobs.kill'). The job LIST needs no route: it arrives through the
 * harness's `session/jobs` push mirror (`jobsBySession` in the sessions
 * list feed). The routes:
 *
 * - 'jobs.output' — REPLAYS the output the MODEL has read so far for one
 *   job. The source is the owner session's own event log: `tool/call` rows
 *   of `job_output` name the job via `arguments.job_id`, and the paired
 *   `tool/result` rows carry the finalized content the model received.
 *   Because the session store's in-memory log can lag the live append feed
 *   after a host restart (the store session stays frozen at its
 *   rehydration boundary), the plugin ALSO mirrors job_output events from
 *   the live `session/event` feed and merges both sources (deduped by seq).
 *   This touches NO DSH source: the model's `job_output` cursor is never
 *   consumed, and the pane stays empty until the agent reads the job.
 * - 'jobs.kill' — the registry's stock `kill` (a pristine DSH API),
 *   fenced by the owning session via the live agent caller. Absent registry
 *   → 503, mirroring the settings routes' optional-service downgrade.
 */
import type { Context } from './context-types.ts';
/** The two background-job routes of the sidebar API. */
export interface SidebarJobsRoutes {
    /** The output the model has read so far for one job (event replay, capped). */
    output(payload: unknown): {
        text: string;
        truncated: boolean;
        read: boolean;
    };
    /** Request cancellation of one job (live jobs flip to stopping). */
    kill(payload: unknown): {
        ok: true;
        outcome: 'requested' | 'already-finished';
    };
}
/**
 * Build the jobs routes bound to the plugin context. `output` merges the
 * owner session's own event log with the live job_output mirror; `kill`
 * reads the jobs/agents services lazily and degrades to a 503 when the
 * deployment lacks the registry.
 * @param ctx - host plugin context.
 * @param outputLimit - response cap for one output replay in bytes; longer
 *   texts are sliced and flagged `truncated` (mirrors the fs.read cap).
 */
export declare function buildJobsApi(ctx: Context, outputLimit: number): SidebarJobsRoutes;
