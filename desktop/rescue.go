// 急救模式的恢复执行器：备份现场（整个 backend 目录 rename 到 backups/
// 下，原子且 junction 自洽）→ 按勾选重新解包源码 / 重置用户配置。
//
// 执行器目录参数化，便于用临时目录做矩阵单测；生产实例由
// newRescueExecutor 组装（backend 目录 + 备份根 + 重新解包函数）。
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

// rescueRequest 是急救页 POST /api/rescue 的载荷：三个动作可独立勾选。
type rescueRequest struct {
	Backup      bool `json:"backup"`
	ResetConfig bool `json:"resetConfig"`
	ResetSource bool `json:"resetSource"`
}

// errSourceUnavailable 是无内嵌 bundle 形态下「初始化源码」的统一失败原因
// （rescue_stub.go 返回它；测试断言文案）。
var errSourceUnavailable = fmt.Errorf("当前安装形态不支持从内置资源恢复源码，请通过安装程序修复")

// rescueExecutor 执行一次急救动作序列。
type rescueExecutor struct {
	backendDir  string
	backupsRoot string
	// reinstall 重新解包源码（embeddedbundle 用内嵌 tar；其他形态不可用）。
	reinstall func() error
	// reinstallAvailable 报告当前形态能否重新解包源码（急救页据此禁用勾选项）。
	reinstallAvailable func() bool
}

// newRescueExecutor 组装生产实例（backend 目录 + 备份根 + 形态相关解包）。
func newRescueExecutor() *rescueExecutor {
	dir, err := rescueBackendDir()
	if err != nil {
		dir = ""
	}
	root, err := backupsRootDir()
	if err != nil {
		root = ""
	}
	return &rescueExecutor{
		backendDir:         dir,
		backupsRoot:        root,
		reinstall:          reinstallBackend,
		reinstallAvailable: rescueSourceAvailable,
	}
}

// backupsRootDir 返回备份根目录（backend 树之外，恢复/重解包不会清到它）。
func backupsRootDir() (string, error) {
	data, err := appDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(data, "backups"), nil
}

// userConfigRel 是 .dsh 下属于用户配置面（非 bundle 出厂内容）的路径。
// 「初始化配置」重置它们；bundle 出厂文件（profiles/*/package.json、
// cordis.yml、desktop.overlay.yml 等）不在列表内。
var userConfigRel = []string{
	"sessions",
	"storages",
	"cache",
	"settings.yaml",
	".credentials.yaml",
	".anonymous-user-id",
	"mygo-self.json",
}

// run 执行急救动作。backupDir 非空表示现场已备份到该目录（供页面展示
// 「打开备份目录」）；错误时现场可能已被移动，返回的部分结果仍有意义。
func (e *rescueExecutor) run(req rescueRequest) (backupDir string, err error) {
	if e.backendDir == "" {
		return "", fmt.Errorf("backend 目录不可用")
	}
	if e.backupsRoot == "" {
		return "", fmt.Errorf("备份目录不可用")
	}
	if !req.Backup && !req.ResetConfig && !req.ResetSource {
		return "", fmt.Errorf("请至少勾选一项初始化动作")
	}
	dir := e.backendDir

	if req.Backup {
		ts := time.Now().Format("20060102-150405")
		backupDir = filepath.Join(e.backupsRoot, ts)
		target := filepath.Join(backupDir, "backend")
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			return "", fmt.Errorf("创建备份目录: %w", err)
		}
		if err := os.Rename(dir, target); err != nil {
			return backupDir, fmt.Errorf("备份失败（backend 目录可能被占用，请先退出后重试）: %w", err)
		}
		if err := writeBackupInfo(backupDir, dir); err != nil {
			log.Printf("rescue: write backup info: %v", err)
		}
		log.Printf("rescue: 现场已备份到 %s", target)
	}

	switch {
	case req.ResetSource:
		if err := e.reinstall(); err != nil {
			return backupDir, fmt.Errorf("重新解包源码失败: %w", err)
		}
		// 只重装源码、保留配置：把备份里的用户配置面搬回新树。
		if req.Backup && !req.ResetConfig {
			fromDsh := filepath.Join(backupDir, "backend", ".dsh")
			if err := restoreUserConfig(fromDsh, filepath.Join(dir, ".dsh")); err != nil {
				return backupDir, fmt.Errorf("还原用户配置失败: %w", err)
			}
		}
	case req.Backup:
		// 未勾选源码重置但已备份：现场必须还原，否则 backend 目录缺失。
		if err := os.Rename(filepath.Join(backupDir, "backend"), dir); err != nil {
			return backupDir, fmt.Errorf("还原现场失败: %w", err)
		}
		_ = os.Remove(backupDir) // 空目录清理；保留失败无碍
		backupDir = ""
	}

	if req.ResetConfig {
		if err := resetUserConfig(dir); err != nil {
			return backupDir, err
		}
	}
	return backupDir, nil
}

// resetUserConfig 清空 .dsh 下的用户配置面（含会话/存储/设置/凭据/profile
// 用户层），保留 bundle 出厂文件。重新解包后的新树调用它幂等（无用户面）。
func resetUserConfig(dir string) error {
	dsh := filepath.Join(dir, ".dsh")
	for _, rel := range userConfigRel {
		p := filepath.Join(dsh, rel)
		if err := os.RemoveAll(p); err != nil {
			return fmt.Errorf("重置 %s: %w", rel, err)
		}
	}
	// profile 用户层 cordis.patch.yml：bundle 出厂不含此文件，存在即用户层。
	profiles, err := os.ReadDir(filepath.Join(dsh, "profiles"))
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("枚举 profiles: %w", err)
	}
	for _, pr := range profiles {
		if !pr.IsDir() {
			continue
		}
		up := filepath.Join(dsh, "profiles", pr.Name(), "cordis.patch.yml")
		if err := os.Remove(up); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("重置 %s: %w", up, err)
		}
	}
	log.Printf("rescue: 用户配置已重置（sessions/storages/settings/凭据/profile 用户层）")
	return nil
}

// restoreUserConfig 把备份 .dsh 里的用户配置面搬回新解包的树（「只重装
// 源码、保留配置」场景）。出厂文件（package.json/overlays/cordis.yml）不搬，
// 用新树的出厂版本。
func restoreUserConfig(fromDsh, toDsh string) error {
	for _, rel := range userConfigRel {
		src := filepath.Join(fromDsh, rel)
		if _, err := os.Lstat(src); err != nil {
			continue
		}
		dst := filepath.Join(toDsh, rel)
		if err := os.RemoveAll(dst); err != nil {
			return fmt.Errorf("覆盖 %s: %w", rel, err)
		}
		if err := os.Rename(src, dst); err != nil {
			return fmt.Errorf("搬回 %s: %w", rel, err)
		}
	}
	// profile 用户层 cordis.patch.yml：同样搬回。
	profiles, err := os.ReadDir(filepath.Join(fromDsh, "profiles"))
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("枚举备份 profiles: %w", err)
	}
	for _, pr := range profiles {
		if !pr.IsDir() {
			continue
		}
		src := filepath.Join(fromDsh, "profiles", pr.Name(), "cordis.patch.yml")
		if _, err := os.Lstat(src); err != nil {
			continue
		}
		dst := filepath.Join(toDsh, "profiles", pr.Name(), "cordis.patch.yml")
		if err := os.RemoveAll(dst); err != nil {
			return fmt.Errorf("覆盖 profile 用户层 %s: %w", pr.Name(), err)
		}
		if err := os.Rename(src, dst); err != nil {
			return fmt.Errorf("搬回 profile 用户层 %s: %w", pr.Name(), err)
		}
	}
	return nil
}

// writeBackupInfo 在备份目录写入现场信息（backend 版本 + 备份时间）。
func writeBackupInfo(backupDir, backendDir string) error {
	info := map[string]string{
		"backedUpAt": time.Now().Format(time.RFC3339),
	}
	if v, err := readBackendVersionFile(backendDir); err == nil {
		info["backendVersion"] = v
	}
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(backupDir, "info.json"), data, 0o600)
}
