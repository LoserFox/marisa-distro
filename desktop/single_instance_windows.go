//go:build windows

// 单实例早检查：wails 的 SingleInstance 互斥在 application.New 才生效，而
// ensureBackend（首次解包 40-70s）在其之前——重复启动会在解包阶段并行写入
// 同一 staging 目录互相踩踏（实测表现为解包失败、进程退出）。这里在解包
// 之前用命名互斥体拦下第二个实例，并通过命名事件请首个实例聚焦窗口。
// wails 的互斥仍作兜底（application.New 时二次检查）。
package main

import (
	"errors"
	"fmt"
	"log"
	"time"

	"golang.org/x/sys/windows"
)

const (
	// singleInstanceMutexName 语义与 wails 的 UniqueID 相同（跨安装全局唯一），
	// 但名字独立，避免与 wails 内部互斥互相影响。
	singleInstanceMutexName = `Local\io.marisa-distro.desktop.early`
	// showWindowEventName 是第二实例通知首个实例「聚焦窗口」的命名事件。
	showWindowEventName = `Local\io.marisa-distro.desktop.show`
)

// errAlreadyRunning 表示已有实例持有互斥体。
var errAlreadyRunning = errors.New("another instance is already running")

// acquireSingleInstance 试图成为单实例：成功时返回释放函数（进程存活期间
// 持有互斥体；进程退出时内核自动释放）。已有实例时通知其聚焦窗口并返回
// errAlreadyRunning，调用方应静默退出（退出码 0，避免 GUI 报错）。
func acquireSingleInstance() (release func(), err error) {
	release, err = acquireNamedMutex(singleInstanceMutexName)
	if err != nil {
		notifyExistingInstance()
		return nil, errAlreadyRunning
	}
	watchShowWindowEvent()
	return release, nil
}

// acquireNamedMutex 创建（或打开）命名互斥体。首次调用成功并持有互斥体；
// 同名再次调用返回 errAlreadyRunning（此时句柄已由 Windows 打开，需关闭）。
func acquireNamedMutex(name string) (func(), error) {
	h, err := windows.CreateMutex(nil, false, windows.StringToUTF16Ptr(name))
	if err != nil {
		if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
			_ = windows.CloseHandle(h)
			return nil, errAlreadyRunning
		}
		return nil, fmt.Errorf("create mutex %s: %w", name, err)
	}
	return func() { _ = windows.CloseHandle(h) }, nil
}

// notifyExistingInstance 通过命名事件请求正在运行的首个实例聚焦主窗口。
// 事件创建失败（极端情况）时静默放弃：第二实例直接退出，窗口本就在
// 首个实例侧。
func notifyExistingInstance() {
	ev, err := windows.CreateEvent(nil, 0, 0, windows.StringToUTF16Ptr(showWindowEventName))
	if err != nil {
		return
	}
	defer windows.CloseHandle(ev)
	_ = windows.SetEvent(ev)
}

// watchShowWindowEvent 在后台等待「聚焦窗口」事件，触发后等到主窗口创建
// 完成再显示并聚焦（mainWindow 在 app.Run 之前赋值，窗口本体在其后创建，
// 过早调用 Show 可能无效）。
func watchShowWindowEvent() {
	ev, err := windows.CreateEvent(nil, 0, 0, windows.StringToUTF16Ptr(showWindowEventName))
	if err != nil {
		log.Printf("single-instance show event unavailable: %v", err)
		return
	}
	go func() {
		defer windows.CloseHandle(ev)
		for {
			r, err := windows.WaitForSingleObject(ev, windows.INFINITE)
			if err != nil || r != windows.WAIT_OBJECT_0 {
				log.Printf("single-instance show event wait failed: %v", err)
				return
			}
			log.Printf("another instance requested focus")
			// 等主窗口创建完成（最多 60s），再显示并聚焦。
			deadline := time.Now().Add(60 * time.Second)
			for mainWindow == nil && time.Now().Before(deadline) {
				time.Sleep(100 * time.Millisecond)
			}
			if mainWindow != nil {
				mainWindow.Show()
				mainWindow.Focus()
			}
		}
	}()
}
