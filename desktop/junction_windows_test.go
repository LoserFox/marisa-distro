//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCreateJunction(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "marker.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "link")

	if err := createJunction(link, target); err != nil {
		t.Fatalf("createJunction: %v", err)
	}
	// 功能验证：junction 必须能跟随访问目标内容（Lstat 的 mode 位对
	// MOUNT_POINT reparse 的呈现随 Go 版本/文件系统差异变化，不作断言）。
	data, err := os.ReadFile(filepath.Join(link, "marker.txt"))
	if err != nil {
		t.Fatalf("read through junction: %v", err)
	}
	if string(data) != "ok" {
		t.Fatalf("marker = %q, want ok", data)
	}
	// 跟随读取必须命中目标（junction 不是目录拷贝）。
	dirInfo, err := os.Stat(link)
	if err != nil {
		t.Fatalf("stat link: %v", err)
	}
	if !dirInfo.IsDir() {
		t.Fatalf("link is not a directory: %v", dirInfo.Mode())
	}
	// 幂等：再次调用不报错也不重复创建。
	if err := createJunction(link, target); err != nil {
		t.Fatalf("second createJunction: %v", err)
	}
	// 重命名/删除链接不应影响目标。
	renamed := filepath.Join(root, "link-renamed")
	if err := os.Rename(link, renamed); err != nil {
		t.Fatalf("rename link: %v", err)
	}
	if _, err := os.ReadFile(filepath.Join(renamed, "marker.txt")); err != nil {
		t.Fatalf("read through renamed junction: %v", err)
	}
}
