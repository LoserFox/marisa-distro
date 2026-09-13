# make-installer.ps1 — build the Marisa DSH Electron shell plus its embedded
# backend payload into a Windows installer.
#
# Four stages, each individually skippable so a failed acceptance run does not
# have to rebuild the ~150MB payload:
#
#   0. profile  profiles/marisa/generate-profile.mjs -> profiles/marisa/runtime
#               The in-repo "release runtime" profile. The payload must be
#               staged from it, not from the maintainer's ~/.dsh profile:
#               scripts/build-release-windows.ps1 does the same, and a
#               maintainer profile would leak whatever that person happens to
#               have installed into the shipped bundle.
#   1. payload  desktop/bundle/make-bundle.ps1 -RuntimeMode electron
#               stages the backend tree and writes desktop-electron/bundle/
#               backend.tar.zst. electron mode omits node.exe: the shell serves
#               as Node through ELECTRON_RUN_AS_NODE (src/electron-node.ts).
#   2. shell    tsc -> lib/, plus vitest as a gate.
#   3. package  electron-builder -> release/ (NSIS installer + portable exe).
#
# The staged payload is what makes the packaged app the EMBEDDED install form
# (src/install-form.ts): without it the shell boots as a dev build and runs a
# `dsh` from PATH instead of the backend it ships.
param(
  [switch]$SkipProfile,   # reuse the existing profiles/marisa/runtime
  [switch]$SkipPayload,   # reuse the existing bundle/backend.tar.zst
  [switch]$SkipTests,
  [ValidateSet('nsis','dir')]
  [string]$Target = 'nsis',
  [string]$Version,
  [string]$NodePath,
  [string]$SevenZipPath
)

$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$app = [System.IO.Path]::GetFullPath((Join-Path $here '..'))
$repo = [System.IO.Path]::GetFullPath((Join-Path $app '..'))
$runtimeProfile = Join-Path $repo 'profiles\marisa\runtime'
$bundleOut = Join-Path $app 'bundle\backend.tar.zst'

Write-Host "=== Marisa DSH Electron installer ==="
Write-Host "repo:    $repo"
Write-Host "app:     $app"
Write-Host "profile: $runtimeProfile"
Write-Host "target:  $Target"
Write-Host ''

# --- stage 0: release runtime profile ---------------------------------------
$profileManifest = Join-Path $runtimeProfile 'package.json'
if ($SkipProfile) {
  if (-not (Test-Path -LiteralPath $profileManifest -PathType Leaf)) {
    throw "-SkipProfile given but no runtime profile at $runtimeProfile"
  }
  Write-Host '[0/4] profile: skipped, reusing existing runtime profile'
} else {
  Write-Host '[0/4] profile: materializing profiles/marisa/runtime ...'
  New-Item -ItemType Directory -Force -Path $runtimeProfile | Out-Null
  $previousProfileDir = $env:MARISA_PROFILE_DIR
  try {
    $env:MARISA_PROFILE_DIR = $runtimeProfile
    & node (Join-Path $repo 'profiles\marisa\generate-profile.mjs')
    if ($LASTEXITCODE -ne 0) { throw "generate-profile.mjs failed with exit code $LASTEXITCODE" }
  } finally {
    if ($null -eq $previousProfileDir) { Remove-Item Env:MARISA_PROFILE_DIR -ErrorAction SilentlyContinue }
    else { $env:MARISA_PROFILE_DIR = $previousProfileDir }
  }
}
if (-not (Test-Path -LiteralPath $profileManifest -PathType Leaf)) {
  throw "profile package.json not materialized at $runtimeProfile"
}

# --- stage 1: backend payload ------------------------------------------------
if ($SkipPayload) {
  if (-not (Test-Path -LiteralPath $bundleOut -PathType Leaf)) {
    throw "-SkipPayload given but no payload at $bundleOut"
  }
  $size = (Get-Item -LiteralPath $bundleOut).Length
  Write-Host ("[1/4] payload: skipped, reusing {0} ({1:N1} MB)" -f $bundleOut, ($size / 1MB))
} else {
  Write-Host '[1/4] payload: staging backend bundle (runtime mode=electron) ...'
  $makeBundle = Join-Path $repo 'desktop\bundle\make-bundle.ps1'
  if (-not (Test-Path -LiteralPath $makeBundle -PathType Leaf)) { throw "missing $makeBundle" }
  $payloadArgs = @{
    RuntimeMode = 'electron'
    ProfilePath = $runtimeProfile
    OutPath     = $bundleOut
  }
  if ($Version) { $payloadArgs.Version = $Version }
  if ($NodePath) { $payloadArgs.NodePath = $NodePath }
  if ($SevenZipPath) { $payloadArgs.SevenZipPath = $SevenZipPath }
  & $makeBundle @payloadArgs
  if ($LASTEXITCODE -ne 0) { throw "make-bundle.ps1 failed with exit code $LASTEXITCODE" }
  $size = (Get-Item -LiteralPath $bundleOut).Length
  Write-Host ("[1/4] payload: {0} ({1:N1} MB)" -f $bundleOut, ($size / 1MB))
}
if (-not (Test-Path -LiteralPath $bundleOut -PathType Leaf)) { throw "payload missing after stage 1: $bundleOut" }

# The payload must NOT carry node.exe in electron mode — the shell is the Node
# runtime. Catching it here beats debugging a 25MB-wrong installer later.
Write-Host '[1/4] payload: verifying node.exe is absent (electron runtime mode) ...'
$probeDir = Join-Path $env:TEMP ("marisa-payload-probe-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $probeDir | Out-Null
try {
  $sevenZip = if ($SevenZipPath) { $SevenZipPath } else { Join-Path $env:ProgramFiles '7-Zip\7z.exe' }
  if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw "7-Zip not found: $sevenZip" }
  # backend.tar.zst is a zstd stream wrapping backend.tar; 7z handles .zst.
  & $sevenZip e -y -o"$probeDir" "$bundleOut" 'backend.tar' | Out-Null
  $tarPath = Join-Path $probeDir 'backend.tar'
  if (-not (Test-Path -LiteralPath $tarPath -PathType Leaf)) { throw "could not unwrap $bundleOut" }
  $tarEntries = & $sevenZip l "$tarPath" 'node.exe' 2>&1 | Out-String
  if ($tarEntries -match 'node\.exe') {
    throw "payload contains node.exe — it was built in runtime mode. The Electron shell ships no node.exe; clear release\.cache and rebuild."
  }
  Write-Host '[1/4] payload: OK (no node.exe)'
} finally {
  Remove-Item -LiteralPath $probeDir -Recurse -Force -ErrorAction SilentlyContinue
}

Push-Location $app
try {
  # --- stage 2: shell --------------------------------------------------------
  Write-Host '[2/4] shell: installing npm dependencies ...'
  if (-not (Test-Path -LiteralPath (Join-Path $app 'node_modules'))) {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  }
  if (-not $SkipTests) {
    Write-Host '[2/4] shell: vitest ...'
    & npx vitest run
    if ($LASTEXITCODE -ne 0) { throw "vitest failed with exit code $LASTEXITCODE" }
  } else {
    Write-Host '[2/4] shell: tests skipped'
  }
  Write-Host '[2/4] shell: tsc build ...'
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "tsc build failed with exit code $LASTEXITCODE" }

  # --- stage 3: package -----------------------------------------------------
  Write-Host "[3/4] package: electron-builder ($Target) ..."
  $builderArgs = @('electron-builder', '--config', 'electron-builder.yml', '--win')
  if ($Target -eq 'dir') { $builderArgs += '--dir' }
  & npx @builderArgs
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

  # --- stage 4: verify the artefact -----------------------------------------
  # An asar that ships zero node_modules still builds cleanly and only fails at
  # launch (ERR_MODULE_NOT_FOUND), so the package is checked before it is
  # called done.
  Write-Host '[4/4] verify: bundled runtime dependencies ...'
  & node (Join-Path $here 'verify-packaged-deps.mjs')
  if ($LASTEXITCODE -ne 0) { throw "packaged dependency check failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$releaseDir = Join-Path $app 'release'
Write-Host ''
Write-Host "=== artifacts in $releaseDir ==="
Get-ChildItem -LiteralPath $releaseDir -File -ErrorAction SilentlyContinue |
  Sort-Object Name |
  ForEach-Object { Write-Host ("  {0,-52} {1,10:N1} MB" -f $_.Name, ($_.Length / 1MB)) }
Get-ChildItem -LiteralPath $releaseDir -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'win-*' } |
  ForEach-Object { Write-Host ("  {0}\ (unpacked)" -f $_.Name) }
