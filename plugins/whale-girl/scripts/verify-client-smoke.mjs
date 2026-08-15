// 浏览器级冒烟：验证 client half 在真实浏览器里 apply 成功且宠物真的渲染。
// 用法：node scripts/verify-client-smoke.mjs <web-url>
// 前置：验证站 web 运行中；本机有 Chrome（CHROME_BIN 可覆盖路径）。
// 断言：无 "Failed to load plugins"（client apply 未抛错）；[data-whale-girl] 存在；
//       舞台有可见内容（.pet-sprite.ready sprite 渲染）。
// 这是 curl 覆盖不到的 client-apply 验证（P6 缺口实操面）——改 client/ 后跑一次。
// 非门禁（依赖 Chrome 与运行中的 web）：人工验证步骤，见 AGENTS.md 按改动面选检查。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.argv[2]
const DEBUG_PORT = 9240
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!URL) {
  console.error('用法: node scripts/verify-client-smoke.mjs <web-url>')
  process.exit(2)
}
if (!existsSync(CHROME)) {
  console.error(`[verify-client-smoke] Chrome 不可用：${CHROME}（用 CHROME_BIN 覆盖）`)
  process.exit(2)
}

/** 元素级断言（避免 CSS 选择器/模块源码字符串假绿）。 */
function analyze(html) {
  const errors = []
  if (html.includes('Failed to load plugins') || html.includes('plugin tree failed to load')) {
    errors.push('页面出现 harness/插件树加载失败（client apply 失败）')
  }
  // 元素 vs CSS：host 元素是 <div data-whale-girl=""（属性带 =），CSS 是 [data-whale-girl]。
  if (!/<div data-whale-girl[=> ]/.test(html)) errors.push('未找到 [data-whale-girl] 元素（client half 未 apply）')
  if (!/<span class="pet-lv"/.test(html)) errors.push('状态条未渲染（apply 可能中途抛错）')
  // 舞台：sprite 元素（含 background-image）。
  const stageHasSprite = /<div class="pet-stage[^"]*"[^>]*>\s*<div class="pet-sprite[^>]*background-image/.test(html)
  if (!stageHasSprite) errors.push('宠物舞台为空（sprite 未渲染）')
  // motion 配方生效（idle 兜底态必为 pet-motion-bob）与账本渲染（任务计数）——回归防线。
  if (!/pet-motion-[a-z]+/.test(html)) errors.push('未找到 pet-motion-* 运动类（motion 配方未生效）')
  if (!/<span class="pet-stats"[^>]*>\d+ 任务/.test(html)) errors.push('账本统计未渲染（任务计数缺失）')
  // transform 合法性：sprite 的 transform 必须是合法 scale 数值（曾因 scale(NaN) 整条被
  // 浏览器丢弃——尺寸变大 + flip 失效双回归，此处防线）。v5 起 transform 是
  // translate(-50%,-50%) scale(s) scaleX(flip) 组合——从 sprite 内联 style 提取首个 scale()。
  if (stageHasSprite) {
    const m = /<div class="pet-sprite[^>]*style="[^"]*transform:[^"]*scale\(([^)]+)\)/.exec(html)
    if (m === null || Number.isNaN(Number(m[1])) || !Number.isFinite(Number(m[1]))) {
      errors.push('sprite transform 非法（scale 非有限数——尺寸/flip 可能回归）')
    }
  }
  return { errors, stageHasSprite }
}

// dump 改 CDP 真实时间模式：`--virtual-time-budget` 与 SSE 长连接（/whale-girl/events
// EventSource）不兼容——虚拟时间等网络空闲而 SSE 永不空闲，--dump-dom 会挂起。
// 真实时间下等宠物渲染（assets + 首次 /state 往返）后再抓 DOM，analyze 断言不变。
async function dump() {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1280,800', URL], { stdio: 'ignore' })
  let ws
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()
      const page = tabs.find((t) => t.type === 'page')
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
    } catch { /* Chrome 未就绪，重试 */ }
  }
  if (!ws) { chrome.kill(); return '' }
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
  // 等宠物渲染：client apply + assets 加载 + 首次 /state 往返（SSE 建立不阻塞）。
  await sleep(3500)
  const r = await call('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })
  chrome.kill()
  return typeof r?.result?.value === 'string' ? r.result.value : ''
}

// 真实时间下资源加载时序不稳定：最多 3 次 dump，任一绿即过。
let last = null
for (let attempt = 1; attempt <= 3; attempt++) {
  last = analyze(await dump())
  if (last.errors.length === 0) break
  if (attempt < 3) console.error(`[verify-client-smoke] 第 ${attempt} 次 dump 未绿，重试…`)
}
if (last.errors.length > 0) {
  for (const e of last.errors) console.error(`[verify-client-smoke] ${e}`)
  process.exit(1)
}
console.log('[verify-client-smoke] OK：client apply 成功，宠物以 sprite 渲染')
