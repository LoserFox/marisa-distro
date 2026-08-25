// POSIX（macOS/Linux）的后端进程管理：经用户 shell source rc 文件后 exec
// 用户环境里的 dsh web，并把后端放入独立进程组（Setpgid），退出时按组
// SIGTERM→SIGKILL 整体清理，不留孤儿 node。
//
//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// rcFileFor 按用户 shell 返回要 source 的配置文件路径（不检查存在性，
// 缺失时 source 报错但被重定向吞掉，不影响后续）。
func rcFileFor(shell string) string {
	switch filepath.Base(shell) {
	case "bash":
		return "~/.bashrc"
	case "zsh":
		return "~/.zshrc"
	default:
		return ""
	}
}

// shellQuote 用单引号包裹字符串，供拼进 shell 命令行（路径可能含空格）。
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// serverCommand 构造启动 dsh web 后端的命令。当用户 shell 有对应 rc 文件时，
// 先 source 该文件（让后端继承用户终端里的环境变量，如 API key），再 exec
// 用户环境里的 dsh——exec 保持同一进程（PID 不变），守护 wait 语义不受影响。
// source 的输出重定向到 /dev/null，避免污染后端 stdout 的 URL 行。
// 进程放入独立进程组（Setpgid）：应用退出时按组终止，保证后端整体清理，
// 不残留孤儿 node。ctx 取消不依赖 exec.CommandContext 的异步 kill（它只杀
// 直接子进程且时机不受控），由调用方经 stopServer 显式终止。
func serverCommand(port string) *exec.Cmd {
	line := webCommandLine(port)

	shell := os.Getenv("SHELL")
	rc := rcFileFor(shell)
	var cmd *exec.Cmd
	if shell != "" && rc != "" {
		cmdline := fmt.Sprintf("source %s >/dev/null 2>&1; exec %s", rc, line)
		cmd = exec.Command(shell, "-c", cmdline)
	} else {
		argv := parseCommandLine(line)
		if len(argv) == 0 {
			argv = []string{"dsh", "web", "--port", port}
		}
		cmd = exec.Command(argv[0], argv[1:]...)
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

// killServer 向 dsh 后端所在进程组发信号（负 PID 覆盖组内全部进程）。
// 先 SIGTERM 给后端优雅退出机会；未及时退出由 stopServer 的 SIGKILL 兜底。
func killServer(cmd *exec.Cmd, sig syscall.Signal) {
	if cmd.Process == nil {
		return
	}
	_ = syscall.Kill(-cmd.Process.Pid, sig)
}

// killServerTree 按进程树终止后端：后端经 Setpgid 独立成组，负 PID 信号
// 覆盖组内全部后代 node 进程。force=false 发 SIGTERM 给优雅退出机会，
// true 直接 SIGKILL —— 语义对齐 Windows 侧 taskkill /T（/F）。组不存在
// （后端已整体退出）时对单个 PID 兜底发一次，ESRCH 静默忽略。
func killServerTree(pid int, force bool) {
	sig := syscall.SIGTERM
	if force {
		sig = syscall.SIGKILL
	}
	if err := syscall.Kill(-pid, sig); err == syscall.ESRCH {
		_ = syscall.Kill(pid, sig)
	}
}

// stopServer 终止后端并等待其退出：SIGTERM 整个进程组，serverStopGrace
// 内未退出则 SIGKILL 兜底，随后等待 Wait 收口（exitCh 必然收到结果）。
func stopServer(cmd *exec.Cmd, exitCh <-chan serverExit) {
	if cmd.Process == nil {
		return
	}
	killServer(cmd, syscall.SIGTERM)
	select {
	case <-exitCh:
		return
	case <-time.After(serverStopGrace):
	}
	killServer(cmd, syscall.SIGKILL)
	select {
	case <-exitCh:
	case <-time.After(serverStopGrace):
	}
}
