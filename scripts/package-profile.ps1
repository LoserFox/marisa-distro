# package-profile.ps1 — package the marisa PROFILE (terminal) distribution.
#
# The desktop release ships the backend bundle inside a Go shell (exe/MSI).
# This script packages the SAME materialized stage as a standalone profile
# artifact using the optimized tarszst pipeline (desktop/bundle/tarszst:
# single zstd stream, 16MB window, sorted entries — smaller than a zip and
# decoding at ~1GB/s), plus the self-contained extractor exe:
#
#   release/Marisa-DSH-profile-<Version>-win-x64.tar.zst   (the bundle)
#   release/Marisa-DSH-windows-x64-extract.exe             (extracts + restores
#                                                            LINKS.json junctions)
#
# Terminal flow: unzip-free — run
#   Marisa-DSH-windows-x64-extract.exe Marisa-DSH-profile-<Version>-win-x64.tar.zst
# then run-marisa.bat inside the extracted directory (bundled with the bundle).
#
# Input : release/_stage — the materialized backend bundle staged by
#         desktop/bundle/make-bundle.ps1 (run it first; a cached make-bundle
#         still leaves a valid stage).
#
# The bundled home (.dsh/) lives inside the extraction directory: switching
# versions = extracting a new tar.zst into a NEW directory, old data untouched
# (the extractor refuses to overwrite a different-version install by default).
#
# Usage: pwsh -File scripts/package-profile.ps1 -Version 0.1.7
# (build-release-windows.ps1 calls this automatically before checksums.)
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,
  [string]$Stage,
  [string]$Output
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage = if ($Stage) { [System.IO.Path]::GetFullPath($Stage) } else { Join-Path $repo 'release\_stage' }
$output = if ($Output) { [System.IO.Path]::GetFullPath($Output) } else { Join-Path $repo "release\Marisa-DSH-profile-$Version-win-x64.tar.zst" }
$extractor = Join-Path $repo "release\Marisa-DSH-windows-x64-extract.exe"
$bundleDir = Join-Path $repo 'desktop\bundle'
$node = (Get-Command node.exe -ErrorAction Stop).Source

# --- stage sanity: must look like a materialized backend bundle --------------
$required = @(
  'VERSION',
  'node.exe',
  'marisa-distro\harness\apps\cli\lib\bin.js',
  '.dsh\profiles\marisa\desktop.overlay.yml',
  '.dsh\profiles\marisa\standalone.overlay.yml'
)
foreach ($rel in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $stage $rel))) {
    throw "stage is not a materialized backend bundle (missing $rel) — run desktop/bundle/make-bundle.ps1 first: $stage"
  }
}

# --- stage the terminal-run entry points --------------------------------------
# run-marisa.bat must be CRLF/ASCII: cmd.exe mis-parses LF-only batch files
# (each line loses its first two chars).
$batSource = Get-Content (Join-Path $bundleDir 'run-marisa.bat') -Raw
$batTarget = Join-Path $stage 'run-marisa.bat'
$batBytes = [System.Text.Encoding]::ASCII.GetBytes(($batSource -replace "`r?`n", "`r`n"))
[System.IO.File]::WriteAllBytes($batTarget, $batBytes)

Copy-Item (Join-Path $bundleDir 'run-profile.mjs') (Join-Path $stage 'run-profile.mjs') -Force
& $node --check (Join-Path $stage 'run-profile.mjs')
if ($LASTEXITCODE -ne 0) { throw "run-profile.mjs failed syntax check" }

# --- tar.zst (the optimized pipeline: desktop/bundle/tarszst) ------------------
Remove-Item -LiteralPath $output -Force -ErrorAction SilentlyContinue
Write-Host "==> packaging profile tar.zst: $output"
& go -C $repo\desktop run ./bundle/tarszst $stage $output
if ($LASTEXITCODE -ne 0) { throw "tarszst failed: $LASTEXITCODE" }

# --- extractor exe (self-contained: extracts the tar.zst + restores junctions) -
Write-Host "==> building profile extractor: $extractor"
& go build -C $repo\desktop -trimpath -ldflags '-s -w' -o $extractor ./bundle/extractprofile
if ($LASTEXITCODE -ne 0) { throw "extractor build failed: $LASTEXITCODE" }

Get-Item $output, $extractor | Select-Object FullName, Length
