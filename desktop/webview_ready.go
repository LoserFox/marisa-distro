// SetURL 的竞态护栏：Wails v3 (beta) 的 WebView2 创建是异步的（controller
// 完成回调前 webview 为 nil），就绪前调用 SetURL 会在 wails 内部解引用
// panic（"catastrophic failure"）。等待平台首次导航完成事件后再导航，
// 保证 WebviewWindow 已可导航。
package main

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// subscribeWebviewReady 在窗口创建时（app.Run 之前）订阅首次导航完成事件，
// 返回导航完成时收到信号的 channel。
//
// 不能在等待时才订阅：启动页（landing.html）的首次导航在应用启动后数秒内
// 即完成，而后端 boot 通常要数十秒（tsx + profile 加载），届时事件早已
// 发出且事件流无回放——晚订阅会永远等不到，窗口停在启动页。
func subscribeWebviewReady(win *application.WebviewWindow) <-chan struct{} {
	ready := make(chan struct{}, 1)
	switch runtime.GOOS {
	case "windows":
		win.OnWindowEvent(events.Windows.WebViewNavigationCompleted, func(*application.WindowEvent) {
			select {
			case ready <- struct{}{}:
			default:
			}
		})
	case "darwin":
		win.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, func(*application.WindowEvent) {
			select {
			case ready <- struct{}{}:
			default:
			}
		})
	default:
		// Linux (GTK WebKit) 无此竞态，原流程直接可用：立即放行。
		close(ready)
	}
	return ready
}

// awaitWebviewReady 阻塞到首次导航完成（webview 已创建），或 ctx 取消 /
// 超时。超时返回错误，调用方应跳过本次 SetURL（窗口停留在启动页）而非
// 冒险导航。
func awaitWebviewReady(ready <-chan struct{}, ctx context.Context) error {
	select {
	case <-ready:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(urlTimeout):
		return fmt.Errorf("webview never reported a completed navigation")
	}
}
