//go:build !windows

package main

// maybeAttachConsole 在非 Windows 平台是 no-op：终端行为由启动方式决定，
// 发行构建默认不弹终端窗口的要求只适用于 Windows。
func maybeAttachConsole() {}
