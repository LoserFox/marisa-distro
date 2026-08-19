import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SNAPSHOT_API_VERSION,
  TURN_COMPLETED_MS,
  turnCompletionSnapshot,
} from '../lib/src/snapshot.mjs'

test('snapshot contract has an explicit initial version', () => {
  assert.equal(SNAPSHOT_API_VERSION, 1)
})

test('turn completion is non-consuming for multiple readers', () => {
  const until = 1000 + TURN_COMPLETED_MS
  const first = turnCompletionSnapshot(until, 1000)
  const second = turnCompletionSnapshot(until, 1000)
  assert.deepEqual(first, second)
  assert.deepEqual(first, { turnCompleted: true, turnCompletedUntil: until })
})

test('turn completion expires at its absolute deadline', () => {
  const until = 5000
  assert.equal(turnCompletionSnapshot(until, 4999).turnCompleted, true)
  assert.deepEqual(
    turnCompletionSnapshot(until, 5000),
    { turnCompleted: false, turnCompletedUntil: until },
  )
})

test('invalid completion deadlines degrade to an inactive window', () => {
  assert.deepEqual(
    turnCompletionSnapshot(Number.NaN, 1000),
    { turnCompleted: false, turnCompletedUntil: 0 },
  )
})
