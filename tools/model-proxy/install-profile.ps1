#Requires -Version 7
<#
.SYNOPSIS
  model-proxy 的 pwsh 默认配置安装 / 卸载。
  把代理默认值写进 $PROFILE（或 -UserScope 写用户级环境变量），
  使 DSH / dsh CLI 的模型请求默认经本地转发代理走上游代理。

.EXAMPLE
  .\install-profile.ps1                     # 写入 $PROFILE（默认 socks5://127.0.0.1:10808）
  .\install-profile.ps1 -Proxy http://127.0.0.1:10809 -Port 8787
  .\install-profile.ps1 -UserScope          # 追加写用户级环境变量（桌面应用可见）
  .\install-profile.ps1 -Uninstall          # 移除 $PROFILE 里的配置块
  .\install-profile.ps1 -Uninstall -UserScope
#>
[CmdletBinding()]
param(
  [string]$Proxy = 'socks5://127.0.0.1:10808',
  [string]$Target = 'https://api.deepseek.com',
  [int]$Port = 8787,
  [switch]$UserScope,
  [switch]$Uninstall,
  [string]$ProfilePath = ''
)

$ErrorActionPreference = 'Stop'
$Begin = '# ===== model-proxy-begin ====='
$End = '# ===== model-proxy-end ====='
$ScriptPath = Join-Path $PSScriptRoot 'model-proxy.mjs'
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "model-proxy.mjs not found next to this script: $ScriptPath"
}

# ── 用户级环境变量（Explorer 启动的桌面应用可见） ──
$UserVars = @('MODEL_PROXY', 'MODEL_PROXY_TARGET', 'MODEL_PROXY_PORT', 'DEEPSEEK_BASE_URL')

function Set-UserVars {
  [Environment]::SetEnvironmentVariable('MODEL_PROXY', $Proxy, 'User')
  [Environment]::SetEnvironmentVariable('MODEL_PROXY_TARGET', $Target, 'User')
  [Environment]::SetEnvironmentVariable('MODEL_PROXY_PORT', [string]$Port, 'User')
  [Environment]::SetEnvironmentVariable('DEEPSEEK_BASE_URL', "http://127.0.0.1:$Port/v1", 'User')
  Write-Host "已写入用户级环境变量：MODEL_PROXY / MODEL_PROXY_TARGET / MODEL_PROXY_PORT / DEEPSEEK_BASE_URL" -ForegroundColor Green
  Write-Host "（新进程生效；桌面应用需重启。当前会话执行下方命令立即生效：）" -ForegroundColor DarkGray
}

function Remove-UserVars {
  foreach ($name in $UserVars) {
    [Environment]::SetEnvironmentVariable($name, $null, 'User')
  }
  Write-Host '已删除用户级环境变量。' -ForegroundColor Green
}

# ── $PROFILE 配置块 ──
function Get-ProfileText {
  $path = if ($ProfilePath) { $ProfilePath } else { $PROFILE }
  if (Test-Path -LiteralPath $path) { Get-Content -LiteralPath $path -Raw -Encoding utf8 } else { '' }
}

function New-Block {
  $escapedScript = $ScriptPath.Replace("'", "''")
  return @"
$Begin
# 模型请求代理默认值（由 install-profile.ps1 管理；直接改这里即可，新终端生效）
`$env:MODEL_PROXY = '$Proxy'
`$env:MODEL_PROXY_TARGET = '$Target'
`$env:MODEL_PROXY_PORT = '$Port'
# DSH 模型请求 → 本地转发代理（DSH 只允许"启动环境"提供这些变量，所以写在 profile 而非 .env）
`$env:DEEPSEEK_BASE_URL = 'http://127.0.0.1:$Port/v1'
# 联网搜索若也需走代理，取消下一行注释
# `$env:DEEPSEEK_SEARCH_BASE_URL = 'http://127.0.0.1:$Port'
# 后台启动本地代理：Start-ModelProxy
function Start-ModelProxy {
  Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList @('$escapedScript')
}
$End
"@
}

function Update-Profile {
  $path = if ($ProfilePath) { $ProfilePath } else { $PROFILE }
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $old = Get-ProfileText
  $pattern = "(?ms)^# ===== model-proxy-begin =====.*?^# ===== model-proxy-end =====\r?\n?"
  $stripped = [regex]::Replace($old, $pattern, '')
  $new = if ($stripped.Trim()) { $stripped.TrimEnd() + "`n`n" + (New-Block) } else { New-Block }
  Set-Content -LiteralPath $path -Value $new -Encoding utf8NoBOM
  Write-Host "已更新 $path" -ForegroundColor Green
}

function Remove-ProfileBlock {
  $path = if ($ProfilePath) { $ProfilePath } else { $PROFILE }
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "没有找到 $path，无需卸载。" -ForegroundColor Yellow
    return
  }
  $old = Get-Content -LiteralPath $path -Raw -Encoding utf8
  $pattern = "(?ms)^# ===== model-proxy-begin =====.*?^# ===== model-proxy-end =====\r?\n?"
  $new = [regex]::Replace($old, $pattern, '')
  if ($new -eq $old) {
    Write-Host "配置块不在 $path 中。" -ForegroundColor Yellow
  } elseif ([string]::IsNullOrWhiteSpace($new)) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "已从 $path 移除配置块（文件已清空删除）。" -ForegroundColor Green
  } else {
    Set-Content -LiteralPath $path -Value $new -Encoding utf8NoBOM
    Write-Host "已从 $path 移除配置块。" -ForegroundColor Green
  }
}

# ── 主流程 ──
if ($Uninstall) {
  Remove-ProfileBlock
  if ($UserScope) { Remove-UserVars }
  Write-Host '完成。'
  exit 0
}

Update-Profile
if ($UserScope) { Set-UserVars }

Write-Host ''
Write-Host '当前生效配置：' -ForegroundColor Cyan
Write-Host "  MODEL_PROXY          = $Proxy"
Write-Host "  MODEL_PROXY_TARGET   = $Target"
Write-Host "  MODEL_PROXY_PORT     = $Port"
Write-Host "  DEEPSEEK_BASE_URL    = http://127.0.0.1:$Port/v1  (DSH 模型请求入口)"
Write-Host ''
Write-Host '下一步：' -ForegroundColor Cyan
Write-Host '  1. 新开一个终端（或 source $PROFILE）使变量生效'
Write-Host "  2. 启动本地代理：Start-ModelProxy   （或 node $ScriptPath）"
Write-Host '  3. 验证：Invoke-RestMethod http://127.0.0.1:8787/__status'
Write-Host '  4. 卸载：.\install-profile.ps1 -Uninstall'
