// src/signals.mjs 单测（node:test）。归属：pet 服务信号器改动跑本文件。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSignals } from '../lib/src/signals.mjs'

test('订阅收到信号与 payload', () => {
  const s = createSignals()
  const got = []
  s.subscribe((sig, payload) => got.push([sig, payload]))
  s.emit('celebrate', { level: 3 })
  s.emit('failure', {})
  assert.deepEqual(got, [['celebrate', { level: 3 }], ['failure', {}]])
})

test('退订后不再收到', () => {
  const s = createSignals()
  let count = 0
  const unsub = s.subscribe(() => { count += 1 })
  s.emit('celebrate')
  unsub()
  s.emit('celebrate')
  assert.equal(count, 1)
})

test('多订阅者各自收到；单个抛错不影响其余（异常隔离）', () => {
  const s = createSignals()
  const got = []
  s.subscribe(() => { throw new Error('boom') })
  s.subscribe((sig) => got.push(sig))
  assert.doesNotThrow(() => s.emit('session', { kind: 'new' }))
  assert.deepEqual(got, ['session'])
})

test('无订阅者时 emit 安全', () => {
  const s = createSignals()
  assert.doesNotThrow(() => s.emit('celebrate'))
})

test('size 反映当前订阅数（退订后减少）', () => {
  const s = createSignals()
  const unsub = s.subscribe(() => {})
  assert.equal(s.size(), 1)
  unsub()
  assert.equal(s.size(), 0)
})
