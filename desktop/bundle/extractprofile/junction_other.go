// Non-Windows junction fallback: plain directory symlinks (the profile tool
// is primarily Windows, but stays portable so POSIX hosts can extract too).
//
//go:build !windows

package main

import (
	"os"
	"path/filepath"
)

func createJunction(link, target string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	if _, err := os.Lstat(link); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Symlink(target, link)
}
