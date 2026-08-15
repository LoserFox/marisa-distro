[CmdletBinding()]
param(
  [string]$Output = (Join-Path $PSScriptRoot '..\desktop\bundle\backend.zip')
)

$ErrorActionPreference = 'Stop'
$outputPath = [System.IO.Path]::GetFullPath($Output)
$staging = Join-Path ([System.IO.Path]::GetDirectoryName($outputPath)) '.ci-test-bundle'

if (Test-Path -LiteralPath $outputPath) {
  throw "refusing to replace an existing bundle: $outputPath"
}
Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null
try {
  [System.IO.File]::WriteAllText((Join-Path $staging 'VERSION'), "ci-test`n", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $staging 'LINKS.json'), "[]`n", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $staging 'launcher.cmd'), "@echo off`r`nexit /b 0`r`n", [System.Text.UTF8Encoding]::new($false))
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $outputPath -CompressionLevel Optimal
  Write-Host "embeddedbundle test fixture written: $outputPath"
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
