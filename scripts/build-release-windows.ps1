[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$env:CI = 'true'   # pnpm non-interactive mode: never prompt for modules-dir purge confirmation
# pnpm resolution (verification-profile install) can exceed the default V8 heap
# on the ~275-project workspace; cap is a limit, not a reservation.
$env:NODE_OPTIONS = '--max-old-space-size=8192'
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

function Write-ReleaseStep {
  param([Parameter(Mandatory = $true)][string]$Name)

  Write-Host "::group::release: $Name"
}

function Complete-ReleaseStep {
  Write-Host '::endgroup::'
}

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
  Write-ReleaseStep 'generate isolated verification profile'
  New-Item -ItemType Directory -Force -Path $verificationProfile | Out-Null
  Invoke-MarisaProfileGeneration $verificationProfile
  Complete-ReleaseStep

  Write-ReleaseStep 'install isolated verification profile'
  Push-Location $verificationProfile
  try {
    # Root install has already populated the pnpm store. The temporary profile
    # is deliberately separate from the release runtime so the boot check
    # cannot accidentally use a maintainer's ~/.dsh profile.
    $attempt = 1
    while ($attempt -le 3) {
      & pnpm install --offline --no-frozen-lockfile
      if ($LASTEXITCODE -eq 0) { break }

      & pnpm install --no-frozen-lockfile
      if ($LASTEXITCODE -eq 0) { break }

      if ($attempt -lt 3) {
        Write-Warning "verification profile install attempt $attempt failed; retrying in 10 seconds"
        Start-Sleep -Seconds 10
      }
      $attempt++
    }
    if ($LASTEXITCODE -ne 0) { throw "release verification profile install failed: $LASTEXITCODE" }
  } finally {
    Pop-Location
    Complete-ReleaseStep
  }

  Write-ReleaseStep 'verify isolated runtime and client bundle'
  $previousDshHome = $env:DSH_HOME
  try {
    $env:DSH_HOME = $verificationHome
    & node profiles/marisa/verify-mygo-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw "Marisa runtime and client-bundle verification failed: $LASTEXITCODE" }
  } finally {
    if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue }
    else { $env:DSH_HOME = $previousDshHome }
    Complete-ReleaseStep
  }
}

Push-Location $repo
try {
  Write-ReleaseStep 'generate runtime profile'
  Invoke-MarisaProfileGeneration $runtimeProfile
  Complete-ReleaseStep

  Write-ReleaseStep 'install root workspace'
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'run repository tests'
  & pnpm test
  if ($LASTEXITCODE -ne 0) { throw "repository and profile tests failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'build harness and profile'
  & pwsh -NoProfile -File build.ps1 -ProfilePath $runtimeProfile -SkipDesktopShell -SkipRootInstall -SkipProfileInstall -SkipSelfCheck
  if ($LASTEXITCODE -ne 0) { throw "Marisa build failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'run package prepare scripts after harness build'
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install (prepare phase) failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Invoke-ReleaseProfileVerification

  Write-ReleaseStep 'assemble backend bundle'
  & pwsh -NoProfile -File desktop/bundle/make-bundle.ps1 -ProfilePath $runtimeProfile -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "backend bundle failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'test installed and embedded bundles'
  & go test -C desktop -tags installedbundle ./...
  if ($LASTEXITCODE -ne 0) { throw "installedbundle tests failed: $LASTEXITCODE" }
  & go test -C desktop -tags embeddedbundle ./...
  if ($LASTEXITCODE -ne 0) { throw "embeddedbundle tests failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'build standalone executable and MSI'
  New-Item -ItemType Directory -Force -Path $release | Out-Null
  # -H=windowsgui：GUI 子系统，双击启动不弹终端窗口（需要终端日志时以
  # --console / MARISA_CONSOLE=1 启动，见 desktop/console_windows.go）。
  & go build -C desktop -tags embeddedbundle -trimpath -ldflags '-s -w -H=windowsgui' -o $standalone .
  if ($LASTEXITCODE -ne 0) { throw "standalone build failed: $LASTEXITCODE" }

  & pwsh -NoProfile -File desktop/scripts/build-msi.ps1 -Output $msi -Version $Version
  if ($LASTEXITCODE -ne 0) { throw "MSI build failed: $LASTEXITCODE" }
  Complete-ReleaseStep

  Write-ReleaseStep 'write release checksums'
  $lines = foreach ($path in @($standalone, $msi)) {
    $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($path))"
  }
  [System.IO.File]::WriteAllLines($checksums, $lines, [System.Text.UTF8Encoding]::new($false))
  Get-Item $standalone, $msi, $checksums | Select-Object FullName, Length
  Complete-ReleaseStep
} finally {
  Pop-Location
}
