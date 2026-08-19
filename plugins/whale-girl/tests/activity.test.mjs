// src/activity.mjs 单测（node:test）。归属：活动推导逻辑改动跑本文件。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveActivity, BURST_MS, mergeCelebrate } from '../lib/src/activity.mjs'

test('无任务 → idle（working=false，无 burst）', () => {
  const r = deriveActivity({ tasks: [], nowMs: 1000 })
  assert.equal(r.working, false)
  assert.equal(r.burst, null)
})

test('存在 running 任务 → working', () => {
  const r = deriveActivity({ tasks: [{ id: 't1', status: 'running' }], nowMs: 1000 })
  assert.equal(r.working, true)
  assert.equal(r.burst, null)
  assert.equal(r.wasWorking, true)
})

test('running→completed 翻转 → celebrate burst 且 completed 带任务 id', () => {
  const known = new Map([['t1', 'running']])
  const r = deriveActivity({ tasks: [{ id: 't1', status: 'completed' }], nowMs: 1000, known })
  assert.equal(r.working, false)
  assert.equal(r.burst.name, 'celebrate')
  assert.equal(r.burst.until, 1000 + BURST_MS)
  assert.deepEqual(r.completed, ['t1'])
  assert.deepEqual(r.failed, [])
})

test('running→failed 翻转 → error burst 且 failed 带任务 id', () => {
  const known = new Map([['t1', 'running']])
  const r = deriveActivity({ tasks: [{ id: 't1', status: 'failed' }], nowMs: 1000, known })
  assert.equal(r.burst.name, 'error')
  assert.deepEqual(r.failed, ['t1'])
  assert.deepEqual(r.completed, [])
})

test('errorMs 参数：失败 burst 用指定窗口（默认 BURST_MS，宿主可统一负面窗口）', () => {
  const known = new Map([['t1', 'running']])
  const r = deriveActivity({ tasks: [{ id: 't1', status: 'failed' }], nowMs: 1000, known, errorMs: 4000 })
  assert.equal(r.burst.name, 'error')
  assert.equal(r.burst.until, 5000)
})

test('上次工作且任务消失（列表只留活跃）→ celebrate burst', () => {
  const r = deriveActivity({ tasks: [], nowMs: 1000, known: new Map([['t1', 'running']]), wasWorking: true })
  assert.equal(r.burst.name, 'celebrate')
})

test('记账推进：known 更新为最新状态', () => {
  const known = new Map()
  deriveActivity({ tasks: [{ id: 't1', status: 'running' }], nowMs: 1, known })
  deriveActivity({ tasks: [{ id: 't1', status: 'completed' }], nowMs: 2, known })
  assert.equal(known.get('t1'), 'completed')
})

test('任务列表为空时清空 known（防长会话泄漏）', () => {
  const known = new Map([['t1', 'completed'], ['t2', 'failed']])
  deriveActivity({ tasks: [], nowMs: 1, known, wasWorking: false })
  assert.equal(known.size, 0)
})

test('known 收缩到当前任务集合（残留终态任务时不线性增长）', () => {
  const known = new Map([['gone', 'completed'], ['t1', 'running']])
  deriveActivity({ tasks: [{ id: 't1', status: 'running' }], nowMs: 1, known, wasWorking: true })
  assert.deepEqual([...known.keys()], ['t1'])
})

test('killed 中性：running→killed 的消失兜底不触发庆祝', () => {
  // poll N：t1 running（wasWorking=true）→ poll N+1：t1 消失（用户取消后列表清空）
  const known = new Map([['t1', 'running']])
  // 先经过 killed 状态（本轮 sawKill 置位）
  deriveActivity({ tasks: [{ id: 't1', status: 'killed' }], nowMs: 1000, known, wasWorking: true })
  // 下一轮任务消失：兜底不得因上一轮 killed 发庆祝
  const r = deriveActivity({ tasks: [], nowMs: 2000, known, wasWorking: false })
  assert.equal(r.burst, null)
})

test('killed 中性：单轮内 running→killed 不发 burst', () => {
  const known = new Map([['t1', 'running']])
  const r = deriveActivity({ tasks: [{ id: 't1', status: 'killed' }], nowMs: 1000, known, wasWorking: true })
  assert.equal(r.burst, null)
  assert.equal(r.completed.length, 0)
})

test('mergeCelebrate：无派生 burst 时事件窗口直接生效（F3 关闭期任务庆祝）', () => {
  assert.deepEqual(mergeCelebrate(null, 7000, 1000), { name: 'celebrate', until: 7000 })
})

test('mergeCelebrate：双源 celebrate 取更晚窗口（不叠加延长）', () => {
  const burst = { name: 'celebrate', until: 6000 }
  assert.deepEqual(mergeCelebrate(burst, 5000, 1000), burst) // 事件窗口更早 → 保留派生
  assert.deepEqual(mergeCelebrate(burst, 8000, 1000), { name: 'celebrate', until: 8000 }) // 事件窗口更晚 → 取事件
})

test('mergeCelebrate：error burst 优先——并发完成不盖掉失败', () => {
  const burst = { name: 'error', until: 6000 }
  assert.deepEqual(mergeCelebrate(burst, 8000, 1000), burst) // 事件 celebrate 更晚也不替换 error
})

test('mergeCelebrate：事件窗口已过期则保持原 burst（不影响轮询路径）', () => {
  const burst = { name: 'celebrate', until: 6000 }
  assert.deepEqual(mergeCelebrate(burst, 500, 1000), burst)
  assert.equal(mergeCelebrate(null, 500, 1000), null)
})

