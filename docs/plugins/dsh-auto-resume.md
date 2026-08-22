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
- 构建：`scripts/build-client.mjs`（esbuild + `__ModuleLoader__` wrapper → `dist/client.js`）；测试 `test/unit.mjs`（node:test，9 例覆盖中断判定全分支 + client bundle 导出契约）。

## rc8 修复（2026-08-22）：client bundle 必须声明 inject

rc8 冒烟（headless Chromium 加载真实 web）发现启动即报 `failed to apply loader entry (@dsh-external/dsh-auto-resume): cannot get property "slots" without inject`，整个 GUI 卡在 boot 失败页。根因：`src/client.jsx` 只导出 `apply`，未导出 `inject`；Cordis 的 ctx 代理仅按插件 `inject` 白名单解析 `ctx.<service>`（见 harness `vendor/cordis/src/reflect.ts`），`apply()` 里 `ctx.slots.inject(...)` 直接抛错。对照 `dsh-bash-terminal` 的同款 slots 用法（声明 `export const inject = ["slots", "locale", "settingsScope"]`）。

修复：`src/client.jsx` 增加 `export const inject = ['slots']`（locale 保持 `ctx.get()` 可选读取，不设硬依赖）并重建 `dist/client.js`；`test/unit.mjs` 新增「client bundle exports inject with slots」回归用例。验证证据：`node test/unit.mjs` 9/9 通过；stage 后端 boot + headless Chromium 冒烟，boot 页无插件失败横幅、应用完整挂载（截图 `release/smoke-rc8-fixed.png`）。

## 同步动作

- 本插件无上游，同步动作 = 无；harness 升级时核对 `conversation.input.right` owner 契约（`InputZone` 的 `input`/`inputActions`）与 aria-label 文案是否变化。
- 若未来要发布 npm，按 npm 快照登记方式迁移（当前 `mode: fork` + repository 指向发行版仓库自身）。

## 2026-08-22 修复：发送按钮原位替换（order:999）

`conversation.input.right` 座位实际渲染在工具行**起点**，导致播放按钮出现在发送按钮左侧而非原位。修复：按钮 CSS 增加 `order:999` 推到 flex 行尾（= 发送按钮原位置），模型选择器、上下文环等其它控件保持在它左侧；注释与 README 同步说明槽位语义。`dist/client.js` 由 `scripts/build-client.mjs` 重建（源码路径注释干净化，去除 worktree 路径）。验证：`node test/unit.mjs` 全过；真机 GUI 挂载后目测按钮位于发送按钮原位。

## 2026-08-23 依赖区间迁移

0.1.1-rc.2 迁移收敛的一部分：`@deepseek-ai/*` 依赖区间从 `^0.1.0-rc.6`/`^0.1.0-rc.8` 统一改为 `workspace:^`（workspace 成员）或 `^0.1.1-rc.2`（registry 包）。机械替换，无代码改动；解析目标从 registry rc.8 副本树切换到 workspace rc.2 树。反馈上游：待同步窗口。
