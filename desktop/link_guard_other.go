//go:build !windows

package main

import "os"

// isLinkInfo 报告 Lstat 结果是否为链接。非 Windows 实验构建里链接由
// os.Symlink 创建（junction_other.go），ModeSymlink 判定足够。
func isLinkInfo(fi os.FileInfo) bool {
	return fi.Mode()&os.ModeSymlink != 0
}
