import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESENCE_TTL_MS, pokePresence, companionOnline } from '../lib/src/presence.mjs'

test('presence TTL is a positive finite window', () => {
  assert.ok(Number.isFinite(PRESENCE_TTL_MS) && PRESENCE_TTL_MS > 0)
})

test('online poke extends the presence window from now', () => {
  const until = pokePresence(0, 1000, true)
  assert.equal(until, 1000 + PRESENCE_TTL_MS)
  // 连续续命窗口顺延（不叠加，只取最新）
  const next = pokePresence(until, 1000 + 10000, true)
  assert.equal(next, 1000 + 10000 + PRESENCE_TTL_MS)
})

test('offline poke ends the window immediately', () => {
  assert.equal(pokePresence(99999, 1000, false), 0)
  assert.equal(companionOnline(0, 1000), false)
})

test('companionOnline flips at the absolute deadline', () => {
  const until = 1000 + PRESENCE_TTL_MS
  assert.equal(companionOnline(until, 1000), true)
  assert.equal(companionOnline(until, until - 1), true)
  assert.equal(companionOnline(until, until), false)
})
