// 后端启动命令的解析:壳不再内置 SEA 后端,而是启动用户环境里的 dsh
// (`dsh web --port 0` 默认;`DSH_WEB_CMD` 覆盖)。用户自己 clone、安装
// Node/pnpm 并运行 install-windows.ps1 把 dsh 装进 PATH —— 壳只负责开窗口、
// 解析后端地址、退出时按进程树清理。
package main

import (
	"os"
	"strings"
)

// webCommandLine 返回启动 dsh web 后端的完整命令行。`{port}` 占位符会被
// 替换为实际端口(默认 "0",由 OS 分配);DSH_WEB_CMD 未设置时用 PATH 上的
// `dsh`(install-windows.ps1 安装的 dsh.cmd,或补丁后检出的 bin\dsh.cmd)。
func webCommandLine(port string) string {
	if cmd := os.Getenv("DSH_WEB_CMD"); cmd != "" {
		return strings.ReplaceAll(cmd, "{port}", port)
	}
	return "dsh web --port " + port
}

// parseCommandLine 把一行命令行拆成 argv:空白分隔,双引号内的空格保留,
// 引号本身被剥离。这是最小引号规则——覆盖 `dsh web --port 0` 与带空格的
// 可执行路径;更复杂的引号(嵌套/转义)请改用 cmd 包装形式(经 shell 启动)。
func parseCommandLine(line string) []string {
	var argv []string
	var cur strings.Builder
	inQuote := false
	flush := func() {
		if cur.Len() > 0 {
			argv = append(argv, cur.String())
			cur.Reset()
		}
	}
	for _, r := range line {
		switch r {
		case '"':
			inQuote = !inQuote
		case ' ', '\t':
			if !inQuote {
				flush()
			} else {
				cur.WriteRune(r)
			}
		default:
			cur.WriteRune(r)
		}
	}
	flush()
	return argv
}
