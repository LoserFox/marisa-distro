// 升级迁移机制（阶段 1：文件层框架）。
//
// 背景：历史上 Marisa 升级没有任何迁移代码——standalone 启动时
// ensureBackend() 发现 VERSION 不一致就静默删旧目录整体重解包，用户改过
// backend 目录内的文件（部署 profile、cordis.patch.yml 等）会被覆盖丢失，
// 数据格式变更也无兜底。方案见
// docs/RESEARCH-upgrade-migration-mechanism-20260822.md。
//
// 本文件实现：
//   - MIGRATIONS.json（新 bundle 根，与 VERSION 并列）解析：{from, to} 阶梯声明
//   - 阶梯选择：from 沿 to 逐级取链，跨多级升级按序执行
//   - scope:file 迁移：backup 级先把旧 backend 内 paths 归档到备份区再标记完成；
//     silent 级记录完成（具体动作由后续迁移项注入）
//   - scope:data 迁移：登记 pending 到 $DSH_HOME/migrations/state.json，并向进程
//     环境注入 MARISA_MIGRATIONS_FROM（后端子进程继承，数据层由后端执行）
//   - 失败安全：任一步失败返回错误，调用方保留旧 backend（不删、不切换）；
//     幂等：state.json 记录已完成 step，重试跳过
//
// 只在 embeddedbundle 形态被 ensureBackend 调用；dev 形态无 bundle 不触发。
// 本文件不设 build tag，任何形态都能编译（函数未被调用即无副作用）。
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// migrationFileName 是新 bundle 根（与 VERSION 并列）的迁移清单文件名。
const migrationFileName = "MIGRATIONS.json"

// migrationsEnvFrom 注入给后端子进程的环境变量：本次升级的起点版本。
// 存在 scope:data 待迁移步骤时才设置；后端据此执行数据层迁移。
const migrationsEnvFrom = "MARISA_MIGRATIONS_FROM"

// MigrationStep 是单个迁移步骤。
type MigrationStep struct {
	ID      string   `json:"id"`
	Scope   string   `json:"scope"`             // "file" | "data"
	Mode    string   `json:"mode"`              // "silent" | "backup" | "prompt"
	Summary string   `json:"summary,omitempty"` // 用户可见的迁移说明
	Detail  string   `json:"detail,omitempty"`
	Paths   []string `json:"paths,omitempty"`   // scope:file：相对旧 backend 根的路径
	Script  string   `json:"script,omitempty"`  // scope:data：相对新 bundle 根的脚本
}

// MigrationGroup 声明 from → to 这一级升级要执行的步骤。
type MigrationGroup struct {
	From  string          `json:"from"`
	To    string          `json:"to"`
	Steps []MigrationStep `json:"steps"`
}

// MigrationsFile 是 MIGRATIONS.json 的根结构。
type MigrationsFile struct {
	Migrations []MigrationGroup `json:"migrations"`
}

// migrationRecord 是 state.json 中一次 from→to 升级的记录。
type migrationRecord struct {
	From        string   `json:"from"`
	To          string   `json:"to"`
	RanAt       string   `json:"ranAt"`
	Completed   []string `json:"completed"`               // 已完成的 step id（跨启动去重）
	DataPending []string `json:"dataPending,omitempty"`   // 待后端执行的 scope:data step id
	BackupDir   string   `json:"backupDir,omitempty"`     // 本次备份区
	Skipped     bool     `json:"skipped,omitempty"`       // 无匹配清单，跳过
}

// loadMigrationsFile 解析 MIGRATIONS.json；文件不存在返回 (nil, nil)。
func loadMigrationsFile(path string) (*MigrationsFile, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// Windows Set-Content -Encoding utf8 会写 BOM，先剥离。
	data = []byte(strings.TrimPrefix(string(data), "\uFEFF"))
	var f MigrationsFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &f, nil
}

// selectMigrationChain 取 from → to 的阶梯迁移组，按 from 沿 to 逐级排序。
// 升级路径 = 从旧版本逐级执行到新版本；缺某一级（断链）返回 error，
// 调用方宁可保留旧版本也不执行不完整迁移。
func selectMigrationChain(f *MigrationsFile, from, to string) ([]MigrationGroup, error) {
	if f == nil || len(f.Migrations) == 0 {
		return nil, nil
	}
	byFrom := make(map[string]MigrationGroup, len(f.Migrations))
	for _, g := range f.Migrations {
		byFrom[g.From] = g
	}
	var chain []MigrationGroup
	cur := from
	seen := map[string]bool{from: true}
	for cur != to {
		g, ok := byFrom[cur]
		if !ok {
			if len(chain) == 0 {
				return nil, nil // 起点无迁移声明：不阻塞升级，调用方记录跳过
			}
			return nil, fmt.Errorf("migration chain breaks at %s (no group declaring from=%s)", cur, cur)
		}
		if seen[g.To] {
			return nil, fmt.Errorf("migration chain cycle at %s", g.To)
		}
		seen[g.To] = true
		chain = append(chain, g)
		cur = g.To
	}
	return chain, nil
}

// migrationsStatePath 是 $DSH_HOME/migrations/state.json。
func migrationsStatePath() (string, error) {
	home := os.Getenv("DSH_HOME")
	if strings.TrimSpace(home) == "" {
		ud, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		home = filepath.Join(ud, ".dsh")
	}
	return filepath.Join(home, "migrations", "state.json"), nil
}

// backupRootDir 是 %LOCALAPPDATA%\marisa-distro\backup-<from>-<to>。
func backupRootDir() (string, error) {
	local := os.Getenv("LOCALAPPDATA")
	if strings.TrimSpace(local) == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		local = filepath.Join(home, "AppData", "Local")
	}
	return filepath.Join(local, "marisa-distro", "backup"), nil
}

// readMigrationState 读现有 state.json（不存在返回空记录）。
func readMigrationState() (*migrationRecord, error) {
	path, err := migrationsStatePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &migrationRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	var rec migrationRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &rec, nil
}

// writeMigrationState 写 state.json（合并式：保留已完成步骤去重）。
func writeMigrationState(rec *migrationRecord) error {
	path, err := migrationsStatePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// copyPath 递归复制 src 到 dst（普通文件与目录，保留相对结构）。
func copyPath(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		data, err := os.ReadFile(src)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, data, info.Mode())
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, e := range entries {
		if err := copyPath(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

// archiveBackupPaths 把旧 backend 内的 paths 逐项归档到备份区（保留相对结构）。
// 源不存在的路径跳过（升级前可能已被清理）；目标已存在则覆盖，幂等可重试。
func archiveBackupPaths(oldDir, backupDir string, paths []string) error {
	for _, p := range paths {
		src := filepath.Join(oldDir, filepath.FromSlash(p))
		dst := filepath.Join(backupDir, filepath.FromSlash(p))
		if _, err := os.Stat(src); errors.Is(err, os.ErrNotExist) {
			log.Printf("migration: backup source missing, skip: %s", p)
			continue
		}
		if err := copyPath(src, dst); err != nil {
			return fmt.Errorf("backup %s: %w", p, err)
		}
		log.Printf("migration: backed up %s -> %s", src, dst)
	}
	return nil
}

// runUpgradeMigrations 是文件层迁移主入口，由 ensureBackend 在解包 staging
// 之后、删除旧 backend 之前调用。失败返回 error——调用方必须保留旧目录。
//
// oldDir：旧 backend 目录（迁移起点，只读归档）；newDir：新 bundle 解包后的
// staging 目录（读 MIGRATIONS.json）；from/to：纯版本号（已 strip 前缀）。
func runUpgradeMigrations(oldDir, newDir, from, to string) error {
	if from == "" || from == to {
		return nil // 旧 backend 无版本标记（首次安装）或同版本：无迁移可跑
	}
	migs, err := loadMigrationsFile(filepath.Join(newDir, migrationFileName))
	if err != nil {
		return err
	}
	if migs == nil {
		return nil // 新 bundle 未带迁移清单：保持历史行为（静默替换）
	}
	chain, err := selectMigrationChain(migs, from, to)
	if err != nil {
		return err
	}
	state, err := readMigrationState()
	if err != nil {
		return err
	}
	if chain == nil {
		// 起点无声明：不阻塞升级，记录跳过供人工介入。
		state.From, state.To, state.RanAt = from, to, time.Now().UTC().Format(time.RFC3339)
		state.Skipped = true
		if err := writeMigrationState(state); err != nil {
			return err
		}
		log.Printf("migration: no chain for %s -> %s, recorded skipped", from, to)
		return nil
	}

	state.From, state.To, state.RanAt = from, to, time.Now().UTC().Format(time.RFC3339)
	state.Skipped = false
	done := map[string]bool{}
	for _, id := range state.Completed {
		done[id] = true
	}
	hasData := false
	for _, group := range chain {
		for _, step := range group.Steps {
			if done[step.ID] {
				continue // 已完成，重试跳过（幂等）
			}
			switch step.Scope {
			case "file":
				switch step.Mode {
				case "silent":
					// 阶段 1：silent 文件层动作无内置实现，仅标记完成；
					// 具体动作由后续迁移项在归档之外注入。
					log.Printf("migration: file silent %s (%s -> %s)", step.ID, from, to)
				case "backup":
					backupDir, err := backupRootDir()
					if err != nil {
						return err
					}
					backupDir = filepath.Join(backupDir, from+"-"+to)
					if err := archiveBackupPaths(oldDir, backupDir, step.Paths); err != nil {
						return fmt.Errorf("migration step %s: %w", step.ID, err)
					}
					state.BackupDir = backupDir
				default:
					return fmt.Errorf("migration step %s: unsupported file mode %q", step.ID, step.Mode)
				}
			case "data":
				hasData = true
				state.DataPending = append(state.DataPending, step.ID)
				log.Printf("migration: data step %s queued for backend (env %s=%s)", step.ID, migrationsEnvFrom, from)
			default:
				return fmt.Errorf("migration step %s: unsupported scope %q", step.ID, step.Scope)
			}
			done[step.ID] = true
		}
	}
	state.Completed = nil
	for id := range done {
		state.Completed = append(state.Completed, id)
	}
	sort.Strings(state.Completed)
	if hasData {
		os.Setenv(migrationsEnvFrom, from)
		log.Printf("migration: MARISA_MIGRATIONS_FROM=%s injected for backend data migrations", from)
	}
	if err := writeMigrationState(state); err != nil {
		return err
	}
	log.Printf("migration: %s -> %s complete (%d steps)", from, to, len(state.Completed))
	return nil
}
