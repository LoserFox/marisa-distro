#!/usr/bin/env node
// whale-girl-desktop 入口。
// - 纯 Node 运行（node lib/index.mjs）：headless 模式（心跳 + 状态 + SSE + 日志），
//   或 --headless 显式指定。用于自测/CI/无桌面环境。
// - Electron 运行（electron . / electron lib/index.mjs）：创建透明置顶桌面窗渲染宠物，
//   核心引擎（companion）在 Electron main 进程内运行，经 IPC 把动画意图推给 renderer。

import { loadConfig } from './src/config.mjs'
import { createLogger } from './client/utils.mjs'

// 解析 CLI（在 import 副作用前做，避免被测试覆盖）
const cfg = loadConfig()
const log = createLogger({ tag: 'whale-girl-desktop' })

const isElectronMain = typeof process !== 'undefined' && process.versions?.electron !== undefined
const headless = !cfg.renderEnabled || process.argv.includes('--headless')
const renderJson = process.argv.includes('--render-json')

if (renderJson) {
  // —— JSON-lines 渲染桥：轻量原生渲染壳（Tauri）消费 ——
  // 动画意图/快照/回话写 stdout（每行一个 JSON），命令从 stdin 读（interact/stop）。
  // 渲染壳零引擎改动：与 Electron/headless 共用 createCompanion 与 hooks 接口。
  // 日志重定向到 stderr：stdout 只承载 JSON 行（渲染壳逐行解析，混入日志行会污染流）。
  const origLog = console.log.bind(console)
  console.log = (...args) => process.stderr.write(`${args.join(' ')}\n`)
  const { createCompanion } = await import('./client/companion.mjs')
  const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)
  const companion = await createCompanion(cfg, {
    onSnapshot: (snap) => out({ type: 'snapshot', snapshot: snap }),
    onAnimation: (anim) => out({ type: 'anim', name: anim.name, context: anim.context }),
    onReply: (reply) => out({ type: 'reply', reply }),
  })
  out({ type: 'ready', baseURL: cfg.baseURL })
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        const cmd = JSON.parse(line)
        if (cmd.type === 'interact') companion.interact(cmd.action ?? 'feed')
        else if (cmd.type === 'stop') companion.stop().then(() => process.exit(0))
      } catch { /* 忽略坏行 */ }
    }
  })
  const shutdown = () => companion.stop().then(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  // 渲染壳（父进程）退出后管道关闭：写 stdout 会 EPIPE——优雅退出而非崩栈。
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0)
  })
} else if (isElectronMain && !headless) {
  // —— Electron main 路径：桌面渲染 ——
  // 注意：不要顶层 await runDesktop()——runDesktop 内部 await app.whenReady()，
  // 若在入口模块顶层 await，会阻塞 Electron 事件循环导致 ready 永不触发（ESM main 陷阱）。
  // 改为 fire-and-forget：runDesktop 自带 async 生命周期，错误会先记录再退出。
  const { runDesktop } = await import('./render/window.mjs')
  process.nextTick(() => {
    runDesktop({ cfg, log }).catch((err) => {
      try { log.error('桌面渲染启动失败:', err?.message ?? err) } catch {}
      process.exit(1)
    })
  })
} else {
  // —— headless 路径：只跑核心（心跳 + 状态 + SSE），供自测与无桌面环境 ——
  const { createCompanion } = await import('./client/companion.mjs')
  const companion = await createCompanion(cfg, {
    onSnapshot: (snap) => {
      const act = snap?.activity?.name ?? '?'
      const lv = snap?.pet?.level ?? '?'
      const online = snap?.companionOnline === true
      log.info(`state: activity=${act} Lv.${lv} companionOnline=${online}`)
    },
    onAnimation: (anim) => log.debug(`anim → ${anim.name}`),
    onReply: (reply) => log.info(`reply: ${reply}`),
  })
  log.info(`headless 模式运行中：BaseURL=${cfg.baseURL} pollMs=${cfg.pollMs} heartbeatMs=${cfg.heartbeatMs}`)
  log.info('按 Ctrl+C 退出（退出时自动发送 {online:false}）')

  const shutdown = () => {
    companion.stop().then(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  // 兜底：引擎内部异常基本已 catch，未捕获拒绝仅记录不静默（进程保持运行/重试）。
  process.on('unhandledRejection', (err) => log.warn('unhandled rejection:', err?.message ?? err))
}