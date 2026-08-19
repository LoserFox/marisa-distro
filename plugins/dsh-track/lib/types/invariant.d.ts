/**
 * Package-owned invariant companion for `@fakechris/dsh-track`.
 *
 * Follows the official plugin-template convention: the companion is a separate
 * Cordis plugin (`dsh-track-invariant`) that registers dsh-track's runtime
 * invariants with the host `invariants` service. The harness mounts
 * `test-invariants` over real compositions (see `verify-package-invariants`
 * / the repo hygiene gates); a profile that composes dsh-track WITHOUT the
 * services it injects fails here with a named reason instead of silently
 * degrading at first tool call.
 * @module @fakechris/dsh-track/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "dsh-track-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
