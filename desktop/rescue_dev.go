//go:build !embeddedbundle && !installedbundle

// 急救的 dev 形态：无独立 backend 目录（用系统 dsh），急救不适用——
// 状态机仍可编译运行，但恢复动作会明确报错，页面也会显示源码恢复不可用。
package main

import "fmt"

// rescueBackendDir 在 dev 形态下无 backend 目录概念。
func rescueBackendDir() (string, error) {
	return "", fmt.Errorf("dev 构建使用系统 dsh，无独立 backend 目录")
}
