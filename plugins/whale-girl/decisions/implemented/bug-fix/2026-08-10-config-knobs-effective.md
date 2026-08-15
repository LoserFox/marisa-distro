# Decision: 配置项生效修复——bubbleMs 接线、pollMs 热生效

Status: implemented

## Problem

体验层配置（src/config.mjs DEFAULTS + settings schema）公开了 `bubbleMs` 与 `pollMs`，但 client 未正确消费：

- `bubbleMs`（回话气泡时长）：showReply 的消失定时器硬编码 2500ms——配置改动无任何效果（死配置项）。
- `pollMs`（/state 轮询间隔）：`setInterval` 在启动时一次性创建；applyClientConfig 更新 cfg 后不重建定时器，
  配置改动要刷新页面才生效——与 README「修改后热生效免重启」的承诺不符。

## Decision

- `bubbleMs`：showReply 的消失定时器改用 `cfg.bubbleMs`（默认 2500 不变）。
- `pollMs`：applyClientConfig 检测到 pollMs 变化时重建轮询定时器（clearInterval + setInterval 新间隔）；
  定时器句柄 `pollTimer` 可重建，dispose 清理不变。
- 默认值不变（bubbleMs=2500、pollMs=3000）——verify-config-sync 单一来源不受影响。

## Alternatives considered

**A：从配置面删除 bubbleMs（不接线）。** 气泡时长是用户可感知的体验项，删除即砍能力；
接线成本一行——接线。

**B：pollMs 注明冷生效（改动刷新页面后生效）。** 轮询间隔是低价值配置，但「热生效」是配置系统的
既定承诺（settings `applies: 'live'`）——重建定时器无风险——重建。

## Consequences

- 全部体验层配置项均实际生效；README「热生效免重启」承诺成立（尺寸/透明度/游走/睡眠/气泡/轮询）。
- 行为变化仅当用户显式配置 bubbleMs/pollMs 时可见；默认行为不变。
- 验证：build-client 重建 + 门禁全绿（client DOM 逻辑无单测面，浏览器冒烟按 AGENTS.md 人工跑）。
