[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
# registry.npmjs.org is flaky from runner networks (UND_ERR_DESTROYED /
# truncated packuments); mirror build.ps1's tuning so every install in this
# script inherits it.
$env:npm_config_fetch_retries = '5'
$env:npm_config_fetch_retry_mintimeout = '2000'
$env:npm_config_network_concurrency = '8'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$release = Join-Path $repo 'release'
$runtimeProfile = Join-Path $repo 'profiles\marisa\runtime'
$verificationHome = Join-Path $release '.release-profile-home'
$verificationProfile = Join-Path $verificationHome 'profiles\marisa'
$standalone = Join-Path $release 'Marisa-DSH-windows-x64-standalone.exe'
$msi = Join-Path $release 'Marisa-DSH-windows-x64.msi'
$checksums = Join-Path $release 'SHA256SUMS.txt'

function Invoke-MarisaProfileGeneration {
  param([Parameter(Mandatory = $true)][string]$ProfilePath)

  $previousProfile = $env:MARISA_PROFILE_DIR
  try {
    $env:MARISA_PROFILE_DIR = $ProfilePath
    & node profiles/marisa/generate-profile.mjs
    if ($LASTEXITCODE -ne 0) { throw "profile generation failed: $LASTEXITCODE" }
  } finally {
    if ($null -eq $previousProfile) { Remove-Item Env:MARISA_PROFILE_DIR -ErrorAction SilentlyContinue }
    else { $env:MARISA_PROFILE_DIR = $previousProfile }
  }
}

function Invoke-ReleaseProfileVerification {
  New-Item -ItemType Directory -Force -Path $verificationProfile | Out-Null
  Invoke-MarisaProfileGeneration $verificationProfile

  Push-Location $verificationProfile
  try {
    # Root install has already populated the pnpm store. The temporary profile
    # is deliberately separate from the release runtime so the boot check
    # cannot accidentally use a maintainer's ~/.dsh profile.
    # registry.npmjs.org is flaky from runner networks (UND_ERR_DESTROYED);
    # retry the online install like build.ps1 does.
    $attempt = 1
    while ($attempt -le 3) {
      if ($attempt -gt 1) {
        Write-Host "WARN: profile install failed on attempt $($attempt - 1); retrying (attempt $attempt of 3)..."
        Start-Sleep -Seconds 10
      }
      & pnpm install --offline --no-frozen-lockfile
      if ($LASTEXITCODE -eq 0) { break }
      & pnpm install --no-frozen-lockfile
      if ($LASTEXITCODE -eq 0) { break }
      $attempt++
    }
    if ($LASTEXITCODE -ne 0) { throw "release verification profile install failed: $LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  $previousDshHome = $env:DSH_HOME
  try {
    $env:DSH_HOME = $verificationHome
    & node profiles/marisa/verify-mygo-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw "Marisa runtime and client-bundle verification failed: $LASTEXITCODE" }
  } finally {
    if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue }
    else { $env:DSH_HOME = $previousDshHome }
  }
}

Push-Location $repo
try {
  Invoke-MarisaProfileGeneration $runtimeProfile

  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed: $LASTEXITCODE" }

  & pnpm test
  if ($LASTEXITCODE -ne 0) { throw "repository and profile tests failed: $LASTEXITCODE" }

  & pwsh -NoProfile -File build.ps1 -ProfilePath $runtimeProfile -SkipDesktopShell -SkipRootInstall -SkipProfileInstall -SkipSelfCheck
  if ($LASTEXITCODE -ne 0) { throw "Marisa build failed: $LASTEXITCODE" }

  # Phase 2: fire every workspace prepare script now that the harness build
  # above produced harness/vendor/schemastery/lib. Plugin prepare steps
  # (dsh-a2a, dsh-code-map, dsh-sidechain) typecheck and bundle successfully.
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install (prepare phase) failed: $LASTEXITCODE" }

  Invoke-ReleaseProfileVerification

  & pwsh -NoProfile -File desktop/bundle/make-bundle.ps1 -ProfilePath $runtimeProfile -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "backend bundle failed: $LASTEXITCODE" }

  & go test -C desktop -tags installedbundle ./...
  if ($LASTEXITCODE -ne 0) { throw "installedbundle tests failed: $LASTEXITCODE" }
  & go test -C desktop -tags embeddedbundle ./...
  if ($LASTEXITCODE -ne 0) { throw "embeddedbundle tests failed: $LASTEXITCODE" }

  New-Item -ItemType Directory -Force -Path $release | Out-Null
  & go build -C desktop -tags embeddedbundle -trimpath -ldflags '-s -w' -o $standalone .
  if ($LASTEXITCODE -ne 0) { throw "standalone build failed: $LASTEXITCODE" }

  & pwsh -NoProfile -File desktop/scripts/build-msi.ps1 -Output $msi -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "MSI build failed: $LASTEXITCODE" }

  $lines = foreach ($path in @($standalone, $msi)) {
    $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($path))"
  }
  [System.IO.File]::WriteAllLines($checksums, $lines, [System.Text.UTF8Encoding]::new($false))
  Get-Item $standalone, $msi, $checksums | Select-Object FullName, Length
} finally {
  Pop-Location
}
