/**
 * Package-owned invariant companion for `@r05en1cu/dsh-mygo`.
 * @module @r05en1cu/dsh-mygo/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@r05en1cu/dsh-mygo'

/** Cordis companion plugin name. */
export const name = 'dsh-mygo-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the #12 skeleton owns mount-time validation of plugin
 * declarations, and the declaration-to-verdict algebra is enforced by unit
 * tests; dispatch and lifecycle invariants arrive with later manager stages.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
