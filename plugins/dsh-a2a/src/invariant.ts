/**
 * Package-owned invariant companion for `@dpskh/a2a`.
 * @module @dpskh/a2a/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dpskh/a2a'

/** Cordis companion plugin name. */
export const name = 'a2a-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Assert the presence stream stays well-formed: every `a2a/presence-changed`
 * carries a non-empty project, agent id, name, and presence id, and the
 * connected state never flips twice in a row (connect when connected, or
 * disconnect when not, both indicate a membership bookkeeping bug).
 */
const install: InvariantInstaller = (ctx: Context, fail: InvariantFailure) => {
  // Per-presence state: one process may host several presences.
  const connected = new Map<string, boolean>()
  ctx.on('a2a/presence-changed', (payload) => {
    if (
      payload.project.length === 0
      || payload.agentId.length === 0
      || payload.name.length === 0
      || payload.presenceId.length === 0
    ) {
      fail('a2a/presence-changed must carry non-empty project, agentId, name, and presenceId')
    }
    const key = `${payload.project}/${payload.name}`
    if (payload.joined === connected.get(key)) {
      fail(`a2a/presence-changed repeated ${payload.joined ? 'connect' : 'disconnect'} state for ${key}`)
    }
    connected.set(key, payload.joined)
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
