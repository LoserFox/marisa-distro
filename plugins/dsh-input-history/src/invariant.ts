/**
 * Package-owned invariant companion for `@dsh-external/dsh-input-history`.
 * @module @dsh-external/dsh-input-history/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-external/dsh-input-history'

/** Cordis companion plugin name. */
export const name = 'dsh-input-history-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the browser capture is a window event-loop effect
 * (addEventListener/removeEventListener pair owned by the plugin fiber); the
 * host half holds no runtime state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
