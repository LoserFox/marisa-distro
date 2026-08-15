<#
# dsh desktop app — Windows one-command installer (window shell only).
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-desktop-windows.ps1
#
# Copies the window shell (dsh-shell.exe) to %LOCALAPPDATA%\dsh-desktop\dsh-shell.exe,
# creates a Start-menu shortcut and a desktop shortcut, and prints the launch
# command. The shell does NOT bundle a backend: it starts the dsh web server
# from YOUR environment — dsh on PATH (installed by scripts\install-windows.ps1
# from dsh-win-port, or run from a patched checkout), or the command in
# DSH_WEB_CMD.
#
# No Go toolchain needed: when no local build exists, the installer downloads
# the prebuilt binary from the latest GitHub release automatically.
#
# Overridable parameters:
#   -Source       local exe path or a URL to a release zip/exe (default:
#                 <repo>\build\dsh-shell.exe if it exists, else latest release)
#   -Destination  install directory (default: %LOCALAPPDATA%\dsh-desktop)
#   -NoShortcuts  skip shortcut creation
#   -PassThru     print the resolved paths as objects instead of prose
#>
[CmdletBinding()]
param(
  [string]$Source,
  [string]$Destination,
  [switch]$NoShortcuts,
  [switch]$PassThru
)

$ErrorActionPreference = 'Stop'

$ReleaseAssetUrl = 'https://github.com/dsh-external/dsh-desktop/releases/latest/download/dsh-desktop-windows-amd64.zip'
$ReleaseRepo = 'dsh-external/dsh-desktop'
$ReleaseAsset = 'dsh-desktop-windows-amd64.zip'

# --- resolve the shell exe ----------------------------------------------------
$repoRoot = Split-Path -Parent $PSScriptRoot
$localBuild = Join-Path $repoRoot 'build\dsh-shell.exe'
$source = $Source
$tmpDirToClean = $null

if (-not $source) {
  if (Test-Path $localBuild) {
    $source = $localBuild
  } else {
    Write-Host '==> No local build found; downloading the prebuilt binary from GitHub Releases...' -ForegroundColor Yellow
    $source = $ReleaseAssetUrl
  }
}

if ($source -match '^https?://') {
  $tmp = Join-Path $env:TEMP ('dsh-desktop-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $download = Join-Path $tmp 'download'
  if ($source -eq $ReleaseAssetUrl) {
    # 私有仓库的 release 直链需要认证:优先用 gh CLI(已登录凭据),
    # 失败再回退直连(公开仓库可用)。
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
      Write-Host '==> Downloading via gh release download...'
      gh release download --repo $ReleaseRepo --pattern $ReleaseAsset --clobber --dir $tmp
      if ($LASTEXITCODE -eq 0) {
        $downloaded = Join-Path $tmp $ReleaseAsset
        if (Test-Path $downloaded) { $source = $downloaded }
      }
    }
  }
  if (-not ($source -match '\.zip$')) {
    Write-Host "==> Downloading $source"
    Invoke-WebRequest -Uri $source -OutFile $download
  }
  $iconFile = $null
  if ($source -match '\.zip$') {
    Expand-Archive -Path $download -DestinationPath $tmp -Force
    $exe = @(Get-ChildItem -Path $tmp -Recurse -Filter 'dsh-shell.exe' | Select-Object -First 1)
    $iconFile = @(Get-ChildItem -Path $tmp -Recurse -Filter 'icon.ico' | Select-Object -First 1)
  } else {
    $exe = @(Get-Item $download)
  }
  if ($exe.Count -eq 0) { throw 'downloaded content contains no dsh-shell.exe' }
  $source = $exe[0].FullName
  if ($iconFile.Count -gt 0) { $sourceIcon = $iconFile[0].FullName }
  $tmpDirToClean = $tmp
} else {
  $source = [System.IO.Path]::GetFullPath($source)
  if (-not (Test-Path $source)) {
    throw "window shell not found: $source. Build it (go build -C . -o build\dsh-shell.exe .) or run without -Source to download the prebuilt binary."
  }
  $localIcon = Join-Path $repoRoot 'assets\icon.ico'
  if (Test-Path $localIcon) { $sourceIcon = $localIcon }
}

# --- install directory ---------------------------------------------------------
if (-not $Destination) { $Destination = Join-Path $env:LOCALAPPDATA 'dsh-desktop' }
$dest = [System.IO.Path]::GetFullPath($Destination)
Write-Host "==> Installing dsh desktop to $dest" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$shellExe = Join-Path $dest 'dsh-shell.exe'
Copy-Item -Path $source -Destination $shellExe -Force
$destIcon = $null
if ($sourceIcon -and (Test-Path $sourceIcon)) {
  $destIcon = Join-Path $dest 'icon.ico'
  Copy-Item -Path $sourceIcon -Destination $destIcon -Force
}

# --- shortcuts -----------------------------------------------------------------
$shortcuts = @()
if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $shortcuts = @(
    (Join-Path $startMenu 'dsh.desktop.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'dsh.desktop.lnk')
  )
  foreach ($link in $shortcuts) {
    $shortcut = $shell.CreateShortcut($link)
    $shortcut.TargetPath = $shellExe
    $shortcut.WorkingDirectory = $dest
    $shortcut.Description = 'DeepSeek Harness desktop'
    if ($destIcon) { $shortcut.IconLocation = "$destIcon,0" }
    $shortcut.Save()
  }
  Write-Host "==> Shortcuts created (Start menu + Desktop)" -ForegroundColor Green
}

# --- cleanup -------------------------------------------------------------------
if ($tmpDirToClean) { Remove-Item -Path $tmpDirToClean -Recurse -Force }

# --- report --------------------------------------------------------------------
if ($PassThru) {
  [pscustomobject]@{
    Destination = $dest
    ShellExe    = $shellExe
    StartMenu   = $shortcuts[0]
  }
} else {
  Write-Host "==> Installed. Launch with:" -ForegroundColor Green
  Write-Host "      $shellExe"
  Write-Host "   or Start menu / Desktop shortcut 'dsh.desktop'."
  Write-Host "   Uninstall: delete $dest and the two shortcuts."
  Write-Host "   Note: the shell starts 'dsh web' from your environment (dsh on PATH,"
  Write-Host "   or DSH_WEB_CMD); the checkout must be built (pnpm run build)."
}
