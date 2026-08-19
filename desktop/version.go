// 后端版本与安装形态环境变量：壳进程把自身形态与后端版本注入进程环境，
// 后端子进程整体继承壳环境（server_windows.go 注释），后端内的插件（如
// dsh-update-check）直接读 MARISA_INSTALL_FORM / MARISA_VERSION。
//
// installForm 常量由各 build tag 文件定义：embeddedbundle=standalone、
// installedbundle=msi、dev 无 tag=dev。
package main

import (
	"os"
	"path/filepath"
	"strings"
)

// stripBackendVersion 把 VERSION 标记内容（marisa-backend-<version>[-dirty]）
// 归一化为纯版本号：剥离 marisa-backend- 前缀与 -dirty 后缀。
func stripBackendVersion(raw string) string {
	v := strings.TrimSpace(raw)
	v = strings.TrimPrefix(v, "marisa-backend-")
	return strings.TrimSuffix(v, "-dirty")
}

// readBackendVersionFile 读取后端目录下的 VERSION 标记文件并归一化。
func readBackendVersionFile(dir string) (string, error) {
	b, err := os.ReadFile(filepath.Join(dir, "VERSION"))
	if err != nil {
		return "", err
	}
	return stripBackendVersion(string(b)), nil
}

// backendVersion 返回后端版本号；dir 为空（dev 形态无后端）返回空串。
// embedded/installed 形态的 dir 就是 ensureBackend 落盘的 backend 目录，
// 其 VERSION 标记已由解包/安装流程写齐，无需再读 tar 或重解压。
func backendVersion(dir string) (string, error) {
	if dir == "" {
		return "", nil
	}
	return readBackendVersionFile(dir)
}

// injectBackendEnv 把安装形态与后端版本写入壳进程环境，供子进程继承。
func injectBackendEnv(form, version string) {
	os.Setenv("MARISA_INSTALL_FORM", form)
	os.Setenv("MARISA_VERSION", version)
}
