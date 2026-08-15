/**
 * Package-owned invariant companion for `dsh-better-sidebar`.
 * @module dsh-better-sidebar/invariant
 */
import type { Context } from './context-types.ts';
/** Cordis companion plugin name. */
export declare const name = "dsh-better-sidebar-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
