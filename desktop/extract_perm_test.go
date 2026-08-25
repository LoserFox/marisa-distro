package main

import (
	"archive/tar"
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/klauspost/compress/zstd"
)

// buildTarZst packs files (name → content+mode) into an in-memory tar.zst,
// mirroring what tarszst produces for regular files.
func buildTarZst(t *testing.T, files map[string]struct {
	content string
	mode    int64
}) []byte {
	t.Helper()
	var raw bytes.Buffer
	zw, err := zstd.NewWriter(&raw)
	if err != nil {
		t.Fatalf("zstd writer: %v", err)
	}
	tw := tar.NewWriter(zw)
	for name, f := range files {
		if err := tw.WriteHeader(&tar.Header{
			Name:     name,
			Typeflag: tar.TypeReg,
			Mode:     f.mode,
			Size:     int64(len(f.content)),
		}); err != nil {
			t.Fatalf("header %s: %v", name, err)
		}
		if _, err := tw.Write([]byte(f.content)); err != nil {
			t.Fatalf("body %s: %v", name, err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zstd: %v", err)
	}
	return raw.Bytes()
}

// TestExtractTarZstRestoresPermissionModes 锁定解压器的权限位还原契约：
// 打包侧（tarszst）对可执行文件规范化为 0755，解压后 node/mnemon/launcher.sh
// 必须保持可执行；普通文件回落 0644。mode=0 的历史归档按防御规则落 0644。
func TestExtractTarZstRestoresPermissionModes(t *testing.T) {
	data := buildTarZst(t, map[string]struct {
		content string
		mode    int64
	}{
		"launcher.sh": {content: "#!/bin/sh\n", mode: 0o755},
		"node":        {content: "ELF", mode: 0o755},
		"plain.txt":   {content: "x", mode: 0o644},
		"legacy.bin":  {content: "y", mode: 0}, // archives without mode bits
	})
	dest := t.TempDir()
	n, err := extractTarZst(data, dest, nil, nil)
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	if n != 4 {
		t.Fatalf("extracted %d files, want 4", n)
	}
	for name, want := range map[string]os.FileMode{
		"launcher.sh": 0o755,
		"node":        0o755,
		"plain.txt":   0o644,
		"legacy.bin":  0o644,
	} {
		got, err := os.Stat(filepath.Join(dest, name))
		if err != nil {
			t.Fatalf("stat %s: %v", name, err)
		}
		if runtime.GOOS == "windows" {
			// Windows 的文件系统不保存 POSIX 权限位：Stat 恒报 0666，
			// chmod 只切换写位。这里退而断言「未被置为只读」，精确的
			// 0755/0644 契约由 Linux/macOS 侧覆盖（tarszst 规范化 +
			// 解压还原在打包/解包双端各自验证）。
			if got.Mode().Perm()&0o200 == 0 {
				t.Errorf("%s is read-only on windows, want writable", name)
			}
			continue
		}
		if got.Mode().Perm() != want {
			t.Errorf("%s perm = %o, want %o", name, got.Mode().Perm(), want)
		}
	}
}
