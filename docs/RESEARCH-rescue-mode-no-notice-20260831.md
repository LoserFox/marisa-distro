# 急救模式无提示缺陷 — 归档调查

> 状态：**TODO（本轮不实施）**
> 日期：2026-08-31
> 调查范围（只读，未修改任何源文件、未构建、未联网）：
> - 主仓库 `C:\Users\lf\Documents\Workspace\marisa-distro` @ `feature/linux-support`
> - Electron worktree `C:\Users\lf\Documents\Workspace\marisa-electron-wt\desktop-electron` @ `desktop-electron`
> - 依赖源码（仅用于 API 能力取证）：`C:\Users\lf\go\pkg\mod\github.com\wailsapp\wails\v3@v3.0.0-beta.10\`（`desktop/go.mod` 固定 `v3.0.0-beta.10`）
>
> **路径约定**：下文 `desktop-electron/src/*.ts` 均指 worktree 绝对路径 `C:\Users\lf\Documents\Workspace\marisa-electron-wt\desktop-electron\src\`；其余相对路径均相对主仓库根。Wails 依赖源码单独标注为「依赖源码」。
>
> **已知缺陷（本轮归档对象）**：后端启动失败进入安全模式（minimal）/ 急救模式（rescue）时，用户没有任何提示——窗口要么静默换成"看起来正常但少了所有 marisa 插件"的基础界面，要么直接切到急救页，要么停在启动页/空白页，用户不知道发生了什么。

---

## 结论摘要

1. **三级状态机本身是完整的**，`normal → minimal → rescue` 的降级判定、持久化、手动入口（`--minimal` / `--rescue`）都在 `desktop/main.go` + `desktop/rescue_state.go` 里实现并有单测；Electron 壳在 `desktop-electron/src/supervisor.ts` 做了 1:1 移植。
2. **缺口不在"页面没有文案"，而在"状态切换没有任何推送通道"**：整条降级链路上，唯一产出是 `log.Printf`（写进 `%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop.log`），没有任何托盘气泡、窗口内提示、系统对话框、任务栏闪烁或托盘状态变化。急救页本身有完整文案（`desktop/rescue.html:216-217` 标题 + `:338-344` 显示"最近启动失败：…"），但**用户不知道要去看它**，而且有一种路径下根本切不过去（见 G3）。
3. **最关键的缺口位置**：
   - `desktop/main.go:299-305` —— normal→minimal 降级：只打日志，用户继续用一个静默"缺插件"的界面，**完全无感**（这是最隐蔽的一处）。
   - `desktop/main.go:306-316` + `desktop/main.go:341-346` —— minimal→rescue 进入急救页：只打两行日志，无 toast/对话框/闪烁。
   - `desktop/main.go:361-366` —— 急救页导航失败时**静默跳过导航**，窗口永远停在启动页，用户看到的只有 landing 页的"正在启动本地服务…"。
   - `desktop/tray.go:186-192` —— 关窗即 `win.Hide()`；进入急救时 `desktop/main.go:357-360` 只调 `SetURL` 不调 `Show`/`Focus`/`Flash`，此时**用户端零可感知信号**。
   - Electron 等价位置：`desktop-electron/src/supervisor.ts:170-177`（只 log）+ `desktop-electron/src/main.ts:320-346`（`enterRescuePage` 只 `loadURL`）。
4. **现成可复用通道是有的**：Wails 壳的 toast 桥（`desktop/toast_bridge.go`，回环 `POST /toast`）、Wails v3 的 `WebviewWindow.Flash()`（依赖源码 `webview_window.go:730`，本仓库从未使用）、`app.Dialog.Info()`（`desktop/tray.go:130` 已在用）；Electron 壳的 `notifications.ts` 桥、`AttentionManager`（`attention.ts:42-48`，但**聚焦时会返回 false 从而整体抑制**）、以及 `dialog.showErrorBox`（`main.ts:413` 已在用，无需窗口即可弹）。harness 侧的 `dsh-web-ui-notify`（`plugins/dsh-web-ui-approval-notify/`）**依赖后端进程存活**，在 minimal 客户端挂掉和 rescue 场景下不可用，不能作为主通道。
5. **本轮不修**。修复方案（第 5 节）按 P0/P1/P2 分层，最小可交付 = 在 `enterRescue` 与 normal→minimal 两个切换点各加一次"经 toast 桥排队"的通知 + `Flash` + `Show`，预计 0.5～1 人日。

---

## 1. 进入安全模式的现有链路

### 1.1 Wails 壳（Go，`desktop/`）

**三级状态机入口**：`desktop/main.go:195` `func supervise(ctx context.Context, port string, win *application.WebviewWindow, ready <-chan struct{})`，由 `main()` 在 `desktop/main.go:574-578` 起 goroutine 调用，与 `app.Run()`（`desktop/main.go:580`）并发。

阶段初值（`desktop/main.go:196-203`）：

```go
196	stage := stageNormal
197	if forcedBootStage != "" {
198		stage = forcedBootStage
199		log.Printf("命令行强制启动阶段：%s", stage)
200	} else if loadRescueState().Stage == stageRescue {
201		stage = stageRescue
202		log.Printf("上次启动停在急救模式，本次直接进入")
203	}
```

`forcedBootStage` 由 `--minimal` / `--rescue` 设置：`desktop/rescue_state.go:43-56`（`parseBootFlags`），在 `desktop/main.go:392` 于 `supervise` 之前解析。持久状态文件为 `%LOCALAPPDATA%\marisa-distro\logs\rescue-state.json`（`desktop/rescue_state.go:66-72`，目录来自 `desktop/logging.go:156-165`）。

**冷启动直入急救页**（`desktop/main.go:222-233`）：

```go
222	if stage == stageRescue {
225		saveRescueState(stageRescue, lastBootError)
226		enterRescue(ctx, win, ready, lastBootError, true)
227		stage = stageNormal
...
232		continue
233	}
```

**每轮后端启动**（`desktop/main.go:235-246`）：

```go
235	applyBootProfile(stage)
236	backendMgr.set(nil, nil)
237	cmd, url, exitCh, err := startServer(ctx, port)
238	failed := false
239	if err != nil {
240		if ctx.Err() != nil {
241			return
242		}
243		failures++
244		lastBootError = err
245		failed = true
246		log.Printf("dsh server 启动失败：%v（%s 后重试）", err, backoff)
```

`startServer` 在 `desktop/main.go:83-120`：等后端 stdout 打印 URL 行，超时上限 `urlTimeout = 120 * time.Second`（`desktop/main.go:64`），失败原因有三类——`server exited without publishing a URL`（`:110`）、`timed out waiting for dsh web URL`（`:115`）、进程启动失败（`:93`）。

**降级推进**（`desktop/main.go:297-317`）：

```go
298	if failed {
299		if stage == stageNormal && failures >= normalFailuresBeforeMinimal {
300			stage = stageMinimal
301			failures = 0
302			backoff = restartBackoff
303			saveRescueState(stageMinimal, lastBootError)
304			log.Printf("完整模式连续 %d 次启动失败，降级基础界面模式（profile=%s，无 Marisa 定制）：%v",
305				normalFailuresBeforeMinimal, minimalBootProfile, lastBootError)
306		} else if stage == stageMinimal && failures >= minimalFailuresBeforeRescue {
307			saveRescueState(stageRescue, lastBootError)
308			log.Printf("极简模式连续 %d 次启动失败，进入急救模式：%v", minimalFailuresBeforeRescue, lastBootError)
309			enterRescue(ctx, win, ready, lastBootError, true)
310			stage = stageNormal
...
315			continue
316		}
317	}
```

阈值：`normalFailuresBeforeMinimal = 2`、`minimalFailuresBeforeRescue = 2`（`desktop/rescue_state.go:15-19`）。失败计数还包含"发布 URL 后 `stableRunTime`（2 分钟，`desktop/rescue_health.go:36`）内快速异常退出"，判定函数 `exitFailureClass`（`desktop/rescue_health.go:176-184`），调用点在 `desktop/main.go:275`（分支体 `:273-292`）。

**进入急救页**：`desktop/main.go:341` `func enterRescue(ctx context.Context, win *application.WebviewWindow, ready <-chan struct{}, lastErr error, waitNav bool)`：

```go
342	log.Printf("进入急救模式：后端无法以完整/极简组合启动")
347	srv, err := newRescueServer(lastErrStr)
348	if err != nil {
349		log.Printf("rescue server 启动失败：%v（回到普通重启）", err)
350		return
351	}
352	if err := srv.start(); err != nil {
353		log.Printf("rescue server 启动失败：%v（回到普通重启）", err)
354		return
355	}
356	defer srv.srv.Close()
357	navigate := func() {
358		log.Printf("rescue 页面：%s", srv.url)
359		win.SetURL(srv.url)
360	}
361	if waitNav {
362		if err := awaitWebviewReady(ready, ctx); err != nil {
363			log.Printf("rescue 页面导航跳过：%v", err)
364		} else {
365			navigate()
366		}
367	} else {
368		navigate()
369	}
370	select {
371	case <-srv.done:
372		log.Printf("急救动作完成，回到完整模式重启")
373	case <-ctx.Done():
374	}
```

急救控制端点：`desktop/rescue_server.go:39-57`（构造）、`:60-84`（`127.0.0.1:0` 随机端口 + token）、`:111-118`（`GET /` 返回内嵌 `rescue.html`）、`:122-133`（`GET /api/state`，含 `lastError` / `logTail` / `capabilities`）。恢复执行器在 `desktop/rescue.go:29-135`。

**已废弃的一路入口**：页面健康检查（白屏 / JS 报错）原本可直接进急救页，现已隐藏：

```go
264	// 页面健康监控已隐藏（90s 自动进急救误触发，后续重做）。
265	_ = navigated
```

（`desktop/main.go:264-265`；相关实现体保留在 `desktop/rescue_health.go:40-165`，提交 `b6db5b36` 隐藏）。Electron 侧同样未移植，见 `desktop-electron/src/supervisor.ts:8-9` 注释。

### 1.2 Electron 壳（`desktop-electron/src/`）

同一条梯子，纯编排 + 注入钩子（`supervisor.ts:69-195`）：

- 初值：`supervisor.ts:73-80`（`parseBootFlags()` → `loadRescueState().stage === 'rescue'`）。
- rescue 分支：`supervisor.ts:101-110`，`await hooks.enterRescue(lastBootError ?? '')`（`:103`）。
- 启动失败计数：`:118-123`（spawn 抛错）/ `:126-135`（ready reject）。
- 降级推进：`:163-179`；minimal→rescue 在 `:170-177`：

```ts
170	} else if (stage === 'minimal' && failures >= MINIMAL_FAILURES_BEFORE_RESCUE) {
171	  saveRescueState('rescue', lastBootError)
172	  log(`极简模式连续 ${MINIMAL_FAILURES_BEFORE_RESCUE} 次启动失败，进入急救模式：${lastBootError ?? ''}`)
173	  stage = 'rescue'
...
177	  continue
```

- 钩子接线（`src/main.ts:526-545`）：`enterRescue: lastError => enterRescuePage(lastError)`（`:537`）、`navigate: url => { startupStage = 'backend-ready'; ... win.loadURL(url.href) }`（`:538-541`）。
- 急救页宿主（`src/main.ts:320-346`）：

```ts
342	log.log(`rescue 页面：${handle.url}`)
343	if (win !== null && !win.isDestroyed()) await win.loadURL(handle.url)
344	await handle.done
345	handle.close()
```

- 急救端点 1:1 移植：`src/rescue-server.ts:220-338`（含 `GET /api/state` 在 `:260-271`）。
- 状态机常量与持久化：`src/rescue-state.ts:15-17`、`:41-79`。

**Electron 另有第二套"恢复"入口**（与 rescue 并存，`docs/desktop-electron.md:67-69` 说明两层互补）：

- `RecoveryWindow`（`src/recovery-window.ts:81-321`）——独立 sandbox 窗，构造时接收 `failureStage` / `failureDetail`（`:304-305`），有原生确认框（`:233-243`、`:272-283`）。
- `openRecoveryWindow`（`src/main.ts:277-317`）——目前只被托盘菜单调用（`src/main.ts:214-222`，「恢复模式…」），**启动失败链路不会自动打开它**。
- 失败路由决策表 `routeDesktopStartupFailure`（`src/startup-failure-routing.ts:30-35`）在 `src/main.ts:24` 被 import，但**在 `main.ts` 中从未调用**（全仓仅 `src/recovery.test.ts:5,11,15` 使用）——即"就绪 → 恢复窗"这条路由当前是死代码。

### 1.3 normal / minimal 两级的插件禁用机制（`MARISA_BOOT_PROFILE`）

机制本身很干净：壳只做一件事——按阶段设置/清除环境变量，后端子进程继承它，由 launcher 决定 `--profile`。

Wails 侧（`desktop/rescue_state.go:114-122`）：

```go
116	func applyBootProfile(stage bootStage) {
117		if stage == stageMinimal {
118			os.Setenv(bootProfileEnv, minimalBootProfile)
119		} else {
120			os.Unsetenv(bootProfileEnv)
121		}
122	}
```

常量：`minimalBootProfile = "web"`（`desktop/rescue_state.go:26`）、`bootProfileEnv = "MARISA_BOOT_PROFILE"`（`:28`）。调用点 `desktop/main.go:235`（每轮启动前）。

消费端（`desktop/bundle/launcher.cmd:20-29`）：

```bat
20	set "BOOT_PROFILE=%MARISA_BOOT_PROFILE%"
21	if "%BOOT_PROFILE%"=="" set "BOOT_PROFILE=marisa"
25	if "%BOOT_PROFILE%"=="web" (
26	    "%BUNDLE%node.exe" "...\apps\cli\lib\bin.js" --profile web --patch "%BUNDLE%minimal.overlay.yml"
27	) else (
28	    "%BUNDLE%node.exe" "...\apps\cli\lib\bin.js" --profile %BOOT_PROFILE% --patch "...\desktop.overlay.yml" --patch "...\standalone.overlay.yml"
29	)
```

Linux/macOS 同构：`desktop/bundle/launcher.sh:21`、`:27-30`。兜底 overlay：`desktop/bundle/minimal.overlay.yml`。

语义（`desktop/rescue_state.go:20-25` 注释 + `docs/RESEARCH-rescue-mode-upstream-comparison-20260823.md:170-186` 实测）：

| 阶段 | profile | 插件面 | 页面表现 |
|---|---|---|---|
| normal | `marisa`（清除 `MARISA_BOOT_PROFILE`） | marisa 完整组合（实测组合树 166 条） | 正常产品界面 |
| minimal（安全模式） | `web` | harness 内置 base+web-app（实测 135 条），**无任何 marisa 插件** | 能用、但少了所有 marisa 定制，**外观上没有"我降级了"的任何标记** |
| rescue（急救模式） | 不启动后端 | 壳层自带页面，不加载任何插件 | `rescue.html` 独立页 |

Electron 侧等价实现：`src/rescue-state.ts:15-17`、`:76-79`；`supervisor.ts:111` `applyBootProfile(stage)`。

### 1.4 触发路径汇总（含"用户能看到什么"）

| # | 触发 | 代码位置 | 现状用户可感知信号 |
|---|---|---|---|
| 1 | normal 连续 2 次启动失败 → minimal | `desktop/main.go:299-305` | **无**（仅日志） |
| 2 | minimal 连续 2 次启动失败 → rescue 页 | `desktop/main.go:306-316` → `:341-369` | 窗口内容被换掉；若窗口可见则"看到了"，无任何主动提示 |
| 3 | 冷启动读到 `stage=rescue` → 直接急救页 | `desktop/main.go:200-203` → `:222-233` | 同上 |
| 4 | `--rescue` / `--minimal` 手动 | `desktop/rescue_state.go:47-56` | 用户自己知道，无需提示 |
| 5 | 急救端点自身启动失败 | `desktop/main.go:347-355` | **无**：`return` 后回到 normal 重试，窗口停在启动页（`landing.html:106`） |
| 6 | 急救页导航被跳过（webview 未就绪/超时） | `desktop/main.go:362-366` | **无**：`srv.done` 永不触发，永久卡在启动页 |
| 7 | 窗口已被关进托盘时进入 rescue | `desktop/tray.go:186-192` + `desktop/main.go:357-360` | **完全零信号** |

---

## 2. "无提示"的具体缺口

### G1（最隐蔽）normal → minimal 降级完全无感

`desktop/main.go:299-305`。现状代码只有 `saveRescueState` + `log.Printf`。此后循环 `continue`，`applyBootProfile(stageMinimal)`（`:235`）→ 后端以 `web` profile 起来 → `win.SetURL(url)`（`:260`）。用户看到的是一个**正常渲染、正常可用、但少了所有 marisa 插件**的界面。

壳层没有任何旁路提示可用于这个界面：唯一注入脚本是通知权限请求（`desktop/main.go:531` 的 `JS: requestNotificationPermissionJS`，内容在 `:39-51`），没有任何 banner/水印注入；页面健康探针注入已停用（`:264-265`）。

> 语义备注：`docs/RESEARCH-rescue-mode-upstream-comparison-20260823.md:182-183`（§9.4 第 3 点）当时把"语义透明化"理解为**改注释与日志文案**，没有落到 UI。这一轮要补的正是 UI 面。

### G2 minimal → rescue 切换无主动提示

`desktop/main.go:306-316`（只 log）→ `enterRescue`（`:341-346`，只 log）。全链路对用户的唯一"通知"是把窗口内容换成急救页。

急救页本身**文案是齐的**：

- `desktop/rescue.html:216` `<h1>魔理沙急救模式</h1>`
- `desktop/rescue.html:217` `<p class="lead sub">哎呀，魔理沙无法正常启动，即使打开极简模式仍无法正常运行。</p>`
- `desktop/rescue.html:338-344`（`init()`）：`st.lastError` 非空时展开 `#errorBox`，文案 `最近启动失败：${st.lastError}`

所以缺口不是"页面没解释"，而是**切换没有推送**：窗口若是隐藏的、被其他窗口盖住的、或在第二显示器上，用户无从察觉。

### G3 急救页导航可能被静默跳过 → 永久停在启动页

`desktop/main.go:361-366`。`awaitWebviewReady`（`desktop/webview_ready.go:52-60`）等待首次导航完成，超时 `urlTimeout = 120s`（`desktop/webview_ready.go:58`）。超时后只打 `rescue 页面导航跳过：…`，**不导航**；随后 `select` 阻塞在 `srv.done`（`:370-372`），而 `srv.done` 只有在用户点了急救页按钮（`handleRescue` `desktop/rescue_server.go:159` 或 `handleRetry` `:166`）才会 `close`——用户看不到页面，于是永远不会 close。结果：进程活着，窗口停在启动页。

启动页给用户的反馈只有：`desktop/landing.html:106` "正在启动本地服务…"、`:111` 计时器、`:123-126` 15 秒后追加的 `首次启动可能需要解包运行环境。若持续无法进入，请从托盘退出后重新打开。`——**没有任何"进入急救模式失败"的信息**，用户会以为还在加载。

### G4 急救端点启动失败无提示、无出口

`desktop/main.go:347-355`：`newRescueServer` / `srv.start()` 失败 → log → `return`。调用方（`:222-233` 或 `:306-316`）紧接着把 stage 拉回 normal 重试；若失败是系统性的（例如端口耗尽、token 生成失败），就是"重试 → 再进 rescue → 再失败"的静默循环，用户始终只见启动页。

### G5 窗口已隐藏时进入急救 → 零可感知信号

`desktop/tray.go:186-192`（关窗即隐藏）：

```go
187	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
188		e.Cancel()
189		win.Hide()
190		log.Printf("窗口已最小化到托盘(常驻后台);托盘菜单「退出」结束应用")
191	})
```

`enterRescue` 的导航闭包（`desktop/main.go:357-360`）**只有 `win.SetURL`**，没有 `Show()` / `Focus()` / `Flash()`。Electron 侧同构：`src/main.ts:174-181` 关窗即 `window.hide()`，`src/main.ts:343` 只有 `loadURL`，不 `show()`。此时用户既看不到窗口，也没有托盘气泡/闪烁，"进入急救模式"这件事在用户侧**不存在**。

### G6 托盘不反映当前模式

`desktop/tray.go:42` `tray.SetTooltip("Marisa DSH")` 是静态串；菜单（`:47-144`）里没有任何"当前模式：基础界面 / 急救模式"条目；`重试完整模式`（`:104-111`）在任何阶段都常亮可点（`:107-109` 对 rescue 下没有后端的情形只在日志里写 `(ignored in rescue)`）。因此即使用户去看托盘，也读不出状态。

Electron 侧同样：`src/main.ts:199-227` 的托盘菜单无阶段指示，只有「打开」「打开日志目录」「重启后端」「恢复模式…」「退出」。

### G7 页面真的白屏时不进梯子（相关但独立）

`desktop/main.go:264-265` 把页面健康监控整段关掉了，所以"webserver 起来了但页面是白屏"这一类故障现在既不降级也不提示，只表现为"窗口一直白/一直转"。`docs/RESEARCH-rescue-mode-upstream-comparison-20260823.md:161-162` 也记录：三级状态机的自然触发路径在真机上**从未被观察到**，属长期未验收路径——这正是本轮缺陷长期没被发现的原因。

### 缺口位置速查表

| 缺口 | 文件:行 | 现状代码（要点） |
|---|---|---|
| G1 normal→minimal | `desktop/main.go:299-305` | `saveRescueState(...)` + `log.Printf`；随后 `win.SetURL` 直接换成基础界面 |
| G2 minimal→rescue | `desktop/main.go:306-316`、`:341-346` | 两处 `log.Printf`；无 toast / dialog / flash / tray 变化 |
| G3 导航被跳过 | `desktop/main.go:361-366` | `awaitWebviewReady` 失败 → 只 log，`navigate()` 不执行，`srv.done` 永不触发 |
| G4 急救端点失败 | `desktop/main.go:347-355` | 两处 `log.Printf` + `return`（无用户出口） |
| G5 隐藏窗口 | `desktop/tray.go:186-192` + `desktop/main.go:357-360` | `win.Hide()` 之后只有 `SetURL` |
| G6 托盘无状态 | `desktop/tray.go:42`、`:47-144` | 静态 tooltip、无模式条目 |
| G7 白屏不降级 | `desktop/main.go:264-265` | `// 页面健康监控已隐藏` + `_ = navigated` |
| E-G1 minimal→rescue | `desktop-electron/src/supervisor.ts:170-177` | 只 `log(...)` |
| E-G2 急救页宿主 | `desktop-electron/src/main.ts:320-346` | `log.log` + `await win.loadURL(...)`，无通知、无 `show()` |
| E-G3 路由死代码 | `desktop-electron/src/main.ts:24`（import）、`src/startup-failure-routing.ts:30-35` | `routeDesktopStartupFailure` 未被调用 |

---

## 3. 现有可复用通知通道

### 3.1 Wails 壳

| 通道 | 位置 | 能力 | 在"后端没起来"时可用？ |
|---|---|---|---|
| 原生 toast 桥 | `desktop/toast_bridge.go:45-58`（监听）、`:68-106`（`POST /toast` → `notifications.NotificationService.SendNotification`）、`:135-143`（组装） | Windows wintoast 原生气泡，支持 `{title, body, sessionId}`，点击可回跳会话（`:110-112`、`:117-130`） | **可用**——桥在壳进程内，不依赖后端。**必须走 HTTP 端点**（见下方风险），因为 `handleToast` 会等 `ready`（`:75-79`，由 `markReady` `:41` 在 `ApplicationStarted` 时放行） |
| 端口注入 | `desktop/main.go:468-479` | `MARISA_TOAST_PORT` 注入后端环境 | 与后端无关 |
| 通知服务就绪信号 | `desktop/main.go:564-569` | `events.Common.ApplicationStarted` → `toastBridgeInstance.markReady()` | — |
| 平台通知能力 | `desktop/toast_bridge.go:147-152`（`serviceList` 注入 `Options.Services`，`desktop/main.go:493`） | — | — |
| 任务栏闪烁 | **依赖源码** `.../pkg/application/webview_window.go:730-737` `func (w *WebviewWindow) Flash(enabled bool)`，Windows 实现 `webview_window_windows.go:2645-2647` → `w32.FlashWindow` | 请求用户注意（Windows 任务栏闪烁 / macOS Dock 弹跳 / Linux no-op） | 可用，但 `desktop/` 中**从未调用**（grep 全仓只有 `win.Show()`，无 `.Flash(`） |
| 原生信息对话框 | `desktop/tray.go:124-134`（`app.Dialog.Info()`） | 模态信息框 | 需应用已运行；未在启动早期使用过 |
| 托盘 tooltip / 菜单项 | `desktop/tray.go:42`、`:47-144` | 静态文本，可动态改（`tray.SetTooltip`） | 可用（需在 `app.Run()` 前配置，见 `desktop/tray.go:30-31` 时序说明） |
| 窗口内文案 | `desktop/landing.html:106,111,112`、`desktop/rescue.html:216-217,338-344` | 静态页/内嵌页 | 可用 |
| **不可用**：harness 通知插件 | `plugins/dsh-web-ui-approval-notify/src/index.ts:21`（同源路由）、`:38-42`（`toastEndpoint`）、`:86-124`（转发）、`:97`（无 `MARISA_TOAST_PORT` 时 503）；浏览器半钩子 `src/client/index.ts:127` | 后端进程内的通知决策 + 转发 | **不可用**：依赖后端 `webServer` 路由（`src/index.ts:18` `inject = ['webServer']`）；minimal 下客户端若挂、rescue 下后端不在，整条链路都不存在 |

### 3.2 Electron 壳

| 通道 | 位置 | 能力 | 备注 / 陷阱 |
|---|---|---|---|
| toast 桥 | `src/notifications.ts:74-138`（回环 `POST /toast`，同 `MARISA_TOAST_PORT` 协议） | Electron 原生 `Notification` | **陷阱**：`:110-115` 只有 `attention.escalate()` 返回 true 才发；`src/attention.ts:42-48` 在**窗口聚焦时直接 return false**，等于"聚焦就整体抑制"（这是 anywhere 的刻意语义，但对"启动失败必须告知"是错误语义） |
| 注意力升级 | `src/attention.ts:24-59` | Windows `flashFrame(true)`；macOS/Linux Dock badge | 同上，聚焦时不动 |
| 原生对话框 | `src/main.ts:413` `dialog.showErrorBox(APP_NAME, ...)` | **无需窗口即可弹**（已在解包失败路径使用） | 最适合"启动早期、窗口还没出来"的场景 |
| 确认/错误对话框 | `src/recovery-window.ts:233-243`、`:256-263`、`:272-283` | `dialog.showMessageBox(window, ...)` | 需父窗口 |
| 独立恢复窗 | `src/recovery-window.ts:81-321` + `src/main.ts:277-317` | 完整恢复 UI，自带 `failureStage` / `failureDetail` 上下文 | 现在只从托盘进（`src/main.ts:214-222`）；`routeDesktopStartupFailure` 未接线 |
| 托盘提示 | `src/main.ts:199-227` | `tray.setToolTip(APP_NAME)`（`:203`）+ 菜单 | 无阶段指示 |
| 页面 | `res/landing.html`、`res/rescue.html`（与 `desktop/` 同源拷贝，`src/main.ts:322`） | 与 Wails 侧同一份文案 | 同样有"最近启动失败"框 |

### 3.3 关键约束（决定方案可行性）

1. **通知在"后端还没起、UI 还没渲染"时能不能发出来？**
   - Windows 原生 toast：**可以**，但必须经过 `toastBridge.handleToast` 的 `ready` 闸门（`desktop/toast_bridge.go:75-79`）。若越过闸门直接调 `notificationService.SendNotification`，在 `ApplicationStarted` 之前底层 `windowsNotifier` 还没 `Startup`（**依赖源码** `pkg/services/notifications/notifications_windows.go:70-112` 才设置 `appName` / AUMID / CLSID activator），`pushNow`（`:244-260`）会用空的 `wn.appName` 调 `wintoast.Push` → 静默失败或 AUMID 错误。
   - Electron 原生 `Notification`：`app.whenReady()` 之后可用；`main.ts:419` 之后才建窗（`:502`），而 toast 桥在 `:459-492` 才起。若要覆盖 `:405-417`（解包失败）这一段更早的窗口，只有 `dialog.showErrorBox`（`:413`）可用。
2. **`Flash()` / `Show()` 的时序**：`Flash`（**依赖源码** `webview_window.go:730-733`）在 `w.impl == nil` 时直接返回；`Show()`（`:509-520`）在 `globalApplication.impl == nil` 时直接返回，否则会 `InvokeSync(w.Run)` 补建窗口；`impl` 在 `application.go:659`（`Run()` 内）才赋值。注意 `SetURL`（`:531-540`）在 `w.impl == nil` 时**只写入 `options.URL` 不导航**——当前 `enterRescue` 之所以没踩这个坑，是因为 `waitNav=true` 分支先 `awaitWebviewReady`（`desktop/main.go:362`），而该信号只在 landing 首次导航完成后发出（`desktop/webview_ready.go:23-47`）。
3. **通知文案必须有别于普通回合通知**：Electron 侧 `src/main.ts:468-472` 的 `outcomeOf` 用标题正则匹配 `回合|turn|任务|job`；若文案里出现这些词会被误判成回合完成/失败并按用户开关过滤（`src/notifications.ts:42-56`），有可能被静默丢弃。

---

## 4. Wails 壳 / Electron 壳 各自改动点

### 4.1 Wails 壳（`desktop/`）

需要新增的东西：

1. **一个壳内"用户通知"入口**，复用已有桥而不是新造：
   - 最省事：新增 `desktop/boot_notice.go`，内部持 `*toastBridge` 句柄（或新增 `func (b *toastBridge) notify(title, body string)`，直接走 `handleToast` 相同的 `ready` 等待 + `SendNotification` 路径），供 `supervise`/`enterRescue` 调用。
   - 备选：从 Go 侧向 `http://127.0.0.1:$MARISA_TOAST_PORT/toast` 发 POST——可行但绕、且需要把端口存成包级变量。
2. **`enterRescue` 增加"告知"步骤**：`desktop/main.go:341` 之后、导航之前，发一条 toast（标题如「Marisa DSH 进入急救模式」，正文带 `lastErrStr` 摘要），并 `win.Show()` + `win.Focus()`（若窗口被隐藏）+ `win.Flash(true)`。
3. **normal→minimal 切换点加提示**：`desktop/main.go:299-305` 分支内发一条"已降级为基础界面（无 Marisa 定制）"的 toast；并在基础界面里加一个持续可见的壳层标记（见 P1）。
4. **修 G3**：`desktop/main.go:361-366` 的 `awaitWebviewReady` 失败分支不能只 log；至少要（a）发通知，（b）记录"急救页未能呈现"到状态文件，（c）给出可恢复路径（例如退化为 `win.Show()` + 托盘 tooltip 改为"需要处理"）。
5. **修 G4**：`desktop/main.go:347-355` 失败时走同一个通知入口告警（而不是静默回 normal）。
6. **托盘状态化**：`desktop/tray.go:42` 的 tooltip 与 `:47-144` 的菜单按当前 stage 更新（新增一个只读的"当前模式"菜单项，`重试完整模式` 的可用性按 stage 置灰）。
7. （可选，二选一）恢复一段**有提示的**页面健康监控：`desktop/main.go:264-265` 的注释说明它是被"90s 误触发"关掉的，若要重启必须做成"先提示、再进急救"，而不是直接换页。

### 4.2 Electron 壳（`desktop-electron/`）

1. **`enterRescuePage` 里加告知**（`src/main.ts:320-346`）：在 `:342` 的 `log.log` 旁边，走一次通知——**但不能用 toast 桥的默认语义**，因为 `attention.escalate()` 在聚焦时会抑制（`src/attention.ts:43`）。选项：
   - 给 `AttentionManager` 增加"强制告知"路径（如 `notifyCritical()`，跳过 `isFocused` 短路）；
   - 或对启动失败类通知绕过 `filterToastIntent` / `escalate`（`src/notifications.ts:109-115` 那段判断），直接 `new ElectronNotification(...).show()`。
   同时补 `win.show()` / `win.focus()` / `win.flashFrame(true)`（`src/main.ts:166-171`、`:479`）。
2. **`supervisor.ts:170-177` 降级点加通知**：`supervisor.ts` 是纯编排（`src/supervisor.ts:11-13` 明确"UI hooks are injected"），正确做法是**扩展 `SuperviseHooks`**（`src/supervisor.ts:39-52`）增加一个 `notify?: (kind, message) => void` 钩子，由 `src/main.ts:526-545` 注入实现，避免把 Electron API 塞进纯逻辑层。
3. **接上已有的失败路由**：`routeDesktopStartupFailure`（`src/startup-failure-routing.ts:30-35`）已在 `src/main.ts:24` import 但未调用；把它用于 `main()` 的 `try/catch`（例如 `:405-417` 的解包段），`appReady === true` 时改用 `openRecoveryWindow('backend-boot', detail)`（`src/main.ts:277-317`）而不是只写日志。
4. **托盘状态化**：`src/main.ts:199-227` 加"当前模式"只读项，`rescue` 阶段把 tooltip 改成"需要处理"。
5. **最小代价路径（与 Wails 对齐的先手）**：`dialog.showErrorBox`（`src/main.ts:413` 已在用）是启动早期唯一无需窗口的通知原语，可作为 P0 兜底。

### 4.3 两条壳的差异小结

| 维度 | Wails 壳 | Electron 壳 |
|---|---|---|
| 已有 toast 通道 | `toast_bridge.go`（Go 内部持有 `NotificationService`，**聚焦也照发**） | `notifications.ts` 桥（**聚焦即抑制**，需专门开一条强制路径） |
| 任务栏闪烁 | API 存在（`WebviewWindow.Flash`）但未使用 | 已有 `AttentionManager.flashFrame`（`attention.ts:45`），但被聚焦短路 |
| 无窗口也能弹的原语 | 无（`app.Dialog.*` 需要已运行的应用） | 有：`dialog.showErrorBox`（`main.ts:413`） |
| 第二套恢复 UI | 无（急救页即全部） | 有：`RecoveryWindow` + `recovery-controller`（现在只从托盘进） |
| 纯逻辑层可测试性 | `supervise` 内联调用 wails API，难单测 | `supervisor.ts` 钩子注入，加 `notify` 钩子后可单测 |
| 白屏检测 | 实现体存在但已停用（`main.go:264-265`） | 从未移植（`supervisor.ts:8-9` 注释） |

---

## 5. 建议修复方案（本轮不实施）

> 原则：**不引入新通道**，优先复用已有桥；**先保证"至少有一个用户可感知信号"**，再谈文案与交互打磨；所有新增逻辑必须可在 headless 单测里断言。

### P0 — 最小可交付（0.5～1 人日）

**P0-1 Wails：新增 `desktop/boot_notice.go`（新建文件，约 60 行）**

- 暴露 `type bootNotifier struct { bridge *toastBridge; win *application.WebviewWindow; log *log.Logger }` 与 `func (n *bootNotifier) announce(title, body string)`：内部复用 `toastBridge` 的 `ready` 闸门（`desktop/toast_bridge.go:75-79`）后调用 `SendNotification`；同时 `win.Show()` + `win.Focus()` + `win.Flash(true)`。
- 为什么必须复用 `ready` 闸门：见 §3.3 第 1 条（`windowsNotifier.Startup` 前 `appName` 为空）。
- 在 `desktop/main.go:471-479` 处把 `toastBridgeInstance` 存成包级变量（现在只有局部变量 + `markReady` 闭包）。

**P0-2 Wails：两个切换点接线**

- `desktop/main.go:299-305`（normal→minimal）：`announce("Marisa DSH 已降级为基础界面", "完整组合连续 2 次启动失败，本次以无 Marisa 定制的基础界面启动。可在托盘点击「重试完整模式」。")`。
- `desktop/main.go:341`（`enterRescue` 开头）：`announce("Marisa DSH 进入急救模式", lastErrStr 摘要 + "已打开恢复页面，请按提示操作。")`。

**P0-3 Wails：修静默死路**

- `desktop/main.go:362-366`：`awaitWebviewReady` 失败时，除日志外追加 `announce(...)` 并把 stage 持久化为 `rescue`（当前该分支下没有 `saveRescueState`，下次冷启动仍按 normal 重试，用户永远等不到急救页）。
- `desktop/main.go:347-355`：两条失败路径同样 `announce(...)`。

**P0-4 Electron：`enterRescuePage` 与降级点接线（同一人日内的另一半）**

- `src/supervisor.ts:39-52` 增加 `notify?: (kind: 'degraded' | 'rescue', message: string) => void` 钩子；在 `:164-169`、`:170-177` 两处调用。
- `src/main.ts:526-545` 注入实现：走"强制告知"路径（`new ElectronNotification(...).show()` + `win.show()`/`focus()`/`flashFrame(true)`），**绕过** `attention.escalate()` 的聚焦短路（`src/attention.ts:43`）。
- 顺带把 `routeDesktopStartupFailure`（`src/main.ts:24`）接上 `main()` 的 catch 分支。

### P1 — 状态可见性（0.5 人日）

- Wails：托盘 tooltip 动态化（`desktop/tray.go:42`）+ 菜单加只读"当前模式"项（`:47-144`）；`重试完整模式` 按 stage 置灰。
- Electron：`src/main.ts:203` `tray.setToolTip(...)` 与菜单同步。
- Wails：minimal 阶段注入一个壳层水印/banner（在 `desktop/main.go:531` 的 `JS:` 里叠加一小段 DOM 注入，或新增 `desktop/boot_banner.go`）。**注意**：这会把"壳层注入"面扩大，需要在 PR 里声明权限影响（AGENTS.md 要求），并确认不被页面 CSP 拦掉。

### P2 — 急救页自身强化（0.5 人日）

- `desktop/rescue.html:216-217` 之上加一条更醒目的"发生了什么"横幅（标题+失败原因+发生时间），并把 `#errorBox`（`:338-344`）从"有错才显示"改为"始终显示，含 stage/失败次数/时间戳"。数据来源：`GET /api/state`（`desktop/rescue_server.go:122-133`）目前只回 `lastError`，需补 `failures` / `since` 字段。
- Electron 的 `res/rescue.html` 是同源拷贝（`src/main.ts:322`），改 `desktop/rescue.html` 后必须同步拷贝，并在 workflow 里补一条"两份文件一致"的校验（否则两条壳的急救页会漂移）。
- `src/recovery-window.ts:304-305` 的 `failureStage` / `failureDetail` 已经具备上下文能力，若启用 P3 可直接复用。

### P3 — 结构性收口（1～2 人日，可延后）

- 统一"启动失败 → 用户可见"为一个显式的 `StartupNotice` 抽象（Wails + Electron 各一份实现，语义对齐），并把 G7（白屏监控）设计成"先提示、再进急救"的两步式，避免重演 `b6db5b36` 的 90s 误触发。
- Electron：把 `rescue` 与 `RecoveryWindow` 两层合一（`docs/desktop-electron.md:69` 已计划"rescue-server.ts 计划下版删除"），届时通知只需接一处。

### 风险与边界情况

| # | 风险 / 边界 | 说明与对策 |
|---|---|---|
| R1 | **通知发得太早** | `supervise` goroutine 在 `app.Run()` 之前启动（`desktop/main.go:574-578` vs `:580`）。冷启动 `--rescue` / 持久化 rescue 时，通知可能落在 `ApplicationStarted`（`:564-569`）之前。对策：一律走 `toastBridge` 的 `ready` 闸门（`toast_bridge.go:75-79`），不要直连 `SendNotification`。 |
| R2 | **`Flash` / `Show` 早调用无效** | 依赖源码 `webview_window.go:730-733`（`impl == nil` 早返回）与 `:509-520`（`globalApplication.impl == nil` 早返回）。对策：把 `Flash`/`Show` 放到导航之后（`desktop/main.go:357-360` 之后），或用 `awaitWebviewReady` 之后的位置。 |
| R3 | **`SetURL` 在 impl 为空时只改配置不导航** | 依赖源码 `webview_window.go:531-540`。当前 `waitNav=false` 路径（`desktop/main.go:367-368`）没有这层保护，若将来重新启用页面健康监控会踩坑。 |
| R4 | **窗口隐藏时用户看不到急救页** | `desktop/tray.go:187-191`。对策：`enterRescue` 必须显式 `Show()`；这是 P0 的一部分，不能只发 toast 了事。 |
| R5 | **Electron 聚焦抑制** | `src/attention.ts:43` + `src/notifications.ts:110-115`：窗口聚焦时通知被整体丢弃。启动失败类通知必须走独立路径，不能复用 `attention.escalate()`。 |
| R6 | **通知被用户的开关过滤掉** | Electron `src/notifications.ts:42-56` 的四开关按标题正则（`src/main.ts:468-472`）过滤。启动失败通知的标题必须避免 `回合|turn|任务|job` 字样，否则可能被 `filterToastIntent` 拦下。Wails 侧目前无开关，但 `desktop/main.go:39-51` 的权限注入若被用户拒绝会静默失效。 |
| R7 | **通知风暴** | 崩溃循环下 `supervise` 每轮退避后重启（`desktop/main.go:319-330`，退避上限 30s），若每个失败都发通知会刷屏。对策：只在**阶段切换**时通知（normal→minimal、→rescue），失败计数本身不发；并给通知加去重（同一 stage 短时间内只发一次）。 |
| R8 | **通知噪声打扰用户** | 用户正在全屏工作/演示时弹原生 toast 可能被打断。可考虑 `notifications.NotificationOptions.InterruptionLevel`（**依赖源码** `pkg/services/notifications/notifications.go:158-162`）设为 `passive`，但 `passive` 在 Windows 会降低可见性，与"必须被看到"的目标冲突——需要产品决策。 |
| R9 | **无 toast 能力的环境** | `desktop/main.go:473-475` 桥不可用时只 log（`native toasts disabled`）；Electron `src/notifications.ts:110` 有 `sender.isSupported()` 判断。对策：通知失败时必须降级到"托盘 tooltip 变化 + 窗口 Show"，保证至少一个信号。 |
| R10 | **两份 rescue.html 漂移** | `desktop/rescue.html` 与 `desktop-electron/res/rescue.html` 是人工拷贝（`src/main.ts:322`）。P2 改文案时必须同步，建议加校验脚本。 |
| R11 | **无头环境/测试** | Wails 的 `supervise` 内联调用 wails API，难以单测；Electron 的 `supervisor.ts` 是钩子注入的纯逻辑，加 `notify` 钩子后可直接断言调用序列（对齐 `src/supervisor.test.ts` 现有风格）。 |
| R12 | **权限影响声明** | 本轮方案不新增网络/进程/密钥能力；P1 若是"壳层注入 DOM"会扩大注入面，需在 PR 中按 AGENTS.md 声明。 |

---

## 6. 验收标准

> 说明：三级状态机的自然触发路径在真机上从未被观察到（`docs/RESEARCH-rescue-mode-upstream-comparison-20260823.md:161-162`），因此验收必须**先能稳定复现**，再谈提示。

### A. 前置：构造可复现的降级（任选其一）

1. **强制阶段（最快）**：`Marisa-DSH-windows-x64-standalone.exe --rescue`（`desktop/rescue_state.go:50-53`）。
2. **持久化状态**：`pwsh scripts/mode-lab/break-modes.ps1 -Scenario 8 -InstallRoot $env:LOCALAPPDATA\marisa-distro`（`scripts/mode-lab/README.md:42`，写入 `%LOCALAPPDATA%\marisa-distro\logs\rescue-state.json`）。
3. **自然触发**：`pwsh scripts/mode-lab/break-modes.ps1 -Scenario 4`（或 5）破坏 bundle/profile package.json（`scripts/mode-lab/README.md:38-39`），启动后等待 normal 失败 ×2 → minimal，再 ×2 → rescue。
4. **Electron**：同名 worktree 构建产物 + 相同 `rescue-state.json` / `--rescue` 参数。

### B. 逐条验收断言

| # | 步骤 | 期望（修复后） | 现状（基线，应复现缺陷） |
|---|---|---|---|
| B1 | 用 A-1 启动，观察 Windows 通知中心 | 出现原生 toast：「Marisa DSH 进入急救模式」+ 失败原因摘要 | 无任何 toast |
| B2 | 窗口已关闭到托盘（点 X）后再触发 A-1 / A-3 | 窗口自动 `Show()` 并聚焦到急救页，同时 toast 出现 | 窗口保持隐藏，用户零感知 |
| B3 | 用 A-3 走到 minimal 阶段 | 每个**阶段切换**恰好一条 toast；minimal 界面可见"已降级（无 Marisa 定制）"标记 | 界面与正常无异，无任何标记 |
| B4 | 托盘 hover / 右键 | tooltip 显示"基础界面模式"/"急救模式"；菜单有只读"当前模式"项 | tooltip 恒为 `Marisa DSH`，菜单无模式项 |
| B5 | 反复触发 A-3 的失败循环（≥5 次） | toast 不刷屏（只在切换点各一条） | — （新增约束） |
| B6 | 人为让急救页导航失败（可在 dev 构建下把 `urlTimeout` 临时调小，或断点阻塞 `awaitWebviewReady`） | 用户仍收到 toast；托盘/日志能指出"急救页未能呈现" | 只有日志一行 `rescue 页面导航跳过`，窗口永久停在启动页 |
| B7 | 让 `newRescueServer` 失败（可注入端口耗尽/临时改 token 生成） | 用户收到告警 toast，而不是静默回 normal 重试 | 只有两行日志 |
| B8 | Electron 壳重复 B1–B7 | 同 Wails（且窗口聚焦时**同样**能收到通知） | 同 Wails，且聚焦时若误用 `attention.escalate()` 会被整体抑制 |
| B9 | 在 A-2/A-3 场景下点击 toast | 焦点落到窗口/急救页（Wails 可复用 `desktop/toast_bridge.go:117-130` 的 focus 回调） | 不适用 |

### C. 自动化证据

- `go test -C desktop -tags installedbundle ./...` 与 `-tags embeddedbundle ./...` 全绿（AGENTS.md 要求）。
- 新增单测（Wails）：`boot_notice` 的注入替身断言"normal→minimal 发一次、→rescue 发一次、同阶段重复失败不追加"，风格对齐 `desktop/toast_bridge_test.go:15-30`（`fakeToastSender`）。
- 新增单测（Electron）：`desktop-electron/src/supervisor.test.ts` 里给 `SuperviseHooks` 传 `notify` 替身，断言调用序列（该文件已是钩子驱动，无需 Electron 运行时）。
- 日志核对：`%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop.log` 中同时存在 `进入急救模式：…`（`desktop/main.go:342`）与新增的"已通知用户"记录行。

### D. 回归红线

- 正常启动（不触发降级）时**不得**出现任何新增 toast / 托盘变化（避免把"每次启动都响一声"做成新缺陷）。
- `--rescue` 手动进入时是否通知需明确：建议**仍然通知**（与自动路径同构，用户可能忘了自己传过参数的任务）。
- 全屏/免打扰场景下的行为需人工确认一次（Windows 专注助手会压掉 toast，此时托盘 + 窗口 Show 是唯一保底信号 —— 对应 R9）。

---

## 7. 未查清 / 待确认

1. **未做真机验证**。本轮全部结论来自静态阅读；三级状态机自然触发路径本就"从未在真机上被观察到"（`docs/RESEARCH-rescue-mode-upstream-comparison-20260823.md:161-162`），因此 G1/G2 的"用户完全无感"是**代码层面的确定结论**，但"用户在真机上究竟看到什么"（例如 minimal 界面是否因缺插件而出现明显功能缺失从而被察觉）未实测。
2. **`app.Dialog.Info()` 在应用启动早期是否可用**：`desktop/tray.go:130-133` 只证明它在托盘点击时可用（应用早已 `Run`）。未验证在 `supervise` 早期 goroutine 中调用是否安全/是否阻塞 —— 若不可用，Wails 侧早期通知只能靠 toast 桥 + `Flash`。
3. **wintoast 在"应用刚启动、AUMID 刚注册"时首次推送的可靠性**：`desktop/toast_bridge.go:73-74` 的注释断言"后端 boot 需数十秒，实际请求必然晚于 markReady"，即**现有代码从未在启动后数秒内推过 toast**。急救/降级通知恰好落在这个未验证窗口内，需要在真机上确认（这是 P0 的主要未知数）。
4. **Windows 专注助手/勿扰模式**下原生 toast 的抑制行为未验证（影响 R9 的保底信号设计）。
5. **Electron 壳 `lib/` 与 `src/` 的对应关系**：`desktop-electron/lib/*.js` 是编译产物，本轮所有引用均以 `src/*.ts` 为准；若修复时只改 `src/` 而未重建，`lib/` 会停留在旧逻辑。
6. **`desktop/bundle/make-bundle.ps1` 当前工作区有未提交改动**（`git status`：` M desktop/bundle/make-bundle.ps1`），本轮未查看其内容，未确认是否与 rescue/通知相关。
7. **`routeDesktopStartupFailure` 是"故意留待接线"还是"遗漏"**：`src/main.ts:24` import 却未调用（全仓仅测试引用），未找到相关 TODO 注释或提交说明。
8. **`docs/desktop-electron.md:27` 与 `:83` 自相矛盾**：前者写 `toast_bridge.go | ❌ 未移植`，后者描述三期已实现 `notifications.ts`。实际代码（`src/notifications.ts` 存在且被 `src/main.ts:484` 调用）以 `:83` 为准，`:27` 为陈旧表格 —— 归档于此，未修改该文档。
