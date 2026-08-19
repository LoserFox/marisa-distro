// Windows 原生目录 junction 创建（替代 cmd /c mklink /J 的子进程开销）。
// MSI 安装 / standalone 首次解包要重建 ~1800 条 workspace 链接；逐条 spawn
// cmd.exe 是安装慢的主要来源之一。这里直接对 link 目录发
// FSCTL_SET_REPARSE_POINT，进程内完成，同样不需要管理员权限
// （junction 不是 symlink，不触发 UAC 要求）。
//
// REPARSE_DATA_BUFFER 的字段布局不手写：直接使用微软 go-winio 的
// EncodeReparsePoint（公开 API，Windows 生态内经过验证的实现），这里只
// 负责打开目录句柄、发出 FSCTL 并处理 inBufferSize 的 METHOD_BUFFERED
// 要求。
//
//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Microsoft/go-winio"
	"golang.org/x/sys/windows"
)

const (
	fsctlSetReparsePoint = 0x000900A4

	fileFlagOpenReparsePoint = 0x00200000 // FILE_FLAG_OPEN_REPARSE_POINT
	fileFlagBackupSemantics  = 0x02000000 // FILE_FLAG_BACKUP_SEMANTICS
)

// createJunction 在 link 处创建一个指向 target 的目录 junction。
// link 不存在时先建空目录（语义对齐 mklink /J）；target 必须是已存在的
// 绝对路径。幂等：link 已存在（无论是否已是 junction）时直接返回 nil。
func createJunction(link, target string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	created := false
	if _, err := os.Lstat(link); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Mkdir(link, 0o755); err != nil && !os.IsExist(err) {
		return err
	}
	created = true
	// 失败时回滚刚建的空目录：否则下次 recreateLinks 看到 link 已存在会
	// 跳过重建，junction 永久丢失且模块解析失败。
	defer func() {
		if created {
			_ = os.Remove(link)
		}
	}()

	absTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	// EncodeReparsePoint 生成完整的 REPARSE_DATA_BUFFER（mount-point 变体）：
	// substitute 用 \??\ 前缀的 NT 路径、print 用 Win32 路径，字段布局与其
	// DecodeReparsePoint 严格互逆。
	data := winio.EncodeReparsePoint(&winio.ReparsePoint{
		Target:       filepath.Clean(absTarget),
		IsMountPoint: true,
	})

	linkPtr, err := windows.UTF16PtrFromString(link)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(linkPtr,
		windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		fileFlagOpenReparsePoint|fileFlagBackupSemantics,
		0)
	if err != nil {
		return fmt.Errorf("open link dir %s: %w", link, err)
	}
	defer windows.CloseHandle(h)

	var returned uint32
	// METHOD_BUFFERED：inBufferSize 必须恰好等于 8 + ReparseDataLength；
	// 传更大的 buffer 会被 NTFS 以 ERROR_INVALID_REPARSE_DATA 拒绝
	// （2026-08-18 实测）。
	dataLen := binary.LittleEndian.Uint16(data[4:6])
	if err := windows.DeviceIoControl(h, fsctlSetReparsePoint,
		&data[0], uint32(8)+uint32(dataLen), nil, 0, &returned, nil); err != nil {
		return fmt.Errorf("set reparse point %s -> %s: %w", link, absTarget, err)
	}
	created = false // 成功：不再回滚
	return nil
}
