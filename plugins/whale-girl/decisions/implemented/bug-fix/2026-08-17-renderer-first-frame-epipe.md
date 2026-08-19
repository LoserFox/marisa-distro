# Decision: 渲染首帧空白修复 + 渲染桥 EPIPE 兜底

Status: implemented

## Problem

Tauri 渲染壳本地部署时发现宠物窗口空白：引擎首轮即产出的动画是 `idle`，而 `renderer.js` 的
`switchAnim` 在 `name === animState`（初始 `animState` 即 `'idle'`）时**同态早退**，跳过
`ensureSheet`——canvas 永远不加载/绘制首帧（Tauri 与 Electron 渲染壳都会中招；此前 Electron
验证未暴露是因为测试宿主会话活跃、首个动画非 idle）。另：`--render-json` 模式下渲染壳（父进程）
退出后管道关闭，引擎继续写 stdout 触发 **EPIPE** 未捕获 → 进程崩栈退出。

## Decision

- **renderer 同态早退兜底**（`render/renderer.js` `switchAnim`）：`name === animState` 且当前
  sheet 未缓存时补 `ensureSheet + drawFrame + reportHitarea`——首帧必渲染，重复同态事件不再重复加载。
- **渲染桥 EPIPE 兜底**（`lib/index.mjs` `--render-json` 分支）：`process.stdout.on('error')`
  捕获 `EPIPE` 后优雅退出（父进程已亡，无需继续心跳）。

## Alternatives considered

- **首帧强制非 idle 状态起步**：改引擎初始动画语义，破坏现有行为——弃。
- **渲染桥改为只写不崩（try/catch 每行）**：EPIPE 是流级错误，逐行 try 拦不住——必须挂
  `stdout` 的 `error` 事件。

## 取代检查

无重叠：`desktop/DESIGN.md` 与 `BUILD-RUN.md` 的记录为本 bug 的环境事实备注（踩坑 #6/#7），
非决策树条目；活跃决策树中无记录覆盖渲染首帧/管道错误处理。

## Consequences

- 空闲宿主（首动画即 idle）下宠物首帧正常渲染（Tauri 实测画面上屏）。
- 渲染壳崩溃/退出后引擎进程优雅退出，无 EPIPE 崩栈残留。
- 引用点：`desktop/render/renderer.js`（switchAnim）、`desktop/lib/index.mjs`（--render-json）。
