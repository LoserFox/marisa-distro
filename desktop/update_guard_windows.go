//go:build windows

// Windows 更新确认框：MessageBoxW（user32），在窗口创建前（ensureBackend）
// 也能同步弹窗，不依赖 Wails 事件循环。MARISA_UPDATE_NO_PROMPT=1 时跳过
// 询问直接备份——供自动化/静默场景（MSI custom action 等）使用。
package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/sys/windows"
)

// MessageBox 返回值。
const (
	msgBoxIDCancel = 2
	msgBoxIDYes    = 6
	msgBoxIDNo     = 7
)

// MessageBox 风格位（user32.h 同值）。
const (
	mbYesNoCancel   = 0x00000003
	mbIconWarning   = 0x00000030
	mbDefButton1    = 0x00000000
	mbTopmost       = 0x00040000
	mbSetForeground = 0x00010000
)

// platformUpdatePrompt 询问用户是否保留数据。返回 (keep, cancel)：
// keep=false 表示用户选择不保留（直接洗一遍）；cancel=true 表示取消更新。
// 环境变量 MARISA_UPDATE_NO_PROMPT=1 时跳过询问，默认备份（keep=true）。
func platformUpdatePrompt(from, to string) (keep, cancel bool) {
	if os.Getenv("MARISA_UPDATE_NO_PROMPT") == "1" {
		return true, false
	}
	title := "Marisa DSH 更新"
	text := fmt.Sprintf(
		"检测到新版本（v%s → v%s）。\n\n"+
			"更新将替换 backend 目录，其中的会话记录、设置等数据（backend\\.dsh）会被删除。\n\n"+
			"是(Y)   备份数据后更新（推荐）\n"+
			"否(N)   不保留数据，直接更新\n"+
			"取消    本次不更新",
		from, to)
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return true, false
	}
	textPtr, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return true, false
	}
	ret, err := windows.MessageBox(0, textPtr, titlePtr,
		mbYesNoCancel|mbIconWarning|mbDefButton1|mbTopmost|mbSetForeground)
	if err != nil {
		log.Printf("update guard: prompt failed (%v), defaulting to backup", err)
		return true, false
	}
	switch ret {
	case msgBoxIDYes:
		return true, false
	case msgBoxIDNo:
		return false, false
	default: // IDCANCEL / 关闭
		return false, true
	}
}
