package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const (
	appLogName    = "marisa-desktop.log"
	maxAppLogSize = 5 << 20
)

// backendLogOutput receives the child process's stderr. setupLogging replaces
// it with the same terminal-and-file writer used by the desktop shell logger.
var backendLogOutput io.Writer = os.Stderr

type persistentLogWriter struct {
	file     io.Writer
	terminal io.Writer
}

func (w persistentLogWriter) Write(data []byte) (int, error) {
	n, err := w.file.Write(data)
	if err != nil {
		return n, err
	}
	if n != len(data) {
		return n, io.ErrShortWrite
	}
	// A Windows GUI launch may not have a writable stderr handle. Terminal
	// mirroring is diagnostic convenience and must never break persistence or
	// stop os/exec from draining the backend pipes.
	_, _ = w.terminal.Write(data)
	return len(data), nil
}

func appLogDir() (string, error) {
	if override := os.Getenv("MARISA_LOG_DIR"); override != "" {
		return filepath.Abs(override)
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve user cache directory: %w", err)
	}
	return filepath.Join(cache, "marisa-distro", "logs"), nil
}

// setupLogging configures one bounded persistent log for both the desktop
// shell and its backend. The previous log is retained as .1 after rotation.
func setupLogging() (path string, closeLog func(), err error) {
	dir, err := appLogDir()
	if err != nil {
		return "", func() {}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", func() {}, fmt.Errorf("create log directory %s: %w", dir, err)
	}
	path = filepath.Join(dir, appLogName)
	if err := rotateAppLog(path); err != nil {
		return "", func() {}, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return "", func() {}, fmt.Errorf("open log %s: %w", path, err)
	}
	output := persistentLogWriter{file: file, terminal: os.Stderr}
	log.SetOutput(output)
	backendLogOutput = output
	return path, func() { _ = file.Close() }, nil
}

func rotateAppLog(path string) error {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect log %s: %w", path, err)
	}
	if info.Size() < maxAppLogSize {
		return nil
	}
	previous := path + ".1"
	if err := os.Remove(previous); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove previous log %s: %w", previous, err)
	}
	if err := os.Rename(path, previous); err != nil {
		return fmt.Errorf("rotate log %s: %w", path, err)
	}
	return nil
}

// scanBackendStdout drains stdout for the lifetime of the backend, writes
// every line to the persistent log, and publishes the first listening URL.
func scanBackendStdout(stdout io.Reader) <-chan string {
	urlCh := make(chan string, 1)
	go func() {
		defer close(urlCh)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		published := false
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("backend stdout: %s", line)
			if !published && strings.HasPrefix(line, "dsh web: ") {
				urlCh <- strings.TrimSpace(strings.TrimPrefix(line, "dsh web: "))
				published = true
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("backend stdout read failed: %v", err)
		}
	}()
	return urlCh
}
