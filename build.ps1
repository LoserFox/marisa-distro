# build.ps1 — marisa-distro v2 single build script
#
# Pipeline (all 8 steps, in order):
#   1. Prereq check        node>=22, pnpm>=11, go, python3
#   2. Root install        pnpm install --no-frozen-lockfile (CI=true) at repo root
#   3. Harness build       pnpm run build in harness/ (fallback: build:web)
#   4. Plugin builds       6 plugins that need lib built (others ship lib)
#   5. Materialize profile node profiles/marisa/generate-profile.mjs
#   6. Profile install     pnpm install --no-frozen-lockfile in %USERPROFILE%\.dsh\profiles\marisa
#   7. Self-check          boot backend, then verify MyGO API + browser bundle graph
#   8. Desktop shell       go build -o release/dsh-shell.exe
#
# Iteration switches (default: everything runs):
#   -SkipRootInstall -SkipHarnessBuild -SkipPluginBuilds -SkipProfileInstall
#   -SkipSelfCheck -SkipDesktopShell
#
# Windows notes baked in:
#   - plugins have no local node_modules; the root hoisted .bin is prepended to
#     PATH before `npm run build` so tsc/tsdown shims resolve.
#
# Run:  powershell -File build.ps1   (pwsh recommended)

[CmdletBinding()]
param(
  [switch]$SkipRootInstall,
  [switch]$SkipHarnessBuild,
  [switch]$SkipPluginBuilds,
  [switch]$SkipProfileInstall,
  [switch]$SkipSelfCheck,
  [switch]$SkipDesktopShell,
  [string]$ProfilePath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# pnpm resolution of the ~275-project workspace exceeds the default V8 heap
# (~4GB) during --no-frozen-lockfile installs (measured 2026-08-19); cap is a
# limit, not a reservation, so spawned prepare scripts are unaffected.
$env:NODE_OPTIONS = '--max-old-space-size=8192'

$Repo = $PSScriptRoot
$RootBin = Join-Path $Repo 'node_modules\.bin'
$RootNodeModules = Join-Path $Repo 'node_modules'
$HomeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$ProfileDir = if ($ProfilePath) { [System.IO.Path]::GetFullPath($ProfilePath) } else { Join-Path $HomeDir '.dsh\profiles\marisa' }
$ReleaseDir = Join-Path $Repo 'release'
$env:CI = 'true'   # pnpm non-interactive mode
# registry.npmjs.org is flaky from this network (UND_ERR_DESTROYED / truncated
# packuments); give pnpm/npm more retries, faster retry cadence, lower concurrency.
$env:npm_config_fetch_retries = '5'
$env:npm_config_fetch_retry_mintimeout = '2000'
$env:npm_config_network_concurrency = '8'

$results = [ordered]@{}
# harness 发行版增量（品牌兜底 + anchored-standard）以 overlay 形式在构建期
# 应用、构建后还原，保证 harness 工作树与上游 pristine（submodule 语义）。
$overlayApplied = $false
$overlayScript = Join-Path $Repo 'scripts\apply-harness-overlays.mjs'

function Write-Step([string]$msg) {
  Write-Host ''
  Write-Host ('## STEP: ' + $msg) -ForegroundColor Cyan
}
function Assert-LastExit0([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "FAILED: $what (exit code $LASTEXITCODE)" }
}

# registry.npmjs.org is flaky from this network (UND_ERR_DESTROYED / truncated
# packuments, e.g. "No matching version found for @aws-sdk/token-providers@3.1108.0"
# although that version exists). Retry the whole install up to 3 times before
# giving up (fetch retries/concurrency are tuned via npm_config_* env vars above).
function Invoke-InstallWithRetry([string]$label, [int]$maxAttempts = 3, [string[]]$extraArgs = @()) {
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    if ($attempt -gt 1) {
      Write-Host "WARN: $label failed on attempt $($attempt - 1); retrying (attempt $attempt of $maxAttempts)..." -ForegroundColor Yellow
      Start-Sleep -Seconds 10
    }
    & pnpm install --no-frozen-lockfile @extraArgs
    if ($LASTEXITCODE -eq 0) { return }
  }
  throw "FAILED: $label (exit code $LASTEXITCODE after $maxAttempts attempts)"
}

function Test-Tool([string]$name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-PluginNpmBuild([string]$dir) {
  Push-Location (Join-Path $Repo "plugins\$dir")
  try {
    & npm run build
    Assert-LastExit0 "npm run build in plugins\$dir"
    if (-not (Test-Path 'lib\index.js')) { throw "plugins\$dir build produced no lib\index.js" }
    $results["plugin:$dir"] = 'OK'
    Write-Host "plugin $dir -> OK (lib/index.js present)"
  } finally { Pop-Location }
}

$webUrl = $null
$httpCode = -1
$webProc = $null

function Stop-WebBackend {
  if ($null -ne $webProc -and -not $webProc.HasExited) {
    Write-Host "killing web backend tree (PID $($webProc.Id))"
    taskkill /PID $webProc.Id /T /F 2>$null | Out-Null
    Start-Sleep -Seconds 2
    if (-not $webProc.HasExited) { Stop-Process -Id $webProc.Id -Force -ErrorAction SilentlyContinue }
  }
}

try {
  # ═══════════════ 1/8 prereqs ═══════════════
  Write-Step '1/8 prereq check'
  $nodeOut = (node -v) 2>&1
  if ($LASTEXITCODE -ne 0) { throw "node is not runnable: $nodeOut" }
  $nodeMajor = [int](($nodeOut -replace '^v', '' -split '\.')[0])
  if ($nodeMajor -lt 22) { throw "node >= 22 required, found $nodeOut" }
  Write-Host "node $nodeOut OK"

  $pnpmOut = ((pnpm -v) 2>&1).Trim()
  if ($LASTEXITCODE -ne 0) { throw "pnpm is not runnable: $pnpmOut" }
  if ([version]$pnpmOut -lt [version]'11.0.0') { throw "pnpm >= 11 required, found $pnpmOut" }
  Write-Host "pnpm $pnpmOut OK"

  if (-not (Test-Tool 'go')) { throw 'go is not on PATH (required for step 8 desktop shell build)' }
  Write-Host "go $((go version)) OK"
  if (-not (Test-Tool 'python3')) { throw 'python3 is not on PATH (required)' }
  Write-Host 'python3 OK'

  # harness 是 git submodule：fresh clone / CI 必须先 checkout（actions/checkout
  # 带 submodules: recursive 时已就绪，此处兜底幂等）。
  if (Test-Path (Join-Path $Repo '.gitmodules')) {
    Write-Host 'ensuring harness submodule is checked out ...'
    & git submodule update --init harness
    if ($LASTEXITCODE -ne 0) { throw 'harness submodule update failed (network?)' }
    if (-not (Test-Path (Join-Path $Repo 'harness\package.json'))) {
      throw 'harness submodule is not materialized; run: git submodule update --init'
    }
  }

  # ═══════════════ 2/8 root workspace install ═══════════════
  if (-not $SkipRootInstall) {
    Write-Step '2/8 root workspace install (pnpm install --no-frozen-lockfile --ignore-scripts)'
    # --ignore-scripts：fresh checkout 下 harness 的 lib/ 尚未构建，带 prepare 的
    # workspace 成员（dsh-mygo-api 等）tsc 解析不到 workspace 包类型会挂；链接
    # 阶段不依赖脚本，先装链接，step 3 构建 harness lib 后再补跑 lifecycle。
    Push-Location $Repo
    try {
      Invoke-InstallWithRetry 'root pnpm install (links only)' @('--ignore-scripts')
      Write-Host 'WARN: lifecycle scripts skipped by --ignore-scripts; will be completed after harness build' -ForegroundColor Yellow
    } finally { Pop-Location }
  } else {
    Write-Step '2/8 root workspace install (SKIPPED by -SkipRootInstall)'
  }

  # ═══════════════ 3/8 harness build ═══════════════
  if (-not $SkipHarnessBuild) {
    Write-Step '3/8 harness build (pnpm --filter @deepseek-ai/dsh-root run build)'
    & node $overlayScript apply
    if ($LASTEXITCODE -ne 0) { throw 'harness overlay apply failed (brand + anchored-standard)' }
    $overlayApplied = $true
    $env:PATH = "$RootBin;$env:PATH"
    # 必须从根 workspace 发起（--filter）：harness 是 git submodule，目录内嵌套
    # 上游自带的 pnpm-workspace.yaml / pnpm-lock.yaml；在 harness 目录直接跑
    # pnpm run 会触发 deps-status 自动 install（与根安装的 hoisted 结构不一致）。
    & pnpm --filter @deepseek-ai/dsh-root run build
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'WARN: full harness build failed; falling back to web-target build (build:web)' -ForegroundColor Yellow
      & pnpm --filter @deepseek-ai/dsh-root run build:web
      Assert-LastExit0 'harness build:web (fallback)'
    }
    $results['harness-build'] = 'OK'
  } else {
    Write-Step '3/8 harness build (SKIPPED by -SkipHarnessBuild)'
  }

  # ═══════════════ 3.5/8 lifecycle completion ═══════════════
  # step 2 用 --ignore-scripts 跳过 prepare；harness lib 构建后，fresh checkout
  # 下带 prepare 的成员（dsh-mygo-api 等）才可解析 workspace 包类型。增量环境
  # 下 mygo-api lib 已存在（prepare 产物），无需补跑。
  $mygoApiLib = Join-Path $Repo 'dsh-mygo\packages\core\mygo-api\lib'
  if (-not $SkipRootInstall -and -not (Test-Path $mygoApiLib)) {
    Write-Step '3.5/8 complete lifecycle scripts (prepare consumers now have harness libs)'
    Push-Location $Repo
    try {
      Invoke-InstallWithRetry 'root pnpm install (lifecycle completion)'
    } finally { Pop-Location }
  }

  # ═══════════════ 4/8 plugin builds ═══════════════
  if (-not $SkipPluginBuilds) {
    Write-Step '4/8 plugin builds (3 rc6-compatible plugins need lib; others ship lib or are compatibility-disabled)'
    $env:PATH = "$RootBin;$env:PATH"   # root hoisted .bin: tsc/tsdown shims for plugins
    foreach ($dir in @('dsh-a2a', 'dsh-code-map', 'dsh-sidechain')) {
      Write-Host "--- building plugin: $dir ---"
      Invoke-PluginNpmBuild $dir
    }
  } else {
    Write-Step '4/8 plugin builds (SKIPPED by -SkipPluginBuilds)'
  }

  # ═══════════════ 5/8 materialize profile ═══════════════
  Write-Step '5/8 materialize profile (generate-profile.mjs)'
  Push-Location $Repo
  try {
    $previousProfileOutput = $env:MARISA_PROFILE_DIR
    $env:MARISA_PROFILE_DIR = $ProfileDir
    & node profiles/marisa/generate-profile.mjs
    $env:MARISA_PROFILE_DIR = $previousProfileOutput
    Assert-LastExit0 'generate-profile.mjs'
  } finally { Pop-Location }
  if (-not (Test-Path (Join-Path $ProfileDir 'package.json'))) {
    throw "profile package.json not materialized at $ProfileDir"
  }

  # ═══════════════ 6/8 profile install ═══════════════
  if (-not $SkipProfileInstall) {
    Write-Step '6/8 profile install (pnpm install --no-frozen-lockfile)'
    Push-Location $ProfileDir
    try {
      Invoke-InstallWithRetry 'profile pnpm install'
    } finally { Pop-Location }
  } else {
    Write-Step '6/8 profile install (SKIPPED by -SkipProfileInstall)'
  }

  # ═══════════════ 7/8 self-check ═══════════════
  if (-not $SkipSelfCheck) {
    Write-Step '7/8 self-check: boot marisa web backend from repo harness'
    New-Item -ItemType Directory -Force $ReleaseDir | Out-Null
    $stdoutLog = Join-Path $ReleaseDir 'web-backend.log'
    $stderrLog = Join-Path $ReleaseDir 'web-backend.err.log'
    Remove-Item $stdoutLog, $stderrLog -ErrorAction SilentlyContinue

    $patchPath = (Join-Path $ProfileDir 'desktop.overlay.yml').Replace('\', '/')
    $builtCli = Join-Path $Repo 'harness\apps\cli\lib\bin.js'
    if (-not (Test-Path -LiteralPath $builtCli -PathType Leaf)) {
      throw "built harness CLI missing after step 3: $builtCli"
    }
    # rc7 CLI syntax: --profile is a launcher flag (dsh --profile marisa);
    # the `web` subcommand does not accept it (rc7 sync, 2026-08-18).
    $binArgs = @('apps/cli/lib/bin.js', '--profile', 'marisa', '--patch', $patchPath)
    Write-Host "spawning: node $($binArgs -join ' ')"
    $webProc = Start-Process -FilePath 'node' -ArgumentList $binArgs `
      -WorkingDirectory (Join-Path $Repo 'harness') `
      -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog `
      -WindowStyle Hidden -PassThru
    Write-Host "web backend PID $($webProc.Id); polling for 'dsh web:' line (up to 180s)"

    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline) {
      if ($webProc.HasExited) { break }
      $content = ''
      foreach ($f in @($stdoutLog, $stderrLog)) {
        if (Test-Path $f) { $content += (Get-Content $f -Raw -ErrorAction SilentlyContinue) }
      }
      if ($content -match 'dsh web: (http://127\.0\.0\.1:\d+)') { $webUrl = $Matches[1]; break }
      Start-Sleep -Seconds 2
    }

    if (-not $webUrl) {
      $tail = if (Test-Path $stdoutLog) { (Get-Content $stdoutLog -Tail 80) -join "`n" } else { '(no stdout log)' }
      $errTail = if (Test-Path $stderrLog) { (Get-Content $stderrLog -Tail 80) -join "`n" } else { '' }
      $exited = $webProc.HasExited
      $code = if ($exited) { $webProc.ExitCode } else { '(still running)' }
      Stop-WebBackend
      throw "WEB BOOT FAILED (exited=$exited exitCode=$code)`n----- stdout tail -----`n$tail`n----- stderr tail -----`n$errTail"
    }
    Write-Host "boot line found: $webUrl"

    try {
      $resp = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 30
      $httpCode = [int]$resp.StatusCode
    } catch {
      if ($_.Exception.Response) {
        $httpCode = [int]$_.Exception.Response.StatusCode
      } else {
        Stop-WebBackend
        throw "HTTP request to $webUrl failed: $($_.Exception.Message)"
      }
    }
    Stop-WebBackend
    if ($httpCode -ne 200) { throw "self-check HTTP got $httpCode (expected 200) at $webUrl" }
    & node (Join-Path $Repo 'profiles\marisa\verify-mygo-runtime.mjs')
    Assert-LastExit0 'MyGO runtime and client-panel verification'
    $results['self-check'] = "HTTP $httpCode + MyGO rc6 API/client panel"
    Write-Host "SELF-CHECK OK: HTTP $httpCode + MyGO rc6 API/client panel" -ForegroundColor Green
  } else {
    Write-Step '7/8 self-check (SKIPPED by -SkipSelfCheck)'
  }

  # ═══════════════ 8/8 desktop shell ═══════════════
  if (-not $SkipDesktopShell) {
    Write-Step '8/8 desktop shell (go build dsh-shell.exe)'
    New-Item -ItemType Directory -Force $ReleaseDir | Out-Null
    & go build -C (Join-Path $Repo 'desktop') -o (Join-Path $ReleaseDir 'dsh-shell.exe') .
    Assert-LastExit0 'go build dsh-shell'
    $results['desktop-shell'] = 'OK'
  } else {
    Write-Step '8/8 desktop shell (SKIPPED by -SkipDesktopShell)'
  }

  # ═══════════════ summary ═══════════════
  Write-Host ''
  Write-Host '================ BUILD SUMMARY ================' -ForegroundColor Green
  $rootCount = (Get-ChildItem $RootNodeModules -ErrorAction SilentlyContinue | Measure-Object).Count
  $profileCount = (Get-ChildItem (Join-Path $ProfileDir 'node_modules') -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host "root node_modules entries:      $rootCount"
  Write-Host "profile node_modules entries:   $profileCount"
  foreach ($dir in @('dsh-a2a', 'dsh-code-map', 'dsh-sidechain')) {
    Write-Host ("plugin {0,-16} {1}" -f $dir, $results["plugin:$dir"])
  }
  if ($webUrl) { Write-Host "self-check:                     $httpCode at $webUrl" }
  $exe = Get-Item (Join-Path $ReleaseDir 'dsh-shell.exe') -ErrorAction SilentlyContinue
  if ($exe) { Write-Host "dsh-shell.exe:                  $($exe.FullName) ($($exe.Length) bytes)" }
  Write-Host '===============================================' -ForegroundColor Green
  Write-Host 'BUILD COMPLETE (all steps passed)'
  exit 0
} catch {
  Write-Host ''
  Write-Host ('FATAL: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'BUILD FAILED'
  exit 1
} finally {
  Stop-WebBackend
  if ($overlayApplied) {
    try {
      & node $overlayScript revert | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Warning 'harness overlay revert failed — harness tree left patched; run scripts/apply-harness-overlays.mjs revert'
      }
    } catch {
      Write-Warning "harness overlay revert failed: $($_.Exception.Message)"
    }
  }
}
