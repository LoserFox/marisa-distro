/**
 * Model-facing tools of dsh-session-isolate. All tools operate on the
 * calling session's OWN worktree and branch; nothing here mutates the shared
 * checkout except iso_export (the explicit merge) and iso_abort_merge.
 * @module dsh-session-isolate/tools
 */
import type { Context } from 'cordis';
import type { SessionIsolateService } from './index.js';
/** Register the iso_* tool family. */
export declare function registerTools(ctx: Context, service: SessionIsolateService): void;
