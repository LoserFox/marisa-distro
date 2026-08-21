# repair-modes.ps1 — Marisa 恢复模式演练：修复脚本
#
# 与 break-modes.ps1 配对。支持：
#   -Restore <N|all>        从演练快照还原指定场景（或全部）破坏的文件
#   -WalRollback <txid>     通过 wal CLI 回滚安装事务（从 WAL 快照回写受保护文件）
#   -WalStatus              查看 WAL 状态
#   -RebuildJunction        重建部署树 junction（目标取自演练清单）
#   -Reextract              重跑提取器（profile 部署形态的 junction 自愈）
#   -ClearRescueState       清除持久化急救状态（退出急救模式）
#   -Verify                 全面体检：列出每个探针的 OK/BROKEN 与建议
#
# 用法示例：
#   pwsh -File repair-modes.ps1 -Verify
#   pwsh -File repair-modes.ps1 -Restore 1,4,5
#   pwsh -File repair-modes.ps1 -Restore all
#   pwsh -File repair-modes.ps1 -WalRollback <txid> -AppExe C:\...\Marisa-DSH-windows-x64-standalone.exe
#   pwsh -File repair-modes.ps1 -RebuildJunction
#   pwsh -File repair-modes.ps1 -ClearRescueState

[CmdletBinding()]
param(
  [string[]]$Restore = @(),
  [string]$WalRollback = '',
  [switch]$WalStatus,
  [switch]$RebuildJunction,
  [switch]$Reextract,
  [string]$Extractor = '',
  [switch]$ClearRescueState,
  [switch]$Verify,
  [string]$InstallRoot = "$env:LOCALAPPDATA\marisa-distro",
  [string]$AppExe = '',
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$script:issues = @()

$BackendDir     = Join-Path $InstallRoot 'backend'
$LinksFile      = Join-Path $BackendDir 'LINKS.json'
$VersionFile    = Join-Path $BackendDir 'VERSION'
$DeployJunction = Join-Path $BackendDir 'marisa-distro'
$LogDir         = Join-Path $InstallRoot 'logs'
$RescueState    = Join-Path $LogDir 'rescue-state.json'
if ($env:MARISA_WAL_STATE_DIR) {
  $WalStateFile = Join-Path $env:MARISA_WAL_STATE_DIR 'state.json'
} else {
  $WalStateFile = Join-Path $InstallRoot 'state\plugin-install-recovery\state.json'
}
$LabRoot        = Join-Path $InstallRoot '.mode-lab'
$ManifestFile   = Join-Path $LabRoot 'manifest.json'

function Write-Step { param([string]$M) Write-Host "==> $M" }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M" }
function Write-Bad  { param([string]$M) Write-Host "[!!] $M" }
function Write-Warn { param([string]$M) Write-Host "[--] $M" }

function Find-MarisaExe {
  if ($AppExe -and (Test-Path $AppExe)) { return $AppExe }
  $names = @('Marisa-DSH-windows-x64-standalone.exe', 'marisa-desktop-msi.exe', 'marisa-desktop.exe', 'marisa-desktop-dev.exe')
  $dirs  = @($InstallRoot, $BackendDir, "$env:LOCALAPPDATA\marisa-distro", "$env:LOCALAPPDATA\marisa-distro\backend",
             (Join-Path (Split-Path $PSScriptRoot -Parent) 'release'))
  foreach ($n in $names) {
    foreach ($d in $dirs) {
      $p = Join-Path $d $n
      if (Test-Path -LiteralPath $p) { return $p }
    }
  }
  $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^marisa' -and $_.Path } | Select-Object -First 1
  if ($proc) { return $proc.Path }
  return $null
}

function Get-LatestManifest {
  if (-not (Test-Path $ManifestFile)) { return $null }
  try { return Get-Content -LiteralPath $ManifestFile -Raw | ConvertFrom-Json } catch { return $null }
}

function Invoke-WalCli {
  param([string[]]$WalArgs)
  $exe = Find-MarisaExe
  if (-not $exe) { throw '未找到 Marisa 可执行文件（wal 子命令需要）。请用 -AppExe 指定。' }
  $env:MARISA_CONSOLE = '1'
  try {
    $out = & $exe wal @WalArgs 2>&1
    $code = $LASTEXITCODE
    $text = (($out | Where-Object { $_ -match '^\s*\{' }) -join "`n").Trim()
    if (-not $text) { $text = ($out -join "`n") }
    if ($code -ne 0) { throw "wal $($WalArgs[0]) 失败（exit $code）：$text" }
    return $text
  } finally {
    Remove-Item Env:MARISA_CONSOLE -ErrorAction SilentlyContinue
  }
}

# ── 动作 ────────────────────────────────────────────────────────────────

function Restore-Scenario {
  param([int]$Id)
  $m = Get-LatestManifest
  if (-not $m) { throw "未找到演练清单 $ManifestFile（先跑 break-modes.ps1）" }
  $entries = @($m | Where-Object { $_.scenario -eq $Id })
  if ($entries.Count -eq 0) { Write-Warn "清单中没有场景 $Id 的记录"; return }
  foreach ($e in $entries) {
    Write-Step ("还原场景 [{0}] {1}" -f $e.scenario, $e.name)
    foreach ($f in @($e.files)) {
      if (-not $f) { continue }
      $exists = Test-Path -LiteralPath $f.orig
      if ($f.snap) {
        if (Test-Path -LiteralPath $f.snap) {
          if ($WhatIf) { Write-Step "WHATIF: 还原 $($f.orig) <- $($f.snap)"; continue }
          New-Item -ItemType Directory -Force -Path (Split-Path $f.orig) | Out-Null
          Copy-Item -LiteralPath $f.snap -Destination $f.orig -Force
          Write-Ok "已还原 $($f.orig)"
        } else {
          Write-Warn "缺少快照（$($f.snap)），无法还原 $($f.orig)"
        }
      } elseif ($exists) {
        # 破坏时原本不存在 → 文件是本次破坏创建的 → 还原 = 删除
        if ($WhatIf) { Write-Step "WHATIF: 删除（还原为原本不存在）$($f.orig)"; continue }
        Remove-Item -LiteralPath $f.orig -Force
        Write-Ok "已删除（还原为原本不存在）$($f.orig)"
      } else {
        Write-Warn "跳过 $($f.orig)（快照为空且目标不存在：junction 类破坏请用 -RebuildJunction / -Reextract）"
      }
    }
  }
}

function Invoke-WalRollback {
  param([string]$Txid)
  if (-not $Txid) { throw '需要 -WalRollback <txid>' }
  Write-Step "wal rollback --tx $Txid"
  if ($WhatIf) { Write-Step 'WHATIF: 执行 wal rollback'; return }
  Write-Host (Invoke-WalCli @('rollback', '--tx', $Txid))
  Write-Ok '回滚完成：受保护文件已从 WAL 快照回写（未匹配的快照会标记 manual-recovery-required）'
}

function Invoke-RebuildJunction {
  $m = Get-LatestManifest
  $target = $null
  if ($m) {
    $e6 = @($m | Where-Object { $_.scenario -eq 6 } | Select-Object -First 1)
    if ($e6.Count -gt 0 -and $e6[0].files -and $e6[0].files[0].target) { $target = $e6[0].files[0].target }
  }
  if (-not $target) {
    throw '清单中没有场景 6 的 junction 目标。请手动指定：New-Item -ItemType Junction -Path <link> -Target <target>'
  }
  Write-Step "重建部署树 junction $DeployJunction -> $target"
  if ($WhatIf) { Write-Step 'WHATIF: 创建 junction'; return }
  if (Test-Path -LiteralPath $DeployJunction) { Remove-Item -LiteralPath $DeployJunction -Force }
  if (-not (Test-Path -LiteralPath $target)) { throw "junction 目标不存在：$target" }
  New-Item -ItemType Junction -Path $DeployJunction -Target $target | Out-Null
  Write-Ok "已重建 $DeployJunction"
}

function Invoke-Reextract {
  if (-not $Extractor) { throw '需要 -Extractor <提取器 exe 路径>（profile 形态：Marisa-DSH-windows-x64-extract.exe）' }
  if (-not (Test-Path $Extractor)) { throw "提取器不存在：$Extractor" }
  Write-Step "重跑提取器（junction 自愈 + 拒绝覆盖旧版本）"
  if ($WhatIf) { Write-Step 'WHATIF: 执行提取器'; return }
  & $Extractor
  if ($LASTEXITCODE -ne 0) { Write-Bad "提取器退出码 $LASTEXITCODE" } else { Write-Ok '提取器完成' }
}

function Invoke-ClearRescueState {
  Write-Step "清除急救状态 $RescueState"
  if ($WhatIf) { Write-Step 'WHATIF: 删除 rescue-state.json'; return }
  if (Test-Path -LiteralPath $RescueState) {
    Remove-Item -LiteralPath $RescueState -Force
    Write-Ok '已清除（下次启动回到 normal 阶段）'
  } else {
    Write-Warn '本来就没有急救状态文件'
  }
}

# ── 体检 ────────────────────────────────────────────────────────────────

function Invoke-Verify {
  Write-Host ''
  Write-Host ('──── Marisa 安装体检 ────  InstallRoot = ' + $InstallRoot)
  $issues = @()

  $probe = {
    param([string]$Name, [bool]$Ok, [string]$Detail)
    if ($Ok) { Write-Ok ("{0,-34} {1}" -f $Name, $Detail) } else {
      Write-Bad ("{0,-34} {1}" -f $Name, $Detail); $script:issues += $Name
    }
  }

  # backend 本体
  $backendOk = Test-Path $BackendDir
  & $probe 'backend 目录' $backendOk $(if ($backendOk) { $BackendDir } else { '缺失！standalone 会重解包；MSI 用 msiexec /fa 修复' })

  $verOk = Test-Path $VersionFile
  $verDetail = if ($verOk) { (Get-Content $VersionFile -Raw).Trim() } else { '缺失（将触发重解包）' }
  if ($verOk -and $verDetail -match 'MODE-LAB|broken') {
    & $probe 'VERSION 标记' $false "$verDetail（被演练篡改 → restore 场景 7，或重启由 update_guard+重解包还原）"
  } else {
    & $probe 'VERSION 标记' $verOk $verDetail
  }

  # LINKS.json 与 junction
  $linksOk = $false
  if (Test-Path $LinksFile) {
    try { $links = Get-Content -LiteralPath $LinksFile -Raw | ConvertFrom-Json; $linksOk = $null -ne $links.entries }
    catch { $linksOk = $false }
  }
  & $probe 'LINKS.json 可解析' $linksOk $(if ($linksOk) { "entries=$($links.entries.Count)" } else { '损坏！restore 场景 1' })

  if ($linksOk) {
    $bad = @()
    foreach ($entry in $links.entries) {
      $link = Join-Path $BackendDir ($entry.link -replace '/', '\')
      if (-not (Test-Path -LiteralPath $link)) { $bad += $entry.link }
    }
    & $probe 'junction 完整' ($bad.Count -eq 0) $(if ($bad.Count -eq 0) { '全部存在（修复模式自愈生效）' } else { "缺失 $($bad.Count) 个：$($bad -join ', ')（重启自愈或 restore 场景 2）" })
  }

  # profile 关键文件
  $profile = Get-ChildItem -Path $InstallRoot -Recurse -Filter 'package.json' -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -match 'profiles[\\/]marisa[\\/]' } | Select-Object -First 1
  if ($profile) {
    $pdir = $profile.DirectoryName
    $pkgOk = $false
    try { $null = Get-Content -LiteralPath $profile.FullName -Raw | ConvertFrom-Json; $pkgOk = $true } catch { $pkgOk = $false }
    & $probe 'profile package.json' $pkgOk $(if ($pkgOk) { $profile.FullName } else { '损坏！restore 场景 3/4' })
    $patchOk = Test-Path (Join-Path $pdir 'cordis.patch.yml')
    & $probe 'cordis.patch.yml' $patchOk $(if ($patchOk) { '存在' } else { '缺失！restore 场景 5' })
  } else {
    & $probe 'profile 目录' $false '未找到 profiles\marisa\package.json'
  }

  # bundle
  $bundle = Get-ChildItem -Path $InstallRoot -Recurse -Filter 'package.json' -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match 'bundles[\\/]marisa-bundle[\\/]' } | Select-Object -First 1
  $bundleOk = $false
  if ($bundle) { try { $null = Get-Content -LiteralPath $bundle.FullName -Raw | ConvertFrom-Json; $bundleOk = $true } catch {} }
  & $probe 'marisa-bundle' $bundleOk $(if ($bundleOk) { $bundle.FullName } else { '损坏或缺失！restore 场景 4' })

  # 部署树 junction
  $deployOk = Test-Path -LiteralPath $DeployJunction
  & $probe '部署树 junction' $deployOk $(if ($deployOk) { "-> $((Get-Item -LiteralPath $DeployJunction -Force).Target)" } else { '缺失！Reextract 或 RebuildJunction' })

  # 用户数据
  $dshOk = Test-Path (Join-Path $BackendDir '.dsh')
  & $probe '用户数据 .dsh' $dshOk $(if ($dshOk) { '存在（未被破坏波及）' } else { '不存在（新安装或已备份迁移）' })

  # WAL 状态
  if (Test-Path $WalStateFile) {
    $wal = Get-Content -LiteralPath $WalStateFile -Raw | ConvertFrom-Json
    $phase = ($wal.PSObject.Properties | Where-Object { $_.Name -match 'phase' } | Select-Object -First 1).Value
    $tx = ($wal.PSObject.Properties | Where-Object { $_.Name -match 'transactionid' } | Select-Object -First 1).Value
    & $probe 'WAL 状态' ($phase -in @('verified', 'rolled-back')) "phase=$phase tx=$tx $(if ($phase -notin @('verified','rolled-back')) { '→ 用 -WalRollback 或 wal verify 收尾' })"
  } else {
    & $probe 'WAL 状态' $true '无未完成事务'
  }

  # 急救状态
  if (Test-Path -LiteralPath $RescueState) {
    $st = Get-Content -LiteralPath $RescueState -Raw | ConvertFrom-Json
    & $probe '急救状态' ($st.stage -ne 'rescue') "stage=$($st.stage)（急救模式卡死 → -ClearRescueState）"
  } else {
    & $probe '急救状态' $true 'normal（无持久化急救状态）'
  }

  Write-Host ''
  if ($script:issues.Count -eq 0) {
    Write-Ok '体检全部通过：安装健康。'
  } else {
    Write-Bad ("发现 {0} 项问题：{1}" -f $script:issues.Count, ($script:issues -join '、'))
    Write-Host '对应修复：restore 场景快照 / -WalRollback / -Reextract / -RebuildJunction / -ClearRescueState，见各场景输出。'
  }
}

# ── 主流程 ──────────────────────────────────────────────────────────────

if ($Verify)            { Invoke-Verify; exit 0 }
if ($ClearRescueState)  { Invoke-ClearRescueState; exit 0 }
if ($WalStatus)         { Write-Host (Invoke-WalCli @('status')); exit 0 }
if ($WalRollback)       { Invoke-WalRollback $WalRollback; exit 0 }
if ($RebuildJunction)   { Invoke-RebuildJunction; exit 0 }
if ($Reextract)         { Invoke-Reextract; exit 0 }
if ($Restore.Count -gt 0) {
  $ids = if ($Restore -contains 'all') { 1..8 } else { @($Restore | ForEach-Object { [int]$_ }) }
  foreach ($id in $ids) { Restore-Scenario $id }
  Write-Host ''
  Write-Step '还原完成，跑 repair-modes.ps1 -Verify 复核。'
  exit 0
}

Write-Host @'
repair-modes.ps1 — Marisa 恢复模式修复脚本
用法：
  -Verify               体检安装（推荐先跑）
  -Restore <N|all>      还原演练快照（1..8）
  -WalRollback <txid>   WAL 事务回滚（需 -AppExe）
  -WalStatus            查看 WAL 状态
  -RebuildJunction      重建部署树 junction
  -Reextract            重跑提取器（需 -Extractor）
  -ClearRescueState     退出急救模式
  -InstallRoot          安装根目录（默认 %LOCALAPPDATA%\marisa-distro）
  -AppExe               Marisa 桌面可执行文件路径（wal 子命令用）
'@
