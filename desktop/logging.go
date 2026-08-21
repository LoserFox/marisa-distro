package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	// appLogName 是稳定入口文件名：始终指向最近一次启动的日志（NTFS 硬链接；
	// 硬链接不可用时退化为一行文本指针）。真实内容按启动写入
	// marisa-desktop-YYYYMMDD-HHMMSS[.N].log。
	appLogName = "marisa-desktop.log"
	// launchLogTimeFmt 是启动日志文件名的时刻格式（YYYYMMDD-HHMMSS）。
	launchLogTimeFmt = "20060102-150405"
	// retainLaunchLogFiles 是保留的最近启动日志组数；每组含可能的 .1 轮转对。
	retainLaunchLogFiles = 20
	// maxAppLogSize 是单个启动日志的大小上限，超出即在写入路径轮转为 .1。
	maxAppLogSize = 5 << 20
)

// launchLogNameRe 识别按启动命名的日志文件（用于区分旧单文件方案的遗留
// 日志与硬链接回退时的文本指针）。
var launchLogNameRe = regexp.MustCompile(`^marisa-desktop-\d{8}-\d{6}(-\d+)?\.log$`)

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

// persistentLogWriter 把日志同时写入本次启动的日志文件与终端镜像；文件超过
// maxBytes 时在写入路径轮转为 path+".1" 并重建当前文件。文件句柄会因轮转
// 而更换，因此所有写入经互斥锁串行化（log 包内部自带锁，但后端 stderr 的
// 透传直接调用 Write，不经过 log）。
type persistentLogWriter struct {
	mu       sync.Mutex
	file     *os.File
	path     string
	terminal io.Writer
	bytes    int64
	maxBytes int64
}

func newPersistentLogWriter(file *os.File, path string, terminal io.Writer, maxBytes int64) *persistentLogWriter {
	return &persistentLogWriter{file: file, path: path, terminal: terminal, maxBytes: maxBytes}
}

// Close 关闭当前日志文件句柄（轮转后可能是新打开的那一个）。
func (w *persistentLogWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

func (w *persistentLogWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.maxBytes > 0 && w.bytes+int64(len(data)) > w.maxBytes {
		_ = w.rotateLocked() // 轮转失败时继续写当前文件，不丢日志
	}
	if w.file == nil {
		// 轮转失败后没有可用句柄：本轮先尝试自愈，仍失败则丢弃本轮。
		_ = w.rotateLocked()
	}
	if w.file == nil {
		return 0, errors.New("log file unavailable after rotation failure")
	}
	n, err := w.file.Write(data)
	if err != nil {
		return n, err
	}
	w.bytes += int64(n)
	if n != len(data) {
		return n, io.ErrShortWrite
	}
	// A Windows GUI launch may not have a writable stderr handle. Terminal
	// mirroring is diagnostic convenience and must never break persistence or
	// stop os/exec from draining the backend pipes.
	_, _ = w.terminal.Write(data)
	return len(data), nil
}

// rotateLocked 把当前启动日志轮转为 path+".1"（先清掉旧的 .1）并打开新的
// path，随后把稳定入口 marisa-desktop.log 重新链接到新文件。调用方必须持有
// w.mu。Windows 上不能移动仍被本进程打开的句柄，因此先关旧句柄再改名；
// 任一步失败都会尝试重开原文件继续写，避免日志中断。
func (w *persistentLogWriter) rotateLocked() error {
	if w.file != nil {
		if err := w.file.Close(); err != nil {
			w.reopenAppend()
			return err
		}
	}
	previous := w.path + ".1"
	if err := os.Remove(previous); err != nil && !os.IsNotExist(err) {
		w.reopenAppend()
		return err
	}
	if err := os.Rename(w.path, previous); err != nil {
		w.reopenAppend()
		return err
	}
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		// 新文件打不开：退回到继续写轮转后的 .1，保证日志不丢。
		if fallback, ferr := os.OpenFile(previous, os.O_APPEND|os.O_WRONLY, 0o600); ferr == nil {
			w.file = fallback
			w.bytes = 0
		}
		return err
	}
	w.file = file
	w.bytes = 0
	_ = refreshLogPointer(w.path) // 指针重新指向新文件；失败仅影响入口便利
	return nil
}

// reopenAppend 在轮转失败后重开原路径继续写（原路径已被改名时退回 .1）；
// 重开也失败时保持 w.file 为 nil，由 Write 在下轮自愈。
func (w *persistentLogWriter) reopenAppend() {
	file, err := os.OpenFile(w.path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		if file, err = os.OpenFile(w.path+".1", os.O_APPEND|os.O_WRONLY, 0o600); err != nil {
			w.file = nil
			return
		}
	}
	w.file = file
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

// setupLogging 配置本次启动的持久日志：日志按启动分文件写入
// marisa-desktop-YYYYMMDD-HHMMSS[.N].log（同一秒内多次启动自动追加 -N 后缀），
// 同时保留一个稳定入口 marisa-desktop.log（NTFS 硬链接到最新启动文件；硬链接
// 不可用时退化为一行文本指针），并清理超出保留数量的历史启动日志。单个启动
// 日志超过 maxAppLogSize 时在写入路径轮转为 .1。壳日志行带 file:line
// （Lshortfile），后端透传写入保持原样。
func setupLogging() (path string, closeLog func(), err error) {
	dir, err := appLogDir()
	if err != nil {
		return "", func() {}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", func() {}, fmt.Errorf("create log directory %s: %w", dir, err)
	}

	var warnings []string
	if err := cleanupRetainedLogs(dir); err != nil {
		warnings = append(warnings, fmt.Sprintf("retained log cleanup failed: %v", err))
	}
	pointerOK, err := migrateLegacyLogPointer(dir)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("legacy log migration failed: %v", err))
		pointerOK = false
	}

	file, path, err := openLaunchLog(dir)
	if err != nil {
		return "", func() {}, fmt.Errorf("open launch log in %s: %w", dir, err)
	}
	// 显式重置而非只置真：setupLogging 可被重复调用（测试），级别必须由
	// 本次调用的环境决定。
	logDebug = os.Getenv("MARISA_LOG_LEVEL") == "debug"
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	output := newPersistentLogWriter(file, path, os.Stderr, maxAppLogSize)
	closeLog = func() { _ = output.Close() }
	if pointerOK {
		if err := refreshLogPointer(path); err != nil {
			warnings = append(warnings, err.Error())
		}
	}

	log.SetOutput(output)
	backendLogOutput = output
	// 清理/迁移/指针的告警落盘到本次启动的日志，便于事后排查。
	for _, msg := range warnings {
		log.Printf("logging: %s", msg)
	}
	if logDebug {
		log.Printf("[debug] log level: debug (MARISA_LOG_LEVEL)")
	}
	return path, closeLog, nil
}

// openLaunchLog 以 O_EXCL 创建本次启动的日志文件，保证一次启动独占一个
// 文件；同一秒内多次启动自动追加 -N 后缀。
func openLaunchLog(dir string) (*os.File, string, error) {
	stamp := time.Now().Format(launchLogTimeFmt)
	for n := 1; ; n++ {
		name := fmt.Sprintf("marisa-desktop-%s.log", stamp)
		if n > 1 {
			name = fmt.Sprintf("marisa-desktop-%s-%d.log", stamp, n)
		}
		path := filepath.Join(dir, name)
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			return file, path, nil
		}
		if !os.IsExist(err) {
			return nil, "", err
		}
	}
}

// refreshLogPointer 重建稳定入口 marisa-desktop.log，使其硬链接到本次启动
// 的日志文件；硬链接不可用（如非 NTFS 文件系统）时退化为一行文本指针，让
// 托盘「版本信息」等固定路径入口仍能指到当前日志。
func refreshLogPointer(launchPath string) error {
	pointer := filepath.Join(filepath.Dir(launchPath), appLogName)
	if err := os.Remove(pointer); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove log pointer %s: %w", pointer, err)
	}
	if err := os.Link(launchPath, pointer); err != nil {
		if werr := os.WriteFile(pointer, []byte(filepath.Base(launchPath)+"\n"), 0o600); werr != nil {
			return fmt.Errorf("link log pointer %s: %v; text pointer also failed: %v", pointer, err, werr)
		}
		return fmt.Errorf("hardlink log pointer %s unavailable: %v; wrote text pointer", pointer, err)
	}
	return nil
}

// migrateLegacyLogPointer 处理旧版本遗留的 marisa-desktop.log：若内容是旧
// 单文件方案的真实日志，按文件修改时间改名进保留池；若只是一行文本指针
// （硬链接不可用时的回退），直接丢弃。返回 ok=false 时调用方不应重建指针
// （旧文件保持原位）。
func migrateLegacyLogPointer(dir string) (ok bool, err error) {
	pointer := filepath.Join(dir, appLogName)
	data, err := os.ReadFile(pointer)
	if os.IsNotExist(err) {
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("read legacy log %s: %w", pointer, err)
	}
	if launchLogNameRe.MatchString(strings.TrimSpace(string(data))) {
		return true, nil // 上一版本留下的文本指针，可直接替换
	}
	info, err := os.Stat(pointer)
	if err != nil {
		return false, fmt.Errorf("stat legacy log %s: %w", pointer, err)
	}
	stamp := info.ModTime().Format(launchLogTimeFmt)
	for n := 1; ; n++ {
		name := fmt.Sprintf("marisa-desktop-%s.log", stamp)
		if n > 1 {
			name = fmt.Sprintf("marisa-desktop-%s-%d.log", stamp, n)
		}
		legacy := filepath.Join(dir, name)
		if _, err := os.Lstat(legacy); err == nil {
			continue // 名字被占，换后缀
		}
		if err := os.Rename(pointer, legacy); err != nil {
			return false, fmt.Errorf("rename legacy log %s -> %s: %w", pointer, legacy, err)
		}
		return true, nil
	}
}

// cleanupRetainedLogs 保留最近 retainLaunchLogFiles 个启动日志组（每组含
// 可能的 .1 轮转对），删除更早的；同时清掉旧单文件方案遗留的
// marisa-desktop.log.1。
func cleanupRetainedLogs(dir string) error {
	matches, err := filepath.Glob(filepath.Join(dir, "marisa-desktop-*.log*"))
	if err != nil {
		return fmt.Errorf("scan launch logs: %w", err)
	}
	groups := map[string][]string{}
	var bases []string
	for _, match := range matches {
		base := strings.TrimSuffix(match, ".1")
		if _, seen := groups[base]; !seen {
			bases = append(bases, base)
		}
		groups[base] = append(groups[base], match)
	}
	sort.Strings(bases)
	if len(bases) > retainLaunchLogFiles {
		for _, base := range bases[:len(bases)-retainLaunchLogFiles] {
			for _, file := range groups[base] {
				if err := os.Remove(file); err != nil && !os.IsNotExist(err) {
					return fmt.Errorf("remove stale launch log %s: %w", file, err)
				}
			}
		}
	}
	legacy := filepath.Join(dir, appLogName+".1")
	if err := os.Remove(legacy); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove legacy rotated log %s: %w", legacy, err)
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
