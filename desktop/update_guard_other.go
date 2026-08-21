//go:build !windows

// 非 Windows 平台无桌面确认框：更新前一律自动备份（keep=true），不打断
// 流程。行为与 Windows 上选择「是（备份后更新）」一致。
package main

// platformUpdatePrompt 在非 Windows 平台返回 (keep=true, cancel=false)。
func platformUpdatePrompt(from, to string) (keep, cancel bool) {
	return true, false
}
