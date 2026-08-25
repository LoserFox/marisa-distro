//go:build embeddedbundle

package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestBackendWebCommandLauncherPerGOOS 锁定 GOOS 分支：Windows 包 launcher.cmd，
// 其余平台 launcher.sh —— 与 make-bundle 实际放入包根的启动器一一对应。
func TestBackendWebCommandLauncherPerGOOS(t *testing.T) {
	wantName := "launcher.cmd"
	if runtime.GOOS != "windows" {
		wantName = "launcher.sh"
	}
	got := backendWebCommand("/fake/backend")
	if !strings.Contains(got, wantName) {
		t.Errorf("backendWebCommand = %q, want it to reference %s", got, wantName)
	}
	if !strings.HasPrefix(got, `"`) || !strings.HasSuffix(got, `"`) {
		t.Errorf("backendWebCommand = %q, want double-quoted path", got)
	}
}

// TestBackendRootDirOverride 锁定 MARISA_BACKEND_DIR 覆盖（全平台一致行为）。
func TestBackendRootDirOverride(t *testing.T) {
	// 平台中立的绝对路径：Windows 上 filepath.Abs 会把 POSIX 风格的
	// /tmp/... 解析成卷相对路径（C:\tmp\...），硬编码 POSIX 路径的断言
	// 无法跨平台成立。
	want := filepath.Join(os.TempDir(), "marisa-test-backend")
	t.Setenv("MARISA_BACKEND_DIR", want)
	dir, err := backendRootDir()
	if err != nil {
		t.Fatalf("backendRootDir: %v", err)
	}
	if filepath.Clean(dir) != filepath.Clean(want) {
		t.Errorf("override ignored: got %q, want %q", dir, want)
	}
}

// TestLauncherShMatchesCmdSemantics 对照两份 launcher 的关键行，防止后续改动
// 让 shell 版与 cmd 版语义漂移（PATH 前缀、DSH_HOME/DSH_ROOT、overlay 数量）。
func TestLauncherShMatchesCmdSemantics(t *testing.T) {
	shBytes, err := os.ReadFile(filepath.Join("bundle", "launcher.sh"))
	if err != nil {
		t.Fatalf("read launcher.sh: %v", err)
	}
	sh := string(shBytes)
	for _, want := range []string{
		`MARISA_BOOT_PROFILE`,
		`.dsh`, `marisa-distro`, `apps/cli/lib/bin.js`,
		`desktop.overlay.yml`, `standalone.overlay.yml`,
	} {
		if !strings.Contains(sh, want) {
			t.Errorf("launcher.sh missing %q", want)
		}
	}
}
