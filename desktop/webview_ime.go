// WebView2 IME 候选框定位补偿（Windows）。wails 只在窗口真正移动
// （WM_MOVE/WM_MOVING）时调用 controller 的 NotifyParentWindowPositionChanged，
// 托盘 hide→show 恢复、最小化恢复与 DPI 变化路径都不会触发该通知；TSF
// （微软拼音等）候选框依赖 controller 持有的父窗口位置做坐标换算，通知缺失
// 时会把候选框钉在屏幕左上角（TSF 回退位）。这里在恢复/DPI 变化后做一次
// 1px 位移往返，借 wails 的 WM_MOVE 路径强制重发通知，并在日志中记录窗口
// 所在显示器的缩放因子，便于候选框错位类问题排查。
//
//go:build windows

package main

import (
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// registerWebviewImeKeepalive 订阅窗口恢复/DPI 变化事件，并在事件后触发
// webviewNudgePosition。事件回调本身在 UI 线程，但 nudge 延迟到窗口状态
// 稳定后再执行（Position/SetPosition 内部经 InvokeSync 回主线程，任意
// goroutine 调用均安全）。
func registerWebviewImeKeepalive(win *application.WebviewWindow) {
	sync := func() {
		// 延迟到 ShowWindow/SetWindowPos 同帧竞争结束后再抖动，避免位移
		// 被窗口系统合并而收不到 WM_MOVE。
		time.AfterFunc(80*time.Millisecond, func() { webviewNudgePosition(win) })
	}
	win.OnWindowEvent(events.Windows.WindowShow, func(*application.WindowEvent) {
		logWebviewImeScreen(win, "WindowShow")
		sync()
	})
	win.OnWindowEvent(events.Windows.WindowRestore, func(*application.WindowEvent) {
		sync()
	})
	win.OnWindowEvent(events.Windows.WindowUnMinimise, func(*application.WindowEvent) {
		sync()
	})
	win.OnWindowEvent(events.Windows.WindowDPIChanged, func(*application.WindowEvent) {
		logWebviewImeScreen(win, "WindowDPIChanged")
		sync()
	})
}

// webviewNudgePosition 把窗口向右移动 1px 再移回：wails 的 WM_MOVE 处理器
// 会调用 NotifyParentWindowPositionChanged，WebView2 据此向 TSF 重新上报
// 父窗口位置。位移往返在同一瞬间完成，视觉不可感知；窗口若已被销毁则
// Position 返回 (0,0) 且 SetPosition 为 no-op，无需额外防护。
func webviewNudgePosition(win *application.WebviewWindow) {
	x, y := win.Position()
	win.SetPosition(x+1, y)
	win.SetPosition(x, y)
}

// logWebviewImeScreen 记录窗口当前所在显示器的缩放因子（DPI/96），供
// IME 候选框错位排查对照系统显示设置。
func logWebviewImeScreen(win *application.WebviewWindow, event string) {
	screen, err := win.GetScreen()
	if err != nil || screen == nil {
		log.Printf("webview ime keepalive: %s (screen lookup: %v)", event, err)
		return
	}
	log.Printf("webview ime keepalive: %s on screen %s scale=%.2f", event, screen.Name, screen.ScaleFactor)
}
