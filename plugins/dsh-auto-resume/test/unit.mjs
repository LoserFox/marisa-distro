import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isInterrupted } from '../src/interrupted.js'

function session(overrides = {}) {
  return {
    running: false,
    removed: false,
    openState: 'open',
    partial: null,
    nodes: [],
    turnTimings: undefined,
    ...overrides,
  }
}

const timings = (endTime) => {
  const m = new Map()
  m.set(1, { endTime })
  return m
}

test('not interrupted: missing session', () => {
  assert.equal(isInterrupted(undefined), false)
  assert.equal(isInterrupted(null), false)
})

test('not interrupted: running, removed, or not open', () => {
  assert.equal(isInterrupted(session({ running: true })), false)
  assert.equal(isInterrupted(session({ removed: true })), false)
  assert.equal(isInterrupted(session({ openState: 'closed' })), false)
})

test('interrupted: unfinished partial stream', () => {
  assert.equal(isInterrupted(session({ partial: { seq: 5 } })), true)
})

test('interrupted: last assistant node flagged interrupted', () => {
  assert.equal(isInterrupted(session({ nodes: [{ kind: 'assistant', interrupted: true }] })), true)
})

test('interrupted: max-tokens turn node', () => {
  assert.equal(isInterrupted(session({ nodes: [{ kind: 'turn-max-tokens' }] })), true)
})

test('interrupted: open turn-timing entry without endTime', () => {
  assert.equal(isInterrupted(session({ turnTimings: timings(undefined) })), true)
})

test('not interrupted: completed turn timing', () => {
  assert.equal(isInterrupted(session({ turnTimings: timings(12345) })), false)
})

test('not interrupted: finished assistant node, closed timing', () => {
  const s = session({
    nodes: [{ kind: 'assistant', interrupted: false }],
    turnTimings: timings(12345),
  })
  assert.equal(isInterrupted(s), false)
})

// Regression (rc8 boot failure): the client bundle must export `inject` with
// the services apply() reads via ctx.<service> (ctx.slots). Without it the
// Cordis ctx proxy throws `cannot get property "slots" without inject` and the
// web boot page reports the plugin as failed, blocking the whole GUI.
test('client bundle exports inject with slots', () => {
  let registration
  globalThis.window = { __ModuleLoader__: { load: (r) => { registration = r } } }
  const bundle = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
  new Function(bundle)() // eslint-disable-line no-new-func
  assert.ok(registration, 'bundle did not register via __ModuleLoader__.load')
  const exports = registration.factory(() => ({ jsx: () => null, jsxs: () => null }))
  assert.deepEqual(exports.inject, ['slots'])
  assert.equal(typeof exports.apply, 'function')
})
