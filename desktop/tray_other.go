//go:build !linux

package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// toggleFromTray 在非 Linux 平台立即切换窗口显隐（无 dbusmenu "opened"
// 误路由问题，见 tray_linux.go）。
func toggleFromTray(win *application.WebviewWindow) {
	if win.IsVisible() {
		win.Hide()
	} else {
		win.Show()
	}
}

// registerTrayMenuOpenHook 非 Linux 平台无事可做。
func registerTrayMenuOpenHook(*application.SystemTray) {}
