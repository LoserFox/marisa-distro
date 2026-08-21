// 更新数据守卫：替换 backend 目录前保护用户数据。
//
// 背景：launcher.cmd 把 DSH_HOME 设在 backend 目录内（%BUNDLE%.dsh），
// standalone 升级 / MSI 覆盖安装 / 卸载都会 RemoveAll 整个 backend 目录，
// 其中的会话记录、设置、记忆等数据随之一起删除（2026-08-21 两次事故）。
//
// 本文件提供：
//   - hasUserData：判断 backend\.dsh 是否含有真实用户数据（junction、空目录不算）
//   - backupDshData：把 backend\.dsh 整体复制到
//     %LOCALAPPDATA%\marisa-distro\backup\dsh-<from>-<ts>\（跳过 junction，
//     junction 指向 backend 内 node_modules 等部署物，不随用户数据备份；
//     新部署会自行重建），并写入 BACKUP-INFO.txt 说明来源与恢复方法
//   - guardUpdateData：删除旧 backend 前调用；平台相关 prompt（Windows 弹
//     确认框，见 update_guard_windows.go；其他平台自动备份），返回
//     dataKept/cancelled 供调用方决定是否继续替换
//
// 失败安全原则与迁移框架一致：任何备份失败都返回错误，调用方必须保留
// 旧 backend（不删、不切换）。
//
// 本文件不设 build tag，任何形态都能编译（函数未被调用即无副作用）。
package main

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// dshHomeDirName 是 backend 目录内 DSH_HOME 的目录名（launcher.cmd 的 %BUNDLE%.dsh）。
const dshHomeDirName = ".dsh"

// backupInfoName 是备份区内的说明文件名。
const backupInfoName = "BACKUP-INFO.txt"

// dshHomePath 返回 backendDir 内的 DSH_HOME 路径。
func dshHomePath(backendDir string) string {
	return filepath.Join(backendDir, dshHomeDirName)
}

// hasUserData 报告 dshHome 是否包含可备份的真实数据。junction（部署物共享）
// 与空目录不算用户数据；只要存在任意一个普通文件即视为有数据。
// 注意：Windows 上 os.ReadDir 的 DirEntry.Type() 不报告 junction 的 reparse
// 位（FindFirstFile 只给 FILE_ATTRIBUTE_DIRECTORY），必须用 os.Lstat 判定。
func hasUserData(dshHome string) (bool, error) {
	info, err := os.Stat(dshHome)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.IsDir() {
		return false, nil // 异常形态：按无可备份数据处理
	}
	found := false
	err = filepath.WalkDir(dshHome, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == dshHome {
			return nil
		}
		// junction / symlink 不是真实数据载体（Lstat 判定，见上）。
		if isJunction(path) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !d.IsDir() {
			found = true
			return fs.SkipAll
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	return found, nil
}

// isJunction 报告 path 是否为目录 junction / symlink（备份时跳过）。
// Windows 上 Go 只对「非目录 reparse point」设 ModeSymlink；目录型 junction
// （IO_REPARSE_TAG_MOUNT_POINT）的 Lstat 返回 ModeIrregular 且 IsDir()=false
// （2026-08-21 实测），因此两种位都要判。WalkDir 对这类条目不会递归进入
// （Type().IsDir() 为 false），跳过回调即可。
func isJunction(path string) bool {
	info, err := os.Lstat(path)
	if err != nil {
		return false
	}
	m := info.Mode()
	return m&os.ModeSymlink != 0 || m&os.ModeIrregular != 0
}

// backupDshData 把 backendDir\.dsh 复制到备份区（跳过 junction）。
// 无数据或 .dsh 不存在时返回 ("", nil)。返回备份目录的绝对路径。
func backupDshData(backendDir, from string) (string, error) {
	src := dshHomePath(backendDir)
	has, err := hasUserData(src)
	if err != nil {
		return "", err
	}
	if !has {
		log.Printf("update guard: no user data under %s, skipping backup", src)
		return "", nil
	}
	root, err := backupRootDir()
	if err != nil {
		return "", err
	}
	stamp := time.Now().Format("20060102-150405")
	if strings.TrimSpace(from) == "" {
		from = "unknown"
	}
	dst := filepath.Join(root, fmt.Sprintf("dsh-%s-%s", from, stamp))
	if err := copyDshTree(src, dst); err != nil {
		return "", fmt.Errorf("backup %s -> %s: %w", src, dst, err)
	}
	info := fmt.Sprintf(`Marisa DSH 数据备份（backend\.dsh）

来源目录 : %s
来源版本 : %s
备份时间 : %s

此备份包含升级/卸载前 backend\.dsh 中的全部用户数据
（会话记录 sessions/、工作区登记 storages/、设置 settings.yaml 等）。
目录 junction（profiles/marisa/node_modules 等部署共享链接）已跳过，
新部署会自行重建，不影响数据。

恢复方法：
  1. 完全退出 Marisa DSH；
  2. 把本目录内容整体复制回新部署的 %s；
  3. 重新启动 Marisa DSH。
`, src, from, time.Now().Format(time.RFC3339), dshHomePath(backendDir))
	if err := os.WriteFile(filepath.Join(dst, backupInfoName), []byte(info), 0o644); err != nil {
		return "", fmt.Errorf("write backup info: %w", err)
	}
	log.Printf("update guard: backed up %s -> %s", src, dst)
	return dst, nil
}

// copyDshTree 递归复制 src 目录树到 dst：junction 跳过（Lstat 判定，见
// hasUserData 注释），普通文件按原权限复制，空目录保留。
func copyDshTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if isJunction(path) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode())
	})
}

// guardUpdateData 在替换 backend 目录前保护用户数据。这是更新流程的统一
// 入口：standalone 升级时弹确认框（保留数据→备份 / 直接洗 / 取消）；
// MSI custom action 等非交互上下文经 platformUpdatePrompt 自动备份。
//
// 返回：
//   - dataKept：true 表示数据已备份或无需备份（可以安全替换）；
//     false 表示用户明确选择不保留数据（仍可替换）。
//   - cancelled：true 表示用户取消更新——调用方必须保留旧目录、终止流程。
//   - backupDir：非空时是本次备份的位置（供日志/提示）。
func guardUpdateData(backendDir, from, to string) (dataKept, cancelled bool, backupDir string, err error) {
	has, err := hasUserData(dshHomePath(backendDir))
	if err != nil {
		return false, false, "", err
	}
	if !has {
		return true, false, "", nil // 没有数据可丢：直接替换，无需询问
	}
	keep, cancel := platformUpdatePrompt(from, to)
	if cancel {
		return false, true, "", nil
	}
	if !keep {
		return false, false, "", nil
	}
	dir, err := backupDshData(backendDir, from)
	if err != nil {
		return false, false, "", err
	}
	return true, false, dir, nil
}
