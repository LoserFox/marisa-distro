// Windows 的后端进程管理。Windows 没有 POSIX 进程组与信号，环境直接继承
// 自壳进程（用户系统/用户环境变量），不做 shell rc source；终止用
// taskkill /T 按进程树清理（优雅 → 宽限 → /F 强制），语义对齐 POSIX 的
// SIGTERM→SIGKILL 阶梯。
//
//go:build windows

package main

import (
	"os/exec"
	"strconv"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// serverCommand 启动用户环境里的 dsh web 后端：默认 `dsh web --port <port>`
// （PATH 上的 dsh.cmd / dsh.exe，Go 自动经 cmd.exe 运行批处理），DSH_WEB_CMD
// 覆盖整条命令行（`{port}` 占位符已替换）。不经过 shell 包装；环境继承自
// 壳进程。
func serverCommand(port string) *exec.Cmd {
	argv := parseCommandLine(webCommandLine(port))
	if len(argv) == 0 {
		// 不可达：webCommandLine 至少返回 "dsh web --port <port>"。
		argv = []string{"dsh", "web", "--port", port}
	}
	cmd := exec.Command(argv[0], argv[1:]...)
	// 发行构建（GUI 子系统）下壳没有控制台可继承：.cmd launcher 会被
	// os/exec 自动套 cmd.exe /c，Windows 会给它新建一个空的控制台窗口。
	// 父进程无控制台时用 CREATE_NO_WINDOW 抑制该窗口；dev 构建从终端
	// 启动（有控制台）时保持继承，终端日志照常可见。
	if !hasConsole() {
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_NO_WINDOW}
	}
	return cmd
}

// killServerTree 按进程树终止后端（taskkill /T 覆盖其后代进程）。
// force 对应 /F：优雅请求超时后的强制结束。
func killServerTree(pid int, force bool) {
	args := []string{"/PID", strconv.Itoa(pid), "/T"}
	if force {
		args = append(args, "/F")
	}
	_ = exec.Command("taskkill", args...).Run()
}

// stopServer 终止后端并等待其退出：先优雅树杀（无信号语义，taskkill 不带
// /F 即请求退出），serverStopGrace 内未退出则 /F 强制兜底，随后等待 Wait
// 收口（exitCh 必然收到结果）。
func stopServer(cmd *exec.Cmd, exitCh <-chan serverExit) {
	if cmd.Process == nil {
		return
	}
	killServerTree(cmd.Process.Pid, false)
	select {
	case <-exitCh:
		return
	case <-time.After(serverStopGrace):
	}
	killServerTree(cmd.Process.Pid, true)
	select {
	case <-exitCh:
	case <-time.After(serverStopGrace):
	}
}
