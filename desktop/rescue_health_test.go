// 页面健康检查的单测：心跳端点状态聚合、监控判定的健康/报错/超时/停止
// 四分支。用真实 HTTP 请求模拟页面探针心跳。
package main

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

// TestPageHealthHeartbeat 验证心跳端点聚合页面状态（booted/错误数/首条错误）。
func TestPageHealthHeartbeat(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	defer ph.close()

	b, e, m := ph.snapshot()
	if b || e != 0 || m != "" {
		t.Fatalf("initial snapshot = (%v, %d, %q), want all zero", b, e, m)
	}

	resp, err := http.Get("http://" + ph.addr + "/hb?b=1&e=2&m=boom")
	if err != nil {
		t.Fatalf("heartbeat request: %v", err)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("CORS header = %q, want *", resp.Header.Get("Access-Control-Allow-Origin"))
	}
	resp.Body.Close()

	b, e, m = ph.snapshot()
	if !b || e != 2 || m != "boom" {
		t.Fatalf("snapshot after heartbeat = (%v, %d, %q), want (true, 2, boom)", b, e, m)
	}

	// 首条错误消息保留；后续心跳的 m 不再覆盖。
	if resp, err := http.Get("http://" + ph.addr + "/hb?b=1&e=3&m=second"); err == nil {
		resp.Body.Close()
	}
	_, e, m = ph.snapshot()
	if e != 3 || m != "boom" {
		t.Fatalf("snapshot after second heartbeat = (%d, %q), want (3, boom)", e, m)
	}
}

// TestPageHealthProbeJS 验证探针脚本包含心跳端点且幂等（重复注入不重复装探针）。
func TestPageHealthProbeJS(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	defer ph.close()
	js := ph.probeJS()
	if !strings.Contains(js, ph.addr+"/hb") {
		t.Fatalf("probe JS 未打到 /hb 心跳端点（曾漏掉导致 90s 必进急救）：%.200s", js)
	}
	for _, want := range []string{"__marisaProbe", "addEventListener('error'", "unhandledrejection", "DOMContentLoaded", "setInterval", "/hb"} {
		if !strings.Contains(js, want) {
			t.Fatalf("probe JS 缺少 %q", want)
		}
	}
	for _, want := range []string{"?b=", "&e=", "&m=", "encodeURIComponent"} {
		if !strings.Contains(js, want) {
			t.Fatalf("probe JS 心跳缺少 %q（曾漏掉导致 b/e/m 永不回传）", want)
		}
	}
}

// TestMonitorPageHealthHealthy 页面 booted 且零错误 → 监控正常退出、不上报。
func TestMonitorPageHealthHealthy(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	inject := func(js string) {
		if !strings.Contains(js, ph.addr) {
			t.Errorf("注入的探针缺少心跳端点")
		}
	}
	stop := make(chan struct{})
	errCh := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		monitorPageHealth(ph, inject, stop, errCh, 5*time.Second)
		close(done)
	}()

	// 模拟页面心跳：加载完成且无错误。
	time.Sleep(300 * time.Millisecond)
	resp, err := http.Get("http://" + ph.addr + "/hb?b=1&e=0")
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	resp.Body.Close()

	select {
	case <-done:
	case <-time.After(4 * time.Second):
		t.Fatal("健康页面未触发监控正常退出")
	}
	select {
	case e := <-errCh:
		t.Fatalf("健康页面被误报失败：%v", e)
	default:
	}
}

// TestMonitorPageHealthError 页面报错（booted + errs>0）→ 立即上报失败。
func TestMonitorPageHealthError(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	errCh := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		monitorPageHealth(ph, func(string) {}, make(chan struct{}), errCh, 5*time.Second)
		close(done)
	}()

	time.Sleep(300 * time.Millisecond)
	resp, err := http.Get("http://" + ph.addr + "/hb?b=1&e=1&m=cannot%20read%20slots")
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	resp.Body.Close()

	select {
	case e := <-errCh:
		if !strings.Contains(e.Error(), "cannot read slots") {
			t.Fatalf("失败原因 = %q，应包含错误消息", e.Error())
		}
	case <-time.After(4 * time.Second):
		t.Fatal("页面报错未触发失败上报")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("上报失败后监控未退出")
	}
}

// TestMonitorPageHealthTimeout 页面始终未 booted → 超时上报失败。
func TestMonitorPageHealthTimeout(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	errCh := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		monitorPageHealth(ph, func(string) {}, make(chan struct{}), errCh, 200*time.Millisecond)
		close(done)
	}()
	select {
	case e := <-errCh:
		if !strings.Contains(e.Error(), "未加载完成") {
			t.Fatalf("失败原因 = %q，应提示未加载完成", e.Error())
		}
	case <-time.After(4 * time.Second):
		t.Fatal("超时未触发失败上报")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("上报失败后监控未退出")
	}
}

// TestMonitorPageHealthStopped 关闭 stop → 监控退出且不上报。
func TestMonitorPageHealthStopped(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	errCh := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		monitorPageHealth(ph, func(string) {}, stop, errCh, 30*time.Second)
		close(done)
	}()
	close(stop)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stop 未终止监控")
	}
	select {
	case e := <-errCh:
		t.Fatalf("stop 后误上报：%v", e)
	default:
	}
}

// TestExitFailureClass 验证后端终结对失败计数的影响矩阵。
func TestExitFailureClass(t *testing.T) {
	boom := errors.New("exit status 1")
	cases := []struct {
		name    string
		err     error
		user    bool
		ranFor  time.Duration
		wantCnt bool
		wantRst bool
	}{
		{"干净退出清零", nil, false, 10 * time.Second, false, true},
		{"用户重启清零", boom, true, 10 * time.Second, false, true},
		{"快速崩溃计数", boom, false, 30 * time.Second, true, false},
		{"快速崩溃计数（临界值内）", boom, false, stableRunTime - time.Second, true, false},
		{"长期运行后崩溃清零", boom, false, 10 * time.Minute, false, true},
	}
	for _, c := range cases {
		cnt, rst := exitFailureClass(c.err, c.user, c.ranFor)
		if cnt != c.wantCnt || rst != c.wantRst {
			t.Errorf("%s: exitFailureClass(%v, %v, %v) = (%v, %v), want (%v, %v)",
				c.name, c.err, c.user, c.ranFor, cnt, rst, c.wantCnt, c.wantRst)
		}
	}
}

// TestProbeTemplateFormat 验证模板格式化不残留占位符（防 %s/%q 误用）。
func TestProbeTemplateFormat(t *testing.T) {
	ph, err := newPageHealth()
	if err != nil {
		t.Fatal(err)
	}
	defer ph.close()
	js := ph.probeJS()
	if strings.Contains(js, "%!") || strings.Contains(js, "%s") || strings.Contains(js, "%q") {
		t.Fatalf("探针脚本残留格式化占位符：%s", fmt.Sprintf("%.80s", js))
	}
}
