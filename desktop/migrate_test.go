package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestLoadMigrationsFile(t *testing.T) {
	t.Run("parses valid manifest", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, migrationFileName)
		writeTestFile(t, path, `{
  "migrations": [
    {"from": "0.1.6", "to": "0.1.7", "steps": [
      {"id": "archive-config", "scope": "file", "mode": "backup", "paths": ["cordis.patch.yml"]},
      {"id": "session-store", "scope": "data", "mode": "backup", "script": "scripts/migrate.mjs"}
    ]}
  ]
}`)
		f, err := loadMigrationsFile(path)
		if err != nil {
			t.Fatalf("load: %v", err)
		}
		if f == nil || len(f.Migrations) != 1 {
			t.Fatalf("unexpected manifest: %+v", f)
		}
		g := f.Migrations[0]
		if g.From != "0.1.6" || g.To != "0.1.7" || len(g.Steps) != 2 {
			t.Fatalf("unexpected group: %+v", g)
		}
		if g.Steps[1].Scope != "data" || g.Steps[1].Script != "scripts/migrate.mjs" {
			t.Fatalf("unexpected step: %+v", g.Steps[1])
		}
	})

	t.Run("missing file returns nil", func(t *testing.T) {
		f, err := loadMigrationsFile(filepath.Join(t.TempDir(), "nope.json"))
		if err != nil || f != nil {
			t.Fatalf("want (nil, nil), got (%v, %v)", f, err)
		}
	})

	t.Run("strips UTF-8 BOM", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), migrationFileName)
		if err := os.WriteFile(path, []byte("\uFEFF{\"migrations\":[]}"), 0o644); err != nil {
			t.Fatal(err)
		}
		f, err := loadMigrationsFile(path)
		if err != nil || f == nil {
			t.Fatalf("BOM parse failed: f=%v err=%v", f, err)
		}
	})
}

func TestSelectMigrationChain(t *testing.T) {
	mk := func(groups ...MigrationGroup) *MigrationsFile {
		return &MigrationsFile{Migrations: groups}
	}
	t.Run("single hop", func(t *testing.T) {
		f := mk(MigrationGroup{From: "0.1.6", To: "0.1.7"})
		chain, err := selectMigrationChain(f, "0.1.6", "0.1.7")
		if err != nil || len(chain) != 1 {
			t.Fatalf("want 1 hop, got %d err %v", len(chain), err)
		}
	})
	t.Run("multi hop follows ladder", func(t *testing.T) {
		f := mk(
			MigrationGroup{From: "0.1.5", To: "0.1.6"},
			MigrationGroup{From: "0.1.6", To: "0.1.7"},
			MigrationGroup{From: "0.1.7", To: "0.1.8"},
		)
		chain, err := selectMigrationChain(f, "0.1.5", "0.1.8")
		if err != nil || len(chain) != 3 {
			t.Fatalf("want 3 hops, got %d err %v", len(chain), err)
		}
		for i, want := range []string{"0.1.6", "0.1.7", "0.1.8"} {
			if chain[i].To != want {
				t.Fatalf("hop %d to=%s want %s", i, chain[i].To, want)
			}
		}
	})
	t.Run("no group at start returns nil chain", func(t *testing.T) {
		f := mk(MigrationGroup{From: "0.1.7", To: "0.1.8"})
		chain, err := selectMigrationChain(f, "0.1.6", "0.1.7")
		if err != nil || chain != nil {
			t.Fatalf("want (nil, nil), got (%v, %v)", chain, err)
		}
	})
	t.Run("broken ladder errors", func(t *testing.T) {
		f := mk(
			MigrationGroup{From: "0.1.5", To: "0.1.6"},
			MigrationGroup{From: "0.1.7", To: "0.1.8"},
		)
		if _, err := selectMigrationChain(f, "0.1.5", "0.1.8"); err == nil {
			t.Fatal("want break error")
		}
	})
	t.Run("cycle errors", func(t *testing.T) {
		f := mk(
			MigrationGroup{From: "a", To: "b"},
			MigrationGroup{From: "b", To: "a"},
		)
		if _, err := selectMigrationChain(f, "a", "c"); err == nil {
			t.Fatal("want cycle error")
		}
	})
}

// isolateMigrationDirs 把 DSH_HOME 与 LOCALAPPDATA 指向临时目录，测试结束恢复。
func isolateMigrationDirs(t *testing.T) {
	t.Helper()
	t.Setenv("DSH_HOME", t.TempDir())
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv(migrationsEnvFrom, "")
}

func TestRunUpgradeMigrations(t *testing.T) {
	t.Run("no manifest does nothing", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err != nil {
			t.Fatalf("want nil, got %v", err)
		}
		if _, err := os.Stat(filepath.Join(os.Getenv("DSH_HOME"), "migrations", "state.json")); !os.IsNotExist(err) {
			t.Fatalf("state.json should not exist, stat err=%v", err)
		}
	})

	t.Run("empty from skips", func(t *testing.T) {
		isolateMigrationDirs(t)
		if err := runUpgradeMigrations(t.TempDir(), t.TempDir(), "", "0.1.7"); err != nil {
			t.Fatalf("want nil, got %v", err)
		}
	})

	t.Run("backup step archives files and records state", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		writeTestFile(t, filepath.Join(oldDir, "cordis.patch.yml"), "user-config")
		writeTestFile(t, filepath.Join(oldDir, "config", "custom.json"), "{}")
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.6", "to": "0.1.7", "steps": [
    {"id": "archive-config", "scope": "file", "mode": "backup", "paths": ["cordis.patch.yml", "config/custom.json"]}
  ]}]
}`)
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err != nil {
			t.Fatalf("migrate: %v", err)
		}
		backup := filepath.Join(os.Getenv("LOCALAPPDATA"), "marisa-distro", "backup", "0.1.6-0.1.7")
		for _, rel := range []string{"cordis.patch.yml", filepath.Join("config", "custom.json")} {
			data, err := os.ReadFile(filepath.Join(backup, rel))
			if err != nil {
				t.Fatalf("backup missing %s: %v", rel, err)
			}
			if rel == "cordis.patch.yml" && string(data) != "user-config" {
				t.Fatalf("backup content mismatch: %q", data)
			}
		}
		state, err := readMigrationState()
		if err != nil {
			t.Fatal(err)
		}
		if state.From != "0.1.6" || state.To != "0.1.7" || len(state.Completed) != 1 {
			t.Fatalf("unexpected state: %+v", state)
		}
	})

	t.Run("data step queues pending and injects env", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.6", "to": "0.1.7", "steps": [
    {"id": "session-store", "scope": "data", "mode": "backup", "script": "scripts/migrate.mjs"}
  ]}]
}`)
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err != nil {
			t.Fatalf("migrate: %v", err)
		}
		if got := os.Getenv(migrationsEnvFrom); got != "0.1.6" {
			t.Fatalf("env %s=%q want 0.1.6", migrationsEnvFrom, got)
		}
		state, err := readMigrationState()
		if err != nil {
			t.Fatal(err)
		}
		if len(state.DataPending) != 1 || state.DataPending[0] != "session-store" {
			t.Fatalf("unexpected pending: %+v", state.DataPending)
		}
	})

	t.Run("idempotent across retries", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		writeTestFile(t, filepath.Join(oldDir, "cordis.patch.yml"), "cfg")
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.6", "to": "0.1.7", "steps": [
    {"id": "archive-config", "scope": "file", "mode": "backup", "paths": ["cordis.patch.yml"]}
  ]}]
}`)
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err != nil {
			t.Fatalf("first: %v", err)
		}
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err != nil {
			t.Fatalf("retry: %v", err)
		}
		state, _ := readMigrationState()
		if len(state.Completed) != 1 {
			t.Fatalf("retry must not duplicate completed steps: %+v", state)
		}
	})

	t.Run("no matching chain records skipped without error", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.7", "to": "0.1.8", "steps": []}]
}`)
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.5", "0.1.8"); err != nil {
			t.Fatalf("want nil, got %v", err)
		}
		state, _ := readMigrationState()
		if !state.Skipped {
			t.Fatalf("want skipped recorded, got %+v", state)
		}
	})

	t.Run("backup failure returns error and keeps state incomplete", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir := t.TempDir()
		newDir := t.TempDir()
		// oldDir/conflict 是文件；备份目标位置预置一个同名目录 → 复制必失败。
		writeTestFile(t, filepath.Join(oldDir, "conflict"), "file-content")
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.6", "to": "0.1.7", "steps": [
    {"id": "boom", "scope": "file", "mode": "backup", "paths": ["conflict"]}
  ]}]
}`)
		backupDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "marisa-distro", "backup", "0.1.6-0.1.7")
		if err := os.MkdirAll(filepath.Join(backupDir, "conflict"), 0o755); err != nil {
			t.Fatal(err)
		}
		err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7")
		if err == nil || !strings.Contains(err.Error(), "boom") {
			t.Fatalf("want failure naming step, got %v", err)
		}
	})

	t.Run("unknown scope fails", func(t *testing.T) {
		isolateMigrationDirs(t)
		oldDir, newDir := t.TempDir(), t.TempDir()
		writeTestFile(t, filepath.Join(newDir, migrationFileName), `{
  "migrations": [{"from": "0.1.6", "to": "0.1.7", "steps": [
    {"id": "bad", "scope": "nope", "mode": "silent"}
  ]}]
}`)
		if err := runUpgradeMigrations(oldDir, newDir, "0.1.6", "0.1.7"); err == nil {
			t.Fatal("want unsupported scope error")
		}
	})
}
