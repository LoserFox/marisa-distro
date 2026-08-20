// 急救控制端点的 HTTP 协议测试：token 校验、state 载荷、retry 信号、
// rescue 动作执行与失败回传（执行器用 mock，不经真实 backend）。
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newTestRescueServer 构造绑定随机端口的端点，执行器指向临时目录 + mock
// 重解包。返回 server、执行器、临时 fixture 与清理函数。
func newTestRescueServer(t *testing.T) (*rescueServer, *rescueFixture) {
	t.Helper()
	f := newRescueFixture(t)
	srv := &rescueServer{
		token:       "test-token",
		done:        make(chan struct{}),
		exec:        f.executor(t),
		lastError:   "boot exploded",
		backupsRoot: f.backups,
	}
	if err := srv.start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = srv.srv.Close() })
	return srv, f
}

// baseURL 去掉页面 URL 的 query 部分（s.url = http://host:port/?token=…）。
func (s *rescueServer) baseURL() string {
	return strings.Split(s.url, "?")[0]
}

func (s *rescueServer) get(t *testing.T, path string) (int, string) {
	t.Helper()
	resp, err := http.Get(s.baseURL() + path + "?token=" + s.token)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func (s *rescueServer) post(t *testing.T, path string, payload any) (int, string) {
	t.Helper()
	var buf bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&buf).Encode(payload); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest("POST", s.baseURL()+path+"?token="+s.token, &buf)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func TestRescueServerAuthRejectsBadToken(t *testing.T) {
	srv, _ := newTestRescueServer(t)
	resp, err := http.Get(srv.baseURL() + "/api/state?token=wrong")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", resp.StatusCode)
	}
}

func TestRescueServerState(t *testing.T) {
	srv, _ := newTestRescueServer(t)
	code, body := srv.get(t, "/api/state")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	var st struct {
		Stage       string `json:"stage"`
		LastError   string `json:"lastError"`
		BackupsRoot string `json:"backupsRoot"`
		Cap         struct {
			ResetSource bool `json:"resetSource"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal([]byte(body), &st); err != nil {
		t.Fatalf("state parse: %v\n%s", err, body)
	}
	if st.Stage != "rescue" || st.LastError != "boot exploded" {
		t.Errorf("state = %+v", st)
	}
	if st.BackupsRoot != srv.backupsRoot {
		t.Errorf("backupsRoot = %q", st.BackupsRoot)
	}
	if !st.Cap.ResetSource {
		t.Error("resetSource capability should be true in test executor")
	}
}

func TestRescueServerRetrySignalsDone(t *testing.T) {
	srv, _ := newTestRescueServer(t)
	code, body := srv.post(t, "/api/retry", nil)
	if code != http.StatusOK || !strings.Contains(body, `"ok":true`) {
		t.Fatalf("retry: %d %s", code, body)
	}
	select {
	case <-srv.done:
	case <-time.After(2 * time.Second):
		t.Fatal("retry did not signal done")
	}
}

func TestRescueServerRescueExecutes(t *testing.T) {
	srv, f := newTestRescueServer(t)
	code, body := srv.post(t, "/api/rescue", rescueRequest{Backup: true, ResetConfig: true, ResetSource: true})
	if code != http.StatusOK {
		t.Fatalf("rescue status = %d", code)
	}
	var r struct {
		Ok        bool   `json:"ok"`
		BackupDir string `json:"backupDir"`
	}
	if err := json.Unmarshal([]byte(body), &r); err != nil {
		t.Fatalf("rescue parse: %v\n%s", err, body)
	}
	if !r.Ok || r.BackupDir == "" {
		t.Fatalf("rescue = %+v", r)
	}
	if f.reinstallCalls != 1 {
		t.Fatalf("reinstall calls = %d", f.reinstallCalls)
	}
	// 用户面清零、出厂树在场
	if _, err := os.Lstat(filepath.Join(f.backend, ".dsh", "sessions", "s1.jsonl")); !os.IsNotExist(err) {
		t.Error("user config survived rescue")
	}
	if _, err := os.Lstat(filepath.Join(f.backend, "VERSION")); err != nil {
		t.Error("backend not reinstalled")
	}
	select {
	case <-srv.done:
	case <-time.After(2 * time.Second):
		t.Fatal("rescue did not signal done")
	}
}

func TestRescueServerRescueFailureKeepsPage(t *testing.T) {
	srv, f := newTestRescueServer(t)
	f.executor(t) // ensure executor exists for fixture validity
	srv.exec = &rescueExecutor{
		backendDir:  f.backend,
		backupsRoot: f.backups,
		reinstall: func() error {
			return errSourceUnavailable
		},
		reinstallAvailable: func() bool { return false },
	}
	code, body := srv.post(t, "/api/rescue", rescueRequest{Backup: false, ResetConfig: false, ResetSource: true})
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	var r struct {
		Ok    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(body), &r); err != nil {
		t.Fatal(err)
	}
	if r.Ok || !strings.Contains(r.Error, "不支持") {
		t.Fatalf("rescue failure = %+v", r)
	}
	// 失败不应触发 done（页面留在急救页可重试）
	select {
	case <-srv.done:
		t.Fatal("done signaled on failure")
	case <-time.After(100 * time.Millisecond):
	}
}
