/**
 * Runnable examples from the author guide — the tutorial's code
 * blocks are these exact sources, guarded by REAL-composition tests so a
 * documented example can never drift into a non-runnable state.
 * @module dsh-mygo/tests/author-examples
 */

/** Example A: the minimal definePlugin from the tutorial. */
export const MINIMAL_PLUGIN_CODE = `module.exports = {
  id: 'hello-plugin',
  version: '1.0.0',
  kinds: ['example'],
  requires: [],
  provides: [],
  permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
  stateful: false,
  swapPolicy: 'immediate',
  config: () => ({}),
  hooks: {
    activate(env) {
      env.on('tools/change', () => {
        ;(globalThis.__authorHello ??= { count: 0 }).count += 1
      })
    },
  },
}`

/** Example B: the permissions + grants guard from the tutorial. */
export const GUARD_PLUGIN_CODE = `module.exports = {
  id: 'guard-plugin',
  version: '1.0.0',
  kinds: ['example'],
  requires: [],
  provides: [],
  permissions: {
    observe: [],
    transform: [],
    intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
    position: 'derived',
    claims: [],
  },
  stateful: false,
  swapPolicy: 'immediate',
  config: () => ({}),
  hooks: {
    activate(env) {
      env.on('tools/pre-execute', (_payload, next) => {
        ;(globalThis.__authorGuard ??= { count: 0 }).count += 1
        // Delegating guard: call next() to allow; return { kind: 'deny' } to veto.
        return next()
      })
    },
  },
}`
