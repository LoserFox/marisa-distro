// Tauri 渲染桥：把 window.whaleGirl 接口接到 Tauri IPC（window.__TAURI__）。
// 与 Electron preload（render/preload.cjs 的 contextBridge）暴露同一 API 面——
// renderer.js 通过 window.whaleGirl 访问，两种渲染壳零改动复用同一渲染层。
// 仅在 Tauri webview 环境生效（Electron 下无 __TAURI__，跳过，用 preload 面）。
(() => {
  'use strict'
  if (typeof window.__TAURI__ === 'undefined') return
  const { invoke } = window.__TAURI__.core
  const { listen } = window.__TAURI__.event
  window.whaleGirl = {
    getManifest: () => invoke('get_manifest'),
    getSheet: (characterId, sheet) => invoke('get_sheet', { characterId, sheet }),
    interact: (action) => invoke('interact', { action }),
    setHitarea: (rect) => invoke('set_hitarea', { rect }),
    dragWindow: (dx, dy) => invoke('drag_window', { dx, dy }),
    onAnim: (cb) => listen('wg-anim', (e) => cb(e.payload)),
    onSnapshot: (cb) => listen('wg-snapshot', (e) => cb(e.payload)),
    onReply: (cb) => listen('wg-reply', (e) => cb(e.payload)),
  }
})()
