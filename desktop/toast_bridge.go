// 原生 toast 桥：本地回环 HTTP 端口接收 {title, body}，转 Wails 通知服务
// （Windows 用 wintoast，启动时自注册 AppUserModelID 与 CLSID activator，
// 无需安装器快捷方式）弹 Windows 原生 toast。后端插件（dsh-web-ui-notify
// host 半边）把浏览器发来的通知意图经 MARISA_TOAST_PORT 转发到这里，
// 从而绕开 WebView2 自绘的（Edge 风格）默认通知 UI。
package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	notifications "github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// toastSender 是最小发送面，测试可注入替身。
type toastSender interface {
	SendNotification(options notifications.NotificationOptions) error
}

// toastBridge 持有回环监听与发送面；服务就绪前请求在 handler 内等待。
type toastBridge struct {
	sender toastSender
	ready  chan struct{}
	once   sync.Once
}

func newToastBridge(sender toastSender) *toastBridge {
	return &toastBridge{sender: sender, ready: make(chan struct{})}
}

// markReady 在应用启动（通知服务 Startup 完成）后调用，放行积压请求。
// 幂等：重复调用（如测试多次 post）不会 panic。
func (b *toastBridge) markReady() { b.once.Do(func() { close(b.ready) }) }

// listen 启动回环监听，返回 OS 分配的端口号。必须在后端启动（注入
// MARISA_TOAST_PORT）之前调用。
func (b *toastBridge) listen() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/toast", b.handleToast)
	go func() {
		if err := http.Serve(ln, mux); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("toast bridge: serve: %v", err)
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// toastIntent 是浏览器半经 host 转发来的载荷；SessionId 用于点击 toast 后
// 跳回对应会话（经 wintoast 激活回传 Data）。
type toastIntent struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	SessionID string `json:"sessionId,omitempty"`
}

func (b *toastBridge) handleToast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// 通知服务在应用启动后才可用；后端 boot 需数十秒，实际请求必然晚于
	// markReady，这里只是防御性地等一等，避免早到请求在 nil 服务上崩。
	select {
	case <-b.ready:
	case <-r.Context().Done():
		return
	}
	var intent toastIntent
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&intent); err != nil {
		http.Error(w, "bad json body", http.StatusBadRequest)
		return
	}
	if intent.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	options := notifications.NotificationOptions{
		ID:    "marisa-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		Title: intent.Title,
		Body:  intent.Body,
	}
	// 会话 id 随 toast 激活载荷回传（wintoast 把整个 options 编码进 launch
	// 参数），点击回调里据此跳转。
	if intent.SessionID != "" {
		options.Data = map[string]interface{}{"sessionId": intent.SessionID}
	}
	err := b.sender.SendNotification(options)
	if err != nil {
		log.Printf("toast bridge: send failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// openSessionJS 构造注入 webview 的跳转调用：可选链调用浏览器半注册的
// window.__dshWebUiNotifyOpen(sessionId)，钩子未就绪时静默。
func openSessionJS(sid string) string {
	return "window.__dshWebUiNotifyOpen?.(" + strconv.Quote(sid) + ")"
}

// openSessionOnToast 在 toast 点击激活（wintoast 回传 Data）时把会话跳转
// 注入 webview：先聚焦窗口，再执行浏览器半注册的全局钩子。focus 与 eval
// 由调用方注入（main 持有 mainWindow），便于测试替身。
func openSessionOnToast(svc *notifications.NotificationService, focus func(), eval func(string)) {
	svc.OnNotificationResponse(func(result notifications.NotificationResult) {
		if result.Error != nil {
			log.Printf("toast click: %v", result.Error)
			return
		}
		sid, ok := result.Response.UserInfo["sessionId"].(string)
		if !ok || sid == "" {
			return
		}
		focus()
		eval(openSessionJS(sid))
	})
}

// startToastBridge 创建通知服务与回环监听，返回 (服务, 桥, 端口, err)。端口为
// 0 或 err 非 nil 表示桥不可用（调用方跳过 MARISA_TOAST_PORT 注入即可，
// host 半边会回 503，浏览器半回退 WebView2 默认通知 UI）。
func startToastBridge() (*notifications.NotificationService, *toastBridge, int, error) {
	svc := notifications.New()
	bridge := newToastBridge(svc)
	port, err := bridge.listen()
	if err != nil {
		return nil, nil, 0, err
	}
	return svc, bridge, port, nil
}

// serviceList 把可用的通知服务包装成 wails Options.Services；nil 时返回
// 空表（桥不可用时应用不带通知服务启动）。
func serviceList(svc *notifications.NotificationService) []application.Service {
	if svc == nil {
		return nil
	}
	return []application.Service{application.NewService(svc)}
}
