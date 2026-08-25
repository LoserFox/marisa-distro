import type { Context } from './context-types.ts';
import { type SidechatThreadInfo } from './sidechat-core.ts';
/** The five Side Chat routes of the sidebar API (wire method names). */
export interface SidechatRoutes {
    /** Create a side thread child seeded with the parent's log up to now.
     *  `question` is optional: empty creates an EMPTY thread (Codex-style
     *  immediate create); the first `sidechat.prompt` then carries the
     *  boundary + snapshot and earns the thread its real label. */
    'sidechat.start'(payload: unknown): Promise<{
        childId: string;
    }>;
    /** Deliver one follow-up message to a thread (live, or cold-resumed). */
    'sidechat.prompt'(payload: unknown): Promise<{
        accepted: true;
    }>;
    /** Abort the thread's running turn (queued work is preserved). */
    'sidechat.cancel'(payload: unknown): Promise<{
        accepted: true;
    }>;
    /** Release the thread's live agent (session and history stay persisted). */
    'sidechat.dispose'(payload: unknown): Promise<{
        accepted: true;
    }>;
    /** Live state + agent identity for the thread header. */
    'sidechat.info'(payload: unknown): Promise<SidechatThreadInfo>;
}
/** Build the Side Chat routes (all optional services degrade to a wire
 *  error the tab surfaces inline). The record keys are the FULL wire method
 *  names the /sidebar/api dispatcher looks up (`api[method]`). */
export declare function buildSidechatApi(ctx: Context): SidechatRoutes;
