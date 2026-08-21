// dsh-desktop — 把 dsh 封装成不依赖外部浏览器的桌面窗口（Wails/WebView2）。
//
// 壳进程（本程序）是唯一的入口，同时是后端的守护进程：它启动用户环境里的
// dsh（默认 `dsh web --port 0`，端口由 OS 分配避免冲突；DSH_WEB_CMD 可覆盖
// 整条命令行），从后端 stdout 解析实际监听地址，用 Wails 的 WebviewWindow
// 内嵌加载。后端异常退出（网络/加载失败等）时自动退避重启并重新指向新
// 地址，全程不打开系统浏览器。应用退出（窗口关闭）时按进程树终止后端，
// 不留孤儿 node。普通开发构建使用用户环境；embeddedbundle 构建则内嵌
// Node、harness 与 marisa profile，运行时不依赖系统 Node/pnpm/dsh。
package main

import (
	"context"
	_ "embed"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	notifications "github.com/wailsapp/wails/v3/pkg/services/notifications"
)

//go:embed landing.html
var loadingHTML string

// requestNotificationPermissionJS 是注入每个 WebView2 文档的启动脚本。桌面壳
// 对权限请求一律放行（wails 未配置 Permissions 策略时对 WebView2 权限请求全局
// ALLOW），因此应用页启动时主动请求一次通知权限即可把 Notification.permission
// 从 'default' 翻成 'granted'：通知类插件（dsh-web-ui-notify 的审批/提问/轮次
// 完成/会话完成提醒）默认生效，无需用户去 设置 → 通用 点「开启桌面通知」。
// 只在真实应用页（http/https；landing 页是 about:blank，origin 无意义）执行；
// 已定的权限（granted/denied）不重复请求；请求失败静默。
const requestNotificationPermissionJS = `(() => {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'default') return
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  const request = () => {
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {})
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', request)
  } else {
    request()
  }
})()`

// mainWindow 是主窗口句柄：单实例二次启动回调（注册于 application.New，
// 早于窗口创建）与托盘菜单用它显示/聚焦窗口；窗口创建后赋值。
var mainWindow *application.WebviewWindow

// currentVersion 是后端版本号（main 启动时读取），供托盘「版本信息」展示。
var currentVersion string

// 后端 URL 就绪的等待上限，以及重启退避的初值与上限。
// urlTimeout 放宽到 120s：standalone 首启是 tsx 冷启动 + 整树 profile 加载，
// 实测 boot 到 URL 行需 30-60s+，30s 会在 boot 途中误杀后端形成重启循环。
const (
	urlTimeout     = 120 * time.Second
	restartBackoff = time.Second
	maxRestartWait = 30 * time.Second
)

// serverStopGrace 是退出/超时时 SIGTERM 进程组后等待其退出的宽限期，
// 到期未退出则 SIGKILL 兜底。
const serverStopGrace = 5 * time.Second

// serverExit 报告一次后端进程的终结；区分正常退出与失败。
type serverExit struct {
	err error // 非 nil 表示非零退出或异常终结
}

// startServer 启动一次 dsh web 后端（DSH_WEB_CMD 或 `dsh web --port <port>`），
// 等待其把 `dsh web: http://127.0.0.1:<port>` 打到 stdout，返回监听 URL。
// port 传 "0" 时由 OS 分配（默认，避免与已占用端口冲突）。ctx 取消或超时
// 时终止后端。返回 cmd 供调用方在退出/重启时终止进程组，exitCh 在进程
// 退出后收到终结结果。
func startServer(ctx context.Context, port string) (cmd *exec.Cmd, url string, exitCh <-chan serverExit, err error) {
	log.Printf("starting dsh web backend: %s", webCommandLine(port))
	cmd = serverCommand(port)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return cmd, "", nil, fmt.Errorf("stdout pipe: %w", err)
	}
	// 后端 stderr 同时写入终端与桌面持久日志。
	cmd.Stderr = backendLogOutput
	if err := cmd.Start(); err != nil {
		return cmd, "", nil, fmt.Errorf("start dsh web: %w", err)
	}

	// 进程终结信号：Wait 必须在读取完管道后调用，这里独立收口。
	exitChRaw := make(chan serverExit, 1)
	go func() {
		err := cmd.Wait()
		exitChRaw <- serverExit{err: err}
	}()

	// 持续消费并记录 stdout；首次 URL 行单独通知启动流程。
	urlCh := scanBackendStdout(stdout)

	select {
	case u := <-urlCh:
		if u == "" {
			stopServer(cmd, exitChRaw)
			return cmd, "", exitChRaw, fmt.Errorf("server exited without publishing a URL")
		}
		return cmd, u, exitChRaw, nil
	case <-time.After(urlTimeout):
		stopServer(cmd, exitChRaw)
		return cmd, "", exitChRaw, fmt.Errorf("timed out waiting for dsh web URL")
	case <-ctx.Done():
		stopServer(cmd, exitChRaw)
		return cmd, "", exitChRaw, ctx.Err()
	}
}

// backendManager 暴露当前后端进程句柄供托盘「重启后端」使用：restart 终止
// 当前进程树，supervise 的 exitCh 收到终结后自动按原路径重启（退避 1s）。
type backendManager struct {
	mu     sync.Mutex
	cmd    *exec.Cmd
	exitCh <-chan serverExit
}

// set 记录本次迭代的后端句柄；进入下一轮启动前先清空。
func (m *backendManager) set(cmd *exec.Cmd, exitCh <-chan serverExit) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cmd, m.exitCh = cmd, exitCh
}

// restart 请求重启当前后端；无活动后端时返回 false（调用方记录日志即可）。
// 只杀不等：exitCh 由 Wait goroutine 恰好发送一次，stopServer 会消费掉它，
// 导致 supervise 的等待 select 永远收不到终结事件；这里让 supervise 自己
// 收到 exit 并走统一重启路径，进程回收仍由 Wait goroutine 完成。
func (m *backendManager) restart() bool {
	m.mu.Lock()
	cmd, exitCh := m.cmd, m.exitCh
	m.mu.Unlock()
	if cmd == nil || exitCh == nil {
		return false
	}
	// 置位用户重启标志：本次终结是主动行为，不计入启动失败计数
	// （崩溃循环计数排除托盘「重启后端」的进程树杀）。
	userRestartRequested.Store(true)
	go func() {
		killServerTree(cmd.Process.Pid, false)
		time.Sleep(serverStopGrace)
		killServerTree(cmd.Process.Pid, true)
	}()
	return true
}

// backendMgr 是托盘重启入口与 supervise 之间的共享句柄。
var backendMgr backendManager

// retryFullMode 是托盘「重试完整模式」的请求标志：置位后 supervise 在下一轮
// 迭代把阶段拉回 normal（清除 MARISA_BOOT_PROFILE 并重置失败计数）。
var retryFullMode atomic.Bool

// userRestartRequested 是托盘「重启后端」的请求标志：置位后本次后端终结
// 不计入启动失败（exitFailureClass 据此清零计数）。
var userRestartRequested atomic.Bool

// lastBootError 记录最近一次后端启动失败原因（急救页展示）。
var lastBootError error

// supervise 守护后端：启动 → 就绪后把窗口指向其 URL → 进程退出则退避重启，
// 直到 ctx 取消（应用退出）。后端在任意时刻意外终结都会走同一重启路径。
// ready 是 subscribeWebviewReady 在窗口创建时订阅的首次导航完成信号。
//
// 三级启动状态机：
//   - normal：完整 marisa 组合；连续 normalFailuresBeforeMinimal 次启动失败
//     降级 minimal；
//   - minimal：harness 内置 web 模板（base+web-app，不加载任何 marisa 插件）；
//     连续 minimalFailuresBeforeRescue 次失败进入 rescue；
//   - rescue：壳层自带急救页（rescue.html + 本地控制端点），不依赖后端；
//     恢复或重试后回到 normal。
//
// 计入失败计数的事件（同一计数器，连续累计）：
//   - 后端进程未发布 URL（启动即退出 / 超时 / 启动失败）；
//   - 发布 URL 后 stableRunTime 内快速异常退出（崩溃循环不再无限重试）；
//   - 页面健康检查失败：页面内未捕获 JS 错误（白屏/错误横幅）或窗口超时
//     未加载完成——shell 对页面可用性的唯一感知通道。
//
// 清零计数的事件：页面健康通过后的干净退出 / 用户主动重启（托盘）。
//
// 冷启动读到持久化的 stage=rescue 时直接进急救页；命令行 --minimal /
// --rescue 强制指定起始阶段，优先于持久化状态。
func supervise(ctx context.Context, port string, win *application.WebviewWindow, ready <-chan struct{}) {
	stage := stageNormal
	if forcedBootStage != "" {
		stage = forcedBootStage
		log.Printf("命令行强制启动阶段：%s", stage)
	} else if loadRescueState().Stage == stageRescue {
		stage = stageRescue
		log.Printf("上次启动停在急救模式，本次直接进入")
	}
	failures := 0
	backoff := restartBackoff
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if retryFullMode.Swap(false) {
			stage = stageNormal
			failures = 0
			backoff = restartBackoff
			lastBootError = nil
			saveRescueState(stageNormal, nil)
			log.Printf("用户请求重试完整模式")
		}

		if stage == stageRescue {
			// 持久化急救状态：冷启动（含 --rescue 强制）期间关闭应用，
			// 下次启动仍直接进急救页，直到用户完成恢复或重试。
			saveRescueState(stageRescue, lastBootError)
			enterRescue(ctx, win, ready, lastBootError)
			stage = stageNormal
			failures = 0
			backoff = restartBackoff
			lastBootError = nil
			saveRescueState(stageNormal, nil)
			continue
		}

		applyBootProfile(stage)
		backendMgr.set(nil, nil)
		cmd, url, exitCh, err := startServer(ctx, port)
		failed := false
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			failures++
			lastBootError = err
			failed = true
			log.Printf("dsh server 启动失败：%v（%s 后重试）", err, backoff)
		} else {
			startedAt := time.Now()
			backendMgr.set(cmd, exitCh)
			backoff = restartBackoff
			lastBootError = nil
			saveRescueState(stageNormal, nil)
			navigated := false
			if err := awaitWebviewReady(ready, ctx); err != nil {
				// Webview 未就绪（或应用退出）：跳过本次导航，窗口停留在
				// 启动页；下一次后端就绪时再试。
				log.Printf("webview 未就绪，跳过导航：%v", err)
			} else {
				log.Printf("dsh server ready at %s", url)
				win.SetURL(url)
				navigated = true
			}

			// 页面健康监控：导航成功后注入探针，捕获页面内 JS 报错/白屏。
			// 未导航（webview 未就绪）时不监控——没有可检查的页面。
			healthStop := make(chan struct{})
			healthErr := make(chan error, 1)
			if navigated {
				if ph, err := newPageHealth(); err != nil {
					log.Printf("页面健康端点不可用：%v（跳过页面健康检查）", err)
				} else {
					go monitorPageHealth(ph, func(js string) { win.ExecJS(js) },
						healthStop, healthErr, pageBootTimeout)
				}
			}

			// 等待本次进程终结、页面健康失败（或应用退出）。
			select {
			case <-ctx.Done():
				// 应用退出：终止后端进程组并等待收口，不留孤儿 node。
				close(healthStop)
				stopServer(cmd, exitCh)
				return
			case exit := <-exitCh:
				close(healthStop)
				if exit.err != nil {
					count, reset := exitFailureClass(exit.err, userRestartRequested.Swap(false), time.Since(startedAt))
					switch {
					case count:
						failures++
						lastBootError = exit.err
						failed = true
						log.Printf("dsh server 快速异常退出（计入失败）：%v", exit.err)
					case reset:
						failures = 0
						log.Printf("dsh server 异常退出（用户重启或长期运行后偶发，不计失败）：%v", exit.err)
					default:
						log.Printf("dsh server 异常退出：%v", exit.err)
					}
				} else {
					failures = 0
					log.Printf("dsh server 退出（重启）")
				}
			case herr := <-healthErr:
				close(healthStop)
				failures++
				lastBootError = herr
				failed = true
				log.Printf("web 页面健康检查失败（计入失败）：%v", herr)
				stopServer(cmd, exitCh)
			}
		}

		// 状态机推进：启动失败、快速崩溃与页面级失败共用同一连续计数。
		if failed {
			if stage == stageNormal && failures >= normalFailuresBeforeMinimal {
				stage = stageMinimal
				failures = 0
				backoff = restartBackoff
				saveRescueState(stageMinimal, lastBootError)
				log.Printf("完整模式连续 %d 次启动失败，降级极简模式（profile=%s）：%v",
					normalFailuresBeforeMinimal, minimalBootProfile, lastBootError)
			} else if stage == stageMinimal && failures >= minimalFailuresBeforeRescue {
				saveRescueState(stageRescue, lastBootError)
				log.Printf("极简模式连续 %d 次启动失败，进入急救模式：%v", minimalFailuresBeforeRescue, lastBootError)
				enterRescue(ctx, win, ready, lastBootError)
				stage = stageNormal
				failures = 0
				backoff = restartBackoff
				lastBootError = nil
				saveRescueState(stageNormal, nil)
				continue
			}
		}

		// 退避等待后重启；应用退出则立即结束。
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < maxRestartWait {
			backoff *= 2
			if backoff > maxRestartWait {
				backoff = maxRestartWait
			}
		}
	}
}

// enterRescue 进入急救模式：启动壳层本地控制端点并把窗口切到急救页，阻塞
// 到用户完成恢复（或点「重试完整启动」）或应用退出。调用方在返回后回到
// normal 阶段重新尝试完整启动。
func enterRescue(ctx context.Context, win *application.WebviewWindow, ready <-chan struct{}, lastErr error) {
	log.Printf("进入急救模式：后端无法以完整/极简组合启动")
	var lastErrStr string
	if lastErr != nil {
		lastErrStr = lastErr.Error()
	}
	srv, err := newRescueServer(lastErrStr)
	if err != nil {
		log.Printf("rescue server 启动失败：%v（回到普通重启）", err)
		return
	}
	if err := srv.start(); err != nil {
		log.Printf("rescue server 启动失败：%v（回到普通重启）", err)
		return
	}
	defer srv.srv.Close()
	if err := awaitWebviewReady(ready, ctx); err != nil {
		log.Printf("rescue 页面导航跳过：%v", err)
	} else {
		log.Printf("rescue 页面：%s", srv.url)
		win.SetURL(srv.url)
	}
	select {
	case <-srv.done:
		log.Printf("急救动作完成，回到完整模式重启")
	case <-ctx.Done():
	}
}

func main() {
	// `wal` 子命令：安装事务 WAL 的 CLI 入口（install_wal_cli.go）。先于
	// 控制台/日志/GUI 初始化分派，安装链路调用后直接退出，不进入桌面流程。
	if handleWalCLI() {
		return
	}

	// --console / MARISA_CONSOLE=1：GUI 子系统发行构建默认无控制台，显式
	// 请求时分配一个并把 stdout/stderr 接过去（必须在 setupLogging 捕获
	// os.Stderr 镜像之前调用；dev 构建从终端启动时 AllocConsole 失败即保持
	// 原句柄，终端日志照常）。
	maybeAttachConsole()

	// --minimal / --rescue：命令行强制启动阶段（详见 rescue_state.go）。
	// 解析必须在 supervise 启动前完成。
	parseBootFlags()

	logPath, closeLog, err := setupLogging()
	if err != nil {
		log.Printf("persistent logging unavailable: %v", err)
	} else {
		defer closeLog()
		log.Printf("persistent log: %s", logPath)
	}

	if handled, err := handleBackendMaintenance(); handled {
		if err != nil {
			log.Fatalf("backend maintenance: %v", err)
		}
		return
	}

	// 单实例早检查：wails 的互斥到 application.New 才生效，而 ensureBackend
	// （首次解包 40-70s）在其之前——重复启动会并行解包同一 staging 目录
	// 互相踩踏（实测两次解包冲突、进程退出）。这里在解包前拦下第二实例并
	// 通知首个实例聚焦窗口（exit 0 静默退出，不弹错误框）；wails 互斥仍作
	// 兜底。
	releaseLock, err := acquireSingleInstance()
	if err != nil {
		log.Printf("检测到已有 Marisa DSH 实例，本实例退出（%v）", err)
		os.Exit(0)
	}
	defer releaseLock()

	// 加载前读取环境变量：全部在创建窗口/启动后端之前解析。
	// DSH_APP_WORKSPACE — 工作目录（默认用户主目录；受限/测试环境可覆盖）。
	// DSH_APP_PORT — 后端监听端口（默认 "0" 由 OS 分配，避免冲突）。
	// MARISA_DEVTOOLS — 窗口就绪后自动打开 WebView2 DevTools（仅非
	// production 构建生效；托盘菜单「打开 DevTools」随时可用）。
	workspace := os.Getenv("DSH_APP_WORKSPACE")
	if workspace == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("resolve home: %v", err)
		}
		workspace = home
	}
	port := os.Getenv("DSH_APP_PORT")
	if port == "" {
		port = "0"
	}
	devtools := os.Getenv("MARISA_DEVTOOLS") == "1"
	if err := os.Chdir(workspace); err != nil {
		log.Fatalf("chdir %s: %v", workspace, err)
	}

	// Standalone 构建（-tags embeddedbundle）：启动前先把内嵌后端解包到
	// %LOCALAPPDATA%\marisa-distro\backend（VERSION 不一致时重新解包），
	// 并把 DSH_WEB_CMD 指向解包后的 launcher —— 壳进程不再依赖系统
	// dsh / Node / PATH。dev 构建（无 tag）时 ensureBackend 返回
	// ("", nil)，DSH_WEB_CMD 保持环境原值，行为与旧版完全一致。
	backendDir, err := ensureBackend()
	if err != nil {
		log.Fatalf("ensure embedded backend: %v", err)
	}
	if backendDir != "" {
		os.Setenv("DSH_WEB_CMD", backendWebCommand(backendDir))
		log.Printf("DSH_WEB_CMD set to embedded backend launcher: %s", os.Getenv("DSH_WEB_CMD"))
	}

	// 注入安装形态与后端版本：后端子进程整体继承壳环境，后端插件（如
	// dsh-update-check）据此决定检查行为与下载资产形态。VERSION 读取失败
	// 不致命——版本为空时插件自动隐身，仅失去更新提示能力。
	version, err := backendVersion(backendDir)
	if err != nil {
		log.Printf("read backend version: %v (update checks will be disabled)", err)
	}
	currentVersion = version
	injectBackendEnv(installForm, version)
	log.Printf("backend env injected: MARISA_INSTALL_FORM=%s MARISA_VERSION=%s", installForm, version)

	// 原生 toast 桥：回环监听 + Wails 通知服务（wintoast 自注册 AUMID）。
	// 端口注入 MARISA_TOAST_PORT，后端子进程继承；桥不可用时后端插件回
	// 503、浏览器半回退 WebView2 默认通知 UI。
	var notificationService *notifications.NotificationService
	var toastBridgeInstance *toastBridge
	if svc, bridge, port, err := startToastBridge(); err != nil {
		log.Printf("toast bridge unavailable: %v (native toasts disabled)", err)
	} else {
		notificationService, toastBridgeInstance = svc, bridge
		os.Setenv("MARISA_TOAST_PORT", strconv.Itoa(port))
		log.Printf("toast bridge on 127.0.0.1:%d (MARISA_TOAST_PORT)", port)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app := application.New(application.Options{
		Name:        "Marisa DSH",
		Description: "Marisa DSH Desktop",
		// 应用/托盘图标：wails 在 Windows 上优先加载 exe 内嵌图标资源（ID 3，
		// 见 icon_windows.syso），缺失时回退到此 PNG（CreateLargeHIconFromImage
		// 支持 PNG 字节）。
		Icon: trayIcon(),
		// 原生 toast：通知服务在 app.Run() 时启动（wintoast 注册 AUMID/
		// CLSID activator），toast 桥的请求经它展示。
		Services: serviceList(notificationService),
		// 单实例：第二次启动不建第二个窗口/托盘/后端，而是通知首个实例显示
		// 并聚焦已有窗口后直接退出（wails 以命名互斥体 + 隐藏消息窗口实现，
		// UniqueID 需跨安装全局唯一）。
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "io.marisa-distro.desktop",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if mainWindow == nil {
					return
				}
				mainWindow.Show()
				mainWindow.Focus()
			},
		},
		Mac: application.MacOptions{
			// 托盘常驻:关窗只隐藏,应用持续运行,托盘「退出」才结束。
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	// 窗口创建延迟到 app.Run()；守护 goroutine 会先 SetURL，窗口即以最新
	// 地址创建。HTML 是启动页（替代 Wails 默认空白页），就绪后由守护进程
	// 用 SetURL 切到真实地址。
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Marisa DSH",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarDefault,
		},
		// OpenInspectorOnStartup 只在非 production 构建生效（wails 内部以
		// isDebugMode 门控），production 构建下此选项被忽略。
		OpenInspectorOnStartup: devtools,
		HTML:                   loadingHTML,
		// 启动即请求通知权限：桌面壳对权限请求自动放行，通知插件的提醒
		// 默认打开（见 requestNotificationPermissionJS）。
		JS: requestNotificationPermissionJS,
	})
	if devtools {
		log.Printf("MARISA_DEVTOOLS=1: DevTools 将在窗口就绪后自动打开（托盘菜单可随时开关）")
	}
	mainWindow = win
	registerCloseToTray(win)
	// toast 点击激活 → 聚焦窗口 + 把会话 id 注入 webview（浏览器半的
	// __dshWebUiNotifyOpen 钩子负责跳转）。需在 mainWindow 赋值之后注册。
	if notificationService != nil {
		openSessionOnToast(notificationService, func() {
			if mainWindow == nil {
				return
			}
			mainWindow.Show()
			mainWindow.Focus()
		}, mainWindow.ExecJS)
	}
	// 首次导航完成信号：必须在 app.Run() 之前订阅（启动页导航在应用启动后
	// 数秒内完成，后端就绪前早已发出；事件流无回放，晚订阅会错过）。
	ready := subscribeWebviewReady(win)
	// IME 候选框定位补偿：hide→show 恢复、最小化恢复与 DPI 变化后重发
	// WebView2 的父窗口位置通知（wails 只在 WM_MOVE 时发送）。
	registerWebviewImeKeepalive(win)

	// 守护后端：启动、就绪、重启都由 supervise 负责。退出时先 cancel 让
	// supervise 终止后端进程组，再等它收口（done）——main 不能抢先返回，
	// 否则 Go 进程退出会强杀 goroutine，kill 来不及执行，后端残留为孤儿。
	// 应用启动后再建托盘(此时 tray impl 可用);托盘菜单/图标由此接管
	// 窗口显隐与退出,后端守护逻辑不变。
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		// 通知服务 Startup 完成（AUMID/activator 已注册），放行 toast 请求。
		if toastBridgeInstance != nil {
			toastBridgeInstance.markReady()
		}
		setupTray(app, win)
	})

	done := make(chan struct{})
	go func() {
		defer close(done)
		supervise(ctx, port, win, ready)
	}()

	if err := app.Run(); err != nil {
		cancel()
		<-done
		log.Fatalf("run app: %v", err)
	}
	cancel()
	<-done
}
