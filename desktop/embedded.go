// Standalone desktop build (go build -tags embeddedbundle): the backend
// bundle (node.exe + harness + marisa profile + launcher) is embedded as a
// single tar.zst in bundle/backend.tar.zst via go:embed. On startup
// ensureBackend materializes it under %LOCALAPPDATA%\marisa-distro\backend
// (versioned by the VERSION file inside the bundle), and DSH_WEB_CMD is
// pointed at the extracted launcher so the shell never depends on a system
// dsh/Node.
//
//go:build embeddedbundle

package main

import (
	"archive/tar"
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/klauspost/compress/zstd"
)

//go:embed bundle/backend.tar.zst
var backendZip []byte

// installForm 是本构建的安装形态标记，随子进程环境注入后端（MARISA_INSTALL_FORM）。
const installForm = "standalone"

// backendVersionName is the version marker file at the bundle root.
const backendVersionName = "VERSION"

// backendRootDir is where the embedded backend is materialized. The tree
// carries DSH_HOME (.dsh profiles) inside it, so it maps to each platform's
// per-user application-data directory rather than a cache directory:
// Windows keeps %LOCALAPPDATA%\marisa-distro\backend, Linux uses
// XDG_DATA_HOME (~/.local/share by default), macOS uses ~/Library/Application
// Support. MARISA_BACKEND_DIR overrides on every platform (the same escape
// hatch the installedbundle build already honors).
func backendRootDir() (string, error) {
	if override := os.Getenv("MARISA_BACKEND_DIR"); override != "" {
		return filepath.Abs(override)
	}
	switch runtime.GOOS {
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			local = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(local, "marisa-distro", "backend"), nil
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support", "marisa-distro", "backend"), nil
	default: // linux and the rest of unix
		data := os.Getenv("XDG_DATA_HOME")
		if data == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			data = filepath.Join(home, ".local", "share")
		}
		return filepath.Join(data, "marisa-distro", "backend"), nil
	}
}

// embeddedBackendVersion reads the VERSION file from the embedded tar.zst.
func embeddedBackendVersion() (string, error) {
	zr, err := zstd.NewReader(bytes.NewReader(backendZip))
	if err != nil {
		return "", fmt.Errorf("open embedded bundle: %w", err)
	}
	defer zr.Close()
	tr := tar.NewReader(zr)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if hdr.Name != backendVersionName {
			continue
		}
		b, err := io.ReadAll(tr)
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(b)), nil
	}
	return "", fmt.Errorf("embedded bundle has no %s entry", backendVersionName)
}

// ensureBackend extracts the embedded backend to disk if the extracted copy
// is missing or stale (VERSION mismatch), then returns its directory.
func ensureBackend() (string, error) {
	dir, err := backendRootDir()
	if err != nil {
		return "", err
	}
	want, err := embeddedBackendVersion()
	if err != nil {
		return "", err
	}
	if cur, err := os.ReadFile(filepath.Join(dir, backendVersionName)); err == nil && strings.TrimSpace(string(cur)) == want {
		log.Printf("backend up to date at %s (version %s)", dir, want)
		// Repair drift: a junction deleted after first install (e.g. a dev
		// shortcut symlinking into this tree, or a manual cleanup) never gets
		// recreated otherwise, and the next boot dies with ERR_MODULE_NOT_FOUND
		// for workspace packages (schemastery / dsh-settings / ...). The replay
		// only creates missing links; present ones are untouched.
		if err := recreateLinks(filepath.Join(dir, "LINKS.json"), dir); err != nil {
			return "", fmt.Errorf("repair installed backend links: %w", err)
		}
		return dir, nil
	}

	// 升级迁移起点：旧 backend 的版本号（读不到视为空，跳过迁移）。
	from, _ := readBackendVersionFile(dir)

	stagingDir := dir + ".extracting"
	log.Printf("extracting embedded backend (version %s, %d bytes) to %s", want, len(backendZip), stagingDir)
	progress := newExtractionProgress(int64(len(backendZip)))
	progress.start()
	if err := os.RemoveAll(stagingDir); err != nil {
		return "", fmt.Errorf("remove incomplete backend %s: %w", stagingDir, err)
	}
	if err := os.MkdirAll(stagingDir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir %s: %w", stagingDir, err)
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(stagingDir)
		}
	}()
	n, err := extractBackend(backendZip, stagingDir, progress.report)
	if err != nil {
		return "", fmt.Errorf("extract backend to %s: %w", stagingDir, err)
	}
	// 升级迁移（阶段 1）：解包 staging 之后、删除旧 backend 之前执行。
	// 失败保留旧目录可启动，下次启动重试；无 MIGRATIONS.json 或 from 为空时跳过。
	if err := runUpgradeMigrations(dir, stagingDir, from, want); err != nil {
		return "", fmt.Errorf("upgrade migrations %s -> %s: %w (old backend kept)", from, want, err)
	}
	// 更新数据守卫：替换 backend 前保护 backend\.dsh（会话/设置等用户数据）。
	// 弹确认框询问「备份后更新 / 直接洗 / 取消」；备份失败或用户取消都保留
	// 旧目录（失败安全，下次启动重试）。
	dataKept, cancelled, backupDir, err := guardUpdateData(dir, from, want)
	if err != nil {
		return "", fmt.Errorf("update data guard: %w (old backend kept)", err)
	}
	if cancelled {
		return "", fmt.Errorf("update cancelled by user (old backend kept)")
	}
	if backupDir != "" {
		log.Printf("backend data backed up to %s before update", backupDir)
	}
	if !dataKept {
		log.Printf("user chose to discard existing backend data (no backup)")
	}
	if err := os.RemoveAll(dir); err != nil {
		return "", fmt.Errorf("remove stale backend %s: %w", dir, err)
	}
	if err := os.Rename(stagingDir, dir); err != nil {
		return "", fmt.Errorf("publish backend %s: %w", dir, err)
	}
	published = true
	// Recreate links only after publishing: Windows junction targets are
	// absolute, so links created under stagingDir would still point at the old
	// ".extracting" path after the rename.
	if err := recreateLinks(filepath.Join(dir, "LINKS.json"), dir); err != nil {
		return "", fmt.Errorf("recreate workspace links: %w", err)
	}
	// VERSION is deliberately skipped by extractTarZst and written only after
	// every file and junction exists. A crash at any earlier point leaves no
	// matching marker, so the next launch retries instead of accepting a
	// partial backend.
	if err := os.WriteFile(filepath.Join(dir, backendVersionName), []byte(want), 0o644); err != nil {
		return "", fmt.Errorf("write backend completion marker: %w", err)
	}
	log.Printf("backend extraction complete: %d entries", n)
	progress.done(n)
	return dir, nil
}

// extractBackend writes the tar.zst bundle to dest (sequential stream, see
// extractTarZst), rejecting path traversal / absolute names. The VERSION
// marker is skipped: ensureBackend writes it only after every file and
// junction exists, so a crash never leaves a matching marker on a partial
// tree. progress, when non-nil, receives extraction progress.
func extractBackend(data []byte, dest string, progress func(consumed, total int64)) (int, error) {
	return extractTarZst(data, dest, func(name string) bool {
		return name == backendVersionName
	}, progress)
}

// launcherName is the bundle-root launcher script staged by make-bundle:
// a .cmd batch file on Windows, a POSIX shell script elsewhere. Both point
// DSH_HOME at the bundle's .dsh and prepend the bundle root to PATH so
// plugins resolve the bundled node/mnemon.
func launcherName() string {
	if runtime.GOOS == "windows" {
		return "launcher.cmd"
	}
	return "launcher.sh"
}

// backendWebCommand returns the DSH_WEB_CMD value pointing at the extracted
// launcher. The `{port}` placeholder is deliberately absent: the bundled
// profile's desktop.overlay.yml pins the webserver to an OS-assigned port
// (port: 0), and the shell parses the actual URL from the backend stdout.
func backendWebCommand(dir string) string {
	return fmt.Sprintf(`"%s"`, filepath.Join(dir, launcherName()))
}

func handleBackendMaintenance() (bool, error) {
	return false, nil
}

// linkEntry mirrors one LINKS.json record written by the bundle build.
type linkEntry struct {
	Link   string `json:"link"`
	Target string `json:"target"`
}

// pathWithin reports whether p is inside root (lexical, no escaping).
func pathWithin(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// recreateLinks replays the pnpm workspace link manifest: the bundle build
// recorded every symlink of the source tree as {link, target} pairs (the zip
// itself cannot carry links), and this recreates each as a directory junction
// via `cmd mklink /J` — junctions need no admin rights or developer mode,
// unlike symlinks, and Node's module resolution follows them transparently.
func recreateLinks(manifestPath, root string) error {
	data, err := os.ReadFile(manifestPath)
	if errors.Is(err, os.ErrNotExist) {
		log.Printf("no LINKS.json in bundle; skipping link recreation")
		return nil
	}
	if err != nil {
		return err
	}
	// Windows PowerShell Set-Content -Encoding utf8 writes a UTF-8 BOM;
	// strip it before JSON parsing.
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var entries []linkEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		// Older bundles write one JSON object per line (no array wrapper).
		entries = nil
		for i, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var e linkEntry
			if err := json.Unmarshal([]byte(line), &e); err != nil {
				return fmt.Errorf("parse LINKS.json line %d: %w", i+1, err)
			}
			entries = append(entries, e)
		}
	}
	created := 0
	// A manifest link path that exists but is NOT a link got shadowed by a
	// real directory — typically a failed/interrupted pnpm operation in the
	// profile dir (its node_modules is one of these junctions). Silent
	// acceptance here used to surface much later as ERR_MODULE_NOT_FOUND
	// boot deaths; fail explicitly instead. No auto-repair: the shadowing
	// directory may hold user-installed content, deleting it silently is
	// worse than demanding a rescue-page reinstall.
	var shadowedLinks []string
	for _, e := range entries {
		link := filepath.Join(root, filepath.FromSlash(e.Link))
		target := filepath.Join(root, filepath.FromSlash(e.Target))
		if !pathWithin(root, link) || !pathWithin(root, target) {
			return fmt.Errorf("link escapes extraction root: %s -> %s", e.Link, e.Target)
		}
		if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
			return err
		}
		if fi, err := os.Lstat(link); err == nil {
			if !isLinkInfo(fi) {
				shadowedLinks = append(shadowedLinks, e.Link)
			}
			continue
		}
		if err := createJunction(link, target); err != nil {
			return fmt.Errorf("create junction %s -> %s: %w", e.Link, e.Target, err)
		}
		created++
	}
	if len(shadowedLinks) > 0 {
		return fmt.Errorf("%d manifest link(s) replaced by real directories (first: %s) — a failed pnpm/npm operation likely overwrote a workspace junction; reinstall the backend (rescue page) to restore", len(shadowedLinks), shadowedLinks[0])
	}
	log.Printf("recreated %d workspace links as junctions", created)
	return nil
}
