// 系统托盘与常驻后台:窗口关闭时最小化到托盘(后端继续运行),托盘菜单提供
// 打开窗口、开机自启开关与退出。退出才真正终止后端进程树。
package main

import (
	"embed"
	"log"

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

	// DevTools 调试入口：生产构建隐藏（devToolsAvailable=false，wails 的
	// openDevTools 为 no-op）；MARISA_DEVTOOLS=1 可在启动时自动打开。
	if devToolsAvailable {
		devToolsItem := menu.Add("打开 DevTools")
		devToolsItem.OnClick(func(*application.Context) {
			log.Printf("opening DevTools")
			win.OpenDevTools()
		})
	}

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
