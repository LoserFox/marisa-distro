// 浏览器级行为验证（人工验证步骤，非门禁——依赖 Chrome 与运行中的 web，同 verify-client-smoke）。
// 用法：node scripts/verify-client-behavior.mjs <web-url> [scenario]
// 场景：sleep-drag-wake（默认）——验证「sleep → 拖拽 → 放下 → idle 缓冲 → wake → 保持清醒
// 不回 sleep」完整链路（v6 交互醒觉回归防线，见决策记录 2026-08-10-client-behavior-probe.md）。
// 此前同类验证是一次性 /tmp/cdp-*.mjs 探针（不入库、不可重跑）——本文件固化场景，
// 断言失败非零退出，供 client 行为改动后重跑。
// 依赖：本机 Chrome（CHROME_BIN 可覆盖）；Node ≥22（全局 WebSocket）。
import { spawn } from 'node:child_process'

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.argv[2]
const SCENARIO = process.argv[3] ?? 'sleep-drag-wake'
const DEBUG_PORT = 9240

if (!URL) {
  console.error('用法: node scripts/verify-client-behavior.mjs <web-url> [scenario]')
  process.exit(2)
}

// ---- CDP 基础（headless Chrome + Runtime/Input）----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function connect() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1280,800', URL], { stdio: 'ignore' })
  let ws
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()
      const page = tabs.find((t) => t.type === 'page')
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
    } catch {}
  }
  if (!ws) { chrome.kill(); throw new Error('CDP 连接失败（Chrome 未就绪）') }
  await new Promise((r) => { ws.onopen = r })
  let id = 0
  const call = (method, params) => new Promise((resolve) => {
    const myId = ++id
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id === myId) { ws.removeEventListener('message', onMsg); resolve(m.result) }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
  await call('Runtime.enable')
  return { chrome, call }
}
/** 读取当前 sprite 的 sheet 名（background-image URL 末段）与 motion 类——状态观察面。 */
const SNAP = `(() => {
  const sprite = document.querySelector('[data-whale-girl] .pet-sprite')
  const stage = document.querySelector('[data-whale-girl] .pet-stage')
  if (!sprite || !stage) return JSON.stringify({ ok: false })
  const m = (sprite.style.backgroundImage || '').match(/[a-z-]+\\.png/)
  const motion = [...stage.classList].find((c) => c.startsWith('pet-motion-')) || ''
  return JSON.stringify({ ok: true, sheet: m ? m[0].replace('.png', '') : 'unknown', motion: motion.replace('pet-motion-', '') })
})()`

// ---- 场景：sleep → drag → 放下 → 清醒不回 sleep ----
// 走真实时间（sleepAfterMs=60000 + 3s 轮询）；断言序列是 v6 交互醒觉的契约：
// 放下后 1.5s 缓冲 idle → wake（3s）→ 底层状态，10s 内不得回到 sleep。
async function sleepDragWake({ call, log }) {
  await call('Runtime.evaluate', { expression: `(() => {
    const t = document.getElementById('deepseek-onboarding-title')
    if (t) t.remove()
    const labelled = document.querySelector('[aria-labelledby="deepseek-onboarding-title"]')
    if (labelled) labelled.remove()
    return 'ok'
  })()`, returnByValue: true })
  await sleep(1500) // 等 onboarding 隐藏的宠物恢复显示（syncInert 经 MutationObserver）
  const read = async (label) => {
    const r = await call('Runtime.evaluate', { expression: SNAP, returnByValue: true })
    const v = JSON.parse(r.result.value)
    log(label, `${v.ok ? v.sheet + '/' + v.motion : 'no-sprite'}`)
    return v
  }
  // 轮询等待某状态出现（消除固定 sleep 的时序脆弱性——headless 下事件/资源处理有抖动）。
  const waitFor = async (label, predicate, timeoutMs = 4000) => {
    const start = Date.now()
    let last = null
    while (Date.now() - start < timeoutMs) {
      last = await read(label)
      if (last.ok && predicate(last)) return last
      await sleep(250)
    }
    throw new Error(`等待 ${label} 超时（最后状态 ${last?.ok ? last.sheet : '无 sprite'}）`)
  }
  await read('initial')
  log('wait', '等待 65s 让宠物入睡（sleepAfterMs=60000 + 轮询粒度）')
  await sleep(65000)
  await waitFor('after-65s', (v) => v.sheet === 'sleep')

  const r0 = await call('Runtime.evaluate', { expression: `(() => {
    const hit = document.querySelector('[data-whale-girl] .pet-hitarea')
    const rect = hit.getBoundingClientRect()
    return JSON.stringify({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) })
  })()`, returnByValue: true })
  const { x, y } = JSON.parse(r0.result.value)
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await sleep(200)
  for (let i = 1; i <= 10; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - i * 25, y, button: 'left' })
    await sleep(30)
  }
  await waitFor('during-drag', (v) => v.sheet === 'drag')
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 250, y, button: 'left', clickCount: 1 })
  // 放下后：1.5s idle 缓冲 → wake（3s）→ 底层状态，全程不得回 sleep。
  await waitFor('release-idle-buffer', (v) => v.sheet === 'idle', 3000)
  await waitFor('release-wake', (v) => v.sheet === 'wake', 4000)
  const t3 = await waitFor('release-settled', (v) => v.sheet !== 'wake' && v.sheet !== 'sleep', 5000)
  if (t3.sheet === 'sleep') throw new Error('放下后回到 sleep（空闲计时未重置）')
  await sleep(5000)
  const t4 = await read('release+10s')
  if (t4.sheet === 'sleep') throw new Error('放下 10s 后回到 sleep（空闲计时未重置）')
  return { during: 'drag', releaseWake: 'wake', settled: t3.sheet, release10s: t4.sheet }
}

const SCENARIOS = { 'sleep-drag-wake': sleepDragWake }

async function main() {
  const scenario = SCENARIOS[SCENARIO]
  if (scenario === undefined) {
    console.error(`未知场景 "${SCENARIO}"（可用：${Object.keys(SCENARIOS).join(', ')}）`)
    process.exit(2)
  }
  const { chrome, call } = await connect()
  try {
    const log = (label, detail) => console.log(`  [${label}] ${detail}`)
    console.log(`[verify-client-behavior] 场景 ${SCENARIO} @ ${URL}`)
    const result = await scenario({ call, log })
    console.log(`[verify-client-behavior] OK：${JSON.stringify(result)}`)
    process.exit(0)
  } catch (error) {
    console.error(`[verify-client-behavior] FAIL：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  } finally {
    chrome.kill()
  }
}

main()
