import type { Context } from '../../context-types.ts';
import type { TabDescriptor } from '../service.ts';
/** How many UI-owned terminals may be open at once (agent-owned ones are uncapped). */
export declare const TERMINAL_LIMIT = 3;
/** The 7 built-in tab descriptors. */
export declare function builtinTabs(ctx: Context): readonly TabDescriptor[];
