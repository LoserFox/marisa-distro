// 非 Windows 实验构建：没有 cmd mklink，直接建目录符号链接
// （Linux/macOS 桌面壳是实验性的，junction 语义由 symlink 近似）。
//
//go:build !windows

package main

import (
	"os"
	"path/filepath"
)

func createJunction(link, target string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	if _, err := os.Lstat(link); err == nil {
		return nil
	}
	return os.Symlink(target, link)
}
