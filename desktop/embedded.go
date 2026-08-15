// Standalone desktop build (go build -tags embeddedbundle): the backend
// bundle (node.exe + harness + marisa profile + launcher) is embedded as a
// single zip in bundle/backend.zip via go:embed. On startup ensureBackend
// materializes it under %LOCALAPPDATA%\marisa-distro\backend (versioned by
// the VERSION file inside the zip), and DSH_WEB_CMD is pointed at the
// extracted launcher so the shell never depends on a system dsh/Node.
//
//go:build embeddedbundle

package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed bundle/backend.zip
var backendZip []byte

// backendVersionName is the version marker file at the zip root.
const backendVersionName = "VERSION"

// backendRootDir is where the embedded backend is materialized.
func backendRootDir() (string, error) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		local = filepath.Join(home, "AppData", "Local")
	}
	return filepath.Join(local, "marisa-distro", "backend"), nil
}

// embeddedBackendVersion reads the VERSION file from the embedded zip.
func embeddedBackendVersion() (string, error) {
	r, err := zip.NewReader(bytes.NewReader(backendZip), int64(len(backendZip)))
	if err != nil {
		return "", fmt.Errorf("open embedded zip: %w", err)
	}
	for _, f := range r.File {
		if f.Name != backendVersionName {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(b)), nil
	}
	return "", fmt.Errorf("embedded zip has no %s file", backendVersionName)
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
		return dir, nil
	}

	stagingDir := dir + ".extracting"
	log.Printf("extracting embedded backend (version %s, %d bytes) to %s", want, len(backendZip), stagingDir)
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
	n, err := extractZip(backendZip, stagingDir)
	if err != nil {
		return "", fmt.Errorf("extract backend to %s: %w", stagingDir, err)
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
	// VERSION is deliberately skipped by extractZip and written only after
	// every file and junction exists. A crash at any earlier point leaves no
	// matching marker, so the next launch retries instead of accepting a
	// partial backend.
	if err := os.WriteFile(filepath.Join(dir, backendVersionName), []byte(want), 0o644); err != nil {
		return "", fmt.Errorf("write backend completion marker: %w", err)
	}
	log.Printf("backend extraction complete: %d entries", n)
	return dir, nil
}

// extractZip writes every entry of the zip to dest, rejecting path
// traversal / absolute names.
func extractZip(data []byte, dest string) (int, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return 0, err
	}
	n := 0
	for _, f := range r.File {
		if f.Name == backendVersionName {
			continue
		}
		name := filepath.Clean(filepath.FromSlash(f.Name))
		if name == "." || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) || filepath.IsAbs(name) {
			return n, fmt.Errorf("unsafe zip entry %q", f.Name)
		}
		target := filepath.Join(dest, name)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return n, err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return n, err
		}
		rc, err := f.Open()
		if err != nil {
			return n, err
		}
		dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return n, err
		}
		_, err = io.Copy(dst, rc)
		cerr := dst.Close()
		rc.Close()
		if err != nil {
			return n, err
		}
		if cerr != nil {
			return n, cerr
		}
		n++
	}
	return n, nil
}

// backendWebCommand returns the DSH_WEB_CMD value pointing at the extracted
// launcher. The `{port}` placeholder is deliberately absent: the bundled
// profile's desktop.overlay.yml pins the webserver to an OS-assigned port
// (port: 0), and the shell parses the actual URL from the backend stdout.
func backendWebCommand(dir string) string {
	return fmt.Sprintf(`"%s"`, filepath.Join(dir, "launcher.cmd"))
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
	for _, e := range entries {
		link := filepath.Join(root, filepath.FromSlash(e.Link))
		target := filepath.Join(root, filepath.FromSlash(e.Target))
		if !pathWithin(root, link) || !pathWithin(root, target) {
			return fmt.Errorf("link escapes extraction root: %s -> %s", e.Link, e.Target)
		}
		if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
			return err
		}
		if _, err := os.Lstat(link); err == nil {
			continue // already present
		}
		cmd := exec.Command("cmd", "/c", "mklink", "/J", link, target)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mklink %s -> %s: %v (%s)", e.Link, e.Target, err, strings.TrimSpace(string(out)))
		}
		created++
	}
	log.Printf("recreated %d workspace links as junctions", created)
	return nil
}
