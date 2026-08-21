//go:build windows

package main

import (
	"errors"
	"log"
	"os"

	"golang.org/x/sys/windows"
)

// errConsoleUnavailable 表示 AllocConsole 失败（通常因进程已有控制台）。
var errConsoleUnavailable = errors.New("AllocConsole failed: a console is already attached")

// kernel32.AllocConsole / GetConsoleWindow：x/sys/windows 未提供包装，
// 直接经 LazyDLL 调用。
var (
	kernel32             = windows.NewLazySystemDLL("kernel32.dll")
	procAllocConsole     = kernel32.NewProc("AllocConsole")
	procGetConsoleWindow = kernel32.NewProc("GetConsoleWindow")
)

// hasConsole 报告当前进程是否已连接控制台：dev 构建从终端启动（或
// --console / MARISA_CONSOLE=1 分配后）为真；GUI 子系统发行构建默认为假。
// serverCommand 据此决定是否给后端子进程加 CREATE_NO_WINDOW——父进程无
// 控制台可继承时，os/exec 经 cmd.exe /c 启动 .cmd launcher 会新建一个空
// 的控制台窗口，必须显式抑制。
func hasConsole() bool {
	r, _, _ := procGetConsoleWindow.Call()
	return r != 0
}

// maybeAttachConsole 在 GUI 子系统构建（-H=windowsgui）下为 --console /
// MARISA_CONSOLE=1 分配一个新控制台，并把 stdout/stderr 重绑过去，使
// 壳与后端日志在终端可见（后端 stderr 经 backendLogOutput 镜像到终端）。
//
// 开发构建（console 子系统，或从已有终端启动）时 AllocConsole 返回
// ERROR_ACCESS_DENIED/ERROR_ALREADY_EXISTS，原句柄保持不变——终端日志
// 照常可见，无需额外处理。必须在 setupLogging 捕获 os.Stderr 之前调用。
func maybeAttachConsole() {
	if !consoleRequested() {
		return
	}
	if err := allocateConsole(); err != nil {
		return
	}
	attach := func(which uint32, name string) {
		h, err := windows.GetStdHandle(which)
		if err != nil || h == 0 || h == windows.InvalidHandle {
			return
		}
		if which == windows.STD_OUTPUT_HANDLE {
			os.Stdout = os.NewFile(uintptr(h), name)
		} else {
			os.Stderr = os.NewFile(uintptr(h), name)
		}
	}
	attach(windows.STD_OUTPUT_HANDLE, "stdout")
	attach(windows.STD_ERROR_HANDLE, "stderr")
	log.Printf("console attached (--console / MARISA_CONSOLE=1)")
}

// allocateConsole 调用 kernel32.AllocConsole；进程已有控制台（dev 构建从
// 终端启动）时返回错误，调用方保持原句柄即可。
func allocateConsole() error {
	r, _, _ := procAllocConsole.Call()
	if r == 0 {
		return errConsoleUnavailable
	}
	return nil
}
