package main

import (
	"errors"
	"fmt"
	"io"
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

// restoreLoggingState 还原 setupLogging 改动的全局状态，供测试清理使用。
func restoreLoggingState() {
	log.SetOutput(os.Stderr)
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	backendLogOutput = os.Stderr
	logDebug = false
}

func TestPersistentLogWriterIgnoresTerminalFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "t.log")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	t.Cleanup(func() { _ = file.Close() })
	output := newPersistentLogWriter(file, path, failingLogWriter{}, 0)
	marker := []byte("durable-marker")

	n, err := output.Write(marker)
	if err != nil {
		t.Fatalf("Write returned terminal error: %v", err)
	}
	if n != len(marker) {
		t.Errorf("Write length = %d, want %d", n, len(marker))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	if got, want := string(data), string(marker); got != want {
		t.Errorf("persistent output = %q, want %q", got, want)
	}
}

func TestSetupLoggingCapturesShellAndBackendOutput(t *testing.T) {
	// 后端 stdout 逐行为 debug 级，此测试开启以断言其落盘。
	t.Setenv("MARISA_LOG_LEVEL", "debug")
	t.Setenv("MARISA_LOG_DIR", t.TempDir())
	t.Cleanup(restoreLoggingState)
	path, closeLog, err := setupLogging()
	if err != nil {
		t.Fatalf("setupLogging: %v", err)
	}
	defer closeLog()

	log.Print("shell-log-marker")
	fmt.Fprintln(backendLogOutput, "backend-stderr-marker")
	urlCh := scanBackendStdout(strings.NewReader("booting\ndsh web: http://127.0.0.1:4321\nready\n"))
	if got, want := <-urlCh, "http://127.0.0.1:4321"; got != want {
		t.Fatalf("published URL = %q, want %q", got, want)
	}
	for range urlCh {
	}

	if base := filepath.Base(path); !launchLogNameRe.MatchString(base) {
		t.Errorf("launch log name %q does not match %v", base, launchLogNameRe)
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

	// 稳定入口 marisa-desktop.log 硬链接到本次启动的日志，内容一致。
	pointer := filepath.Join(filepath.Dir(path), appLogName)
	pointerData, err := os.ReadFile(pointer)
	if err != nil {
		t.Fatalf("read log pointer: %v", err)
	}
	if string(pointerData) != text {
		t.Errorf("pointer content differs from launch log")
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat launch log: %v", err)
	}
	pointerInfo, err := os.Stat(pointer)
	if err != nil {
		t.Fatalf("stat log pointer: %v", err)
	}
	if !os.SameFile(fileInfo, pointerInfo) {
		t.Errorf("log pointer is not a hardlink to the launch log")
	}
}

func TestLogDebugfSilentUnlessDebugLevel(t *testing.T) {
	t.Setenv("MARISA_LOG_LEVEL", "")
	t.Setenv("MARISA_LOG_DIR", t.TempDir())
	t.Cleanup(restoreLoggingState)
	_, closeLog, err := setupLogging()
	if err != nil {
		t.Fatalf("setupLogging: %v", err)
	}
	defer closeLog()

	logDebugf("debug-marker-%s", "hidden")
	if logDebug {
		t.Fatal("logDebug set without MARISA_LOG_LEVEL=debug")
	}
}

func TestPerLaunchLogFilesDistinct(t *testing.T) {
	t.Setenv("MARISA_LOG_LEVEL", "")
	t.Setenv("MARISA_LOG_DIR", t.TempDir())
	t.Cleanup(restoreLoggingState)

	first, closeFirst, err := setupLogging()
	if err != nil {
		t.Fatalf("first setupLogging: %v", err)
	}
	defer closeFirst()
	second, closeSecond, err := setupLogging()
	if err != nil {
		t.Fatalf("second setupLogging: %v", err)
	}
	defer closeSecond()

	if first == second {
		t.Errorf("two launches share the same log file %q", first)
	}
	for _, path := range []string{first, second} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("launch log %s missing: %v", path, err)
		}
	}
	// 稳定入口指向最近一次启动。
	pointer := filepath.Join(filepath.Dir(second), appLogName)
	secondInfo, err := os.Stat(second)
	if err != nil {
		t.Fatalf("stat second launch log: %v", err)
	}
	pointerInfo, err := os.Stat(pointer)
	if err != nil {
		t.Fatalf("stat log pointer: %v", err)
	}
	if !os.SameFile(secondInfo, pointerInfo) {
		t.Errorf("log pointer does not point at the latest launch log")
	}
}

func TestLaunchLogRotatesAtSizeCap(t *testing.T) {
	dir := t.TempDir()
	file, path, err := openLaunchLog(dir)
	if err != nil {
		t.Fatalf("openLaunchLog: %v", err)
	}
	output := newPersistentLogWriter(file, path, io.Discard, 16)
	t.Cleanup(func() { _ = output.Close() })

	first := []byte("0123456789abcdef") // 恰好等于上限，不触发轮转
	second := []byte("tail")
	if _, err := output.Write(first); err != nil {
		t.Fatalf("first Write: %v", err)
	}
	if _, err := output.Write(second); err != nil {
		t.Fatalf("second Write: %v", err)
	}

	previous, err := os.ReadFile(path + ".1")
	if err != nil {
		t.Fatalf("read rotated log: %v", err)
	}
	if string(previous) != string(first) {
		t.Errorf("rotated log = %q, want %q", previous, first)
	}
	current, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read current log: %v", err)
	}
	if string(current) != string(second) {
		t.Errorf("current log = %q, want %q", current, second)
	}
	// 轮转后稳定入口重新指向新的当前文件。
	currentInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat current log: %v", err)
	}
	pointerInfo, err := os.Stat(filepath.Join(dir, appLogName))
	if err != nil {
		t.Fatalf("stat log pointer: %v", err)
	}
	if !os.SameFile(currentInfo, pointerInfo) {
		t.Errorf("log pointer not relinked after rotation")
	}
}

func TestRetentionKeepsNewestLaunches(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 25; i++ {
		name := fmt.Sprintf("marisa-desktop-20260101-%06d.log", i)
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatalf("seed launch log %s: %v", name, err)
		}
		if i >= 23 {
			if err := os.WriteFile(filepath.Join(dir, name+".1"), []byte("y"), 0o600); err != nil {
				t.Fatalf("seed rotated log %s: %v", name+".1", err)
			}
		}
	}
	legacy := filepath.Join(dir, appLogName+".1")
	if err := os.WriteFile(legacy, []byte("legacy"), 0o600); err != nil {
		t.Fatalf("seed legacy rotated log: %v", err)
	}

	if err := cleanupRetainedLogs(dir); err != nil {
		t.Fatalf("cleanupRetainedLogs: %v", err)
	}

	for i := 0; i < 5; i++ {
		name := fmt.Sprintf("marisa-desktop-20260101-%06d.log", i)
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Errorf("oldest launch log %s still exists", name)
		}
	}
	for i := 5; i < 25; i++ {
		name := fmt.Sprintf("marisa-desktop-20260101-%06d.log", i)
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("kept launch log %s missing: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "marisa-desktop-20260101-000024.log.1")); err != nil {
		t.Errorf("kept rotated log missing: %v", err)
	}
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Errorf("legacy rotated log still exists")
	}
}

func TestLegacyPointerMigratedOnUpgrade(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MARISA_LOG_LEVEL", "")
	t.Setenv("MARISA_LOG_DIR", dir)
	t.Cleanup(restoreLoggingState)

	// 模拟旧单文件方案遗留的 marisa-desktop.log。
	legacy := filepath.Join(dir, appLogName)
	content := "2026/08/22 15:00:00 main.go:1: legacy combined log line\n"
	if err := os.WriteFile(legacy, []byte(content), 0o600); err != nil {
		t.Fatalf("seed legacy log: %v", err)
	}

	path, closeLog, err := setupLogging()
	if err != nil {
		t.Fatalf("setupLogging: %v", err)
	}
	defer closeLog()

	// 稳定入口硬链接到本次启动的日志。
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat launch log: %v", err)
	}
	pointerInfo, err := os.Stat(filepath.Join(dir, appLogName))
	if err != nil {
		t.Fatalf("stat log pointer: %v", err)
	}
	if !os.SameFile(fileInfo, pointerInfo) {
		t.Errorf("log pointer is not a hardlink to the launch log")
	}

	// 遗留内容以时间戳文件名保留在日志目录中。
	matches, err := filepath.Glob(filepath.Join(dir, "marisa-desktop-*.log"))
	if err != nil {
		t.Fatalf("glob launch logs: %v", err)
	}
	preserved := false
	for _, match := range matches {
		if match == path {
			continue
		}
		data, err := os.ReadFile(match)
		if err != nil {
			t.Fatalf("read migrated log %s: %v", match, err)
		}
		if string(data) == content {
			preserved = true
		}
	}
	if !preserved {
		t.Errorf("legacy log content not preserved among %v", matches)
	}
}
