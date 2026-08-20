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

// logDebug 由 MARISA_LOG_LEVEL=debug 开启：后端 stdout 逐行、窗口显隐、
// webview 导航等高频事件只在该级别记录；默认 info 只保留生命周期事件。
var logDebug bool

// logDebugf 记录调试级事件（MARISA_LOG_LEVEL=debug 时生效），消息带
// [debug] 前缀便于在文件日志中检索。
func logDebugf(format string, args ...any) {
	if logDebug {
		log.Printf("[debug] "+format, args...)
	}
}

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
// Shell log lines carry file:line (Lshortfile) so a GUI-process crash can be
// traced to the emitting site; backend passthrough writes stay verbatim.
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
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	// 显式重置而非只置真：setupLogging 可被重复调用（测试），级别必须由
	// 本次调用的环境决定。
	logDebug = os.Getenv("MARISA_LOG_LEVEL") == "debug"
	output := persistentLogWriter{file: file, terminal: os.Stderr}
	log.SetOutput(output)
	backendLogOutput = output
	if logDebug {
		log.Printf("[debug] log level: debug (MARISA_LOG_LEVEL)")
	}
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

// scanBackendStdout 持续消费后端 stdout 直到进程退出，逐行写入持久日志
// （debug 级：后端自述输出在高频运行时噪声较大），并发布首个监听 URL。
func scanBackendStdout(stdout io.Reader) <-chan string {
	urlCh := make(chan string, 1)
	go func() {
		defer close(urlCh)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		published := false
		for scanner.Scan() {
			line := scanner.Text()
			logDebugf("backend stdout: %s", line)
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
