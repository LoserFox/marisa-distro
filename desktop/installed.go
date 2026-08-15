//go:build installedbundle

package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const installedVersionName = "VERSION"

func installedBackendDir() (string, error) {
	if override := os.Getenv("MARISA_BACKEND_DIR"); override != "" {
		return filepath.Abs(override)
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(exe), "backend"), nil
}

func ensureBackend() (string, error) {
	dir, err := installedBackendDir()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(dir, "launcher.cmd")); err != nil {
		return "", fmt.Errorf("installed backend is incomplete at %s: %w", dir, err)
	}
	if err := recreateInstalledLinks(filepath.Join(dir, "LINKS.json"), dir); err != nil {
		return "", fmt.Errorf("repair installed backend links: %w", err)
	}
	return dir, nil
}

func backendWebCommand(dir string) string {
	return fmt.Sprintf(`"%s"`, filepath.Join(dir, "launcher.cmd"))
}

func handleBackendMaintenance() (bool, error) {
	if len(os.Args) != 3 {
		return false, nil
	}
	switch os.Args[1] {
	case "--prepare-installed-backend":
		err := prepareInstalledBackend(os.Args[2])
		writeBackendMaintenanceError(err)
		return true, err
	case "--remove-installed-backend":
		err := removeInstalledBackend(os.Args[2])
		writeBackendMaintenanceError(err)
		return true, err
	default:
		return false, nil
	}
}

func writeBackendMaintenanceError(err error) {
	exe, exeErr := os.Executable()
	if exeErr != nil {
		return
	}
	path := filepath.Join(filepath.Dir(exe), "backend-maintenance-error.log")
	if err == nil {
		_ = os.Remove(path)
		return
	}
	_ = os.WriteFile(path, []byte(err.Error()+"\n"), 0o644)
}

func prepareInstalledBackend(zipPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Join(filepath.Dir(exe), "backend")
	staging := dir + ".installing"
	if err := os.RemoveAll(staging); err != nil {
		return err
	}
	if err := os.MkdirAll(staging, 0o755); err != nil {
		return err
	}
	data, err := os.ReadFile(zipPath)
	if err != nil {
		return err
	}
	if _, err := extractInstalledZip(data, staging); err != nil {
		_ = os.RemoveAll(staging)
		return err
	}
	if err := removeInstalledLinks(dir); err != nil {
		return err
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	if err := os.Rename(staging, dir); err != nil {
		return err
	}
	return recreateInstalledLinks(filepath.Join(dir, "LINKS.json"), dir)
}

func removeInstalledBackend(requested string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	expected := filepath.Clean(filepath.Join(filepath.Dir(exe), "backend"))
	actual, err := filepath.Abs(requested)
	if err != nil {
		return err
	}
	if !strings.EqualFold(expected, filepath.Clean(actual)) {
		return fmt.Errorf("refusing to remove unexpected backend path %s", actual)
	}
	if err := removeInstalledLinks(expected); err != nil {
		return err
	}
	return os.RemoveAll(expected)
}

func extractInstalledZip(data []byte, dest string) (int, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return 0, err
	}
	n := 0
	for _, f := range r.File {
		name := filepath.Clean(filepath.FromSlash(f.Name))
		if name == "." || filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
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
		_, copyErr := io.Copy(dst, rc)
		closeErr := dst.Close()
		rc.Close()
		if copyErr != nil {
			return n, copyErr
		}
		if closeErr != nil {
			return n, closeErr
		}
		n++
	}
	return n, nil
}

type installedLinkEntry struct {
	Link   string `json:"link"`
	Target string `json:"target"`
}

func installedPathWithin(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func recreateInstalledLinks(manifestPath, root string) error {
	entries, err := readInstalledLinks(manifestPath)
	if err != nil {
		return err
	}
	entries = outermostInstalledLinks(entries)
	created := 0
	for _, entry := range entries {
		link := filepath.Join(root, filepath.FromSlash(entry.Link))
		target := filepath.Join(root, filepath.FromSlash(entry.Target))
		if !installedPathWithin(root, link) || !installedPathWithin(root, target) {
			return fmt.Errorf("link escapes backend: %s -> %s", entry.Link, entry.Target)
		}
		if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
			return err
		}
		if _, err := os.Lstat(link); err == nil {
			continue
		}
		cmd := exec.Command("cmd", "/c", "mklink", "/J", link, target)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mklink %s -> %s: %v (%s)", entry.Link, entry.Target, err, strings.TrimSpace(string(out)))
		}
		created++
	}
	log.Printf("recreated %d installed workspace links", created)
	return nil
}

func readInstalledLinks(manifestPath string) ([]installedLinkEntry, error) {
	data, err := os.ReadFile(manifestPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var entries []installedLinkEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func removeInstalledLinks(root string) error {
	entries, err := readInstalledLinks(filepath.Join(root, "LINKS.json"))
	if err != nil {
		return err
	}
	entries = outermostInstalledLinks(entries)
	sort.Slice(entries, func(i, j int) bool { return len(entries[i].Link) > len(entries[j].Link) })
	for _, entry := range entries {
		link := filepath.Join(root, filepath.FromSlash(entry.Link))
		if !installedPathWithin(root, link) {
			return fmt.Errorf("link escapes backend: %s", entry.Link)
		}
		_, err := os.Lstat(link)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if err := os.Remove(link); err != nil {
			return fmt.Errorf("remove junction %s: %w", entry.Link, err)
		}
	}
	return nil
}

func outermostInstalledLinks(entries []installedLinkEntry) []installedLinkEntry {
	sort.Slice(entries, func(i, j int) bool {
		return len(filepath.Clean(entries[i].Link)) < len(filepath.Clean(entries[j].Link))
	})
	selected := make([]installedLinkEntry, 0, len(entries))
	for _, entry := range entries {
		candidate := strings.ToLower(filepath.Clean(filepath.FromSlash(entry.Link)))
		nested := false
		for _, parent := range selected {
			parentPath := strings.ToLower(filepath.Clean(filepath.FromSlash(parent.Link)))
			if strings.HasPrefix(candidate, parentPath+string(filepath.Separator)) {
				nested = true
				break
			}
		}
		if !nested {
			selected = append(selected, entry)
		}
	}
	return selected
}
