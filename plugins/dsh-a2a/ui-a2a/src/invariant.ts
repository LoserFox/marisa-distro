/**
 * Package-owned invariant companion for `@dpskh/ui-a2a`.
 * @module @dpskh/ui-a2a/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dpskh/ui-a2a'

/** Cordis companion plugin name. */
export const name = 'ui-a2a-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: A2A Mesh owns status and change events, while
 * Connection owns channel registration and teardown. This package projects
 * those authoritative relationships without maintaining a second durable
 * relationship; Host bridge and browser behavior tests cover the projection.
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
