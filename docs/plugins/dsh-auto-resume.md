# dsh-auto-resume

本地第一方插件（2026-08-22 落地）：会话被意外终止（用户停止 / max-tokens / 后端崩溃恢复）后，composer 发送按钮**原位变成播放 ▶ 按钮**，点击即发送「继续」恢复对话。

## 来源

- 无上游仓库：基于 2026-08-21 会话（DSH GUI `session-0f67ffb8`，19:56）的 Cordis 动态插件实验落地——原型的 run-2 版本（`resume-1` 插件，注册 `conversation.input.right` + `setDraft('继续')+submit()`）已实测成功。
- 交互按用户要求调整：不是发送按钮**旁**的独立按钮，而是**替换发送按钮本体**（隐藏官方按钮 + 原位播放按钮）。

## 实现要点

- client-only 插件，注册 `conversation.input.right` 座位（发送按钮左侧 tool row 座位）。
- 原位替换：CSS `:has()` + 兄弟选择器隐藏官方发送按钮（`div[data-slot="conversation.input.right"]:has(button.dsh-resume-play) ~ button[aria-label="发送消息"|"Send message"]`）——纯插件侧样式覆盖，不修改 harness 源码。
- 中断判定（`src/interrupted.js` 的 `isInterrupted`）：未运行 + 仍打开 + （未完成 partial / 最后节点 `assistant.interrupted` / `turn-max-tokens` / 未闭合回合计时）。
- 点击动作复用输入机：`setDraft('继续')` + `submit()`（与官方 max-tokens 提示一致）。
- 构建：`scripts/build-client.mjs`（esbuild + `__ModuleLoader__` wrapper → `dist/client.js`）；测试 `test/unit.mjs`（node:test，8 例覆盖中断判定全分支）。

## 同步动作

- 本插件无上游，同步动作 = 无；harness 升级时核对 `conversation.input.right` owner 契约（`InputZone` 的 `input`/`inputActions`）与 aria-label 文案是否变化。
- 若未来要发布 npm，按 npm 快照登记方式迁移（当前 `mode: fork` + repository 指向发行版仓库自身）。
