// 急救恢复执行器与状态机的矩阵单测：用临时目录 + mock 重解包，验证
// backup/resetConfig/resetSource 六种组合的动作语义与现场完整性。
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// rescueFixture 建一个模拟 backend 树（含用户面与出厂文件）与备份根。
type rescueFixture struct {
	backend  string
	backups  string
	reinstallCalls int
}

func newRescueFixture(t *testing.T) *rescueFixture {
	t.Helper()
	root := t.TempDir()
	f := &rescueFixture{
		backend: filepath.Join(root, "backend"),
		backups: filepath.Join(root, "backups"),
	}
	mk := func(rel, content string) {
		t.Helper()
		p := filepath.Join(f.backend, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// 用户配置面
	mk(".dsh/sessions/s1.jsonl", "session")
	mk(".dsh/storages/workspace.json", "{}")
	mk(".dsh/cache/c.bin", "cache")
	mk(".dsh/settings.yaml", "user-settings")
	mk(".dsh/.credentials.yaml", "secret")
	mk(".dsh/profiles/marisa/cordis.patch.yml", "user-layer")
	// 出厂文件
	mk(".dsh/profiles/marisa/package.json", "{}")
	mk(".dsh/profiles/marisa/desktop.overlay.yml", "- id: webserver")
	mk("VERSION", "marisa-backend-0.1.8")
	mk("marisa-distro/harness/apps/cli/lib/bin.js", "bin")
	return f
}

// executor 构造被测执行器；mock reinstall 模拟重新解包（重建出厂骨架）。
func (f *rescueFixture) executor(t *testing.T) *rescueExecutor {
	t.Helper()
	reinstall := func() error {
		f.reinstallCalls++
		if err := os.RemoveAll(f.backend); err != nil {
			return err
		}
		// 出厂骨架：.dsh/profiles/marisa/package.json + VERSION + 主体
		for _, p := range []string{
			".dsh/profiles/marisa/package.json",
			".dsh/profiles/marisa/desktop.overlay.yml",
			"VERSION",
			"marisa-distro/harness/apps/cli/lib/bin.js",
		} {
			full := filepath.Join(f.backend, filepath.FromSlash(p))
			if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
				return err
			}
			if err := os.WriteFile(full, []byte("factory"), 0o644); err != nil {
				return err
			}
		}
		return nil
	}
	return &rescueExecutor{
		backendDir:         f.backend,
		backupsRoot:        f.backups,
		reinstall:          reinstall,
		reinstallAvailable: func() bool { return true },
	}
}

func exists(t *testing.T, p string) bool {
	t.Helper()
	_, err := os.Lstat(p)
	return err == nil
}

// backupsOf 返回备份目录里的 backend 现场（唯一一份）。
func backupsOf(t *testing.T, f *rescueFixture) string {
	t.Helper()
	entries, err := os.ReadDir(f.backups)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.IsDir() {
			return filepath.Join(f.backups, e.Name(), "backend")
		}
	}
	t.Fatal("no backup found")
	return ""
}

func TestRescueFullDefault(t *testing.T) {
	f := newRescueFixture(t)
	dir := f.backend
	backupDir, err := f.executor(t).run(rescueRequest{Backup: true, ResetConfig: true, ResetSource: true})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir == "" {
		t.Fatal("expected backup dir")
	}
	if f.reinstallCalls != 1 {
		t.Fatalf("reinstall calls = %d, want 1", f.reinstallCalls)
	}
	// 出厂骨架在场，用户面清零
	if !exists(t, filepath.Join(dir, "VERSION")) {
		t.Error("backend not reinstalled (VERSION missing)")
	}
	for _, rel := range []string{"sessions/s1.jsonl", "settings.yaml", ".credentials.yaml", "profiles/marisa/cordis.patch.yml"} {
		if exists(t, filepath.Join(dir, ".dsh", rel)) {
			t.Errorf("user config %s survived reset", rel)
		}
	}
	// 备份完整
	bak := backupsOf(t, f)
	for _, rel := range []string{".dsh/sessions/s1.jsonl", ".dsh/settings.yaml", "VERSION"} {
		if !exists(t, filepath.Join(bak, filepath.FromSlash(rel))) {
			t.Errorf("backup missing %s", rel)
		}
	}
	if !exists(t, filepath.Join(filepath.Dir(bak), "info.json")) {
		t.Error("backup info.json missing")
	}
}

func TestRescueSourceOnlyKeepsConfig(t *testing.T) {
	f := newRescueFixture(t)
	dir := f.backend
	backupDir, err := f.executor(t).run(rescueRequest{Backup: true, ResetConfig: false, ResetSource: true})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir == "" {
		t.Fatal("expected backup dir")
	}
	// 源码出厂、用户面保留（从备份搬回新树）
	for _, rel := range []string{"sessions/s1.jsonl", "settings.yaml", "profiles/marisa/cordis.patch.yml"} {
		if !exists(t, filepath.Join(dir, ".dsh", rel)) {
			t.Errorf("user config %s not restored", rel)
		}
	}
	// 出厂 package.json 用新树的（不是备份里的旧内容）
	data, err := os.ReadFile(filepath.Join(dir, ".dsh", "profiles", "marisa", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "factory" {
		t.Errorf("factory file should come from reinstall, got %q", data)
	}
}

func TestRescueConfigOnlyRestoresAndResets(t *testing.T) {
	f := newRescueFixture(t)
	dir := f.backend
	backupDir, err := f.executor(t).run(rescueRequest{Backup: true, ResetConfig: true, ResetSource: false})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir != "" {
		t.Errorf("expected no backup dir (restored in place), got %q", backupDir)
	}
	if f.reinstallCalls != 0 {
		t.Fatalf("reinstall calls = %d, want 0", f.reinstallCalls)
	}
	// 现场还原（源码原样），用户面清空
	if !exists(t, filepath.Join(dir, "marisa-distro", "harness", "apps", "cli", "lib", "bin.js")) {
		t.Error("source tree lost")
	}
	for _, rel := range []string{"sessions/s1.jsonl", "settings.yaml", ".credentials.yaml", "profiles/marisa/cordis.patch.yml"} {
		if exists(t, filepath.Join(dir, ".dsh", rel)) {
			t.Errorf("user config %s survived reset", rel)
		}
	}
	// 出厂文件保留
	if !exists(t, filepath.Join(dir, ".dsh", "profiles", "marisa", "package.json")) {
		t.Error("factory package.json lost")
	}
}

func TestRescueBackupOnly(t *testing.T) {
	f := newRescueFixture(t)
	backupDir, err := f.executor(t).run(rescueRequest{Backup: true, ResetConfig: false, ResetSource: false})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir != "" {
		t.Errorf("expected no backup dir for backup-only, got %q", backupDir)
	}
	if !exists(t, filepath.Join(f.backend, ".dsh", "sessions", "s1.jsonl")) {
		t.Error("backend should be untouched")
	}
}

func TestRescueNoBackupConfigOnly(t *testing.T) {
	f := newRescueFixture(t)
	dir := f.backend
	backupDir, err := f.executor(t).run(rescueRequest{Backup: false, ResetConfig: true, ResetSource: false})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir != "" {
		t.Errorf("expected no backup dir, got %q", backupDir)
	}
	for _, rel := range []string{"sessions/s1.jsonl", "settings.yaml", ".credentials.yaml"} {
		if exists(t, filepath.Join(dir, ".dsh", rel)) {
			t.Errorf("user config %s survived reset", rel)
		}
	}
	if !exists(t, filepath.Join(dir, ".dsh", "profiles", "marisa", "package.json")) {
		t.Error("factory package.json lost")
	}
}

func TestRescueNoBackupSourceOnly(t *testing.T) {
	f := newRescueFixture(t)
	dir := f.backend
	backupDir, err := f.executor(t).run(rescueRequest{Backup: false, ResetConfig: false, ResetSource: true})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if backupDir != "" {
		t.Errorf("expected no backup dir, got %q", backupDir)
	}
	if f.reinstallCalls != 1 {
		t.Fatalf("reinstall calls = %d, want 1", f.reinstallCalls)
	}
	if !exists(t, filepath.Join(dir, "VERSION")) {
		t.Error("backend not reinstalled")
	}
}

func TestRescueEmptyRequestRejected(t *testing.T) {
	f := newRescueFixture(t)
	if _, err := f.executor(t).run(rescueRequest{}); err == nil {
		t.Fatal("empty request should fail")
	}
}

func TestRescueUnavailableSource(t *testing.T) {
	f := newRescueFixture(t)
	exec := f.executor(t)
	exec.reinstall = func() error {
		return errSourceUnavailable
	}
	exec.reinstallAvailable = func() bool { return false }
	if exec.reinstallAvailable() {
		t.Error("unavailable source reported available")
	}
	if _, err := exec.run(rescueRequest{Backup: false, ResetConfig: false, ResetSource: true}); err == nil {
		t.Error("source reset should fail when unavailable")
	}
	if !strings.Contains(errSourceUnavailable.Error(), "不支持") {
		t.Errorf("unexpected unavailable error text: %v", errSourceUnavailable)
	}
}

func TestRescueStateRoundTrip(t *testing.T) {
	// 状态文件走 appLogDir（环境相关）：直接测 save/load 幂等性与损坏容忍。
	prev := os.Getenv("MARISA_LOG_DIR")
	dir := t.TempDir()
	t.Setenv("MARISA_LOG_DIR", dir)
	defer func() {
		if prev == "" {
			os.Unsetenv("MARISA_LOG_DIR")
		} else {
			os.Setenv("MARISA_LOG_DIR", prev)
		}
	}()

	loadRescueState() // 无文件 → normal
	saveRescueState(stageRescue, os.ErrNotExist)
	s := loadRescueState()
	if s.Stage != stageRescue {
		t.Fatalf("stage = %q, want rescue", s.Stage)
	}
	if !strings.Contains(s.LastError, "file does not exist") && !strings.Contains(s.LastError, "no such file") {
		t.Errorf("lastError = %q", s.LastError)
	}
	// 损坏文件 → 回退 normal
	path, err := rescueStatePath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if s := loadRescueState(); s.Stage != stageNormal {
		t.Fatalf("corrupt state stage = %q, want normal", s.Stage)
	}
}

func TestApplyBootProfile(t *testing.T) {
	os.Unsetenv(bootProfileEnv)
	applyBootProfile(stageMinimal)
	if got := os.Getenv(bootProfileEnv); got != minimalBootProfile {
		t.Fatalf("minimal env = %q, want %q", got, minimalBootProfile)
	}
	applyBootProfile(stageNormal)
	if got := os.Getenv(bootProfileEnv); got != "" {
		t.Fatalf("normal env = %q, want unset", got)
	}
}
