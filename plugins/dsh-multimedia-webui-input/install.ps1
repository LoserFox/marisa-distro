param(
  [ValidateSet('install', 'uninstall', 'status')]
  [string]$Mode = 'install'
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $ScriptRoot 'scripts/install.mjs') $Mode
exit $LASTEXITCODE
