//go:build !windows

package main

// acquireSingleInstance 非 Windows 平台为 no-op：mac/linux 的 wails
// SingleInstance 在应用初始化早期生效，且没有解包竞态问题。
func acquireSingleInstance() (func(), error) {
	return func() {}, nil
}
