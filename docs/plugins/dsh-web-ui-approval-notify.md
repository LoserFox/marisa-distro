# dsh-web-ui-approval-notify fork

上游：`bill9109/dsh-web-ui-notify`（上游 v0.1.3 即最新，无更新可同步）。本地维护
的差异：

- Vitest 指向本仓库 harness 的兼容路径（`vitest.config.ts`）：
  - `@deepseek-ai/dsh-client-test-runtime` 在本 harness（rc7+）位于
    `packages/test-support/client-runtime/src`（上游配置指向
    `packages/client/test-runtime/src`，本 pin 无此目录）；
- `tsdown.config.mjs` 用 `node:url` 的 `pathToFileURL` 加载
  `DSH_CHECKOUT/packages/client/tsdown.client.ts`，修复 Windows 下
  `import('C:\…')` 非合法 ESM URL 的构建失败（建议反馈上游）；
- `tsconfig.json` 的 `types` 增加 `"node"`（host 半边注册路由需要
  node:http / process / Buffer 类型）。

## 桌面壳原生 toast 机制（2026-08-22，插件→宿主桥接）

背景：WebView2 的 web Notification API 默认走 WebView2 自绘的（Edge 风格）
通知 UI，不是 Windows 原生 toast（实证：操作中心历史库无记录）；Wails 不
暴露 WebView2 controller，宿主接管 `NotificationReceived` 的路走不通。
且 DSH 客户端插件拿不到 profile 行 config（`__DSH_BOOT__` entry 只带
id/url/rev/inject），浏览器半的开关只能靠壳侧。

方案（插件→宿主桥接，零新 npm 依赖）：

1. **桌面壳**（`desktop/toast_bridge.go` + `main.go`）：
   - 注册 Wails 通知服务（`pkg/services/notifications`，Windows 用 wintoast，
     启动时自注册 `Software\Classes\AppUserModelId\<Name>` + CLSID
     LocalServer32 activator，无需安装器快捷方式）；
   - 开本地回环 HTTP 监听（127.0.0.1:0），`POST /toast {title, body}` →
     `SendNotification`（wintoast 每次调用自行 RoInitialize，任意 goroutine
     安全）；应用启动后 `markReady` 放行；
   - 端口注入后端环境 `MARISA_TOAST_PORT`（后端子进程继承壳环境）。
2. **插件 host 半边**（`src/index.ts`，原先是 no-op）：`inject=['webServer']`，
   注册同源路由 `/plugins/dsh-web-ui-approval-notify/toast`，把 `{title, body}`
   POST 转发到 `http://127.0.0.1:<MARISA_TOAST_PORT>/toast`；端口缺失回 503。
3. **插件浏览器半**（`src/client/notify.ts` + `index.ts`）：
   - `desktopShellNow()`（`'_wails' in window`）时把通知意图 POST 到该路由
     （原生 toast），失败回退 `new Notification`（WebView2 默认 UI）；
   - 普通浏览器保持上游行为（`new Notification` + 点击跳转）；
   - 「离开」判定扩展为 `awayNow()`：页面隐藏 **或**（壳内窗口失焦）——
     桌面壳里切走不最小化时 `visibilityState` 仍是 `visible`，上游的
     hidden-only 闸门在壳内几乎永不触发（实证：窗口失焦时 vis=visible
     focus=false）；
   - 注册全局钩子 `window.__dshWebUiNotifyOpen(sessionId)`（随 fiber 卸载
     删除），供壳在 toast 点击时经 ExecJS 调用。
4. **点击跳转**：通知意图带 `sessionId` → 桥把它放进 `NotificationOptions.Data`
   → wintoast 编码进 toast 激活载荷（实证：launch base64 解码含
   `data.sessionId`）→ 点击时 `OnNotificationResponse` 回传
   `UserInfo["sessionId"]` → 桌面 `Show+Focus` 并 `ExecJS`
   `window.__dshWebUiNotifyOpen?.("<sid>")` → 客户端 `sessions.open`。
5. **提醒默认打开**：`desktop/main.go` 注入 `requestNotificationPermissionJS`
   （启动时自动请求一次通知权限，壳全局 ALLOW 立即放行；回退路径所需）。
6. **通知样式设置**（追加）：设置 → 通用 的「桌面通知」行新增「通知样式」
   下拉（localStorage `dsh-web-ui-notify.style`，默认 `native`）：
   - **系统原生 (Windows Toast)**：壳内走上面的桥接链路（默认）；
   - **浏览器默认 (WebView2)**：壳内也直接用 `new Notification`（WebView2
     自绘 UI），不经过原生桥；
   普通浏览器无原生桥，始终为浏览器默认。偏好存 localStorage——客户端插件
   读不到 profile 行 config（`__DSH_BOOT__` 只带 id/url/rev/inject），
   浏览器半的开关只能靠壳侧/localStorage。

权限影响（AGENTS.md 要求注明）：本插件 host 半边新增网络能力——仅向
`127.0.0.1:<MARISA_TOAST_PORT>`（壳注入的随机回环端口）发起 POST；桌面壳
新增 127.0.0.1 回环监听。均不触外网、不写盘（除 wintoast 注册表项与临时
图标文件，wails 服务自带行为）。

## 测试证据（2026-08-22）

- `vitest run`（repo 根工具链 + DSH_CHECKOUT=harness）：3 个文件 36 项全过
  （browser-plugin 23：含壳内失焦→路由委派（sessionId 随 POST）、路由失败
  →回退 Notification、浏览器 parity、`__dshWebUiNotifyOpen` 钩子跳转/未知
  会话静默；settings-row 5；host-routes 8：503/400/405/502/转发（含
  sessionId）/端点解析）。
- `go build/vet` + `go test -tags installedbundle/embeddedbundle`（desktop
  改动，含 `toast_bridge_test.go`：Data.sessionId 映射、400/405/500、
  openSessionJS 转义）全过。
- 端到端实证：真实 Wails 通知服务 + 桥的测试 exe，`POST /toast`（带
  sessionId）返回 204；操作中心历史库（wpndatabase.db）出现
  `primary=Marisa DSH`、`activationType="foreground"` 的原生 toast，激活
  载荷 base64 解码含 `{"data":{"sessionId":"s-test-42"}}`——点击回传链路
  数据面验证通过（真实点击后的 ExecJS 跳转待发行构建后人工验收）。

## 子代理会话完成不再弹「会话完成」通知（2026-08-27，fork 差异）

问题：后台 subagent 返回时也会弹「会话完成」通知。根因：subagent（child）
会话也是列表行（`origin: 'subagent'`），runtime 的
`syncCompletedNotifications` 对**任何**非选中会话的 running→idle 沿都会挂
`completed` 完成提醒，插件 `scanList` 的整会话完成分支不区分来源，于是
subagent 一结束就为子会话弹「会话完成」toast——而子代理的返回本来就会经父
会话的 turn-end 通知体现，子会话的 toast 纯属噪音。

修复（`src/client/index.ts` `scanList`）：整会话完成通知跳过
`origin === 'subagent'` 行（`sid !== current && summary.origin !== 'subagent'
&& summary.completed === true`）。子代理行的**待交互**通知（approval/
question，子代理卡住等输入）保留——那正是该通知的用途，不受影响。

测试证据（2026-08-27，vitest 3 文件 41 项全过）：新增
`browser-plugin.spec.ts` 用例——子代理行 `completed: true` 零通知；同一子
代理行挂 question 仍通知（标题含子会话名）；旁边普通后台会话完成仍通知。
`lib/` 产物已随本次修复重建（lib/client.js 含 `origin !== "subagent"` 判断）。

## 构建注意（2026-08-27）：harness rc8 下 scripts/build.mjs 失效

harness 换到 rc8 后，`packages/client/tsdown.client.ts` 预设新增
`workspaceManifest` 校验：按包名在 harness 的 `packages/*/*/package.json`
里查 manifest，独立于 workspace 的插件直接构建报错（且脚本的
`symlinkSync` 在无权限的 Windows 上还先 EPERM）。临时绕过法（本次重建
lib/ 用）：

1. `node_modules` 链接改用 junction（`fs.symlinkSync(…, 'junction')`）指向
   harness/node_modules，再按需 junction 工作区包与 react/@types/react；
2. 在 harness 下建真实目录 `packages/plugins/dsh-web-ui-approval-notify/`
   只放一份 package.json 拷贝（预设只读 manifest；glob 不进 junction）；
   构建完删除该目录与残留链接，harness 零改动；
3. `tsc -p tsconfig.json` + `tsdown -c tsdown.config.mjs`（DSH_CHECKOUT 指
   向 harness）。

建议反馈上游：插件 tsdown 配置自包含化（参照 dsh-stickers/dsh-sonar 的
自带预设写法），彻底摆脱对 harness workspace 的构建期依赖。

## 同步时验证通知权限、托盘行为和客户端审批事件。
