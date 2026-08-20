//go:build !embeddedbundle

// 急救「初始化源码」的非 embedded 形态：dev 构建无内嵌 bundle，
// installed 形态源码由 MSI 管理——统一标记为不可用，急救页禁用该项。
package main

// rescueSourceAvailable 报告当前形态能否从内置资源重新解包源码。
func rescueSourceAvailable() bool { return false }

// reinstallBackend 在无内嵌 bundle 的形态下不可用（dev：无源码可恢复；
// installed：走安装程序修复）。
func reinstallBackend() error { return errSourceUnavailable }
