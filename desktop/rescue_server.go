// 急救模式的壳层本地控制端点：后端无法以完整/极简组合启动时，窗口切到
// 本端点提供的急救页（rescue.html），页面通过同源 API 请求壳层执行
// 备份 / 初始化配置 / 初始化源码，不依赖任何后端进程。
//
// 安全：仅绑定 127.0.0.1 随机端口，所有请求须携带随机 token（页面 URL
// 内嵌，fetch 透传），本机其他进程无法盲调。
package main

import (
	_ "embed"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
)

//go:embed rescue.html
var rescueHTML string

// rescueServer 是急救模式的控制端点。
type rescueServer struct {
	token       string
	done        chan struct{}
	srv         *http.Server
	url         string
	exec        *rescueExecutor
	lastError   string
	logPath     string
	backupsRoot string
}

// newRescueServer 构造端点；lastError 是最近一次启动失败原因（展示给急救页）。
func newRescueServer(lastError string) (*rescueServer, error) {
	tok := make([]byte, 16)
	if _, err := rand.Read(tok); err != nil {
		return nil, fmt.Errorf("generate rescue token: %w", err)
	}
	s := &rescueServer{
		token:     hex.EncodeToString(tok),
		done:      make(chan struct{}),
		exec:      newRescueExecutor(),
		lastError: lastError,
	}
	if dir, err := appLogDir(); err == nil {
		s.logPath = filepath.Join(dir, appLogName)
	}
	if root, err := backupsRootDir(); err == nil {
		s.backupsRoot = root
	}
	return s, nil
}

// start 监听 127.0.0.1 随机端口并开始服务；URL 供窗口导航（含 token）。
func (s *rescueServer) start() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handlePage)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/backups", s.handleBackups)
	mux.HandleFunc("/api/rescue", s.handleRescue)
	mux.HandleFunc("/api/retry", s.handleRetry)
	mux.HandleFunc("/api/open-log", s.handleOpenLog)
	mux.HandleFunc("/api/open-backups", s.handleOpenBackups)
	s.srv = &http.Server{Handler: s.auth(mux)}
	go func() {
		if err := s.srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("rescue server: %v", err)
		}
	}()
	s.url = "http://" + ln.Addr().String() + "/?token=" + s.token
	return nil
}

// signalDone 恰好一次地通知等待方（急救完成或用户重试）。
func (s *rescueServer) signalDone() {
	select {
	case <-s.done:
	default:
		close(s.done)
	}
}

// auth 校验 token：query（页面 fetch 透传）或 X-Rescue-Token 头均可。
func (s *rescueServer) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != s.token && r.Header.Get("X-Rescue-Token") != s.token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

func (s *rescueServer) handlePage(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(rescueHTML))
}

// handleState 返回急救页初始化数据：最近失败原因、日志路径/尾部、备份根、
// 以及当前形态的能力（能否重新解包源码）。
func (s *rescueServer) handleState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"stage":       string(stageRescue),
		"lastError":   s.lastError,
		"logPath":     s.logPath,
		"logTail":     readLogTail(s.logPath, 8<<10),
		"backupsRoot": s.backupsRoot,
		"capabilities": map[string]bool{
			"resetSource": s.exec.reinstallAvailable(),
		},
	})
}

func (s *rescueServer) handleBackups(w http.ResponseWriter, r *http.Request) {
	exists := s.backupsRoot != ""
	if exists {
		if fi, err := os.Stat(s.backupsRoot); err != nil || !fi.IsDir() {
			exists = false
		}
	}
	writeJSON(w, map[string]bool{"exists": exists})
}

// handleRescue 执行一次急救动作；成功时通知等待方返回主流程。
func (s *rescueServer) handleRescue(w http.ResponseWriter, r *http.Request) {
	var req rescueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": "请求格式错误: " + err.Error()})
		return
	}
	log.Printf("rescue: 执行恢复 backup=%v resetConfig=%v resetSource=%v", req.Backup, req.ResetConfig, req.ResetSource)
	backupDir, err := s.exec.run(req)
	if err != nil {
		log.Printf("rescue: 恢复失败：%v", err)
		writeJSON(w, map[string]any{"ok": false, "error": err.Error(), "backupDir": backupDir})
		return
	}
	s.signalDone()
	writeJSON(w, map[string]any{"ok": true, "backupDir": backupDir})
}

// handleRetry 不做任何恢复，直接通知主流程以完整模式重新尝试。
func (s *rescueServer) handleRetry(w http.ResponseWriter, r *http.Request) {
	log.Printf("rescue: 用户选择重试完整启动（不恢复）")
	s.signalDone()
	writeJSON(w, map[string]any{"ok": true})
}

func (s *rescueServer) handleOpenLog(w http.ResponseWriter, r *http.Request) {
	if s.logPath == "" {
		writeJSON(w, map[string]any{"ok": false, "error": "日志路径不可用"})
		return
	}
	if err := ensureAndOpenFolder(filepath.Dir(s.logPath)); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (s *rescueServer) handleOpenBackups(w http.ResponseWriter, r *http.Request) {
	if s.backupsRoot == "" {
		writeJSON(w, map[string]any{"ok": false, "error": "备份目录不可用"})
		return
	}
	if err := ensureAndOpenFolder(s.backupsRoot); err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// readLogTail 读取日志文件尾部最多 maxBytes 字节（UTF-8 边界近似截断）。
func readLogTail(path string, maxBytes int) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	if len(data) > maxBytes {
		data = data[len(data)-maxBytes:]
	}
	return string(data)
}
