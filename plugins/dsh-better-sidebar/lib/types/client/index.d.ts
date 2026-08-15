import type { Context } from '../context-types.ts';
import './layout.css';
/** Services required before mounting (provided by the client runtime; the
 *  locale service backs the sidebar's copy — see locales.ts). */
export declare const inject: string[];
/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions).
 */
export declare function apply(ctx: Context): void;
