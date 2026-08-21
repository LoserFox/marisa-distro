// 安装事务 WAL（移植上游 dsh-plugin-desktop install-recovery 概念到 Go 壳层）。
//
// 装插件/更新前把受保护声明文件快照到 profile 之外的备份目录，阶段机崩溃可
// 恢复；急救模式（及后续 CLI/页面动作面）可回滚或授权单次重试。受保护文件
// 由调用方显式传入（marisa 默认集合见 defaultWalProtectedFiles），快照只记
// sha256 镜像，不持久化 profile 路径本身（只记 profile 目录哈希）。
//
// 阶段机：prepared → awaiting-restart → verifying → recovery-pending
//          → retry-requested → verified | rolled-back | manual-recovery-required
// 回滚判定：当前文件与封存 after 镜像（或未封存时的无条件）一致才覆盖还原；
// 与 before/after 都不一致视为事务外改动，拒绝覆盖（manual-recovery-required）。
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

const (
	walStateVersion  = 1
	walStateDirName  = "plugin-install-recovery"
	walStateFileName = "state.json"
	walStateDirMode  = 0o700
	walStateFileMode = 0o600
	// walMaxStateBytes 限制 state.json 大小（防损坏文件撑爆内存）。
	walMaxStateBytes = 64 << 10
	// walTxIDBytes 事务 ID 熵：32 字节随机 hex = 64 字符。
	walTxIDBytes = 32
)

// walTxIDPattern 校验持久化事务 ID（读入时防注入/损坏）。
var walTxIDPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// walPhase 是事务阶段。
type walPhase string

const (
	walPrepared            walPhase = "prepared"
	walAwaitingRestart     walPhase = "awaiting-restart"
	walVerifying           walPhase = "verifying"
	walRecoveryPending     walPhase = "recovery-pending"
	walRetryRequested      walPhase = "retry-requested"
	walVerified            walPhase = "verified"
	walRolledBack          walPhase = "rolled-back"
	walManualRecoveryRequired walPhase = "manual-recovery-required"
)

// walPhaseTerminal 报告阶段是否为终态（此后可被新事务覆盖）。
func walPhaseTerminal(p walPhase) bool {
	return p == walVerified || p == walRolledBack || p == walManualRecoveryRequired
}

// walFailureReason 记录失败原因（展示用；不参与阶段判定）。
type walFailureReason string

const (
	walFailInstall           walFailureReason = "install-failed"
	walFailInterrupted       walFailureReason = "interrupted-install"
	walFailStartup           walFailureReason = "startup-failed"
	walFailStartupUnconfirmed walFailureReason = "startup-unconfirmed"
	walFailRecovery          walFailureReason = "recovery-failed"
)

// walFileImage 是单个受保护文件的哈希镜像；Present=false 表示安装前不存在。
type walFileImage struct {
	Present bool   `json:"present"`
	SHA256  string `json:"sha256,omitempty"`
	Size    int64  `json:"size,omitempty"`
	Mode    uint32 `json:"mode,omitempty"`
	// BackupFile 是备份目录内的叶名（<index>.bin），快照存在时非空。
	BackupFile string `json:"backupFile,omitempty"`
}

// walFileRecord 是受保护文件安装前（Before）与安装后（After）的镜像。
type walFileRecord struct {
	Path   string       `json:"path"`
	Before walFileImage `json:"before"`
	// After 在 seal 时封存；nil 表示安装未完成封存（回滚时无条件还原）。
	After *walFileImage `json:"after,omitempty"`
}

// walTransaction 是持久化的单一安装事务。
type walTransaction struct {
	Version         int             `json:"version"`
	TransactionID   string          `json:"transactionId"`
	ProfileName     string          `json:"profileName"`
	ProfileIdentity string          `json:"profileIdentity"`
	PackageName     string          `json:"packageName"`
	PackageVersion  string          `json:"packageVersion"`
	CreatedAt       time.Time       `json:"createdAt"`
	Phase           walPhase        `json:"phase"`
	FailureReason   walFailureReason `json:"failureReason,omitempty"`
	Files           []walFileRecord `json:"files"`
	SealedAt        *time.Time      `json:"sealedAt,omitempty"`
	VerifiedAt      *time.Time      `json:"verifiedAt,omitempty"`
	RestoredAt      *time.Time      `json:"restoredAt,omitempty"`
	RetryAt         *time.Time      `json:"retryAt,omitempty"`
}

// walRollbackResult 是一次回滚的结果（供急救页展示）。
type walRollbackResult struct {
	Status string // "restored" | "already-restored" | "manual-recovery-required"
	// MismatchedFiles 是 manual 情形下被拒绝覆盖的文件（事务外改动）。
	MismatchedFiles []string `json:"mismatchedFiles,omitempty"`
}

// walStore 是 WAL 的存储（目录在 profile 之外，急救恢复不会清到它）。
type walStore struct {
	dir string
}

// newWalStore 组装生产实例：%LOCALAPPDATA%\marisa-distro\state\plugin-install-recovery。
// MARISA_WAL_STATE_DIR 可覆盖状态目录（测试与隔离环境用）。
func newWalStore() (*walStore, error) {
	if dir := os.Getenv("MARISA_WAL_STATE_DIR"); dir != "" {
		return &walStore{dir: dir}, nil
	}
	data, err := appDataDir()
	if err != nil {
		return nil, err
	}
	return &walStore{dir: filepath.Join(data, "state", walStateDirName)}, nil
}

// newWalStoreAt 组装指向显式目录的实例（测试与 CLI 用）。
func newWalStoreAt(dir string) *walStore {
	return &walStore{dir: dir}
}

func (s *walStore) statePath() string     { return filepath.Join(s.dir, walStateFileName) }
func (s *walStore) backupsDir(txid string) string {
	return filepath.Join(s.dir, "backups", txid)
}

// read 读取当前事务；无事务返回 (nil, nil)；损坏/超限返回错误（调用方
// 按无事务处理或报错，取决于场景）。
func (s *walStore) read() (*walTransaction, error) {
	data, err := os.ReadFile(s.statePath())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) > walMaxStateBytes {
		return nil, fmt.Errorf("wal: state file too large (%d bytes)", len(data))
	}
	var tx walTransaction
	if err := json.Unmarshal(data, &tx); err != nil {
		return nil, fmt.Errorf("wal: parse state: %w", err)
	}
	if tx.Version != walStateVersion || !walTxIDPattern.MatchString(tx.TransactionID) {
		return nil, fmt.Errorf("wal: invalid state (version=%d)", tx.Version)
	}
	return &tx, nil
}

// require 读取并校验事务 ID；不匹配返回错误。
func (s *walStore) require(txid string) (*walTransaction, error) {
	tx, err := s.read()
	if err != nil {
		return nil, err
	}
	if tx == nil || tx.TransactionID != txid {
		return nil, fmt.Errorf("wal: transaction %s not found", txid)
	}
	return tx, nil
}

// write 原子写 state.json（临时文件 + rename）。
func (s *walStore) write(tx *walTransaction) error {
	if err := os.MkdirAll(s.dir, walStateDirMode); err != nil {
		return err
	}
	data, err := json.MarshalIndent(tx, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.statePath() + ".tmp"
	if err := os.WriteFile(tmp, data, walStateFileMode); err != nil {
		return err
	}
	return os.Rename(tmp, s.statePath())
}

// defaultWalProtectedFiles 返回 marisa 安装事务的默认受保护声明文件：
// profile 的 package.json（bundles 声明）与 cordis.patch.yml（用户层受管
// 块），以及 backend 的 LINKS.json（launcher 插件 junction 清单；junction
// 本身可由 recreateLinks 从清单重建）。backendDir 为空（未知形态）时只
// 保护 profile 级文件。
func defaultWalProtectedFiles(profileDir, backendDir string) []string {
	files := []string{
		filepath.Join(profileDir, "package.json"),
		filepath.Join(profileDir, "cordis.patch.yml"),
	}
	if backendDir != "" {
		files = append(files, filepath.Join(backendDir, "LINKS.json"))
	}
	return files
}

// profileIdentity 是 profile 目录的 sha256（路径本身不持久化）。
func profileIdentity(profileDir string) string {
	sum := sha256.Sum256([]byte(filepath.Clean(profileDir)))
	return hex.EncodeToString(sum[:])
}

// hashFile 计算文件 sha256 与大小。
func hashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// snapshotFile 生成文件镜像并把存在文件复制到备份目录（叶名 <name>.bin）。
func snapshotFile(path, backupRoot, name string) (walFileImage, error) {
	fi, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return walFileImage{Present: false}, nil
	}
	if err != nil {
		return walFileImage{}, err
	}
	if !fi.Mode().IsRegular() {
		return walFileImage{}, fmt.Errorf("not a regular file")
	}
	sum, size, err := hashFile(path)
	if err != nil {
		return walFileImage{}, err
	}
	backupFile := name + ".bin"
	src, err := os.Open(path)
	if err != nil {
		return walFileImage{}, err
	}
	defer src.Close()
	dst, err := os.OpenFile(filepath.Join(backupRoot, backupFile),
		os.O_CREATE|os.O_WRONLY|os.O_TRUNC, walStateFileMode)
	if err != nil {
		return walFileImage{}, err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return walFileImage{}, err
	}
	return walFileImage{
		Present:    true,
		SHA256:     sum,
		Size:       size,
		Mode:       uint32(fi.Mode().Perm()),
		BackupFile: backupFile,
	}, nil
}

// currentImage 只计算当前镜像（不落备份），用于回滚判定与封存。
func currentImage(path string) (walFileImage, error) {
	fi, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return walFileImage{Present: false}, nil
	}
	if err != nil {
		return walFileImage{}, err
	}
	if !fi.Mode().IsRegular() {
		return walFileImage{}, fmt.Errorf("not a regular file")
	}
	sum, size, err := hashFile(path)
	if err != nil {
		return walFileImage{}, err
	}
	return walFileImage{Present: true, SHA256: sum, Size: size, Mode: uint32(fi.Mode().Perm())}, nil
}

// walBeginInput 是 begin 的参数。
type walBeginInput struct {
	ProfileDir     string
	ProfileName    string
	PackageName    string
	PackageVersion string
	ProtectedFiles []string
}

// begin 开启新事务：快照受保护文件 → 写 state.json（prepared）。已有活动
// 事务时拒绝（先回滚或验证）。
func (s *walStore) begin(in walBeginInput) (*walTransaction, error) {
	if in.ProfileDir == "" {
		return nil, errors.New("wal: profile dir required")
	}
	if in.ProfileName == "" {
		return nil, errors.New("wal: profile name required")
	}
	if in.PackageName == "" {
		return nil, errors.New("wal: package name required")
	}
	if len(in.ProtectedFiles) == 0 {
		return nil, errors.New("wal: no protected files")
	}
	existing, err := s.read()
	if err != nil {
		return nil, err
	}
	if existing != nil && !walPhaseTerminal(existing.Phase) {
		return nil, fmt.Errorf("wal: an install transaction is already %s; rollback or verify it first", existing.Phase)
	}

	txidBytes := make([]byte, walTxIDBytes)
	if _, err := rand.Read(txidBytes); err != nil {
		return nil, fmt.Errorf("wal: generate transaction id: %w", err)
	}
	tx := &walTransaction{
		Version:         walStateVersion,
		TransactionID:   hex.EncodeToString(txidBytes),
		ProfileName:     in.ProfileName,
		ProfileIdentity: profileIdentity(in.ProfileDir),
		PackageName:     in.PackageName,
		PackageVersion:  in.PackageVersion,
		CreatedAt:       time.Now().UTC(),
		Phase:           walPrepared,
	}
	backupRoot := s.backupsDir(tx.TransactionID)
	if err := os.MkdirAll(backupRoot, walStateDirMode); err != nil {
		return nil, fmt.Errorf("wal: create backup dir: %w", err)
	}
	for i, path := range in.ProtectedFiles {
		img, err := snapshotFile(path, backupRoot, fmt.Sprintf("%02d", i))
		if err != nil {
			return nil, fmt.Errorf("wal: snapshot %s: %w", path, err)
		}
		tx.Files = append(tx.Files, walFileRecord{Path: path, Before: img})
	}
	if err := s.write(tx); err != nil {
		return nil, fmt.Errorf("wal: write state: %w", err)
	}
	log.Printf("wal: begin tx=%s pkg=%s@%s files=%d", tx.TransactionID, in.PackageName, in.PackageVersion, len(tx.Files))
	return tx, nil
}

// seal 在安装完成后封存 after 镜像：prepared → awaiting-restart。
func (s *walStore) seal(txid string) (*walTransaction, error) {
	tx, err := s.require(txid)
	if err != nil {
		return nil, err
	}
	if tx.Phase != walPrepared {
		return nil, fmt.Errorf("wal: seal requires prepared, current %s", tx.Phase)
	}
	now := time.Now().UTC()
	tx.SealedAt = &now
	for i := range tx.Files {
		img, err := currentImage(tx.Files[i].Path)
		if err != nil {
			return nil, fmt.Errorf("wal: seal %s: %w", tx.Files[i].Path, err)
		}
		tx.Files[i].After = &img
	}
	tx.Phase = walAwaitingRestart
	if err := s.write(tx); err != nil {
		return nil, err
	}
	log.Printf("wal: seal tx=%s → awaiting-restart", txid)
	return tx, nil
}

// markVerifying 在下次启动开始验证：awaiting-restart / retry-requested
// → verifying（retry-requested 即授权重试后的首次启动）。
func (s *walStore) markVerifying(txid string) (*walTransaction, error) {
	tx, err := s.require(txid)
	if err != nil {
		return nil, err
	}
	if tx.Phase != walAwaitingRestart && tx.Phase != walRetryRequested {
		return nil, fmt.Errorf("wal: verifying requires awaiting-restart/retry-requested, current %s", tx.Phase)
	}
	tx.Phase = walVerifying
	if err := s.write(tx); err != nil {
		return nil, err
	}
	log.Printf("wal: verifying tx=%s", txid)
	return tx, nil
}

// markRecoveryPending 在启动失败/安装中断时进入待恢复：
// prepared/awaiting-restart/verifying → recovery-pending（记录失败原因）。
// prepared 接受：begin 后未 seal 即崩溃（中断安装）也必须在下次启动可回滚。
func (s *walStore) markRecoveryPending(txid string, reason walFailureReason) (*walTransaction, error) {
	tx, err := s.require(txid)
	if err != nil {
		return nil, err
	}
	if tx.Phase != walPrepared && tx.Phase != walAwaitingRestart && tx.Phase != walVerifying {
		return nil, fmt.Errorf("wal: recovery-pending requires prepared/awaiting-restart/verifying, current %s", tx.Phase)
	}
	tx.Phase = walRecoveryPending
	if reason != "" {
		tx.FailureReason = reason
	}
	if err := s.write(tx); err != nil {
		return nil, err
	}
	log.Printf("wal: recovery-pending tx=%s reason=%s", txid, reason)
	return tx, nil
}

// verify 在启动健康确认后清事务：verifying → verified（删除备份目录）。
func (s *walStore) verify(txid string) (*walTransaction, error) {
	tx, err := s.require(txid)
	if err != nil {
		return nil, err
	}
	if tx.Phase != walVerifying {
		return nil, fmt.Errorf("wal: verify requires verifying, current %s", tx.Phase)
	}
	now := time.Now().UTC()
	tx.VerifiedAt = &now
	tx.Phase = walVerified
	if err := s.write(tx); err != nil {
		return nil, err
	}
	_ = os.RemoveAll(s.backupsDir(txid))
	log.Printf("wal: verified tx=%s（备份已清理）", txid)
	return tx, nil
}

// requestRetry 授权单次重试：recovery-pending → retry-requested。
func (s *walStore) requestRetry(txid string) (*walTransaction, error) {
	tx, err := s.require(txid)
	if err != nil {
		return nil, err
	}
	if tx.Phase != walRecoveryPending {
		return nil, fmt.Errorf("wal: retry requires recovery-pending, current %s", tx.Phase)
	}
	now := time.Now().UTC()
	tx.RetryAt = &now
	tx.Phase = walRetryRequested
	if err := s.write(tx); err != nil {
		return nil, err
	}
	log.Printf("wal: retry-requested tx=%s", txid)
	return tx, nil
}

// rollback 回滚事务：恢复受保护文件到安装前状态。当前文件与封存 after
// 一致（或未封存）才覆盖还原；与 before/after 都不一致 → 拒绝覆盖该文件
// （manual-recovery-required）。
func (s *walStore) rollback(txid string, reason walFailureReason) (walRollbackResult, error) {
	tx, err := s.require(txid)
	if err != nil {
		return walRollbackResult{}, err
	}
	if walPhaseTerminal(tx.Phase) {
		return walRollbackResult{}, fmt.Errorf("wal: cannot rollback terminal phase %s", tx.Phase)
	}
	var result walRollbackResult
	backupRoot := s.backupsDir(txid)
	now := time.Now().UTC()
	for i := range tx.Files {
		rec := &tx.Files[i]
		current, err := currentImage(rec.Path)
		if err != nil {
			return result, fmt.Errorf("wal: inspect %s: %w", rec.Path, err)
		}
		if !rec.Before.Present {
			// 安装前不存在：现在存在即视为安装产物，删掉。
			if current.Present {
				if err := os.Remove(rec.Path); err != nil {
					return result, fmt.Errorf("wal: remove %s: %w", rec.Path, err)
				}
			}
			continue
		}
		if !current.Present {
			// 文件被安装流程删除：从备份还原。
			if err := restoreFromBackup(rec, backupRoot); err != nil {
				return result, fmt.Errorf("wal: restore %s: %w", rec.Path, err)
			}
			continue
		}
		if rec.After != nil && current.SHA256 != rec.After.SHA256 && current.SHA256 != rec.Before.SHA256 {
			// 事务外改动：不覆盖。
			result.MismatchedFiles = append(result.MismatchedFiles, rec.Path)
			continue
		}
		if current.SHA256 == rec.Before.SHA256 {
			continue // 已是安装前状态
		}
		if err := restoreFromBackup(rec, backupRoot); err != nil {
			return result, fmt.Errorf("wal: restore %s: %w", rec.Path, err)
		}
	}
	tx.RestoredAt = &now
	if len(result.MismatchedFiles) > 0 {
		tx.Phase = walManualRecoveryRequired
		result.Status = "manual-recovery-required"
	} else {
		tx.Phase = walRolledBack
		result.Status = "restored"
	}
	if reason != "" {
		tx.FailureReason = reason
	}
	if err := s.write(tx); err != nil {
		return result, err
	}
	log.Printf("wal: rollback tx=%s → %s (mismatch=%d)", txid, tx.Phase, len(result.MismatchedFiles))
	return result, nil
}

// restoreFromBackup 从备份副本还原文件（内容 + 权限）。
func restoreFromBackup(rec *walFileRecord, backupRoot string) error {
	if rec.Before.BackupFile == "" {
		return fmt.Errorf("no backup copy recorded")
	}
	src, err := os.Open(filepath.Join(backupRoot, rec.Before.BackupFile))
	if err != nil {
		return err
	}
	defer src.Close()
	if err := os.MkdirAll(filepath.Dir(rec.Path), 0o755); err != nil {
		return err
	}
	dst, err := os.OpenFile(rec.Path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(rec.Before.Mode))
	if err != nil {
		return err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return nil
}
