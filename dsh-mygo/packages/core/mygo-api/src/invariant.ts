/**
 * Package-owned invariant companion for `@r05en1cu/dsh-mygo-api`.
 * @module @r05en1cu/dsh-mygo-api/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@r05en1cu/dsh-mygo-api'

/** Cordis companion plugin name. */
export const name = 'dsh-mygo-api-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a type/contract surface plus pure
 * message templating and a fake-env test harness; its value algebra is
 * enforced by unit tests.
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
