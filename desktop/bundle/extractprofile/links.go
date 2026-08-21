// LINKS.json replay: the bundle archives have all junctions deleted (they
// cannot travel through a tar), with the equivalent links recorded in
// LINKS.json by make-bundle.ps1. After extraction these must be recreated as
// real junctions or module resolution fails at boot. Mirrors the desktop
// shell's recreateInstalledLinks (desktop/installed.go).
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type linkEntry struct {
	Link   string `json:"link"`
	Target string `json:"target"`
}

// recreateLinks reads LINKS.json and (re)creates every junction. Idempotent:
// existing entries are skipped, so it can run on every start. Self-healing:
// a junction whose target is gone (e.g. pointing at a dead .extracting
// staging dir) is removed and recreated; real files/dirs are never touched.
func recreateLinks(manifestPath, root string) (int, error) {
	entries, err := readLinks(manifestPath)
	if err != nil {
		return 0, err
	}
	entries = outermostLinks(entries)
	created := 0
	for _, entry := range entries {
		link := filepath.Join(root, filepath.FromSlash(entry.Link))
		target := filepath.Join(root, filepath.FromSlash(entry.Target))
		if !pathWithin(root, link) || !pathWithin(root, target) {
			return created, fmt.Errorf("link escapes bundle root: %s -> %s", entry.Link, entry.Target)
		}
		if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
			return created, err
		}
		if _, err := os.Lstat(link); err == nil {
			// Junctions are NOT ModeSymlink on Windows (they read as plain
			// dirs), so probe with Readlink — it resolves both symlinks and
			// junctions and fails on real directories.
			resolved, readErr := os.Readlink(link)
			if readErr != nil {
				continue // real dir/file: never clobber
			}
			if _, statErr := os.Stat(resolved); statErr == nil {
				continue // healthy junction
			}
			// Stale junction (target missing): drop it and recreate below.
			if rmErr := os.Remove(link); rmErr != nil {
				return created, fmt.Errorf("remove stale junction %s: %w", entry.Link, rmErr)
			}
		} else if !os.IsNotExist(err) {
			return created, err
		}
		if err := createJunction(link, target); err != nil {
			return created, fmt.Errorf("create junction %s -> %s: %w", entry.Link, entry.Target, err)
		}
		created++
	}
	return created, nil
}

func readLinks(manifestPath string) ([]linkEntry, error) {
	data, err := os.ReadFile(manifestPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var entries []linkEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func pathWithin(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func outermostLinks(entries []linkEntry) []linkEntry {
	sort.Slice(entries, func(i, j int) bool {
		return len(filepath.Clean(entries[i].Link)) < len(filepath.Clean(entries[j].Link))
	})
	selected := make([]linkEntry, 0, len(entries))
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
