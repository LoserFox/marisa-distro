# break-modes.ps1 — Marisa 恢复模式演练：故意修坏安装的若干部位
#
# 用途：在真实安装（standalone / MSI / profile 部署）上故意制造故障，
# 用于测试桌面壳的三种恢复模式：
#   修复模式（repair）  —— 启动自愈（junction 重建 / 整树重解包）+ WAL 事务回滚
#   安全模式（minimal） —— 连续启动失败后降级为基础界面（无 Marisa 定制）
#   急救模式（rescue）  —— --rescue 急救页（插件级禁用 / 恢复动作 / 状态清除）
#
# 安全性：
#   * 动手前先把将破坏的文件原样快照到 <InstallRoot>\.mode-lab\snap-<ts>\，
#     并在 manifest.json 记录每个场景破坏了什么、快照在哪。
#   * 绝不触碰 backend\.dsh（用户会话数据）。
#   * 每个场景打印「预期行为」和对应的修复命令（repair-modes.ps1）。
#
# 用法：
#   pwsh -File break-modes.ps1 -List
#   pwsh -File break-modes.ps1 -Scenario 2 -InstallRoot %LOCALAPPDATA%\marisa-distro
#   pwsh -File break-modes.ps1 -Scenario 3 -AppExe C:\path\Marisa-DSH-windows-x64-standalone.exe
#   pwsh -File break-modes.ps1 -Scenario all
#   pwsh -File break-modes.ps1 -Scenario 1 -WhatIf   # 演练模式，只打印不动手

[CmdletBinding()]
param(
  [string]$Scenario = '',
  [string]$InstallRoot = "$env:LOCALAPPDATA\marisa-distro",
  [string]$AppExe = '',
  [string]$ProfileDir = '',
  [switch]$List,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# ── 路径 ────────────────────────────────────────────────────────────────
$BackendDir    = Join-Path $InstallRoot 'backend'
$LinksFile     = Join-Path $BackendDir 'LINKS.json'
$VersionFile   = Join-Path $BackendDir 'VERSION'
$DeployJunction= Join-Path $BackendDir 'marisa-distro'
$LogDir        = Join-Path $InstallRoot 'logs'
$RescueState   = Join-Path $LogDir 'rescue-state.json'
$LabRoot       = Join-Path $InstallRoot '.mode-lab'
$SnapDir       = Join-Path $LabRoot "snap-$ts"
$ManifestFile  = Join-Path $LabRoot 'manifest.json'
$Manifest      = @()
if (Test-Path $ManifestFile) {
  try { $Manifest = @(Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json) } catch { $Manifest = @() }
}

# ── 场景目录 ────────────────────────────────────────────────────────────
$Scenarios = @(
  @{ Id = 1;  Name = 'links-json';        Mode = '修复模式'; Title = '损坏 backend\LINKS.json（junction 清单）' }
  @{ Id = 2;  Name = 'junction';          Mode = '修复模式'; Title = '删除 LINKS.json 记录的一个 junction' }
  @{ Id = 3;  Name = 'wal';               Mode = '修复模式'; Title = 'WAL 事务演练：begin → 损坏受保护文件 → pending → rollback' }
  @{ Id = 4;  Name = 'bundle';            Mode = '安全模式'; Title = '损坏 marisa-bundle\package.json（Marisa 专属插件包）' }
  @{ Id = 5;  Name = 'patch-yml';         Mode = '安全模式'; Title = '损坏 profile 的 cordis.patch.yml（组成补丁）' }
  @{ Id = 6;  Name = 'deploy-junction';   Mode = '修复/急救'; Title = '删除部署树 junction（backend\marisa-distro）' }
  @{ Id = 7;  Name = 'version';           Mode = '修复模式'; Title = '篡改 backend\VERSION（触发重解包 + 数据备份守卫）' }
  @{ Id = 8;  Name = 'rescue-state';      Mode = '急救模式'; Title = '写入持久化急救状态（每次启动直接进急救页）' }
)

function Write-Step { param([string]$M) Write-Host "==> $M" }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M" }
function Write-Bad  { param([string]$M) Write-Host "[!!] $M" }
function Write-Warn { param([string]$M) Write-Host "[--] $M" }

function Assert-NotRunning {
  $hit = Get-Process | Where-Object { $_.ProcessName -match '^marisa|^Marisa' -and $_.MainWindowTitle -ne '' } |
         Select-Object -First 5
  if ($hit) {
    Write-Warning "检测到正在运行的 Marisa 进程（$($hit.ProcessName -join ', ')）。请先完全退出应用再执行破坏，否则文件可能被占用或行为被掩盖。"
  }
}

function Find-ProfileDir {
  if ($ProfileDir -and (Test-Path (Join-Path $ProfileDir 'package.json'))) { return $ProfileDir }
  $cand = Get-ChildItem -Path $InstallRoot -Recurse -Filter 'package.json' -ErrorAction SilentlyContinue |
          Where-Object { $_.FullName -match 'profiles[\\/]marisa[\\/]' } | Select-Object -First 1
  if ($cand) { return $cand.DirectoryName }
  return $null
}

function Find-MarisaExe {
  if ($AppExe -and (Test-Path $AppExe)) { return $AppExe }
  # 固定候选名 × 固定目录（避免对 LOCALAPPDATA 全树递归，慢且无谓）
  $names = @('Marisa-DSH-windows-x64-standalone.exe', 'marisa-desktop-msi.exe', 'marisa-desktop.exe', 'marisa-desktop-dev.exe')
  $dirs  = @($InstallRoot, $BackendDir, "$env:LOCALAPPDATA\marisa-distro", "$env:LOCALAPPDATA\marisa-distro\backend",
             (Join-Path (Split-Path $PSScriptRoot -Parent) 'release'))
  foreach ($n in $names) {
    foreach ($d in $dirs) {
      $p = Join-Path $d $n
      if (Test-Path -LiteralPath $p) { return $p }
    }
  }
  # 正在运行的 Marisa 进程直接给出 exe 路径
  $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^marisa' -and $_.Path } | Select-Object -First 1
  if ($proc) { return $proc.Path }
  return $null
}

function Invoke-Snapshot {
  param([string]$Label, [string]$Path)
  if (-not $Path) { return }
  if (Test-Path -LiteralPath $Path) {
    $dst = Join-Path $SnapDir "$Label-$([IO.Path]::GetFileName($Path))"
    Copy-Item -LiteralPath $Path -Destination $dst -Force
    Write-Ok "快照 $Path -> $dst"
    return $dst
  }
  Write-Ok "目标不存在（$Path），记录为「原本不存在」"
  return $null
}

function Add-ManifestEntry {
  param([int]$Id, [string]$Name, [string]$Mode, [string]$Repair, [array]$Files)
  # 函数作用域内 += 只改局部副本，必须写脚本作用域
  $script:Manifest += @{
    scenario   = $Id
    name       = $Name
    mode       = $Mode
    ts         = $ts
    repair     = $Repair
    files      = $Files
    installRoot= $InstallRoot
  }
}

function Save-Manifest {
  New-Item -ItemType Directory -Force -Path $LabRoot | Out-Null
  $Manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $ManifestFile -Encoding UTF8
  Write-Ok "演练清单 -> $ManifestFile"
}

function Corrupt-File {
  param([string]$Path, [string]$Garbage = 'MODE-LAB-BROKEN: 这不是合法内容' * 1)
  Set-Content -LiteralPath $Path -Value "MODE-LAB-BROKEN $ts 故意损坏" -Encoding UTF8
  Write-Bad "已损坏 $Path"
}

# ── 场景实现 ────────────────────────────────────────────────────────────

function Invoke-Scenario-1 {  # LINKS.json 损坏
  if (-not (Test-Path $LinksFile)) { throw "未找到 $LinksFile（确认 InstallRoot 正确）" }
  if ($WhatIf) { Write-Step 'WHATIF: 快照并损坏 LINKS.json'; return }
  $snap = Invoke-Snapshot 's1' $LinksFile
  Corrupt-File $LinksFile
  Add-ManifestEntry 1 'links-json' '修复模式' 'repair-modes.ps1 -Restore 1' @(@{orig=$LinksFile; snap=$snap})
  Write-Host ''
  Write-Host '  预期行为：启动时 recreateLinks 解析失败 → 后端起不来 → 连续失败降级 minimal（安全模式）→ 急救页。'
  Write-Host '  修复：    pwsh repair-modes.ps1 -Restore 1   （从快照还原 LINKS.json）'
}

function Invoke-Scenario-2 {  # 删除一个 junction
  $links = $null
  if (Test-Path $LinksFile) {
    try { $links = Get-Content -LiteralPath $LinksFile -Raw | ConvertFrom-Json } catch { $links = $null }
  }
  if (-not $links) {
    # 活文件已被场景 1 损坏：回退到最新可解析的快照（junction 路径不变）
    $snaps = Get-ChildItem -Path $LabRoot -Recurse -Filter 's1-LINKS.json' -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending
    foreach ($snap in $snaps) {
      try { $links = Get-Content -LiteralPath $snap.FullName -Raw | ConvertFrom-Json; break } catch { $links = $null }
    }
    if ($links) { Write-Warn "LINKS.json 已损坏（场景 1 的破坏仍在），用快照 $($snap.FullName) 定位 junction" }
  }
  if (-not $links) { throw "未找到可用的 LINKS.json（$LinksFile 不存在且无快照）" }
  if (-not $links.entries -or $links.entries.Count -eq 0) { throw 'LINKS.json 没有 entries，无法演练 junction 删除' }
  $entry = $links.entries | Select-Object -First 1
  $link  = Join-Path $BackendDir ($entry.link -replace '/', '\')
  if (-not (Test-Path -LiteralPath $link)) { throw "junction $link 不存在（也许已被删？选别的场景）" }
  $target = (Get-Item -LiteralPath $link -Force).Target
  Add-ManifestEntry 2 'junction' '修复模式' '无需修复（启动自愈）；可 repair-modes.ps1 -Verify 验证' @(@{orig=$link; snap=$null; target=$target})
  if ($WhatIf) { Write-Step "WHATIF: 删除 junction $link -> $target"; return }
  Remove-Item -LiteralPath $link -Force
  Write-Bad "已删除 junction $link"
  Write-Host ''
  Write-Host '  预期行为：下次启动 ensureBackend 的 repair 路径按 LINKS.json 自动重建该 junction（修复模式自愈）。'
  Write-Host '  修复：    不需要；重启应用即可。跑 repair-modes.ps1 -Verify 确认已重建。'
}

function Invoke-Scenario-3 {  # WAL 事务
  $exe = Find-MarisaExe
  if (-not $exe) { throw '未找到 Marisa 可执行文件（wal 子命令需要）。请用 -AppExe 指定，例如 -AppExe C:\...\Marisa-DSH-windows-x64-standalone.exe' }
  $profile = Find-ProfileDir
  if (-not $profile) { throw "未找到 profile 目录（profiles\marisa\package.json）。可用 -ProfileDir 指定" }
  $pkgJson = Join-Path $profile 'package.json'
  if (-not (Test-Path $pkgJson)) { throw "未找到 $pkgJson" }
  if ($WhatIf) { Write-Step "WHATIF: wal begin + 损坏 $pkgJson + wal pending"; return }

  $env:MARISA_CONSOLE = '1'   # GUI 子系统下捕获 stdout
  Write-Step "wal begin（保护 profile package.json + cordis.patch.yml + backend LINKS.json）"
  $out = & $exe wal begin --profile-dir $profile --profile-name marisa --package mode-lab --version "lab-$ts" --backend-dir $BackendDir 2>&1
  Remove-Item Env:MARISA_CONSOLE -ErrorAction SilentlyContinue
  # exe 的 log 输出（YYYY/MM/DD 前缀）会混进 stderr，只取 JSON 行
  $raw = (($out | Where-Object { $_ -match '^\s*\{' }) -join "`n").Trim()
  if (-not $raw) { $raw = ($out -join "`n") }
  $parsed = $null
  if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $null } }
  $txid = if ($parsed) { ($parsed.PSObject.Properties | Where-Object { $_.Name -match 'transactionid' } | Select-Object -First 1).Value } else { $null }
  if (-not $txid) { throw "wal begin 未返回事务 ID：$raw" }
  Write-Ok "事务 ID: $txid"

  $snap = Invoke-Snapshot 's3' $pkgJson
  Corrupt-File $pkgJson

  $env:MARISA_CONSOLE = '1'
  $out2 = & $exe wal pending --tx $txid --reason mode-lab 2>&1
  Remove-Item Env:MARISA_CONSOLE -ErrorAction SilentlyContinue
  $raw2 = (($out2 | Where-Object { $_ -match '^\s*\{' }) -join "`n").Trim()
  Write-Host $(if ($raw2) { $raw2 } else { $out2 -join "`n" })

  Add-ManifestEntry 3 'wal' '修复模式' "repair-modes.ps1 -WalRollback $txid" @(@{orig=$pkgJson; snap=$snap; txid=$txid})
  Write-Host ''
  Write-Host "  预期行为：profile package.json 已损坏且 WAL 处于 recovery-pending → 启动失败并提示恢复。"
  Write-Host "  修复：    pwsh repair-modes.ps1 -WalRollback $txid  （从 WAL 快照回写还原三个受保护文件）"
}

function Invoke-Scenario-4 {  # marisa-bundle 损坏
  $bundle = Get-ChildItem -Path $InstallRoot -Recurse -Filter 'package.json' -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match 'bundles[\\/]marisa-bundle[\\/]' } | Select-Object -First 1
  if (-not $bundle) { throw '未找到 bundles\marisa-bundle\package.json' }
  if ($WhatIf) { Write-Step 'WHATIF: 快照并损坏 marisa-bundle package.json'; return }
  $snap = Invoke-Snapshot 's4' $bundle.FullName
  Corrupt-File $bundle.FullName
  Add-ManifestEntry 4 'bundle' '安全模式' 'repair-modes.ps1 -Restore 4' @(@{orig=$bundle.FullName; snap=$snap})
  Write-Host ''
  Write-Host '  预期行为：normal 启动加载 marisa-bundle 失败（连续 2 次）→ 自动降级 minimal：基础界面（无 Marisa 定制，安全模式）。'
  Write-Host '            或进入急救页后可用「插件管理」禁用/启用该 bundle。'
  Write-Host '  修复：    pwsh repair-modes.ps1 -Restore 4'
}

function Invoke-Scenario-5 {  # cordis.patch.yml 损坏
  $profile = Find-ProfileDir
  if (-not $profile) { throw "未找到 profile 目录" }
  $patch = Join-Path $profile 'cordis.patch.yml'
  if (-not (Test-Path $patch)) { throw "未找到 $patch" }
  if ($WhatIf) { Write-Step 'WHATIF: 快照并损坏 cordis.patch.yml'; return }
  $snap = Invoke-Snapshot 's5' $patch
  Corrupt-File $patch
  Add-ManifestEntry 5 'patch-yml' '安全模式' 'repair-modes.ps1 -Restore 5' @(@{orig=$patch; snap=$snap})
  Write-Host ''
  Write-Host '  预期行为：同场景 4 —— normal 失败 ×2 → minimal 基础界面（安全模式）。'
  Write-Host '  修复：    pwsh repair-modes.ps1 -Restore 5'
}

function Invoke-Scenario-6 {  # 部署树 junction
  if (-not (Test-Path -LiteralPath $DeployJunction)) { throw "部署树 junction $DeployJunction 不存在（本安装形态可能没有部署树，跳过）" }
  $target = (Get-Item -LiteralPath $DeployJunction -Force).Target
  Add-ManifestEntry 6 'deploy-junction' '修复/急救' 'repair-modes.ps1 -Reextract / -RebuildJunction' @(@{orig=$DeployJunction; snap=$null; target=$target})
  if ($WhatIf) { Write-Step "WHATIF: 删除 junction $DeployJunction -> $target"; return }
  Remove-Item -LiteralPath $DeployJunction -Force
  Write-Bad "已删除部署树 junction $DeployJunction"
  Write-Host ''
  Write-Host "  预期行为：profile 挂载失败 → 启动失败 → minimal → 急救页（急救模式）。"
  Write-Host "  修复：    1) 重跑提取器（junction 自愈）：pwsh repair-modes.ps1 -Reextract -Extractor <extract.exe 路径>"
  Write-Host "            2) 或手动重建：pwsh repair-modes.ps1 -RebuildJunction（目标从演练清单读取）"
}

function Invoke-Scenario-7 {  # VERSION 篡改
  if (-not (Test-Path $VersionFile)) { throw "未找到 $VersionFile" }
  $snap = Invoke-Snapshot 's7' $VersionFile
  if ($WhatIf) { Write-Step 'WHATIF: 篡改 VERSION'; return }
  Set-Content -LiteralPath $VersionFile -Value 'marisa-backend-mode-lab-broken' -Encoding UTF8
  Write-Bad '已篡改 VERSION（版本不匹配）'
  Add-ManifestEntry 7 'version' '修复模式' '无需手动修复；重启应用自动重解包' @(@{orig=$VersionFile; snap=$snap})
  Write-Host ''
  Write-Host '  预期行为：standalone 重启时检测到版本不匹配 → update_guard 先把 backend\.dsh 备份到'
  Write-Host '            %LOCALAPPDATA%\marisa-distro\backup\dsh-*（并弹确认）→ 整树重解包（修复模式）。'
  Write-Host '  修复：    不需要；重启应用。跑 repair-modes.ps1 -Verify 确认 .dsh 备份存在、VERSION 已还原。'
}

function Invoke-Scenario-8 {  # 急救状态
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $snap = Invoke-Snapshot 's8' $RescueState
  if ($WhatIf) { Write-Step 'WHATIF: 写入 rescue-state.json {stage: rescue}'; return }
  $state = @{ stage = 'rescue'; lastError = 'mode-lab 模拟：故意写入急救状态'; updatedAt = (Get-Date).ToUniversalTime().ToString('o') }
  $state | ConvertTo-Json | Set-Content -LiteralPath $RescueState -Encoding UTF8
  Write-Bad "已写入持久化急救状态 -> $RescueState"
  Add-ManifestEntry 8 'rescue-state' '急救模式' 'repair-modes.ps1 -ClearRescueState（或急救页「重试完整模式」）' @(@{orig=$RescueState; snap=$snap})
  Write-Host ''
  Write-Host '  预期行为：下次启动直接进急救页（急救模式），页面显示失败原因与恢复动作。'
  Write-Host '  修复：    pwsh repair-modes.ps1 -ClearRescueState   或 在急救页点「重试完整模式」。'
}

# ── 主流程 ──────────────────────────────────────────────────────────────

if ($List) {
  Write-Host ''
  Write-Host 'Marisa 恢复模式演练 —— 破坏场景清单'
  Write-Host ('InstallRoot = ' + $InstallRoot)
  Write-Host ''
  foreach ($s in $Scenarios) {
    Write-Host ("  [{0}] {1,-15} {2,-12} {3}" -f $s.Id, $s.Name, $s.Mode, $s.Title)
  }
  Write-Host ''
  Write-Host '用法示例：'
  Write-Host '  pwsh -File break-modes.ps1 -Scenario 2 -InstallRoot %LOCALAPPDATA%\marisa-distro'
  Write-Host '  pwsh -File break-modes.ps1 -Scenario 3 -AppExe C:\path\Marisa-DSH-windows-x64-standalone.exe'
  Write-Host '  pwsh -File break-modes.ps1 -Scenario all -WhatIf'
  exit 0
}

if (-not $Scenario) {
  Write-Host '缺少 -Scenario（1..8 或 all）。用 -List 查看清单。'
  exit 1
}

if (-not (Test-Path $InstallRoot)) {
  Write-Bad "InstallRoot 不存在：$InstallRoot"
  Write-Host '确认安装位置，或用 -InstallRoot 指定。注意：这是要故意破坏的目录，路径请仔细。'
  exit 1
}

Assert-NotRunning
New-Item -ItemType Directory -Force -Path $SnapDir | Out-Null

$ids = if ($Scenario -eq 'all') { 1..8 } else { @([int]$Scenario) }
foreach ($id in $ids) {
  $s = $Scenarios | Where-Object { $_.Id -eq $id } | Select-Object -First 1
  if (-not $s) { Write-Bad "未知场景 $id"; continue }
  Write-Host ''
  Write-Host ('──── 场景 [{0}] {1}（{2}）' -f $s.Id, $s.Title, $s.Mode)
  try {
    & (Get-Item "function:Invoke-Scenario-$id").ScriptBlock
  } catch {
    Write-Bad ("场景 {0} 跳过：{1}" -f $id, $_.Exception.Message)
  }
}

Save-Manifest
Write-Host ''
Write-Host '演练完毕。跑 repair-modes.ps1 -Verify 检查当前损坏状态，再按各场景给出的命令修复。'
