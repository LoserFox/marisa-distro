package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStripBackendVersion(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"marisa-backend-0.1.6-dirty", "0.1.6"},
		{"marisa-backend-0.1.6", "0.1.6"},
		{"0.1.6", "0.1.6"},
		{" marisa-backend-0.1.6-dirty \n", "0.1.6"},
		{"marisa-backend-0.1.6-dirty.1", "0.1.6-dirty.1"},
		{"marisa-backend-0.1.7-rc.1", "0.1.7-rc.1"},
		{"", ""},
	}
	for _, c := range cases {
		if got := stripBackendVersion(c.raw); got != c.want {
			t.Errorf("stripBackendVersion(%q) = %q, want %q", c.raw, got, c.want)
		}
	}
}

func TestReadBackendVersionFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "VERSION"), []byte("marisa-backend-0.1.6-dirty"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := readBackendVersionFile(dir)
	if err != nil {
		t.Fatalf("readBackendVersionFile: %v", err)
	}
	if got != "0.1.6" {
		t.Errorf("readBackendVersionFile = %q, want %q", got, "0.1.6")
	}
}

func TestReadBackendVersionFileMissing(t *testing.T) {
	if _, err := readBackendVersionFile(t.TempDir()); err == nil {
		t.Error("readBackendVersionFile on a dir without VERSION should fail")
	}
}

func TestBackendVersion(t *testing.T) {
	if got, err := backendVersion(""); err != nil || got != "" {
		t.Errorf("backendVersion(\"\") = %q, %v; want empty, nil", got, err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "VERSION"), []byte("marisa-backend-0.1.6"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, err := backendVersion(dir); err != nil || got != "0.1.6" {
		t.Errorf("backendVersion(dir) = %q, %v; want 0.1.6, nil", got, err)
	}
}

func TestInjectBackendEnv(t *testing.T) {
	t.Setenv("MARISA_INSTALL_FORM", "")
	t.Setenv("MARISA_VERSION", "")
	injectBackendEnv("standalone", "0.1.6")
	if got := os.Getenv("MARISA_INSTALL_FORM"); got != "standalone" {
		t.Errorf("MARISA_INSTALL_FORM = %q, want %q", got, "standalone")
	}
	if got := os.Getenv("MARISA_VERSION"); got != "0.1.6" {
		t.Errorf("MARISA_VERSION = %q, want %q", got, "0.1.6")
	}
}
