// 系统托盘与常驻后台:窗口关闭时最小化到托盘(后端继续运行),托盘菜单提供
// 打开窗口、开机自启开关与退出。退出才真正终止后端进程树。
package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed assets/icon.png
var trayIconFS embed.FS

// trayIcon 返回托盘/任务栏图标字节(PNG;Wails 的 Windows 实现直接解码)。
func trayIcon() []byte {
	data, err := trayIconFS.ReadFile("assets/icon.png")
	if err != nil {
		return nil
	}
	return data
}

// setupTray 创建系统托盘(应用启动事件后调用,此时 impl 可用)。
// 托盘行为:
//   - 左键单击:切换主窗口显隐
//   - 菜单「打开 Marisa DSH」:显示并聚焦主窗口
//   - 菜单「开机自启」:勾选状态来自 Autostart;点击即开关 HKCU\…\Run(Windows)
//   - 菜单「打开日志目录/打开数据目录」:系统文件管理器打开日志/数据目录
//   - 菜单「重启后端」:终止当前后端,supervise 自动重启并重新导航
//   - 菜单「打开 DevTools」:打开 WebView2 DevTools(仅非 production 构建)
//   - 菜单「退出」:application.Quit() → main 的 cancel → 后端进程树清理
func setupTray(app *application.App, win *application.WebviewWindow) {
	tray := app.SystemTray.New()
	tray.SetTooltip("Marisa DSH")
	if icon := trayIcon(); icon != nil {
		tray.SetIcon(icon)
	}

	menu := application.NewMenu()

	openItem := menu.Add("打开 Marisa DSH")
	openItem.OnClick(func(*application.Context) {
		win.Show()
	})

	autostartItem := menu.AddCheckbox("开机自启", autostartEnabled(app))
	autostartItem.OnClick(func(*application.Context) {
		if autostartItem.Checked() {
			if err := app.Autostart.Enable(); err != nil {
				log.Printf("autostart enable failed: %v", err)
			}
		} else {
			if err := app.Autostart.Disable(); err != nil {
				log.Printf("autostart disable failed: %v", err)
			}
		}
	})

	menu.AddSeparator()

	// 日志/数据目录入口：点击时先确保目录存在，再交给系统文件管理器打开。
	if logDir, err := appLogDir(); err == nil {
		logDirItem := menu.Add("打开日志目录")
		logDirItem.OnClick(func(*application.Context) {
			if err := ensureAndOpenFolder(logDir); err != nil {
				log.Printf("open log dir failed: %v", err)
			}
		})
	} else {
		log.Printf("log dir unavailable: %v", err)
	}
	if dataDir, err := appDataDir(); err == nil {
		dataDirItem := menu.Add("打开数据目录")
		dataDirItem.OnClick(func(*application.Context) {
			if err := ensureAndOpenFolder(dataDir); err != nil {
				log.Printf("open data dir failed: %v", err)
			}
		})
	} else {
		log.Printf("data dir unavailable: %v", err)
	}

	// 重启后端：终止当前后端进程树，supervise 收到 exitCh 后自动以 1s
	// 退避重启并重新导航窗口——改完 harness/服务端组合无需关应用。
	restartItem := menu.Add("重启后端")
	restartItem.OnClick(func(*application.Context) {
		if !backendMgr.restart() {
			log.Printf("backend restart requested but no backend is running")
			return
		}
		log.Printf("backend restart requested; supervise will relaunch it")
	})

	// 重试完整模式：极简模式（降级）下请求回到完整 marisa 组合。
	// 置位标志后杀后端，supervise 下一轮迭代读到标志即拉回 normal。
	retryItem := menu.Add("重试完整模式")
	retryItem.OnClick(func(*application.Context) {
		retryFullMode.Store(true)
		if !backendMgr.restart() {
			log.Printf("retry full mode requested but no backend is running (ignored in rescue)")
		}
		log.Printf("retry full mode requested; supervise will relaunch the full profile")
	})

	// DevTools 调试入口：生产构建隐藏（devToolsAvailable=false，wails 的
	// openDevTools 为 no-op）；MARISA_DEVTOOLS=1 可在启动时自动打开。
	if devToolsAvailable {
		devToolsItem := menu.Add("打开 DevTools")
		devToolsItem.OnClick(func(*application.Context) {
			log.Printf("opening DevTools")
			win.OpenDevTools()
		})
	}

	// 版本信息：原生信息对话框展示后端版本、安装形态与日志位置。
	aboutItem := menu.Add("版本信息")
	aboutItem.OnClick(func(*application.Context) {
		msg := fmt.Sprintf("Marisa DSH 桌面版\n\n版本：%s\n安装形态：%s", currentVersion, installForm)
		if dir, err := appLogDir(); err == nil {
			msg += fmt.Sprintf("\n日志：%s", filepath.Join(dir, appLogName))
		}
		dialog := app.Dialog.Info()
		dialog.Title = "Marisa DSH"
		dialog.Message = msg
		dialog.Show()
	})

	menu.AddSeparator()

	quitItem := menu.Add("退出")
	quitItem.OnClick(func(*application.Context) {
		log.Printf("tray quit requested")
		app.Quit()
	})

	tray.SetMenu(menu)
	tray.OnClick(func() {
		if win.IsVisible() {
			win.Hide()
		} else {
			win.Show()
		}
	})
	tray.Run()
	log.Printf("system tray ready")
}

// ensureAndOpenFolder 确保目录存在后，用系统文件管理器打开它（Explorer /
// Finder / xdg-open）。
func ensureAndOpenFolder(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer", dir).Start()
	case "darwin":
		return exec.Command("open", dir).Start()
	default:
		return exec.Command("xdg-open", dir).Start()
	}
}

// autostartEnabled 读取当前开机自启状态(失败按未启用处理)。
func autostartEnabled(app *application.App) bool {
	enabled, err := app.Autostart.IsEnabled()
	if err != nil {
		log.Printf("autostart status: %v", err)
		return false
	}
	return enabled
}

// registerCloseToTray 拦截窗口关闭:取消关闭并把窗口藏进托盘(常驻后台),
// 后端继续运行;真正的退出走托盘「退出」。
// 用 hook 而非 listener:hook 同步先执行,Cancel 后内部关闭 listener 会被跳过。
func registerCloseToTray(win *application.WebviewWindow) {
	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		win.Hide()
		log.Printf("窗口已最小化到托盘(常驻后台);托盘菜单「退出」结束应用")
	})
}
