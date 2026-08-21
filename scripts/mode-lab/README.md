# Marisa 恢复模式演练（mode-lab）

配套板子（release 产物）使用的破坏/修复脚本，用于测试桌面壳的三种恢复模式：

| 模式 | 触发方式 | 表现 | 对应脚本场景 |
|------|----------|------|--------------|
| **修复模式** | 启动自愈 / WAL 回滚 | 启动时自动重建 junction、版本不匹配自动重解包（先备份数据）、`wal rollback` 回写受保护文件 | 1、2、3、6、7 |
| **安全模式** | 连续 2 次启动失败自动降级；`--minimal` / `MARISA_BOOT_PROFILE=web` 强制 | 基础界面：harness 自带 base+web-app，零 Marisa 定制插件 | 4、5 |
| **急救模式** | 自动降级（minimal 再失败 2 次）；`--rescue` 强制；持久化 rescue 状态 | 壳层自带急救页（127.0.0.1 随机端口 + token），插件级禁用/启用、恢复动作、日志/备份直达 | 6、7、8 |

## 快速开始

```powershell
# 1. 先体检安装（确认基线健康）
pwsh scripts/mode-lab/repair-modes.ps1 -Verify

# 2. 查看破坏场景清单
pwsh scripts/mode-lab/break-modes.ps1 -List

# 3. 选一个场景破坏（例如场景 2：删 junction → 测修复模式自愈）
pwsh scripts/mode-lab/break-modes.ps1 -Scenario 2 -InstallRoot $env:LOCALAPPDATA\marisa-distro

# 4. 按场景输出启动应用，观察预期行为
#    （安全模式：& <exe> --minimal   急救模式：& <exe> --rescue）

# 5. 修复
pwsh scripts/mode-lab/repair-modes.ps1 -Restore 2
pwsh scripts/mode-lab/repair-modes.ps1 -Verify
```

## 场景明细

| # | 破坏内容 | 目标模式 | 预期行为 | 修复 |
|---|----------|----------|----------|------|
| 1 | 损坏 `backend\LINKS.json` | 修复 | 启动失败 → minimal → 急救页 | `-Restore 1` |
| 2 | 删除 LINKS.json 记录的一个 junction | 修复 | 下次启动自动重建（自愈） | 重启即可，`-Verify` 确认 |
| 3 | WAL 演练：begin → 损坏 profile package.json → pending | 修复 | 事务处于 recovery-pending，回滚恢复三文件 | `-WalRollback <txid>`（需 `-AppExe`） |
| 4 | 损坏 `bundles\marisa-bundle\package.json` | 安全 | normal 失败 ×2 → minimal 基础界面 | `-Restore 4` |
| 5 | 损坏 profile `cordis.patch.yml` | 安全 | 同上 | `-Restore 5` |
| 6 | 删除部署树 junction `backend\marisa-distro` | 修复/急救 | 挂载失败 → 降级 → 急救页 | `-Reextract`（提取器自愈）或 `-RebuildJunction` |
| 7 | 篡改 `backend\VERSION` | 修复 | 版本不匹配 → update_guard 先备份 `.dsh` → 整树重解包 | 重启即可，`-Verify` 确认备份存在 |
| 8 | 写入持久化急救状态 | 急救 | 每次启动直接进急救页 | `-ClearRescueState` 或急救页「重试完整模式」 |

## 安全机制

- **快照先行**：每个场景动手前，被破坏文件原样复制到 `<InstallRoot>\.mode-lab\snap-<ts>\`，
  演练清单写在 `manifest.json`，`-Restore` 按清单回拷。
- **绝不触碰** `backend\.dsh`（用户会话数据）。场景 7 恰好演示的是数据备份守卫（update_guard）。
- `-WhatIf` 演练模式：只打印不执行。
- 破坏前检测正在运行的 Marisa 进程并警告。
- 场景 3 的 WAL 事务使用真实 WAL 存储（`%LOCALAPPDATA%\marisa-distro\state\plugin-install-recovery`），
  回滚由桌面壳的 `wal` 子命令完成（GUI 构建需 `MARISA_CONSOLE=1` 捕获 stdout，脚本已处理）。

## 手动入口速查

```powershell
# 安全模式（基础界面）
& Marisa-DSH-windows-x64-standalone.exe --minimal
$env:MARISA_BOOT_PROFILE = 'web'; & Marisa-DSH-windows-x64-standalone.exe

# 急救模式
& Marisa-DSH-windows-x64-standalone.exe --rescue

# WAL 状态查看 / 回滚
& Marisa-DSH-windows-x64-standalone.exe wal status
& Marisa-DSH-windows-x64-standalone.exe wal rollback --tx <txid>

# MSI 修复（installed 形态）
msiexec /fa Marisa-DSH-windows-x64.msi
```

## 术语

- **部署树**：`%LOCALAPPDATA%\marisa-distro\backend\marisa-distro`（junction）→ 自洽 rc 树。
- **backend**：`%LOCALAPPDATA%\marisa-distro\backend`，含 `VERSION` 标记、`LINKS.json`（junction 清单）、`.dsh`（用户数据）。
- **WAL 状态**：`%LOCALAPPDATA%\marisa-distro\state\plugin-install-recovery\state.json`（`MARISA_WAL_STATE_DIR` 可覆盖）。
- **急救状态**：`%LOCALAPPDATA%\marisa-distro\logs\rescue-state.json`（`MARISA_LOG_DIR` 可覆盖）。
