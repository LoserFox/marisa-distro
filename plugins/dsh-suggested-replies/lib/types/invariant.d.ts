/**
 * Package-owned invariant companion for suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin identity. */
export declare const name = "dsh-suggested-replies-invariant";
/** Service required before the package can reserve its invariant namespace. */
export declare const inject: string[];
/** Register the package invariant companion. */
export declare const apply: (ctx: Context) => Promise<() => void>;
