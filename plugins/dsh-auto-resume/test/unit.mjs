import { test } from 'node:test'
import assert from 'node:assert/strict'
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
