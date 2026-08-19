// Dev desktop build (plain `go build`, no -tags embeddedbundle): nothing is
// embedded; the shell keeps its original behavior of launching the user's
// system dsh (PATH) or whatever DSH_WEB_CMD the environment provides.
//
//go:build !embeddedbundle && !installedbundle

package main

// installForm 是本构建的安装形态标记，随子进程环境注入后端（MARISA_INSTALL_FORM）。
// dev 形态：无内嵌后端，MARISA_VERSION 为空串，更新检查插件自动隐身。
const installForm = "dev"

// ensureBackend is a no-op in the dev build: returns ("", nil) so main keeps
// DSH_WEB_CMD untouched.
func ensureBackend() (string, error) {
	return "", nil
}

// backendWebCommand is unreachable in the dev build (ensureBackend never
// returns a dir), but must exist for main to compile.
func backendWebCommand(dir string) string {
	return ""
}

func handleBackendMaintenance() (bool, error) {
	return false, nil
}
