//go:build windows

package main

import (
	"os"
	"syscall"

	"golang.org/x/sys/windows"
)

// isLinkInfo 报告 Lstat 结果是否为链接（junction/symlink）而非真实目录。
// 只看 ModeSymlink 不可靠：mount point reparse 的 mode 位呈现随 Go 版本和
// 文件系统变化（见 junction_windows_test.go 的注释），因此补一层 Windows
// 原生的 FILE_ATTRIBUTE_REPARSE_POINT 判定。LINKS.json 重放用它发现
// 「链接被真实目录顶掉」的退化——最常见于失败/中断的 pnpm 操作。
func isLinkInfo(fi os.FileInfo) bool {
	if fi.Mode()&os.ModeSymlink != 0 {
		return true
	}
	if attr, ok := fi.Sys().(*syscall.Win32FileAttributeData); ok {
		return attr.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0
	}
	return false
}
