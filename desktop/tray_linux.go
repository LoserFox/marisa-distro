//go:build linux

package main

import (
	"log"
	"reflect"
	"sync"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// trayToggleDelay 是左键切换的延迟窗口。wails v3 beta.10 把 dbusmenu 的
// "opened" 事件（宿主弹出托盘菜单时的标准协议调用，KDE Plasma 每次右键
// 都会发）错误路由进 SystemTray.clickHandler——右键弹菜单会附带触发一次
// 左键窗口切换。Event 分支在 clickHandler 之后同步调用 onMenuOpen，因此
// 把真实切换推迟这一小段：若期间菜单打开（onMenuOpen 被调），说明刚才的
// clickHandler 来自菜单打开而非真实左键，取消挂起的切换。Activate（真实
// 左键）不会触发 onMenuOpen，切换照常执行，仅多 60ms 延迟。
const trayToggleDelay = 60 * time.Millisecond

// trayToggles 登记挂起的延迟切换，菜单打开时全部取消。timer 触发后自摘除，
// map 不会随点击次数增长。
var trayToggles struct {
	mu      sync.Mutex
	seq     int
	pending map[int]*time.Timer
}

// toggleFromTray 延迟执行窗口显隐切换（见 trayToggleDelay 说明）。
func toggleFromTray(win *application.WebviewWindow) {
	trayToggles.mu.Lock()
	if trayToggles.pending == nil {
		trayToggles.pending = map[int]*time.Timer{}
	}
	trayToggles.seq++
	seq := trayToggles.seq
	trayToggles.pending[seq] = time.AfterFunc(trayToggleDelay, func() {
		trayToggles.mu.Lock()
		delete(trayToggles.pending, seq)
		trayToggles.mu.Unlock()
		if win.IsVisible() {
			win.Hide()
		} else {
			win.Show()
		}
	})
	trayToggles.mu.Unlock()
}

// registerTrayMenuOpenHook 把 cancelPendingTrayToggles 注入 SystemTray 的
// onMenuOpen 回调。beta.10 没有公开 API，只能反射写私有字段；wails 升级
// 改动内部结构时返回 false，行为退化为「右键弹菜单附带一次窗口切换」
// （即修复前的状态），不影响其余功能。
func registerTrayMenuOpenHook(tray *application.SystemTray) {
	field := reflect.ValueOf(tray).Elem().FieldByName("onMenuOpen")
	if !field.IsValid() || field.Kind() != reflect.Func || !field.CanAddr() || field.Type() != reflect.TypeOf(func() {}) {
		log.Printf("tray menu hook unavailable (wails internals changed); 右键弹菜单可能附带一次窗口切换")
		return
	}
	writable := reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem()
	writable.Set(reflect.ValueOf(cancelPendingTrayToggles))
}

// cancelPendingTrayToggles 取消所有挂起的延迟切换（菜单刚被宿主打开）。
func cancelPendingTrayToggles() {
	trayToggles.mu.Lock()
	timers := trayToggles.pending
	trayToggles.pending = map[int]*time.Timer{}
	trayToggles.mu.Unlock()
	for _, t := range timers {
		t.Stop()
	}
}
