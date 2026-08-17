// 应用数据目录解析：%LOCALAPPDATA%\marisa-distro 是日志目录与解包后端的
// 公共父目录，托盘「打开数据目录」指向此处。
package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func appDataDir() (string, error) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home: %w", err)
		}
		local = filepath.Join(home, "AppData", "Local")
	}
	return filepath.Join(local, "marisa-distro"), nil
}
