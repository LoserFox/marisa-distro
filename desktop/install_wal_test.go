// 安装事务 WAL 的矩阵单测：阶段机全路径、原子写、快照/回滚语义、
// manual-recovery-required 判定、present:false 还原、CLI 子命令。
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// walFixture 建一个临时 store + profile 树（含受保护文件）。
type walFixture struct {
	store      *walStore
	statePath  string
	profileDir string
	pkgJSON    string
	patchYML   string
}

func newWalFixture(t *testing.T) *walFixture {
	t.Helper()
	root := t.TempDir()
	storeDir := filepath.Join(root, "state")
	profileDir := filepath.Join(root, "profile")
	if err := os.MkdirAll(profileDir, 0o755); err != nil {
		t.Fatal(err)
	}
	f := &walFixture{
		store:      newWalStoreAt(storeDir),
		statePath:  filepath.Join(storeDir, walStateFileName),
		profileDir: profileDir,
		pkgJSON:    filepath.Join(profileDir, "package.json"),
		patchYML:   filepath.Join(profileDir, "cordis.patch.yml"),
	}
	f.writeFile(t, f.pkgJSON, `{"name":"marisa-profile"}`)
	f.writeFile(t, f.patchYML, "user-layer: v1\n")
	return f
}

func (f *walFixture) writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func (f *walFixture) readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func (f *walFixture) begin(t *testing.T, pkg string) *walTransaction {
	t.Helper()
	tx, err := f.store.begin(walBeginInput{
		ProfileDir:     f.profileDir,
		ProfileName:    "marisa",
		PackageName:    pkg,
		PackageVersion: "1.0.0",
		ProtectedFiles: []string{f.pkgJSON, f.patchYML},
	})
	if err != nil {
		t.Fatal(err)
	}
	return tx
}

func TestWalBeginSnapshotsAndWritesState(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")

	if tx.Phase != walPrepared {
		t.Fatalf("phase = %s, want prepared", tx.Phase)
	}
	if len(tx.Files) != 2 {
		t.Fatalf("files = %d, want 2", len(tx.Files))
	}
	// package.json 镜像存在且 hash 非空
	if !tx.Files[0].Before.Present || tx.Files[0].Before.SHA256 == "" {
		t.Fatalf("package.json before image missing: %+v", tx.Files[0].Before)
	}
	// 备份副本已落盘
	backup := filepath.Join(f.store.backupsDir(tx.TransactionID), tx.Files[0].Before.BackupFile)
	if _, err := os.Stat(backup); err != nil {
		t.Fatalf("backup copy missing: %v", err)
	}
	// state.json 已原子写（无 .tmp 残留）
	if _, err := os.Stat(f.statePath); err != nil {
		t.Fatalf("state.json missing: %v", err)
	}
	if _, err := os.Stat(f.statePath + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("tmp state file left behind")
	}
	// 目录权限（Windows 上 mode 只保证部分语义，跳过权限断言）
}

func TestWalBeginRejectsActiveTransaction(t *testing.T) {
	f := newWalFixture(t)
	f.begin(t, "demo-pkg")
	if _, err := f.store.begin(walBeginInput{
		ProfileDir:     f.profileDir,
		ProfileName:    "marisa",
		PackageName:    "other",
		ProtectedFiles: []string{f.pkgJSON},
	}); err == nil || !strings.Contains(err.Error(), "already") {
		t.Fatalf("begin over active tx: err = %v, want 'already' error", err)
	}
}

func TestWalBeginAfterTerminalOverwrites(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	f.store.markRecoveryPending(tx.TransactionID, walFailStartup)
	f.store.requestRetry(tx.TransactionID)
	f.store.markVerifying(tx.TransactionID)
	if _, err := f.store.verify(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	// 终态后允许新事务
	next, err := f.store.begin(walBeginInput{
		ProfileDir:     f.profileDir,
		ProfileName:    "marisa",
		PackageName:    "second",
		ProtectedFiles: []string{f.pkgJSON},
	})
	if err != nil {
		t.Fatalf("begin after verified: %v", err)
	}
	if next.TransactionID == tx.TransactionID {
		t.Fatalf("new transaction reused old id")
	}
}

func TestWalVerifyCleansBackups(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	backupDir := f.store.backupsDir(tx.TransactionID)
	if _, err := os.Stat(backupDir); err != nil {
		t.Fatalf("backup dir missing: %v", err)
	}
	if _, err := f.store.seal(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.markVerifying(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	verified, err := f.store.verify(tx.TransactionID)
	if err != nil {
		t.Fatal(err)
	}
	if verified.Phase != walVerified {
		t.Fatalf("phase = %s, want verified", verified.Phase)
	}
	if _, err := os.Stat(backupDir); !os.IsNotExist(err) {
		t.Fatalf("backup dir not cleaned after verify")
	}
}

// 阶段机非法迁移必须报错（每个迁移都从 require 校验当前阶段）。
func TestWalPhaseTransitionGuards(t *testing.T) {
	t.Run("seal twice", func(t *testing.T) {
		f := newWalFixture(t)
		tx := f.begin(t, "demo-pkg")
		if _, err := f.store.seal(tx.TransactionID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.store.seal(tx.TransactionID); err == nil {
			t.Fatalf("seal from awaiting-restart: expected error")
		}
	})
	t.Run("verify before verifying", func(t *testing.T) {
		f := newWalFixture(t)
		tx := f.begin(t, "demo-pkg")
		if _, err := f.store.verify(tx.TransactionID); err == nil {
			t.Fatalf("verify from prepared: expected error")
		}
	})
	t.Run("retry before pending", func(t *testing.T) {
		f := newWalFixture(t)
		tx := f.begin(t, "demo-pkg")
		if _, err := f.store.requestRetry(tx.TransactionID); err == nil {
			t.Fatalf("retry from prepared: expected error")
		}
	})
	t.Run("pending from sealed", func(t *testing.T) {
		f := newWalFixture(t)
		tx := f.begin(t, "demo-pkg")
		if _, err := f.store.markRecoveryPending(tx.TransactionID, walFailInterrupted); err != nil {
			t.Fatalf("pending from prepared (interrupted install): %v", err)
		}
	})
}

// 回滚：安装修改文件后（seal 封存 after），回滚恢复安装前内容。
func TestWalRollbackRestoresAfterSealedInstall(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	before := f.readFile(t, f.pkgJSON)
	// 模拟安装修改
	f.writeFile(t, f.pkgJSON, `{"name":"marisa-profile","plugins":["demo"]}`)
	if _, err := f.store.seal(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.markRecoveryPending(tx.TransactionID, walFailStartup); err != nil {
		t.Fatal(err)
	}
	result, err := f.store.rollback(tx.TransactionID, walFailRecovery)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "restored" {
		t.Fatalf("status = %s, want restored", result.Status)
	}
	if got := f.readFile(t, f.pkgJSON); got != before {
		t.Fatalf("package.json not restored: got %q, want %q", got, before)
	}
	// 事务进入终态 rolled-back
	tx2, err := f.store.read()
	if err != nil {
		t.Fatal(err)
	}
	if tx2.Phase != walRolledBack {
		t.Fatalf("phase = %s, want rolled-back", tx2.Phase)
	}
}

// 回滚：事务外改动（与 before/after 均不一致）→ manual-recovery-required，
// 文件不被覆盖。
func TestWalRollbackDetectsExternalModification(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	// 安装修改
	f.writeFile(t, f.pkgJSON, `{"name":"marisa-profile","plugins":["demo"]}`)
	if _, err := f.store.seal(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	// 事务外改动
	external := `{"name":"marisa-profile","plugins":["demo"],"userTouched":true}`
	f.writeFile(t, f.pkgJSON, external)
	result, err := f.store.rollback(tx.TransactionID, walFailRecovery)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "manual-recovery-required" {
		t.Fatalf("status = %s, want manual-recovery-required", result.Status)
	}
	if len(result.MismatchedFiles) != 1 || result.MismatchedFiles[0] != f.pkgJSON {
		t.Fatalf("mismatched = %v, want [%s]", result.MismatchedFiles, f.pkgJSON)
	}
	if got := f.readFile(t, f.pkgJSON); got != external {
		t.Fatalf("external modification was overwritten: %q", got)
	}
	if tx2, _ := f.store.read(); tx2.Phase != walManualRecoveryRequired {
		t.Fatalf("phase = %s, want manual-recovery-required", tx2.Phase)
	}
}

// 回滚：未封存（安装未完成即失败）时无条件还原。
func TestWalRollbackUnconditionalBeforeSeal(t *testing.T) {
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	before := f.readFile(t, f.patchYML)
	f.writeFile(t, f.patchYML, "user-layer: v1\nplugins:\n- demo\n")
	// 不 seal，直接 pending（安装失败路径）
	if _, err := f.store.markRecoveryPending(tx.TransactionID, walFailInstall); err != nil {
		t.Fatal(err)
	}
	result, err := f.store.rollback(tx.TransactionID, walFailRecovery)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "restored" {
		t.Fatalf("status = %s, want restored", result.Status)
	}
	if got := f.readFile(t, f.patchYML); got != before {
		t.Fatalf("patch not restored: %q", got)
	}
}

// 回滚：安装删除文件（present:false 由备份还原）；安装新建文件（before
// 不存在）→ 删除。
func TestWalRollbackRestoresAbsenceAndRemovesNewFiles(t *testing.T) {
	f := newWalFixture(t)
	// 第三个受保护文件安装前不存在
	extra := filepath.Join(f.profileDir, "links.json")
	tx, err := f.store.begin(walBeginInput{
		ProfileDir:     f.profileDir,
		ProfileName:    "marisa",
		PackageName:    "demo-pkg",
		ProtectedFiles: []string{f.pkgJSON, extra},
	})
	if err != nil {
		t.Fatal(err)
	}
	// 模拟安装：删除 package.json、创建 links.json
	if err := os.Remove(f.pkgJSON); err != nil {
		t.Fatal(err)
	}
	f.writeFile(t, extra, `{"plugins":[]}`)
	if _, err := f.store.seal(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.rollback(tx.TransactionID, walFailStartup); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(f.pkgJSON); err != nil {
		t.Fatalf("package.json not restored: %v", err)
	}
	if _, err := os.Stat(extra); !os.IsNotExist(err) {
		t.Fatalf("install-created file not removed")
	}
}

// 读：无事务返回 nil；损坏状态报错。
func TestWalReadHandlesMissingAndCorrupt(t *testing.T) {
	f := newWalFixture(t)
	tx, err := f.store.read()
	if err != nil || tx != nil {
		t.Fatalf("read empty = %v, %v; want nil, nil", tx, err)
	}
	if err := os.MkdirAll(filepath.Dir(f.statePath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(f.statePath, []byte("{not-json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.read(); err == nil {
		t.Fatalf("corrupt state: expected error")
	}
}

// 回滚：要求事务 ID 匹配。
func TestWalRequireMismatchedTxID(t *testing.T) {
	f := newWalFixture(t)
	f.begin(t, "demo-pkg")
	if _, err := f.store.require("0000000000000000000000000000000000000000000000000000000000000000"); err == nil {
		t.Fatalf("require with wrong txid: expected error")
	}
}

// CLI：begin → status → rollback 全链路 JSON 输出（MARISA_WAL_STATE_DIR
// 把生产状态目录指到临时目录，测试不碰真实 LOCALAPPDATA）。
func TestWalCLIBeginStatusRollback(t *testing.T) {
	f := newWalFixture(t)
	storeDir := filepath.Dir(f.statePath)
	t.Setenv("MARISA_WAL_STATE_DIR", storeDir)

	out, err := runWalCLI([]string{
		"begin", "--profile-dir", f.profileDir, "--profile-name", "marisa",
		"--package", "cli-demo", "--version", "2.0.0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"packageName":"cli-demo"`) || !strings.Contains(out, `"phase":"prepared"`) {
		t.Fatalf("begin output unexpected: %s", out)
	}
	var tx walTransaction
	if err := json.Unmarshal([]byte(out), &tx); err != nil {
		t.Fatal(err)
	}

	status, err := runWalCLI([]string{"status"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(status, tx.TransactionID) {
		t.Fatalf("status output missing txid: %s", status)
	}

	// 安装修改 → seal → pending → rollback
	f.writeFile(t, f.pkgJSON, `{"name":"marisa-profile","plugins":["cli-demo"]}`)
	if _, err := runWalCLI([]string{"seal", "--tx", tx.TransactionID}); err != nil {
		t.Fatal(err)
	}
	if _, err := runWalCLI([]string{"pending", "--tx", tx.TransactionID}); err != nil {
		t.Fatal(err)
	}
	rb, err := runWalCLI([]string{"rollback", "--tx", tx.TransactionID})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(rb, `"status":"restored"`) {
		t.Fatalf("rollback output unexpected: %s", rb)
	}
	if got := f.readFile(t, f.pkgJSON); !strings.Contains(got, `"name":"marisa-profile"`) || strings.Contains(got, "cli-demo") {
		t.Fatalf("package.json not restored via CLI: %q", got)
	}

	// 参数校验
	if _, err := runWalCLI([]string{"begin"}); err == nil {
		t.Fatalf("begin without args: expected error")
	}
	if _, err := runWalCLI([]string{"nope"}); err == nil {
		t.Fatalf("unknown subcommand: expected error")
	}
}

// 权限模式：备份副本与 state.json 用 0600（Windows 不强制 POSIX 权限位，
// 跳过；Unix 上断言无 group/other 位）。
func TestWalFileModes(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows 不强制 POSIX 权限位")
	}
	f := newWalFixture(t)
	tx := f.begin(t, "demo-pkg")
	if fi, err := os.Stat(f.statePath); err != nil {
		t.Fatal(err)
	} else if fi.Mode().Perm()&0o077 != 0 {
		t.Fatalf("state.json mode = %o, want no group/other bits", fi.Mode().Perm())
	}
	backup := filepath.Join(f.store.backupsDir(tx.TransactionID), tx.Files[0].Before.BackupFile)
	if fi, err := os.Stat(backup); err != nil {
		t.Fatal(err)
	} else if fi.Mode().Perm()&0o077 != 0 {
		t.Fatalf("backup mode = %o, want no group/other bits", fi.Mode().Perm())
	}
}
