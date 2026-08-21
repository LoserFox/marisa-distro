package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	notifications "github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// fakeToastSender 捕获 SendNotification 载荷，供桥 handler 测试断言。
type fakeToastSender struct {
	options notifications.NotificationOptions
	err     error
}

func (f *fakeToastSender) SendNotification(options notifications.NotificationOptions) error {
	f.options = options
	return f.err
}

// postToast 对桥的 /toast 路由发起一次 JSON POST。
func postToast(t *testing.T, bridge *toastBridge, body string) *httptest.ResponseRecorder {
	t.Helper()
	bridge.markReady()
	req := httptest.NewRequest(http.MethodPost, "/toast", strings.NewReader(body))
	rec := httptest.NewRecorder()
	bridge.handleToast(rec, req)
	return rec
}

func TestToastBridgeHandleToast(t *testing.T) {
	sender := &fakeToastSender{}
	bridge := newToastBridge(sender)

	rec := postToast(t, bridge, `{"title":"会话 · 需要审批","body":"越权执行","sessionId":"s1"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("POST with sessionId: code = %d, want 204", rec.Code)
	}
	if sender.options.Title != "会话 · 需要审批" || sender.options.Body != "越权执行" {
		t.Errorf("title/body not forwarded: %+v", sender.options)
	}
	if got := sender.options.Data["sessionId"]; got != "s1" {
		t.Errorf("Data.sessionId = %v, want s1", got)
	}
	if sender.options.ID == "" {
		t.Error("ID must be unique per toast")
	}

	rec = postToast(t, bridge, `{"title":"无会话"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("POST without sessionId: code = %d, want 204", rec.Code)
	}
	if sender.options.Data != nil {
		t.Errorf("Data = %v, want nil when no sessionId", sender.options.Data)
	}

	rec = postToast(t, bridge, `{"body":"no title"}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing title: code = %d, want 400", rec.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/toast", nil)
	rec = httptest.NewRecorder()
	bridge.handleToast(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: code = %d, want 405", rec.Code)
	}
}

func TestToastBridgeForwardsSendError(t *testing.T) {
	sender := &fakeToastSender{err: errors.New("wintoast failed")}
	bridge := newToastBridge(sender)
	rec := postToast(t, bridge, `{"title":"t"}`)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("send error: code = %d, want 500", rec.Code)
	}
}

func TestOpenSessionJS(t *testing.T) {
	if got, want := openSessionJS("s1"), `window.__dshWebUiNotifyOpen?.("s1")`; got != want {
		t.Errorf("openSessionJS(s1) = %q, want %q", got, want)
	}
	// 会话 id 里带引号/反斜杠时仍保持合法字符串字面量。
	got := openSessionJS(`s"a\b`)
	if !strings.Contains(got, `window.__dshWebUiNotifyOpen?.(`) || !strings.HasSuffix(got, ")") {
		t.Errorf("openSessionJS escapes incorrectly: %q", got)
	}
	if strings.Contains(got, `"s"a`) {
		t.Errorf("openSessionJS did not escape quotes: %q", got)
	}
}
