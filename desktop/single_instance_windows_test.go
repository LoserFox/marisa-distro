//go:build windows

package main

import (
	"fmt"
	"testing"
	"time"
)

// TestAcquireNamedMutex 验证命名互斥体的三次状态转移：
// 首次获取成功 → 同名再次获取报 errAlreadyRunning（模拟第二实例）→
// 释放后重新获取成功（模拟首实例退出后再次启动）。
// 测试用唯一名字，避免与真实实例的互斥体互相影响。
func TestAcquireNamedMutex(t *testing.T) {
	name := fmt.Sprintf(`Local\io.marisa-distro.desktop.test-%d`, time.Now().UnixNano())

	release, err := acquireNamedMutex(name)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}

	if _, err := acquireNamedMutex(name); err != errAlreadyRunning {
		// 拿到句柄时（err 非 nil）由 acquireNamedMutex 自行关闭；此处仅失败分支。
		t.Fatalf("second acquire: got %v, want errAlreadyRunning", err)
	}

	release()

	release2, err := acquireNamedMutex(name)
	if err != nil {
		t.Fatalf("third acquire after release: %v", err)
	}
	release2()
}
