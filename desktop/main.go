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
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed landing.html
var loadingHTML string

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
	go func() {
		killServerTree(cmd.Process.Pid, false)
		time.Sleep(serverStopGrace)
		killServerTree(cmd.Process.Pid, true)
	}()
	return true
}

// backendMgr 是托盘重启入口与 supervise 之间的共享句柄。
var backendMgr backendManager

// supervise 守护后端：启动 → 就绪后把窗口指向其 URL → 进程退出则退避重启，
// 直到 ctx 取消（应用退出）。后端在任意时刻意外终结都会走同一重启路径。
// ready 是 subscribeWebviewReady 在窗口创建时订阅的首次导航完成信号。
func supervise(ctx context.Context, port string, win *application.WebviewWindow, ready <-chan struct{}) {
	backoff := restartBackoff
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		backendMgr.set(nil, nil)
		cmd, url, exitCh, err := startServer(ctx, port)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("dsh server 启动失败：%v（%s 后重试）", err, backoff)
		} else {
			backendMgr.set(cmd, exitCh)
			backoff = restartBackoff
			if err := awaitWebviewReady(ready, ctx); err != nil {
				// Webview 未就绪（或应用退出）：跳过本次导航，窗口停留在
				// 启动页；下一次后端就绪时再试。
				log.Printf("webview 未就绪，跳过导航：%v", err)
			} else {
				log.Printf("dsh server ready at %s", url)
				win.SetURL(url)
			}

			// 等待本次进程终结（或应用退出）。
			select {
			case <-ctx.Done():
				// 应用退出：终止后端进程组并等待收口，不留孤儿 node。
				stopServer(cmd, exitCh)
				return
			case exit := <-exitCh:
				if exit.err != nil {
					log.Printf("dsh server 异常退出：%v", exit.err)
				} else {
					log.Printf("dsh server 退出（重启）")
				}
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

func main() {
	// --console / MARISA_CONSOLE=1：GUI 子系统发行构建默认无控制台，显式
	// 请求时分配一个并把 stdout/stderr 接过去（必须在 setupLogging 捕获
	// os.Stderr 镜像之前调用；dev 构建从终端启动时 AllocConsole 失败即保持
	// 原句柄，终端日志照常）。
	maybeAttachConsole()

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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app := application.New(application.Options{
		Name:        "Marisa DSH",
		Description: "Marisa DSH Desktop",
		// 应用/托盘图标：wails 在 Windows 上优先加载 exe 内嵌图标资源（ID 3，
		// 见 icon_windows.syso），缺失时回退到此 PNG（CreateLargeHIconFromImage
		// 支持 PNG 字节）。
		Icon: trayIcon(),
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
	})
	if devtools {
		log.Printf("MARISA_DEVTOOLS=1: DevTools 将在窗口就绪后自动打开（托盘菜单可随时开关）")
	}
	mainWindow = win
	registerCloseToTray(win)
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
