//go:build embeddedbundle

// 急救「初始化源码」的 embedded 实现：删除 backend 目录后复用 ensureBackend
// 的版本化解包路径（VERSION 缺失即重新解包内嵌 tar.zst），得到全新出厂树。
package main

import (
	"fmt"
	"os"
)

// rescueBackendDir 返回当前形态的 backend 目录（embedded：%LOCALAPPDATA%）。
func rescueBackendDir() (string, error) { return backendRootDir() }

// rescueSourceAvailable 报告当前形态能否从内置资源重新解包源码。
func rescueSourceAvailable() bool { return true }

// reinstallBackend 强制重装 backend：清掉整个目录（含残留 .extracting），
// 再走 ensureBackend 的原子发布流程。用户面（.dsh 运行时数据）是否保留由
// 调用方（rescueExecutor.run）在解包前后按勾选处理。
func reinstallBackend() error {
	dir, err := backendRootDir()
	if err != nil {
		return err
	}
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("删除现有 backend: %w", err)
	}
	if err := os.RemoveAll(dir + ".extracting"); err != nil {
		return fmt.Errorf("清理残留解包目录: %w", err)
	}
	if _, err := ensureBackend(); err != nil {
		return fmt.Errorf("重新解包内嵌 backend: %w", err)
	}
	return nil
}
