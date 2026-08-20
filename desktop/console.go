// 控制台策略：发行构建（-H=windowsgui）默认不创建任何终端窗口，日志只写
// 持久文件；仅在显式请求时把 stdout/stderr 接到新控制台。
package main

import "os"

// consoleRequested 报告用户是否通过启动参数 --console 或环境变量
// MARISA_CONSOLE=1 显式要求控制台日志。发行构建无此参数时全程无终端窗口。
func consoleRequested() bool {
	if os.Getenv("MARISA_CONSOLE") == "1" {
		return true
	}
	for _, a := range os.Args[1:] {
		if a == "--console" {
			return true
		}
	}
	return false
}
