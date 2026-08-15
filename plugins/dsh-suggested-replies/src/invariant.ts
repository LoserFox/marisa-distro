/**
 * Package-owned invariant companion for suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-external/dsh-suggested-replies'

/** Cordis companion plugin identity. */
export const name = 'dsh-suggested-replies-invariant'
/** Service required before the package can reserve its invariant namespace. */
export const inject = ['invariants']

/** Internal Agent logs own model history; the sidecar and freshness gate own Web state. */
const install: InvariantInstaller = () => {}

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
