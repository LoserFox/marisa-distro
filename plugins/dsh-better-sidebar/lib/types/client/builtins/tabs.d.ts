import type { Context } from '../../context-types.ts';
import type { TabDescriptor } from '../service.ts';
/** How many UI-owned terminals may be open at once (agent-owned ones are uncapped). */
export declare const TERMINAL_LIMIT = 3;
/** Optional per-registration builtin behavior (currently terminal title). */
export interface BuiltinTabOptions {
    /** Returns the display title for newly opened terminal tabs. */
    terminalTitle?: () => string;
}
/** The 6 built-in tab descriptors. */
export declare function builtinTabs(ctx: Context, options?: BuiltinTabOptions): readonly TabDescriptor[];
