//go:build installedbundle

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeLinksManifest(t *testing.T, root string, entries string) {
	t.Helper()
	manifest := filepath.Join(root, "LINKS.json")
	if err := os.WriteFile(manifest, []byte(entries), 0o644); err != nil {
		t.Fatal(err)
	}
}

// 链接清单条目被真实目录顶掉（失败/中断的 pnpm 操作的典型退化）必须
// 显式报错，而不是静默接受后死于 ERR_MODULE_NOT_FOUND。
func TestRecreateInstalledLinksDetectsShadowedLink(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "target"), 0o755); err != nil {
		t.Fatal(err)
	}
	// 真实目录占据清单链接位：profile node_modules 的模拟。
	if err := os.MkdirAll(filepath.Join(root, "profile", "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeLinksManifest(t, root, `[{"link":"profile/node_modules","target":"target"}]`)

	err := recreateInstalledLinks(filepath.Join(root, "LINKS.json"), root)
	if err == nil {
		t.Fatal("shadowed manifest link accepted silently")
	}
	if !strings.Contains(err.Error(), "replaced by real directories") {
		t.Fatalf("error does not identify the shadowing: %v", err)
	}
	if !strings.Contains(err.Error(), "profile/node_modules") {
		t.Fatalf("error does not name the shadowed link: %v", err)
	}
}

// 正常路径：链接缺失 → 创建；已是链接 → 幂等跳过；不误报。
func TestRecreateInstalledLinksHappyPath(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "target"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeLinksManifest(t, root, `[{"link":"profile/node_modules","target":"target"}]`)

	if err := recreateInstalledLinks(filepath.Join(root, "LINKS.json"), root); err != nil {
		t.Fatalf("first recreate: %v", err)
	}
	fi, err := os.Lstat(filepath.Join(root, "profile", "node_modules"))
	if err != nil {
		t.Fatal(err)
	}
	if !isLinkInfo(fi) {
		t.Fatalf("recreated entry is not a link: %v", fi.Mode())
	}
	// 幂等重放：已存在的链接不再创建，也不触发守卫。
	if err := recreateInstalledLinks(filepath.Join(root, "LINKS.json"), root); err != nil {
		t.Fatalf("idempotent replay: %v", err)
	}
}

func TestIsLinkInfoRealDirectory(t *testing.T) {
	dir := t.TempDir()
	fi, err := os.Lstat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if isLinkInfo(fi) {
		t.Fatalf("plain directory reported as link: %v", fi.Mode())
	}
}
