package main

import (
	"bytes"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type failingLogWriter struct{}

func (failingLogWriter) Write([]byte) (int, error) {
	return 0, errors.New("terminal unavailable")
}

func TestPersistentLogWriterIgnoresTerminalFailure(t *testing.T) {
	var file bytes.Buffer
	output := persistentLogWriter{file: &file, terminal: failingLogWriter{}}
	marker := []byte("durable-marker")

	n, err := output.Write(marker)
	if err != nil {
		t.Fatalf("Write returned terminal error: %v", err)
	}
	if n != len(marker) {
		t.Errorf("Write length = %d, want %d", n, len(marker))
	}
	if got, want := file.String(), string(marker); got != want {
		t.Errorf("persistent output = %q, want %q", got, want)
	}
}

func TestSetupLoggingCapturesShellAndBackendOutput(t *testing.T) {
	// 后端 stdout 逐行为 debug 级，此测试开启以断言其落盘。
	t.Setenv("MARISA_LOG_LEVEL", "debug")
	t.Setenv("MARISA_LOG_DIR", t.TempDir())
	path, closeLog, err := setupLogging()
	if err != nil {
		t.Fatalf("setupLogging: %v", err)
	}
	defer func() {
		closeLog()
		log.SetOutput(os.Stderr)
		backendLogOutput = os.Stderr
	}()

	log.Print("shell-log-marker")
	fmt.Fprintln(backendLogOutput, "backend-stderr-marker")
	urlCh := scanBackendStdout(strings.NewReader("booting\ndsh web: http://127.0.0.1:4321\nready\n"))
	if got, want := <-urlCh, "http://127.0.0.1:4321"; got != want {
		t.Fatalf("published URL = %q, want %q", got, want)
	}
	for range urlCh {
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	text := string(data)
	for _, marker := range []string{
		"shell-log-marker",
		"backend-stderr-marker",
		"[debug] backend stdout: booting",
		"[debug] backend stdout: dsh web: http://127.0.0.1:4321",
		"[debug] backend stdout: ready",
	} {
		if !strings.Contains(text, marker) {
			t.Errorf("log does not contain %q:\n%s", marker, text)
		}
	}
}

func TestLogDebugfSilentUnlessDebugLevel(t *testing.T) {
	t.Setenv("MARISA_LOG_LEVEL", "")
	t.Setenv("MARISA_LOG_DIR", t.TempDir())
	_, closeLog, err := setupLogging()
	if err != nil {
		t.Fatalf("setupLogging: %v", err)
	}
	defer func() {
		closeLog()
		log.SetOutput(os.Stderr)
		backendLogOutput = os.Stderr
		logDebug = false
	}()

	logDebugf("debug-marker-%s", "hidden")
	if logDebug {
		t.Fatal("logDebug set without MARISA_LOG_LEVEL=debug")
	}
}

func TestRotateAppLogRetainsOnePreviousFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, appLogName)
	old := []byte("old-log")
	if err := os.WriteFile(path, old, 0o644); err != nil {
		t.Fatalf("seed current log: %v", err)
	}
	if err := os.Truncate(path, maxAppLogSize); err != nil {
		t.Fatalf("grow current log: %v", err)
	}
	if err := os.WriteFile(path+".1", []byte("older-log"), 0o644); err != nil {
		t.Fatalf("seed previous log: %v", err)
	}

	if err := rotateAppLog(path); err != nil {
		t.Fatalf("rotateAppLog: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("current log still exists after rotation: %v", err)
	}
	info, err := os.Stat(path + ".1")
	if err != nil {
		t.Fatalf("stat rotated log: %v", err)
	}
	if got, want := info.Size(), int64(maxAppLogSize); got != want {
		t.Errorf("rotated log size = %d, want %d", got, want)
	}
}
