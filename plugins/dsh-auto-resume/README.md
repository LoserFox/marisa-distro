# dsh-auto-resume

会话被意外终止（用户停止、max-tokens、后端崩溃恢复）后，composer 的发送按钮**原位变成播放按钮**——点击即发送「继续」恢复对话。

## 行为

- **触发条件**：当前会话未在运行、仍打开，且最后回合带中断证据（未完成 partial 流 / assistant 节点 `interrupted: true` / max-tokens 回合 / 未闭合的回合计时）。
- **交互**：满足条件且草稿为空时，发送按钮（「发送消息」）被隐藏，原位显示播放 ▶ 按钮（同尺寸、品牌色）；点击后通过输入动作 `setDraft('继续') + submit()` 发送「继续」。
- **自动消失**：点击后草稿非空 → 快照重渲染 → 播放按钮消失，发送按钮回归。
- 中英文文案：继续 / Continue（经 `locale` 服务注册）。

## 实现

- client-only 插件：注册 `conversation.input.right` 座位（发送按钮左侧的 tool row 座位）。
- 原位替换用 CSS `:has()`：`div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="发送消息"|"Send message"]` 隐藏官方发送按钮——不修改 harness 源码，纯插件侧样式覆盖。
- 中断判定独立于 `src/interrupted.js`（`isInterrupted`），`test/unit.mjs` 覆盖全分支（node:test）。

## 构建与测试

```sh
node scripts/build-client.mjs   # 生成 dist/client.js（esbuild + __ModuleLoader__ wrapper）
node test/unit.mjs              # isInterrupted 分支测试
```

## 边界与已知限制

- 判定基于会话投影快照（slot owner 的 `session`/`input`），不订阅额外事件流；会话状态变化由现有快照重渲染驱动。
- 只处理「可继续」的普通中断；子代理运行中、会话关闭、会话被移除不显示播放按钮。
- 发送内容固定为「继续」，与官方 max-tokens 提示的建议一致。
