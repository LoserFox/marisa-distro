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

// platformUpdatePrompt 询问用户如何更新。返回 (keep, cancel)：
// keep=true 表示保留数据（备份 + 自动迁移进新版本）；keep=false 表示
// 全新开始（数据留在备份区，不迁移）；cancel=true 表示取消更新。
// 环境变量 MARISA_UPDATE_NO_PROMPT=1 时跳过询问，默认保留（keep=true）。
func platformUpdatePrompt(from, to string) (keep, cancel bool) {
	if os.Getenv("MARISA_UPDATE_NO_PROMPT") == "1" {
		return true, false
	}
	title := "Marisa DSH 更新"
	text := fmt.Sprintf(
		"检测到新版本（v%s → v%s）。\n\n"+
			"升级会自动保留你的数据（会话记录、设置、插件配置），\n"+
			"并先备份到 backup\\ 目录作为安全网。\n\n"+
			"是(Y)   保留数据并更新（推荐）\n"+
			"否(N)   清除全部数据，全新开始\n"+
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
