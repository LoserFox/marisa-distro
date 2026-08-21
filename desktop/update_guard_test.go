package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// makeDshTree 在 backendDir 下造一个含用户数据与 junction 的 .dsh 树。
func makeDshTree(t *testing.T, backendDir string) {
	t.Helper()
	dsh := dshHomePath(backendDir)
	writeTestFile(t, filepath.Join(dsh, "settings.yaml"), "theme: dark\n")
	writeTestFile(t, filepath.Join(dsh, "sessions", "proj", "s1", "session.jsonl.zstd"), "zstd-bytes")
	writeTestFile(t, filepath.Join(dsh, "storages", "workspace.json"), "{}")
	// junction：指向 backend 内 node_modules 的部署共享链接（模拟
	// profiles/marisa/node_modules）。
	link := filepath.Join(dsh, "profiles", "marisa", "node_modules")
	target := filepath.Join(backendDir, "node_modules")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(target, "marker.txt"), "modules")
	if runtime.GOOS == "windows" {
		if err := createJunction(link, target); err != nil {
			t.Fatalf("create junction: %v", err)
		}
	} else {
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("symlink unavailable: %v", err)
		}
	}
}

func TestHasUserData(t *testing.T) {
	t.Run("missing dir", func(t *testing.T) {
		has, err := hasUserData(filepath.Join(t.TempDir(), ".dsh"))
		if err != nil {
			t.Fatal(err)
		}
		if has {
			t.Fatal("missing .dsh must report no data")
		}
	})
	t.Run("empty dir", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), ".dsh")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		has, err := hasUserData(dir)
		if err != nil {
			t.Fatal(err)
		}
		if has {
			t.Fatal("empty .dsh must report no data")
		}
	})
	t.Run("junction only", func(t *testing.T) {
		backend := t.TempDir()
		target := filepath.Join(backend, "node_modules")
		if err := os.MkdirAll(target, 0o755); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(backend, ".dsh", "profiles", "marisa", "node_modules")
		if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
			t.Fatal(err)
		}
		if runtime.GOOS == "windows" {
			if err := createJunction(link, target); err != nil {
				t.Fatalf("create junction: %v", err)
			}
		} else {
			if err := os.Symlink(target, link); err != nil {
				t.Skipf("symlink unavailable: %v", err)
			}
		}
		has, err := hasUserData(filepath.Join(backend, ".dsh"))
		if err != nil {
			t.Fatal(err)
		}
		if has {
			t.Fatal("junction-only .dsh must report no data")
		}
	})
	t.Run("with real files", func(t *testing.T) {
		backend := t.TempDir()
		makeDshTree(t, backend)
		has, err := hasUserData(dshHomePath(backend))
		if err != nil {
			t.Fatal(err)
		}
		if !has {
			t.Fatal("data-bearing .dsh must report data")
		}
	})
}

func TestBackupDshData(t *testing.T) {
	isolateMigrationDirs(t)
	backend := t.TempDir()
	makeDshTree(t, backend)
	dst, err := backupDshData(backend, "0.1.7")
	if err != nil {
		t.Fatalf("backup: %v", err)
	}
	if dst == "" {
		t.Fatal("backup must return a path when data exists")
	}
	// 备份区位置与命名。
	wantPrefix := filepath.Join(os.Getenv("LOCALAPPDATA"), "marisa-distro", "backup", "dsh-0.1.7-")
	if !strings.HasPrefix(dst, wantPrefix) {
		t.Fatalf("backup path %q, want prefix %q", dst, wantPrefix)
	}
	// 真实数据在。
	for _, rel := range []string{
		"settings.yaml",
		filepath.Join("sessions", "proj", "s1", "session.jsonl.zstd"),
		filepath.Join("storages", "workspace.json"),
	} {
		if _, err := os.Stat(filepath.Join(dst, rel)); err != nil {
			t.Fatalf("backup missing %s: %v", rel, err)
		}
	}
	if data, err := os.ReadFile(filepath.Join(dst, "settings.yaml")); err != nil || string(data) != "theme: dark\n" {
		t.Fatalf("backup content mismatch: %q err=%v", data, err)
	}
	// junction 被跳过（不复制节点内容，也不留空壳链接）。
	if isJunction(filepath.Join(dst, "profiles", "marisa", "node_modules")) {
		t.Fatal("junction must not be backed up")
	}
	if _, err := os.Stat(filepath.Join(dst, "profiles", "marisa", "node_modules", "marker.txt")); err == nil {
		t.Fatal("junction target content must not leak into backup")
	}
	// 说明文件。
	if data, err := os.ReadFile(filepath.Join(dst, backupInfoName)); err != nil {
		t.Fatalf("BACKUP-INFO.txt missing: %v", err)
	} else if !strings.Contains(string(data), "0.1.7") {
		t.Fatalf("BACKUP-INFO.txt must record source version, got: %s", data)
	}
}

func TestBackupDshDataNoData(t *testing.T) {
	isolateMigrationDirs(t)
	backend := t.TempDir()
	dst, err := backupDshData(backend, "0.1.7")
	if err != nil {
		t.Fatal(err)
	}
	if dst != "" {
		t.Fatalf("no-data backup must return empty path, got %q", dst)
	}
}

func TestBackupDshDataKeepsOriginal(t *testing.T) {
	isolateMigrationDirs(t)
	backend := t.TempDir()
	makeDshTree(t, backend)
	if _, err := backupDshData(backend, "0.1.7"); err != nil {
		t.Fatal(err)
	}
	// 备份是复制不是移动：原树完好。
	for _, rel := range []string{"settings.yaml", filepath.Join("storages", "workspace.json")} {
		if _, err := os.Stat(filepath.Join(backend, ".dsh", rel)); err != nil {
			t.Fatalf("original lost %s: %v", rel, err)
		}
	}
}

func TestGuardUpdateDataNoDataSkipsPrompt(t *testing.T) {
	isolateMigrationDirs(t)
	backend := t.TempDir()
	// 无 .dsh：直接通过，不询问、不备份。
	kept, cancelled, backupDir, err := guardUpdateData(backend, "0.1.7", "0.1.8")
	if err != nil {
		t.Fatal(err)
	}
	if !kept || cancelled || backupDir != "" {
		t.Fatalf("want (true,false,\"\"), got (%v,%v,%q)", kept, cancelled, backupDir)
	}
}
