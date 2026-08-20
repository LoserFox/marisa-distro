//go:build installedbundle

// 急救的 installed 形态目录解析：backend 在 exe 旁的安装目录。
package main

// rescueBackendDir 返回当前形态的 backend 目录（installed：exe 旁 backend）。
func rescueBackendDir() (string, error) { return installedBackendDir() }
