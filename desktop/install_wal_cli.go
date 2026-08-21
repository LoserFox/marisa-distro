// 安装事务 WAL 的 CLI 子命令（`marisa-desktop.exe wal ...`），供 mygo 面板
// 等安装链路在安装前后调用：begin →（安装）→ seal →（下次启动）→ verifying
// → verify；失败路径 pending/rollback/retry。JSON 输出到 stdout，机器可读。
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
)

// handleWalCLI 在 main 最前面分派 `wal` 子命令；返回 true 表示已处理
// （调用方直接返回，不再进入 GUI 流程）。
func handleWalCLI() bool {
	if len(os.Args) < 2 || os.Args[1] != "wal" {
		return false
	}
	out, err := runWalCLI(os.Args[2:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "wal:", err)
		os.Exit(1)
	}
	if out != "" {
		fmt.Println(out)
	}
	return true
}

// runWalCLI 执行子命令并返回 JSON 输出（测试可直接调用）。
func runWalCLI(args []string) (string, error) {
	if len(args) == 0 {
		return "", fmt.Errorf("subcommand required: begin|seal|verifying|pending|verify|retry|rollback|status")
	}
	store, err := newWalStore()
	if err != nil {
		return "", err
	}
	cmd := args[0]
	fs := flag.NewFlagSet("wal "+cmd, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	var (
		profileDir   = fs.String("profile-dir", "", "profile 目录（begin 必填）")
		profileName  = fs.String("profile-name", "", "profile 名（begin 必填）")
		pkg          = fs.String("package", "", "包名（begin 必填）")
		version      = fs.String("version", "", "包版本")
		backendDir   = fs.String("backend-dir", "", "backend 目录（begin 可选，补 LINKS.json 保护）")
		files        = fs.String("files", "", "额外受保护文件（逗号分隔，追加到默认集合）")
		txid         = fs.String("tx", "", "事务 ID（seal/verifying/pending/verify/retry/rollback 必填）")
		reason       = fs.String("reason", "", "失败原因（pending/rollback 可选）")
	)
	if err := fs.Parse(args[1:]); err != nil {
		return "", err
	}
	switch cmd {
	case "begin":
		if *profileDir == "" || *profileName == "" || *pkg == "" {
			return "", fmt.Errorf("begin requires --profile-dir --profile-name --package")
		}
		protected := defaultWalProtectedFiles(*profileDir, *backendDir)
		for _, f := range splitCSV(*files) {
			protected = append(protected, f)
		}
		tx, err := store.begin(walBeginInput{
			ProfileDir:     *profileDir,
			ProfileName:    *profileName,
			PackageName:    *pkg,
			PackageVersion: *version,
			ProtectedFiles: protected,
		})
		if err != nil {
			return "", err
		}
		return marshalWal(tx)
	case "seal":
		return walTxResult(store, *txid, func(tx *walTransaction) (*walTransaction, error) {
			return store.seal(tx.TransactionID)
		})
	case "verifying":
		return walTxResult(store, *txid, func(tx *walTransaction) (*walTransaction, error) {
			return store.markVerifying(tx.TransactionID)
		})
	case "pending":
		return walTxResult(store, *txid, func(tx *walTransaction) (*walTransaction, error) {
			return store.markRecoveryPending(tx.TransactionID, walFailureReason(orDefault(*reason, string(walFailStartup))))
		})
	case "verify":
		return walTxResult(store, *txid, func(tx *walTransaction) (*walTransaction, error) {
			return store.verify(tx.TransactionID)
		})
	case "retry":
		return walTxResult(store, *txid, func(tx *walTransaction) (*walTransaction, error) {
			return store.requestRetry(tx.TransactionID)
		})
	case "rollback":
		tx, err := store.require(*txid)
		if err != nil {
			return "", err
		}
		result, err := store.rollback(tx.TransactionID, walFailureReason(orDefault(*reason, string(walFailRecovery))))
		if err != nil {
			return "", err
		}
		after, err := store.require(*txid) // 回滚后的终态阶段
		if err != nil {
			return "", err
		}
		out := struct {
			TransactionID   string   `json:"transactionId"`
			PackageName     string   `json:"packageName"`
			PackageVersion  string   `json:"packageVersion"`
			Phase           walPhase `json:"phase"`
			Status          string   `json:"status"`
			MismatchedFiles []string `json:"mismatchedFiles,omitempty"`
		}{
			TransactionID:   tx.TransactionID,
			PackageName:     tx.PackageName,
			PackageVersion:  tx.PackageVersion,
			Phase:           after.Phase,
			Status:          result.Status,
			MismatchedFiles: result.MismatchedFiles,
		}
		return marshalWal(out)
	case "status":
		tx, err := store.read()
		if err != nil {
			return "", err
		}
		if tx == nil {
			return "{}", nil
		}
		return marshalWal(tx)
	default:
		return "", fmt.Errorf("unknown subcommand %q", cmd)
	}
}

// walTxResult 执行一个以事务为输入/输出的子命令并输出 JSON。
func walTxResult(store *walStore, txid string, run func(tx *walTransaction) (*walTransaction, error)) (string, error) {
	if txid == "" {
		return "", fmt.Errorf("--tx required")
	}
	tx, err := store.require(txid)
	if err != nil {
		return "", err
	}
	next, err := run(tx)
	if err != nil {
		return "", err
	}
	return marshalWal(next)
}

// marshalWal 序列化事务/结果（紧凑 JSON，机器可读）。
func marshalWal(v any) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// splitCSV 拆分逗号分隔的额外文件列表（去空白、去空项）。
func splitCSV(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// orDefault 返回 s 非空时的值，否则返回 fallback。
func orDefault(s, fallback string) string {
	if s != "" {
		return s
	}
	return fallback
}
